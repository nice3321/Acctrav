import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can, CYCLE_STATE_LABELS, type CycleState } from "@/lib/rbac";
import { ensureCycle, listPeriods, payableFor } from "@/lib/cycles";
import { Card, Empty, Kpi, KpiGrid, Money } from "@/components/ui";

const STATE_PILL: Record<CycleState, string> = {
  draft: "pill-neutral", review: "pill-caution", approved: "pill-info", paid: "pill-positive", void: "pill-negative",
};

export default async function CyclesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "view.all")) redirect("/me");

  const periods = listPeriods();
  const rows = periods.map((p) => {
    const { cycle, result } = ensureCycle(p.id);
    const payable = payableFor(cycle.id, result);
    return { period: p, cycle, result, payable };
  });

  const totals = {
    draft: rows.filter((r) => r.cycle.state === "draft").reduce((a, r) => a + r.payable.grandTotalHalalas, 0),
    review: rows.filter((r) => r.cycle.state === "review").reduce((a, r) => a + r.payable.grandTotalHalalas, 0),
    approved: rows.filter((r) => r.cycle.state === "approved").reduce((a, r) => a + r.payable.grandTotalHalalas, 0),
    paid: rows.filter((r) => r.cycle.state === "paid").reduce((a, r) => a + r.payable.grandTotalHalalas, 0),
  };

  return (
    <>
      <KpiGrid min={190}>
        <Kpi label="مسودات" value={<Money halalas={totals.draft} decimals={0} />} accent="var(--text-3)" />
        <Kpi label="قيد المراجعة" value={<Money halalas={totals.review} decimals={0} />} accent="var(--caution-vivid)" />
        <Kpi label="معتمدة بانتظار الصرف" value={<Money halalas={totals.approved} decimals={0} />} accent="var(--info)" />
        <Kpi label="مصروفة" value={<Money halalas={totals.paid} decimals={0} />} accent="var(--positive-vivid)" />
      </KpiGrid>

      <Card flush title="دورات العمولة" subtitle="دورة واحدة لكل فترة · الأرقام تُجمَّد عند الخروج من المسودة">
        {rows.length === 0 ? (
          <Empty title="لا فترات بعد" />
        ) : (
          <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>الفترة</th><th>النموذج</th><th>الربح</th><th>وعاء العمولة</th>
                  <th>الإجمالي المستحق</th><th>الحالة</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ period, cycle, result, payable }) => (
                  <tr key={period.id}>
                    <td>
                      <b style={{ color: "var(--ink)" }}>{period.label}</b>
                      <div className="ltr num" style={{ fontSize: 10.5, color: "var(--text-3)", textAlign: "start" }}>
                        {period.start_date} → {period.end_date}
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${result.model === "target" ? "pill-accent" : "pill-neutral"}`}>
                        {result.model === "target" ? "الهدف الشهري" : "شرائح (أرشيف)"}
                      </span>
                    </td>
                    <td><Money halalas={result.totalProfitHalalas} decimals={0} /></td>
                    <td>
                      {result.model === "target"
                        ? <Money halalas={result.salesPoolHalalas} decimals={0} />
                        : <span style={{ color: "var(--text-3)" }}>—</span>}
                    </td>
                    <td><Money halalas={payable.grandTotalHalalas} tone={payable.grandTotalHalalas > 0 ? "positive" : "muted"} /></td>
                    <td><span className={`pill ${STATE_PILL[cycle.state]}`}>{CYCLE_STATE_LABELS[cycle.state]}</span></td>
                    <td style={{ textAlign: "end" }}>
                      <Link href={`/cycles/${period.id}`} className="btn btn-ghost btn-xs">فتح</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
