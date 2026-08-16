import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { CYCLE_STATE_LABELS, can, nextStates, type CycleState } from "@/lib/rbac";
import { adjustmentsFor, ensureCycle, getPeriod, listEmployees, payableFor } from "@/lib/cycles";
import { Card, Empty, Kpi, KpiGrid, Money, Pct, riyals } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addAdjustmentAction, deleteAdjustmentAction, transitionCycleAction } from "@/app/actions";

const STATE_PILL: Record<CycleState, string> = {
  draft: "pill-neutral", review: "pill-caution", approved: "pill-info", paid: "pill-positive", void: "pill-negative",
};
const TRANSITION_LABEL: Record<string, string> = {
  review: "إرسال للمراجعة", approved: "اعتماد الدورة", paid: "تسجيل الصرف",
  draft: "إرجاع لمسودة", void: "إبطال الدورة",
};

export default async function CycleDetailPage({ params }: { params: Promise<{ periodId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "view.all")) redirect("/me");

  const { periodId } = await params;
  const period = getPeriod(periodId);
  if (!period) notFound();

  const { cycle, result } = ensureCycle(periodId);
  const payable = payableFor(cycle.id, result);
  const adjustments = adjustmentsFor(cycle.id);
  const employees = new Map(listEmployees().map((e) => [e.id, e.name] as const));
  const available = nextStates(user.role, cycle.state);
  const canAdjust = can(user.role, "commission.adjust") && cycle.state === "draft";

  return (
    <>
      <Card style={{ marginBottom: 18, padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Link href="/cycles" className="btn btn-ghost btn-sm">‹ الدورات</Link>
            <h1 style={{ fontSize: 17 }}>{period.label}</h1>
            <span className={`pill ${STATE_PILL[cycle.state]}`}>{CYCLE_STATE_LABELS[cycle.state]}</span>
            <span className={`pill ${result.model === "target" ? "pill-accent" : "pill-neutral"}`}>
              {result.model === "target" ? "نموذج الهدف الشهري" : "نظام الشرائح"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} className="no-print">
            {available.map((to) =>
              to === "void" ? null : (
                <ActionForm key={to} action={transitionCycleAction}>
                  <input type="hidden" name="periodId" value={periodId} />
                  <input type="hidden" name="to" value={to} />
                  <SubmitButton
                    className={`btn btn-sm ${to === "paid" ? "btn-positive" : to === "draft" ? "btn-ghost" : "btn-primary"}`}
                    confirm={
                      to === "paid"
                        ? `سيتم تسجيل صرف ${riyals(payable.grandTotalHalalas, 2)} ر.س. هذا الإجراء نهائي ولا يمكن التراجع عنه. المتابعة؟`
                        : to === "approved"
                          ? "الاعتماد يجمّد أرقام الدورة نهائيًا. المتابعة؟"
                          : undefined
                    }
                  >
                    {TRANSITION_LABEL[to]}
                  </SubmitButton>
                </ActionForm>
              ),
            )}
          </div>
        </div>
        {cycle.state !== "draft" && (
          <p style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 10 }}>
            الأرقام مجمَّدة من لقطة وقت الإرسال للمراجعة — تعديل السياسة أو المبيعات لن يغيّرها.
            {cycle.reviewed_by && ` · راجعها ${cycle.reviewed_by}`}
            {cycle.approved_by && ` · اعتمدها ${cycle.approved_by}`}
            {cycle.paid_by && ` · صرفها ${cycle.paid_by}`}
          </p>
        )}
      </Card>

      <KpiGrid min={200}>
        <Kpi label="ربح الفترة" value={<Money halalas={result.totalProfitHalalas} decimals={0} />} />
        <Kpi
          label="هدف التكاليف"
          value={<Money halalas={result.monthlyCostHalalas} decimals={0} />}
          foot={result.model === "target"
            ? (result.achieved ? `تحقق: ${result.activeLevel!.label}` : "لم يتحقق المستوى الأول")
            : "لا ينطبق على نظام الشرائح"}
          accent={result.achieved ? "var(--positive-vivid)" : "var(--caution-vivid)"}
        />
        <Kpi
          label="وعاء عمولة المبيعات"
          value={<Money halalas={result.salesPoolHalalas} decimals={0} />}
          foot={result.achieved ? `${(result.activeLevel!.rateBp / 100).toFixed(0)}% من فائض ${riyals(result.surplusHalalas)}` : undefined}
        />
        <Kpi
          label="الإجمالي المستحق"
          value={<Money halalas={payable.grandTotalHalalas} tone="positive" />}
          foot={`موظفون ${riyals(payable.totalNetHalalas)} · أقسام ${riyals(payable.totalDeptHalalas)}`}
          accent="var(--positive-vivid)"
        />
      </KpiGrid>

      {!result.achieved && result.model === "target" && (
        <div className="alert alert-caution" style={{ marginBottom: 18 }}>
          <span>◆</span>
          <div>
            لم يبلغ ربح الفترة هدف التكاليف، فلا فائض يُوزَّع ولا حوافز أقسام.
            {result.employees.some((e) => e.viaFallback)
              ? " طُبِّقت شبكة الأمان الفردية: كل موظف حقق ربحًا مؤهلًا يتقاضى نسبة من ربحه الشخصي."
              : " شبكة الأمان الفردية غير مفعّلة، فلا عمولات لهذه الفترة."}
          </div>
        </div>
      )}

      <Card flush title="كشوف الموظفين" subtitle="الأساس + التسويات = الصافي المستحق" style={{ marginBottom: 18 }}>
        <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>الموظف</th><th>المبيعات</th><th>الربح</th>
                <th>{result.model === "target" ? "الوزن" : "الربح المؤهل"}</th>
                <th>الأساس</th><th>التسويات</th><th>الصافي</th>
              </tr>
            </thead>
            <tbody>
              {payable.lines.map((line) => (
                <tr key={line.employeeId}>
                  <td>
                    <b style={{ color: "var(--ink)" }}>{employees.get(line.employeeId) ?? line.employeeId}</b>
                    {line.excluded && <span className="pill pill-neutral" style={{ marginInlineStart: 6 }}>مستبعد</span>}
                    {line.viaFallback && <span className="pill pill-caution" style={{ marginInlineStart: 6 }}>شبكة أمان</span>}
                  </td>
                  <td><Money halalas={line.salesHalalas} decimals={0} /></td>
                  <td><Money halalas={line.profitHalalas} decimals={0} /></td>
                  <td>
                    {result.model === "target"
                      ? <Pct bp={line.weightBp} decimals={2} />
                      : <Money halalas={line.eligibleProfitHalalas} decimals={0} />}
                  </td>
                  <td><Money halalas={line.baseCommissionHalalas} /></td>
                  <td>
                    {line.adjustmentTotal === 0
                      ? <span style={{ color: "var(--text-3)" }}>—</span>
                      : <Money halalas={line.adjustmentTotal} tone={line.adjustmentTotal > 0 ? "positive" : "negative"} />}
                  </td>
                  <td><Money halalas={line.netHalalas} tone={line.netHalalas > 0 ? "positive" : "muted"} /></td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={4}>الإجمالي</td>
                <td><Money halalas={result.totalEmployeeCommissionHalalas} /></td>
                <td><Money halalas={payable.totalNetHalalas - result.totalEmployeeCommissionHalalas} /></td>
                <td><Money halalas={payable.totalNetHalalas} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {result.departments.length > 0 && (
        <Card flush title="حوافز الأقسام المؤثرة" subtitle="نسبة من الفائض حسب المستوى المتحقق" style={{ marginBottom: 18 }}>
          <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
            <table>
              <thead><tr><th>القسم</th><th>النسبة</th><th>المبلغ</th></tr></thead>
              <tbody>
                {result.departments.map((d) => (
                  <tr key={d.departmentId}>
                    <td><b style={{ color: "var(--ink)" }}>{d.name}</b></td>
                    <td><Pct bp={d.rateBp} /></td>
                    <td><Money halalas={d.amountHalalas} tone={d.amountHalalas > 0 ? "positive" : "muted"} /></td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={2}>الإجمالي</td>
                  <td><Money halalas={result.totalDepartmentIncentiveHalalas} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: canAdjust ? "minmax(0,1fr) 340px" : "1fr", gap: 18, alignItems: "start" }} className="acctrav-split">
        <Card flush title="سجل التسويات اليدوية" subtitle="كل تسوية تحمل سببًا ومُنفِّذًا — لا تعديل مجهول على المال">
          {adjustments.length === 0 ? (
            <Empty title="لا تسويات على هذه الدورة" />
          ) : (
            <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
              <table>
                <thead><tr><th>الموظف</th><th>المبلغ</th><th>السبب</th><th>بواسطة</th>{canAdjust && <th />}</tr></thead>
                <tbody>
                  {adjustments.map((a) => (
                    <tr key={a.id}>
                      <td>{employees.get(a.employee_id) ?? a.employee_id}</td>
                      <td><Money halalas={a.amount_halalas} tone={a.amount_halalas > 0 ? "positive" : "negative"} /></td>
                      <td style={{ fontSize: 11.5 }}>{a.note}</td>
                      <td style={{ fontSize: 11, color: "var(--text-2)" }}>
                        {a.created_by}
                        <div className="ltr num" style={{ fontSize: 10, color: "var(--text-3)", textAlign: "start" }}>{a.created_at}</div>
                      </td>
                      {canAdjust && (
                        <td style={{ textAlign: "end" }}>
                          <ActionForm action={deleteAdjustmentAction}>
                            <input type="hidden" name="adjustmentId" value={a.id} />
                            <input type="hidden" name="periodId" value={periodId} />
                            <SubmitButton className="btn btn-danger btn-xs" confirm="حذف هذه التسوية؟">حذف</SubmitButton>
                          </ActionForm>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {canAdjust && (
          <Card title="إضافة تسوية">
            <ActionForm action={addAdjustmentAction} resetOnSuccess>
              <input type="hidden" name="periodId" value={periodId} />
              <div style={{ display: "grid", gap: 12 }}>
                <div className="field">
                  <label htmlFor="adj-emp">الموظف</label>
                  <select id="adj-emp" name="employeeId" required>
                    {payable.lines.map((l) => (
                      <option key={l.employeeId} value={l.employeeId}>{employees.get(l.employeeId) ?? l.employeeId}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="adj-amount">المبلغ بالريال (سالب للخصم)</label>
                  <input id="adj-amount" name="amount" type="text" inputMode="decimal" placeholder="500 أو -250" required className="ltr" />
                </div>
                <div className="field">
                  <label htmlFor="adj-note">السبب</label>
                  <input id="adj-note" name="note" type="text" placeholder="مثال: مكافأة حملة الصيف" required />
                </div>
                <SubmitButton>إضافة التسوية</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        )}
      </div>

      <style>{`@media (max-width: 1100px) { .acctrav-split { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}
