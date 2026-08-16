import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { budgetForMonth, financeMonths, pnlForMonth } from "@/lib/cycles";
import { monthLabel } from "@/lib/dates";
import { Card, Empty, Money, riyals } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveBudgetAction } from "@/app/actions";

function Variance({ budget, actual, invert = false }: { budget: number; actual: number; invert?: boolean }) {
  if (!budget) return <td style={{ color: "var(--text-3)" }} className="num">—</td>;
  const diff = actual - budget;
  const good = invert ? diff <= 0 : diff >= 0;
  return (
    <td className="num" style={{ color: good ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}>
      {diff >= 0 ? "+" : ""}{riyals(diff)}
      <span style={{ fontSize: 9.5, marginInlineStart: 4 }}>({((actual / budget) * 100).toFixed(0)}%)</span>
    </td>
  );
}

export default async function BudgetsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "budget.manage")) redirect("/");

  const months = financeMonths();
  const years = [...new Set(months.map((m) => m.slice(0, 4)))].sort((a, b) => b.localeCompare(a));

  return (
    <>
      {years.map((year) => {
        const yearMonths = months.filter((m) => m.startsWith(year)).sort();
        return (
          <Card key={year} flush title={`ميزانية ${year}`} subtitle="الميزانية مقابل التنفيذ الفعلي المحتسب من المبيعات والمصروفات" style={{ marginBottom: 18 }}>
            {yearMonths.length === 0 ? (
              <Empty title="لا أشهر في هذه السنة" />
            ) : (
              <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>الشهر</th>
                      <th>إيرادات: ميزانية</th><th>فعلي</th><th>انحراف</th>
                      <th>ربح: ميزانية</th><th>فعلي</th><th>انحراف</th>
                      <th>مصروفات: سقف</th><th>فعلي</th><th>انحراف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {yearMonths.map((m) => {
                      const b = budgetForMonth(m);
                      const a = pnlForMonth(m);
                      return (
                        <tr key={m}>
                          <td><b style={{ color: "var(--ink)" }}>{monthLabel(m)}</b></td>
                          <td className="num">{b.revenue_halalas ? riyals(b.revenue_halalas) : "—"}</td>
                          <td><Money halalas={a.revenueHalalas} decimals={0} /></td>
                          <Variance budget={b.revenue_halalas} actual={a.revenueHalalas} />
                          <td className="num">{b.gross_profit_halalas ? riyals(b.gross_profit_halalas) : "—"}</td>
                          <td><Money halalas={a.grossProfitHalalas} decimals={0} /></td>
                          <Variance budget={b.gross_profit_halalas} actual={a.grossProfitHalalas} />
                          <td className="num">{b.expenses_halalas ? riyals(b.expenses_halalas) : "—"}</td>
                          <td><Money halalas={a.opexHalalas} decimals={0} /></td>
                          <Variance budget={b.expenses_halalas} actual={a.opexHalalas} invert />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}

      <Card title="تحديد ميزانية شهر" subtitle="اترك أي حقل صفرًا لتعطيل مقارنته">
        <ActionForm action={saveBudgetAction}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
            <div className="field">
              <label htmlFor="b-ym">الشهر</label>
              <input id="b-ym" name="ym" type="month" defaultValue={months[0] ?? new Date().toISOString().slice(0, 7)} required />
            </div>
            <div className="field">
              <label htmlFor="b-rev">الإيرادات المستهدفة (ر.س)</label>
              <input id="b-rev" name="revenue" type="text" inputMode="decimal" defaultValue="0" className="ltr" />
            </div>
            <div className="field">
              <label htmlFor="b-gp">مجمل الربح المستهدف (ر.س)</label>
              <input id="b-gp" name="grossProfit" type="text" inputMode="decimal" defaultValue="0" className="ltr" />
            </div>
            <div className="field">
              <label htmlFor="b-exp">سقف المصروفات (ر.س)</label>
              <input id="b-exp" name="expenses" type="text" inputMode="decimal" defaultValue="0" className="ltr" />
            </div>
          </div>
          <div style={{ marginTop: 14 }}><SubmitButton>حفظ الميزانية</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
