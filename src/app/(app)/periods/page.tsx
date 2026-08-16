import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ensureCycle, getPeriod, latestPeriod, listEmployees, listPeriods, salesRowsFor } from "@/lib/cycles";
import { rows } from "@/lib/db";
import { Card, Empty, Money, Pct } from "@/components/ui";
import { PeriodPicker } from "@/components/period-picker";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { setPeriodCostAction } from "@/app/actions";

export default async function PeriodsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "view.all")) redirect("/me");

  const { period: param } = await searchParams;
  const periods = listPeriods();
  const period = (param ? getPeriod(param) : undefined) ?? latestPeriod();
  if (!period) return <Card title="لا فترات"><Empty title="لم تُستورد أي فترة بعد" /></Card>;

  const sales = salesRowsFor(period.id);
  const employees = new Map(listEmployees().map((e) => [e.id, e.name] as const));
  const { cycle } = ensureCycle(period.id);

  const totalSales = sales.reduce((a, r) => a + r.salesHalalas, 0);
  const totalProfit = sales.reduce((a, r) => a + r.profitHalalas, 0);
  const totalOrders = sales.reduce((a, r) => a + (r.saleCount ?? 0), 0);

  const txCounts = new Map(
    rows<{ employee_id: string; n: number }>(
      "SELECT employee_id, count(*) AS n FROM transactions WHERE period_id = ? GROUP BY employee_id", period.id,
    ).map((r) => [r.employee_id, r.n] as const),
  );

  return (
    <>
      <Card style={{ marginBottom: 18, padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>الفترة</span>
            <PeriodPicker periods={periods.map((p) => ({ id: p.id, label: p.label }))} value={period.id} basePath="/periods" />
            <span className="pill pill-neutral">مصدر: {period.source ?? "—"}</span>
          </div>
          <Link href={`/cycles/${period.id}`} className="btn btn-primary btn-sm">دورة العمولة</Link>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 18 }}>
        <Card><div style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 600 }}>المبيعات</div>
          <div style={{ fontSize: 21, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}><Money halalas={totalSales} decimals={0} /></div></Card>
        <Card><div style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 600 }}>مجمل الربح</div>
          <div style={{ fontSize: 21, fontWeight: 700, marginTop: 4 }}><Money halalas={totalProfit} decimals={0} tone="positive" /></div></Card>
        <Card><div style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 600 }}>عدد الطلبات</div>
          <div className="num" style={{ fontSize: 21, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{totalOrders || "—"}</div></Card>
        <Card>
          <div style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 600, marginBottom: 6 }}>هدف التكاليف الشهري</div>
          {can(user.role, "policy.edit") && cycle.state === "draft" ? (
            <ActionForm action={setPeriodCostAction}>
              <input type="hidden" name="periodId" value={period.id} />
              <div style={{ display: "flex", gap: 8 }}>
                <input name="cost" type="text" inputMode="decimal" defaultValue={(period.monthly_cost_halalas / 100).toFixed(2)} className="ltr" />
                <SubmitButton className="btn btn-sm">حفظ</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <div style={{ fontSize: 21, fontWeight: 700, color: "var(--ink)" }}>
              <Money halalas={period.monthly_cost_halalas} decimals={0} />
            </div>
          )}
        </Card>
      </div>

      <Card flush title={`بيانات ${period.label}`} subtitle={`${sales.length} موظف — مرتبة حسب الربح`}>
        <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <table>
            <thead>
              <tr><th>الموظف</th><th>المبيعات</th><th>الربح</th><th>الهامش</th><th>طلبات</th><th>استرداد</th><th>حجوزات</th></tr>
            </thead>
            <tbody>
              {sales.map((r) => (
                <tr key={r.employeeId}>
                  <td>
                    <b style={{ color: "var(--ink)" }}>{employees.get(r.employeeId) ?? r.employeeId}</b>
                    {r.excluded && <span className="pill pill-neutral" style={{ marginInlineStart: 6 }}>مستبعد</span>}
                  </td>
                  <td><Money halalas={r.salesHalalas} decimals={0} /></td>
                  <td><Money halalas={r.profitHalalas} /></td>
                  <td><Pct bp={r.salesHalalas > 0 ? Math.round((r.profitHalalas * 10000) / r.salesHalalas) : null} /></td>
                  <td className="num">{r.saleCount ?? "—"}</td>
                  <td className="num">{r.refundCount ?? "—"}</td>
                  <td className="num">{txCounts.get(r.employeeId) ?? "—"}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>الإجمالي</td>
                <td><Money halalas={totalSales} decimals={0} /></td>
                <td><Money halalas={totalProfit} /></td>
                <td><Pct bp={totalSales > 0 ? Math.round((totalProfit * 10000) / totalSales) : null} /></td>
                <td className="num">{totalOrders || "—"}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
