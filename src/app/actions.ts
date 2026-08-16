"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getDb, nowIso, one, run, tx } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { ForbiddenError, canTransition, isMutable, type CycleState } from "@/lib/rbac";
import { activePolicy, ensureCycle, payableFor, writeAudit } from "@/lib/cycles";
import { sarToHalalas } from "@/lib/money";

export interface ActionState { error?: string; ok?: string }

/** Wraps an action so a thrown ForbiddenError becomes a message, not a 500 page. */
async function guarded(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: err.message };
    return { error: (err as Error).message || "تعذر تنفيذ الإجراء" };
  }
}

/* ------------------------- commission lifecycle ------------------------- */

export async function transitionCycleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const periodId = String(formData.get("periodId"));
    const to = String(formData.get("to")) as CycleState;
    const reason = String(formData.get("reason") ?? "").trim();

    // Ask for the permission the *target* state needs, then re-check the edge itself.
    const permission =
      to === "review" ? "commission.review" :
      to === "approved" ? "commission.approve" :
      to === "paid" ? "commission.pay" :
      to === "void" ? "commission.approve" :
      "commission.review";
    const user = await requirePermission(permission);

    const { cycle, result } = ensureCycle(periodId);
    if (!canTransition(user.role, cycle.state, to)) {
      return { error: `لا يمكن الانتقال من "${cycle.state}" إلى "${to}" بدورك الحالي` };
    }
    if (to === "void" && !reason) return { error: "سبب الإبطال مطلوب" };

    const payable = payableFor(cycle.id, result);

    if (to === "paid") {
      // The payout row carries a UNIQUE idempotency key, so a double submit —
      // two clicks, a retry, two CFOs at once — collapses into one transfer.
      const key = `payout:${cycle.id}`;
      const existing = one<{ id: string }>("SELECT id FROM payouts WHERE idempotency_key = ?", key);
      if (existing) return { ok: "الصرف مسجَّل مسبقًا لهذه الدورة" };

      tx((db) => {
        db.prepare("INSERT INTO payouts (id, cycle_id, idempotency_key, total_halalas, paid_by) VALUES (?,?,?,?,?)")
          .run(randomUUID(), cycle.id, key, payable.grandTotalHalalas, user.displayName);
        db.prepare("UPDATE commission_cycles SET state='paid', paid_by=?, paid_at=? WHERE id=?")
          .run(user.displayName, nowIso(), cycle.id);
      });
    } else {
      const columns: Partial<Record<CycleState, string>> = {
        review: "reviewed_by=?, reviewed_at=?",
        approved: "approved_by=?, approved_at=?",
      };
      const setClause = columns[to];
      if (setClause) {
        run(`UPDATE commission_cycles SET state=?, ${setClause} WHERE id=?`, to, user.displayName, nowIso(), cycle.id);
      } else if (to === "void") {
        run("UPDATE commission_cycles SET state='void', void_reason=? WHERE id=?", reason, cycle.id);
      } else {
        run("UPDATE commission_cycles SET state=? WHERE id=?", to, cycle.id);
      }
    }

    const labels: Record<string, string> = {
      review: "إرسال للمراجعة", approved: "اعتماد", paid: "صرف", draft: "إرجاع لمسودة", void: "إبطال",
    };
    writeAudit(user.id, user.displayName, `${labels[to]} دورة عمولة`, "commission_cycle", cycle.id,
      `${labels[to]} — إجمالي ${(payable.grandTotalHalalas / 100).toFixed(2)} ر.س${reason ? ` · السبب: ${reason}` : ""}`);

    revalidatePath("/cycles");
    revalidatePath(`/cycles/${periodId}`);
    revalidatePath("/");
    return { ok: `تم ${labels[to]}` };
  });
}

export async function addAdjustmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await requirePermission("commission.adjust");
    const periodId = String(formData.get("periodId"));
    const employeeId = String(formData.get("employeeId"));
    const amount = sarToHalalas(String(formData.get("amount") ?? "0"));
    const note = String(formData.get("note") ?? "").trim();

    if (!amount) return { error: "أدخل مبلغًا غير صفري" };
    if (!note) return { error: "سبب التسوية مطلوب — التسوية بلا سبب لا تُراجَع لاحقًا" };

    const { cycle } = ensureCycle(periodId);
    // Adjusting an approved or paid cycle would move money someone already signed for.
    if (!isMutable(cycle.state)) return { error: "لا يمكن تعديل دورة غادرت حالة المسودة" };

    run("INSERT INTO adjustments (id, cycle_id, employee_id, amount_halalas, note, created_by) VALUES (?,?,?,?,?,?)",
      randomUUID(), cycle.id, employeeId, amount, note, user.displayName);

    const emp = one<{ name: string }>("SELECT name FROM employees WHERE id = ?", employeeId);
    writeAudit(user.id, user.displayName, "تسوية عمولة", "adjustment", cycle.id,
      `${emp?.name ?? employeeId}: ${amount > 0 ? "+" : ""}${(amount / 100).toFixed(2)} ر.س — ${note}`);

    revalidatePath(`/cycles/${periodId}`);
    return { ok: "أُضيفت التسوية" };
  });
}

export async function deleteAdjustmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await requirePermission("commission.adjust");
    const id = String(formData.get("adjustmentId"));
    const periodId = String(formData.get("periodId"));

    const { cycle } = ensureCycle(periodId);
    if (!isMutable(cycle.state)) return { error: "لا يمكن تعديل دورة غادرت حالة المسودة" };

    const adj = one<{ amount_halalas: number; note: string }>("SELECT amount_halalas, note FROM adjustments WHERE id = ?", id);
    if (!adj) return { error: "التسوية غير موجودة" };

    run("DELETE FROM adjustments WHERE id = ?", id);
    writeAudit(user.id, user.displayName, "حذف تسوية", "adjustment", id,
      `حذف تسوية ${(adj.amount_halalas / 100).toFixed(2)} ر.س — ${adj.note}`);

    revalidatePath(`/cycles/${periodId}`);
    return { ok: "حُذفت التسوية" };
  });
}

/* ------------------------------- periods -------------------------------- */

export async function setPeriodCostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await requirePermission("policy.edit");
    const periodId = String(formData.get("periodId"));
    const cost = sarToHalalas(String(formData.get("cost") ?? "0"));
    if (cost < 0) return { error: "قيمة التكاليف لا يمكن أن تكون سالبة" };

    const { cycle } = ensureCycle(periodId);
    if (!isMutable(cycle.state)) return { error: "دورة هذه الفترة اعتُمدت — تغيير الهدف سيغيّر مستحقات معتمدة" };

    const period = one<{ label: string }>("SELECT label FROM periods WHERE id = ?", periodId);
    run("UPDATE periods SET monthly_cost_halalas = ? WHERE id = ?", cost, periodId);
    ensureCycle(periodId); // recompute the draft against the new target

    writeAudit(user.id, user.displayName, "تعديل هدف التكاليف", "period", periodId,
      `${period?.label ?? periodId}: ${(cost / 100).toFixed(2)} ر.س`);

    revalidatePath("/periods");
    revalidatePath(`/cycles/${periodId}`);
    return { ok: "حُدِّث الهدف وأُعيد الاحتساب" };
  });
}

/* ------------------------------ employees ------------------------------- */

export async function saveEmployeeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await requirePermission("employee.manage");
    const id = String(formData.get("employeeId") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const status = String(formData.get("status") ?? "active");
    const target = sarToHalalas(String(formData.get("target") ?? "0"));
    const aliases = String(formData.get("aliases") ?? "")
      .split(/[,،]/).map((s) => s.trim()).filter(Boolean);

    if (!name) return { error: "اسم الموظف مطلوب" };
    if (target < 0) return { error: "الهدف الفردي لا يمكن أن يكون سالبًا" };
    if (!aliases.includes(name)) aliases.unshift(name);

    tx((db) => {
      const employeeId = id || `e_${randomUUID().slice(0, 8)}`;
      if (id) {
        db.prepare("UPDATE employees SET name=?, status=?, target_halalas=? WHERE id=?").run(name, status, target, id);
        db.prepare("DELETE FROM employee_aliases WHERE employee_id = ?").run(id);
      } else {
        db.prepare("INSERT INTO employees (id, name, status, target_halalas) VALUES (?,?,?,?)")
          .run(employeeId, name, status, target);
      }
      const ins = db.prepare("INSERT OR IGNORE INTO employee_aliases (employee_id, alias) VALUES (?,?)");
      for (const a of aliases) ins.run(id || employeeId, a);
    });

    writeAudit(user.id, user.displayName, id ? "تعديل موظف" : "إضافة موظف", "employee", id || name,
      `${name} · الحالة ${status === "excluded" ? "مستبعد" : "نشط"} · هدف ${(target / 100).toFixed(2)} ر.س`);

    revalidatePath("/employees");
    return { ok: "حُفظت بيانات الموظف" };
  });
}

/* ------------------------------- matches -------------------------------- */

export async function resolveMatchAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await requirePermission("match.resolve");
    const matchId = String(formData.get("matchId"));
    const decision = String(formData.get("decision")); // 'merge' | 'separate'
    const employeeId = String(formData.get("employeeId") ?? "");

    const match = one<{ raw_name: string }>("SELECT raw_name FROM name_matches WHERE id = ?", matchId);
    if (!match) return { error: "سجل المطابقة غير موجود" };

    if (decision === "merge") {
      if (!employeeId) return { error: "اختر الموظف المراد الدمج معه" };
      const emp = one<{ name: string }>("SELECT name FROM employees WHERE id = ?", employeeId);
      if (!emp) return { error: "الموظف غير موجود" };
      tx((db) => {
        db.prepare("INSERT OR IGNORE INTO employee_aliases (employee_id, alias) VALUES (?,?)").run(employeeId, match.raw_name);
        db.prepare("UPDATE name_matches SET resolved=1, resolution='merged', suggested_id=? WHERE id=?").run(employeeId, matchId);
      });
      writeAudit(user.id, user.displayName, "مطابقة أسماء", "name_match", matchId, `دمج "${match.raw_name}" مع "${emp.name}"`);
    } else {
      run("UPDATE name_matches SET resolved=1, resolution='separate' WHERE id=?", matchId);
      writeAudit(user.id, user.displayName, "مطابقة أسماء", "name_match", matchId, `اعتماد "${match.raw_name}" كاسم مستقل`);
    }

    revalidatePath("/matches");
    return { ok: "حُسمت المطابقة" };
  });
}

/* ------------------------------- expenses ------------------------------- */

export async function saveExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await requirePermission("expense.manage");
    const id = String(formData.get("expenseId") ?? "").trim();
    const spentOn = String(formData.get("spentOn") ?? "");
    const amount = sarToHalalas(String(formData.get("amount") ?? "0"));
    const description = String(formData.get("description") ?? "").trim();
    const categoryId = String(formData.get("categoryId") ?? "") || null;
    const vendor = String(formData.get("vendor") ?? "").trim() || null;
    const method = String(formData.get("method") ?? "bank");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn)) return { error: "أدخل تاريخًا صحيحًا" };
    if (amount <= 0) return { error: "المبلغ يجب أن يكون أكبر من صفر" };
    if (!description) return { error: "البيان مطلوب" };

    if (id) {
      run(`UPDATE expenses SET spent_on=?, category_id=?, description=?, vendor=?, amount_halalas=?, method=? WHERE id=?`,
        spentOn, categoryId, description, vendor, amount, method, id);
    } else {
      run(`INSERT INTO expenses (id, spent_on, category_id, description, vendor, amount_halalas, method, created_by)
           VALUES (?,?,?,?,?,?,?,?)`,
        randomUUID(), spentOn, categoryId, description, vendor, amount, method, user.displayName);
    }

    writeAudit(user.id, user.displayName, id ? "تعديل مصروف" : "تسجيل مصروف", "expense", id || description,
      `${description} — ${(amount / 100).toFixed(2)} ر.س (${spentOn})`);

    revalidatePath("/expenses");
    revalidatePath("/pnl");
    revalidatePath("/");
    return { ok: id ? "عُدِّل القيد" : "سُجِّل المصروف" };
  });
}

export async function deleteExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await requirePermission("expense.manage");
    const id = String(formData.get("expenseId"));
    const exp = one<{ description: string; amount_halalas: number }>(
      "SELECT description, amount_halalas FROM expenses WHERE id = ?", id);
    if (!exp) return { error: "القيد غير موجود" };

    run("DELETE FROM expenses WHERE id = ?", id);
    writeAudit(user.id, user.displayName, "حذف مصروف", "expense", id,
      `${exp.description} — ${(exp.amount_halalas / 100).toFixed(2)} ر.س`);

    revalidatePath("/expenses");
    revalidatePath("/pnl");
    return { ok: "حُذف القيد" };
  });
}

/* -------------------------------- budgets ------------------------------- */

export async function saveBudgetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await requirePermission("budget.manage");
    const ym = String(formData.get("ym") ?? "");
    if (!/^\d{4}-\d{2}$/.test(ym)) return { error: "اختر شهرًا صحيحًا" };

    const revenue = sarToHalalas(String(formData.get("revenue") ?? "0"));
    const grossProfit = sarToHalalas(String(formData.get("grossProfit") ?? "0"));
    const expenses = sarToHalalas(String(formData.get("expenses") ?? "0"));
    if (revenue < 0 || grossProfit < 0 || expenses < 0) return { error: "قيم الميزانية لا يمكن أن تكون سالبة" };

    run(`INSERT INTO budgets (ym, revenue_halalas, gross_profit_halalas, expenses_halalas) VALUES (?,?,?,?)
         ON CONFLICT(ym) DO UPDATE SET revenue_halalas=excluded.revenue_halalas,
           gross_profit_halalas=excluded.gross_profit_halalas, expenses_halalas=excluded.expenses_halalas`,
      ym, revenue, grossProfit, expenses);

    writeAudit(user.id, user.displayName, "تحديد ميزانية", "budget", ym,
      `${ym}: إيرادات ${(revenue / 100).toFixed(0)} · ربح ${(grossProfit / 100).toFixed(0)} · مصروفات ${(expenses / 100).toFixed(0)}`);

    revalidatePath("/budgets");
    return { ok: "حُفظت الميزانية" };
  });
}

/* -------------------------------- policy -------------------------------- */

export async function savePolicyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await requirePermission("policy.edit");
    const policy = activePolicy();

    const blend = Number(formData.get("weightBlend") ?? 50);
    if (!Number.isFinite(blend) || blend < 0 || blend > 100) return { error: "مزيج التوزيع يجب أن يكون بين 0 و100" };
    policy.weightBlendBp = Math.round(blend * 100);

    const fallbackRate = Number(formData.get("fallbackRate") ?? 10);
    if (fallbackRate < 0 || fallbackRate > 100) return { error: "نسبة شبكة الأمان يجب أن تكون بين 0 و100" };
    policy.individualFallback = {
      enabled: formData.get("fallbackEnabled") === "on",
      rateBp: Math.round(fallbackRate * 100),
    };

    const vatRate = Number(formData.get("vatRate") ?? 15);
    if (vatRate < 0 || vatRate > 100) return { error: "نسبة الضريبة يجب أن تكون بين 0 و100" };
    policy.vat = { enabled: formData.get("vatEnabled") === "on", rateBp: Math.round(vatRate * 100) };

    for (const level of policy.levels) {
      const mult = Number(formData.get(`level_${level.id}_multiplier`));
      const rate = Number(formData.get(`level_${level.id}_rate`));
      if (Number.isFinite(mult) && mult >= 0) level.costMultiplierBp = Math.round(mult * 10000);
      if (Number.isFinite(rate) && rate >= 0 && rate <= 100) level.rateBp = Math.round(rate * 100);
    }
    for (const dept of policy.departments) {
      for (const level of policy.levels) {
        const v = Number(formData.get(`dept_${dept.id}_${level.id}`));
        if (Number.isFinite(v) && v >= 0 && v <= 100) dept.levelRatesBp[level.id] = Math.round(v * 100);
      }
    }

    // A new policy row rather than an update: approved cycles keep pointing at the
    // snapshot they were computed from, and the change itself stays auditable.
    getDb().prepare("INSERT INTO policy (body, status) VALUES (?, 'draft')").run(JSON.stringify(policy));

    // Only draft cycles follow the new policy; anything reviewed or beyond is frozen.
    const draftPeriods = getDb()
      .prepare("SELECT period_id FROM commission_cycles WHERE state = 'draft'")
      .all() as { period_id: string }[];
    for (const p of draftPeriods) ensureCycle(p.period_id);

    writeAudit(user.id, user.displayName, "تعديل سياسة العمولة", "policy", null,
      `تحديث السياسة وإعادة احتساب ${draftPeriods.length} دورة مسودة`);

    revalidatePath("/policy");
    revalidatePath("/cycles");
    return { ok: `حُفظت السياسة كمسودة · أُعيد احتساب ${draftPeriods.length} دورة` };
  });
}

export async function approvePolicyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return guarded(async () => {
    const user = await requirePermission("policy.approve");
    void formData;
    const latest = one<{ id: number; status: string }>("SELECT id, status FROM policy ORDER BY id DESC LIMIT 1");
    if (!latest) return { error: "لا توجد سياسة للاعتماد" };
    if (latest.status === "approved") return { ok: "السياسة معتمدة بالفعل" };

    run("UPDATE policy SET status='approved', approved_by=?, approved_at=? WHERE id=?",
      user.displayName, nowIso(), latest.id);
    writeAudit(user.id, user.displayName, "اعتماد سياسة", "policy", String(latest.id), "اعتماد نسخة السياسة الحالية");

    revalidatePath("/policy");
    return { ok: "اعتُمدت السياسة" };
  });
}
