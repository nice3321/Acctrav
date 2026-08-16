import "server-only";
import { randomUUID } from "node:crypto";
import { getDb, nowIso, one, rows, tx } from "./db";
import { computeCycle, netPayable, type CycleResult, type Policy, type SalesRow } from "./commission-engine";
import { type CycleState, isMutable } from "./rbac";
import { sum } from "./money";

/* ------------------------------ policy ------------------------------ */

export function activePolicy(): Policy {
  const row = one<{ body: string }>("SELECT body FROM policy ORDER BY id DESC LIMIT 1");
  if (!row) throw new Error("لا توجد سياسة عمولة محفوظة — شغّل scripts/seed.mjs");
  return JSON.parse(row.body) as Policy;
}

export function policyMeta() {
  return one<{ id: number; status: string; approved_by: string | null; approved_at: string | null }>(
    "SELECT id, status, approved_by, approved_at FROM policy ORDER BY id DESC LIMIT 1",
  )!;
}

/* ------------------------------ periods ----------------------------- */

export interface PeriodRow {
  id: string; label: string; start_date: string; end_date: string;
  source: string | null; monthly_cost_halalas: number;
}

export function listPeriods(): PeriodRow[] {
  return rows<PeriodRow>("SELECT * FROM periods ORDER BY start_date DESC");
}
export function getPeriod(id: string): PeriodRow | undefined {
  return one<PeriodRow>("SELECT * FROM periods WHERE id = ?", id);
}
export function latestPeriod(): PeriodRow | undefined {
  return one<PeriodRow>("SELECT * FROM periods ORDER BY start_date DESC LIMIT 1");
}

export function salesRowsFor(periodId: string): SalesRow[] {
  const raw = rows<{
    employee_id: string; sales_halalas: number; profit_halalas: number;
    sale_count: number | null; refund_count: number | null;
    status: string; target_halalas: number;
  }>(
    `SELECT s.employee_id, s.sales_halalas, s.profit_halalas, s.sale_count, s.refund_count,
            e.status, e.target_halalas
       FROM sales_rows s JOIN employees e ON e.id = s.employee_id
      WHERE s.period_id = ?
      ORDER BY s.profit_halalas DESC`,
    periodId,
  );
  return raw.map((r) => ({
    employeeId: r.employee_id,
    salesHalalas: r.sales_halalas,
    profitHalalas: r.profit_halalas,
    saleCount: r.sale_count,
    refundCount: r.refund_count,
    excluded: r.status === "excluded",
    targetHalalas: r.target_halalas,
  }));
}

/* ------------------------------ cycles ------------------------------ */

export interface CycleRow {
  id: string; period_id: string; state: CycleState; model: string;
  snapshot: string; pool_halalas: number; computed_at: string;
  reviewed_by: string | null; reviewed_at: string | null;
  approved_by: string | null; approved_at: string | null;
  paid_by: string | null; paid_at: string | null; void_reason: string | null;
}

/**
 * Returns the cycle for a period, computing it on demand.
 *
 * A `draft` cycle is recomputed from live data on every read, so editing a policy
 * or a sales figure shows up immediately. From `review` onward the stored snapshot
 * is authoritative and is NEVER recomputed — those numbers have been seen and
 * signed off by a human, and quietly moving them would be the worst bug this
 * system could have.
 */
export function ensureCycle(periodId: string): { cycle: CycleRow; result: CycleResult } {
  const period = getPeriod(periodId);
  if (!period) throw new Error("الفترة غير موجودة");

  const existing = one<CycleRow>("SELECT * FROM commission_cycles WHERE period_id = ?", periodId);

  if (existing && !isMutable(existing.state)) {
    return { cycle: existing, result: JSON.parse(existing.snapshot) as CycleResult };
  }

  const result = computeCycle({
    periodStart: period.start_date,
    monthlyCostHalalas: period.monthly_cost_halalas,
    rows: salesRowsFor(periodId),
    policy: activePolicy(),
  });

  const cycle = tx((db) => {
    const id = existing?.id ?? randomUUID();
    if (existing) {
      db.prepare(
        "UPDATE commission_cycles SET model=?, snapshot=?, pool_halalas=?, computed_at=? WHERE id=?",
      ).run(result.model, JSON.stringify(result), result.salesPoolHalalas, nowIso(), id);
      db.prepare("DELETE FROM commission_items WHERE cycle_id = ?").run(id);
      db.prepare("DELETE FROM department_incentives WHERE cycle_id = ?").run(id);
    } else {
      db.prepare(
        `INSERT INTO commission_cycles (id, period_id, state, model, snapshot, pool_halalas)
         VALUES (?,?,'draft',?,?,?)`,
      ).run(id, periodId, result.model, JSON.stringify(result), result.salesPoolHalalas);
    }

    const insItem = db.prepare(
      "INSERT INTO commission_items (cycle_id, employee_id, base_halalas, vat_halalas, detail) VALUES (?,?,?,?,?)",
    );
    for (const e of result.employees) {
      insItem.run(id, e.employeeId, e.baseCommissionHalalas, e.vatHalalas, JSON.stringify(e));
    }
    const insDept = db.prepare(
      `INSERT INTO department_incentives (cycle_id, department_id, name, rate_bp, amount_halalas, vat_halalas)
       VALUES (?,?,?,?,?,?)`,
    );
    for (const d of result.departments) {
      insDept.run(id, d.departmentId, d.name, d.rateBp, d.amountHalalas, d.vatHalalas);
    }
    return db.prepare("SELECT * FROM commission_cycles WHERE id = ?").get(id) as unknown as CycleRow;
  });

  return { cycle, result };
}

export interface Adjustment {
  id: string; employee_id: string; amount_halalas: number;
  note: string; created_by: string; created_at: string;
}

export function adjustmentsFor(cycleId: string): Adjustment[] {
  return rows<Adjustment>("SELECT * FROM adjustments WHERE cycle_id = ? ORDER BY created_at", cycleId);
}

/** Base + adjustments per employee, floored at zero — what actually gets transferred. */
export function payableFor(cycleId: string, result: CycleResult) {
  const adj = adjustmentsFor(cycleId);
  const byEmp = new Map<string, number[]>();
  for (const a of adj) {
    if (!byEmp.has(a.employee_id)) byEmp.set(a.employee_id, []);
    byEmp.get(a.employee_id)!.push(a.amount_halalas);
  }
  const lines = result.employees.map((e) => ({
    ...e,
    adjustments: byEmp.get(e.employeeId) ?? [],
    adjustmentTotal: sum(byEmp.get(e.employeeId) ?? []),
    netHalalas: netPayable(e.baseCommissionHalalas, byEmp.get(e.employeeId) ?? []),
  }));
  return {
    lines,
    totalNetHalalas: sum(lines.map((l) => l.netHalalas)),
    totalDeptHalalas: result.totalDepartmentIncentiveHalalas,
    grandTotalHalalas: sum(lines.map((l) => l.netHalalas)) + result.totalDepartmentIncentiveHalalas,
  };
}

/* ------------------------- outstanding money ------------------------ */

export function outstandingDues() {
  const list = rows<{ state: CycleState; pool: number; label: string; period_id: string; cycle_id: string }>(
    `SELECT c.state, c.id AS cycle_id, c.period_id, p.label,
            (SELECT COALESCE(SUM(base_halalas),0) FROM commission_items WHERE cycle_id = c.id)
          + (SELECT COALESCE(SUM(amount_halalas),0) FROM department_incentives WHERE cycle_id = c.id) AS pool
       FROM commission_cycles c JOIN periods p ON p.id = c.period_id
      WHERE c.state IN ('draft','review','approved')`,
  );
  const by = (s: CycleState) => sum(list.filter((r) => r.state === s).map((r) => r.pool));
  return {
    rows: list,
    draft: by("draft"),
    review: by("review"),
    approved: by("approved"),
    total: sum(list.map((r) => r.pool)),
  };
}

/* ----------------------------- finance ------------------------------ */

export function expensesForMonth(ym: string) {
  return rows<{
    id: string; spent_on: string; category_id: string | null; description: string;
    vendor: string | null; amount_halalas: number; method: string; category_name: string | null;
    category_color: string | null;
  }>(
    `SELECT e.*, c.name AS category_name, c.color AS category_color
       FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE substr(e.spent_on,1,7) = ? ORDER BY e.spent_on DESC`,
    ym,
  );
}

export function financeMonths(): string[] {
  const a = rows<{ ym: string }>("SELECT DISTINCT substr(start_date,1,7) AS ym FROM periods");
  const b = rows<{ ym: string }>("SELECT DISTINCT substr(spent_on,1,7) AS ym FROM expenses");
  return [...new Set([...a, ...b].map((r) => r.ym))].sort((x, y) => y.localeCompare(x));
}

export interface MonthlyPnl {
  ym: string;
  periodId: string | null;
  revenueHalalas: number;
  cogsHalalas: number;
  grossProfitHalalas: number;
  commissionSalesHalalas: number;
  commissionDeptHalalas: number;
  opexHalalas: number;
  opexByCategory: { id: string; name: string; color: string; amountHalalas: number }[];
  operatingHalalas: number;
  grossMarginBp: number | null;
  netMarginBp: number | null;
}

export function pnlForMonth(ym: string): MonthlyPnl {
  const period = one<PeriodRow>("SELECT * FROM periods WHERE substr(start_date,1,7) = ?", ym);

  let revenue = 0, gross = 0, commSales = 0, commDept = 0;
  if (period) {
    const t = one<{ s: number; p: number }>(
      "SELECT COALESCE(SUM(sales_halalas),0) AS s, COALESCE(SUM(profit_halalas),0) AS p FROM sales_rows WHERE period_id = ?",
      period.id,
    )!;
    revenue = t.s;
    gross = t.p;
    const { cycle } = ensureCycle(period.id);
    commSales = one<{ n: number }>(
      "SELECT COALESCE(SUM(base_halalas),0) AS n FROM commission_items WHERE cycle_id = ?", cycle.id,
    )!.n;
    commDept = one<{ n: number }>(
      "SELECT COALESCE(SUM(amount_halalas),0) AS n FROM department_incentives WHERE cycle_id = ?", cycle.id,
    )!.n;
  }

  const cats = rows<{ id: string; name: string; color: string; amount: number }>(
    `SELECT COALESCE(c.id,'uncategorised') AS id, COALESCE(c.name,'غير مصنف') AS name,
            COALESCE(c.color,'#7A8A86') AS color, SUM(e.amount_halalas) AS amount
       FROM expenses e LEFT JOIN expense_categories c ON c.id = e.category_id
      WHERE substr(e.spent_on,1,7) = ? GROUP BY 1,2,3 ORDER BY amount DESC`,
    ym,
  );
  const opex = sum(cats.map((c) => c.amount));
  const operating = gross - opex - commSales - commDept;

  return {
    ym,
    periodId: period?.id ?? null,
    revenueHalalas: revenue,
    cogsHalalas: revenue - gross,
    grossProfitHalalas: gross,
    commissionSalesHalalas: commSales,
    commissionDeptHalalas: commDept,
    opexHalalas: opex,
    opexByCategory: cats.map((c) => ({ id: c.id, name: c.name, color: c.color, amountHalalas: c.amount })),
    operatingHalalas: operating,
    grossMarginBp: revenue > 0 ? Math.round((gross * 10000) / revenue) : null,
    netMarginBp: revenue > 0 ? Math.round((operating * 10000) / revenue) : null,
  };
}

export function budgetForMonth(ym: string) {
  return (
    one<{ ym: string; revenue_halalas: number; gross_profit_halalas: number; expenses_halalas: number }>(
      "SELECT * FROM budgets WHERE ym = ?", ym,
    ) ?? { ym, revenue_halalas: 0, gross_profit_halalas: 0, expenses_halalas: 0 }
  );
}

/* ---------------------------- employees ----------------------------- */

export interface EmployeeRow {
  id: string; name: string; status: string; target_halalas: number; aliases?: string;
}

export function listEmployees(): EmployeeRow[] {
  return rows<EmployeeRow>(
    `SELECT e.*, (SELECT group_concat(alias, '، ') FROM employee_aliases WHERE employee_id = e.id) AS aliases
       FROM employees e ORDER BY e.name COLLATE NOCASE`,
  );
}
export function getEmployee(id: string): EmployeeRow | undefined {
  return one<EmployeeRow>("SELECT * FROM employees WHERE id = ?", id);
}

export function employeeHistory(employeeId: string) {
  return rows<{
    period_id: string; label: string; start_date: string;
    sales_halalas: number; profit_halalas: number; state: CycleState;
    base_halalas: number; vat_halalas: number; adj: number;
  }>(
    `SELECT p.id AS period_id, p.label, p.start_date, s.sales_halalas, s.profit_halalas,
            COALESCE(c.state,'draft') AS state,
            COALESCE(i.base_halalas,0) AS base_halalas, COALESCE(i.vat_halalas,0) AS vat_halalas,
            COALESCE((SELECT SUM(amount_halalas) FROM adjustments
                       WHERE cycle_id = c.id AND employee_id = s.employee_id),0) AS adj
       FROM sales_rows s
       JOIN periods p ON p.id = s.period_id
  LEFT JOIN commission_cycles c ON c.period_id = p.id
  LEFT JOIN commission_items i ON i.cycle_id = c.id AND i.employee_id = s.employee_id
      WHERE s.employee_id = ?
      ORDER BY p.start_date DESC`,
    employeeId,
  );
}

export function auditTrail(limit = 200) {
  return rows<{ id: string; at: string; actor_name: string; action: string; entity: string | null; details: string }>(
    "SELECT * FROM audit_events ORDER BY at DESC, rowid DESC LIMIT ?", limit,
  );
}

export function writeAudit(actorId: string | null, actorName: string, action: string, entity: string, entityId: string | null, details: string) {
  getDb()
    .prepare("INSERT INTO audit_events (id, at, actor_id, actor_name, action, entity, entity_id, details) VALUES (?,?,?,?,?,?,?,?)")
    .run(randomUUID(), nowIso(), actorId, actorName, action, entity, entityId, details);
}
