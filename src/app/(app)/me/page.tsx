import { redirect } from "next/navigation";
import { assertCanReadEmployee, currentUser } from "@/lib/auth";
import { CYCLE_STATE_LABELS, type CycleState } from "@/lib/rbac";
import { employeeHistory, ensureCycle, getEmployee, payableFor } from "@/lib/cycles";
import { monthShort, ymOf } from "@/lib/dates";
import { AreaChart, Card, Empty, Kpi, KpiGrid, Money, Pct } from "@/components/ui";
import { PrintTrigger } from "@/components/print-trigger";
import { BrandMark } from "@/components/brand";

const STATE_PILL: Record<CycleState, string> = {
  draft: "pill-neutral", review: "pill-caution", approved: "pill-info", paid: "pill-positive", void: "pill-negative",
};

export default async function MyStatementPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.employeeId) {
    return <Card title="كشف العمولة"><Empty title="لا يوجد ملف موظف مرتبط بهذا الحساب" hint="راجع الإدارة المالية لربط حسابك بسجل موظف." /></Card>;
  }

  // Belt and braces: the page already comes from the session, but the guard is what
  // makes a hand-crafted request for someone else's id fail rather than succeed.
  await assertCanReadEmployee(user.employeeId);

  const employee = getEmployee(user.employeeId);
  const history = employeeHistory(user.employeeId);
  if (!employee || history.length === 0) {
    return <Card title="كشف العمولة"><Empty title="لا بيانات مبيعات لك بعد" /></Card>;
  }

  const { period: param } = await searchParams;
  const selected = history.find((h) => h.period_id === param) ?? history[0];
  const { cycle, result } = ensureCycle(selected.period_id);
  const payable = payableFor(cycle.id, result);
  const line = payable.lines.find((l) => l.employeeId === user.employeeId);

  const trend = [...history].reverse().slice(-12).map((h) => ({
    label: h.label, short: monthShort(ymOf(h.start_date)), value: h.profit_halalas,
  }));

  const lifetime = history.reduce(
    (a, h) => ({
      sales: a.sales + h.sales_halalas,
      profit: a.profit + h.profit_halalas,
      paid: a.paid + (h.state === "paid" ? Math.max(0, h.base_halalas + h.adj) : 0),
    }),
    { sales: 0, profit: 0, paid: 0 },
  );

  return (
    <>
      <Card style={{ marginBottom: 18, padding: "14px 18px" }} className="no-print">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{
              width: 40, height: 40, borderRadius: "50%", color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700,
              background: "linear-gradient(135deg, var(--brand-600), var(--brand-400))",
            }}>{employee.name.trim().slice(0, 1)}</span>
            <div>
              <b style={{ fontSize: 15, color: "var(--ink)" }}>{employee.name}</b>
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>كشف العمولة الشخصي</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <form>
              <select name="period" defaultValue={selected.period_id} style={{ width: "auto", minWidth: 160 }}
                aria-label="اختيار الفترة">
                {history.map((h) => <option key={h.period_id} value={h.period_id}>{h.label}</option>)}
              </select>
              <button type="submit" className="btn btn-ghost btn-sm" style={{ marginInlineStart: 8 }}>عرض</button>
            </form>
            <PrintTrigger />
          </div>
        </div>
      </Card>

      <KpiGrid min={190}>
        <Kpi label="مبيعاتي في الفترة" value={<Money halalas={selected.sales_halalas} decimals={0} />} />
        <Kpi label="ربحي في الفترة" value={<Money halalas={selected.profit_halalas} decimals={0} tone="positive" />} accent="var(--positive-vivid)" />
        <Kpi
          label="عمولتي الصافية"
          value={<Money halalas={line?.netHalalas ?? 0} tone="positive" />}
          foot={<span className={`pill ${STATE_PILL[cycle.state]}`}>{CYCLE_STATE_LABELS[cycle.state]}</span>}
          accent="var(--brand-500)"
        />
        <Kpi label="إجمالي ما صُرف لي" value={<Money halalas={lifetime.paid} decimals={0} />} foot={`عبر ${history.length} فترة`} accent="var(--info)" />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", gap: 18, alignItems: "start" }} className="acctrav-split">
        <Card className="print-block" title={`تفاصيل الاحتساب — ${selected.label}`}>
          <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <BrandMark size={34} />
              <div><b style={{ fontSize: 14, color: "var(--ink)" }}>ترافليون</b>
                <div style={{ fontSize: 10.5, color: "var(--text-2)" }}>كشف عمولة — {selected.label}</div></div>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-2)", textAlign: "start" }}>
              الموظف: <b style={{ color: "var(--ink)" }}>{employee.name}</b>
            </div>
          </header>

          {!line ? (
            <Empty title="لا يوجد سطر عمولة لهذه الفترة" />
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {result.model === "target" ? (
                    result.achieved ? (
                      <>
                        <tr><td>ربح الشركة في الشهر</td><td><Money halalas={result.totalProfitHalalas} /></td></tr>
                        <tr><td>هدف التكاليف الشهري</td><td><Money halalas={result.monthlyCostHalalas} /></td></tr>
                        <tr><td>المستوى المتحقق</td><td>{result.activeLevel!.label} ({(result.activeLevel!.rateBp / 100).toFixed(0)}%)</td></tr>
                        <tr><td>الفائض الموزَّع</td><td><Money halalas={result.surplusHalalas} /></td></tr>
                        <tr><td>وعاء عمولة المبيعات</td><td><Money halalas={result.salesPoolHalalas} /></td></tr>
                        <tr><td>حصتي من المبيعات</td><td><Pct bp={line.salesShareBp} decimals={2} /></td></tr>
                        <tr><td>حصتي من عدد الطلبات</td><td><Pct bp={line.orderShareBp} decimals={2} /></td></tr>
                        <tr><td>وزني المرجّح</td><td><Pct bp={line.weightBp} decimals={2} /></td></tr>
                      </>
                    ) : line.viaFallback ? (
                      <>
                        <tr><td colSpan={2}>
                          <div className="alert alert-caution"><span>◆</span>
                            <div>لم تحقق الشركة هدفها الشهري — طُبِّقت شبكة الأمان الفردية على ربحك الشخصي.</div></div>
                        </td></tr>
                        <tr><td>ربحي الشخصي</td><td><Money halalas={line.profitHalalas} /></td></tr>
                        <tr>
                          <td>نسبة شبكة الأمان</td>
                          <td>
                            <Pct bp={line.profitHalalas > 0 ? Math.round((line.baseCommissionHalalas * 10000) / line.profitHalalas) : 0} />
                          </td>
                        </tr>
                      </>
                    ) : (
                      <tr><td colSpan={2}>
                        <div className="alert alert-negative"><span>◆</span>
                          <div>لم تحقق الشركة هدفها الشهري ولم يتحقق شرط شبكة الأمان الفردية — لا عمولة مستحقة لهذه الفترة.</div></div>
                      </td></tr>
                    )
                  ) : (
                    <>
                      {line.refundAdjustmentHalalas > 0 && (
                        <tr><td>خصم حصة الاستردادات</td><td><Money halalas={-line.refundAdjustmentHalalas} tone="negative" /></td></tr>
                      )}
                      <tr><td>الربح المؤهل</td><td><Money halalas={line.eligibleProfitHalalas} /></td></tr>
                      {line.tierBreakdown.map((t, i) => (
                        <tr key={i}>
                          <td style={{ paddingInlineStart: 30 }}>{t.label} — {(t.rateBp / 100).toFixed(0)}% على <Money halalas={t.baseHalalas} decimals={0} /></td>
                          <td><Money halalas={t.commissionHalalas} /></td>
                        </tr>
                      ))}
                    </>
                  )}
                  <tr className="total-row"><td>العمولة الأساسية</td><td><Money halalas={line.baseCommissionHalalas} /></td></tr>
                  {line.adjustmentTotal !== 0 && (
                    <tr><td>التسويات</td><td><Money halalas={line.adjustmentTotal} tone={line.adjustmentTotal > 0 ? "positive" : "negative"} /></td></tr>
                  )}
                  <tr className="total-row">
                    <td>الصافي المستحق</td>
                    <td><Money halalas={line.netHalalas} tone="positive" /></td>
                  </tr>
                  {line.vatHalalas > 0 && (
                    <tr><td>ضريبة القيمة المضافة (تُضاف للفوترة)</td><td><Money halalas={line.vatHalalas} /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div style={{ display: "grid", gap: 18 }}>
          <Card title="تطور ربحي الشهري">
            <AreaChart points={trend} height={180} color="var(--positive-vivid)" id="me" />
          </Card>

          <Card flush title="سجلي عبر الفترات">
            <div className="table-wrap" style={{ border: "none", borderRadius: 0, maxHeight: 340, overflowY: "auto" }}>
              <table>
                <thead><tr><th>الفترة</th><th>الربح</th><th>العمولة</th><th>الحالة</th></tr></thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.period_id}>
                      <td>{h.label}</td>
                      <td><Money halalas={h.profit_halalas} decimals={0} /></td>
                      <td><Money halalas={Math.max(0, h.base_halalas + h.adj)} /></td>
                      <td><span className={`pill ${STATE_PILL[h.state]}`}>{CYCLE_STATE_LABELS[h.state]}</span></td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td>الإجمالي</td>
                    <td><Money halalas={lifetime.profit} decimals={0} /></td>
                    <td colSpan={2}><Money halalas={lifetime.paid} /> مصروفة</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <style>{`@media (max-width: 1100px) { .acctrav-split { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}
