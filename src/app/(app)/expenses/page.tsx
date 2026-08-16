import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { budgetForMonth, expensesForMonth, financeMonths, pnlForMonth } from "@/lib/cycles";
import { rows } from "@/lib/db";
import { monthLabel } from "@/lib/dates";
import { Card, Donut, Empty, Kpi, KpiGrid, Money, riyals } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { deleteExpenseAction, saveExpenseAction } from "@/app/actions";
import { MonthPicker } from "@/components/month-picker";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "expense.manage")) redirect("/");

  const months = financeMonths();
  const { month: param } = await searchParams;
  const ym = param && /^\d{4}-\d{2}$/.test(param) ? param : months[0] ?? new Date().toISOString().slice(0, 7);

  const list = expensesForMonth(ym);
  const pnl = pnlForMonth(ym);
  const budget = budgetForMonth(ym);
  const categories = rows<{ id: string; name: string }>("SELECT id, name FROM expense_categories ORDER BY name");
  const total = list.reduce((a, e) => a + e.amount_halalas, 0);

  return (
    <>
      <Card style={{ marginBottom: 18, padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>الشهر</span>
          <MonthPicker value={ym} basePath="/expenses" />
          {budget.expenses_halalas > 0 && (
            <span className={`pill ${total > budget.expenses_halalas ? "pill-negative" : "pill-positive"}`}>
              {total > budget.expenses_halalas ? "تجاوز الميزانية" : "ضمن الميزانية"}
            </span>
          )}
        </div>
      </Card>

      <KpiGrid min={200}>
        <Kpi label={`مصروفات ${monthLabel(ym)}`} value={<Money halalas={total} decimals={0} />} foot={`${list.length} قيد`} accent="var(--caution-vivid)" />
        <Kpi
          label="ميزانية الشهر"
          value={budget.expenses_halalas > 0 ? <Money halalas={budget.expenses_halalas} decimals={0} /> : <span style={{ fontSize: 15, color: "var(--text-3)" }}>غير محددة</span>}
          foot={budget.expenses_halalas > 0
            ? <Money halalas={budget.expenses_halalas - total} decimals={0} tone={budget.expenses_halalas - total >= 0 ? "positive" : "negative"} />
            : undefined}
          accent="var(--info)"
        />
        <Kpi
          label="أعلى تصنيف"
          value={<span style={{ fontSize: 16 }}>{pnl.opexByCategory[0]?.name ?? "—"}</span>}
          foot={pnl.opexByCategory[0] ? <Money halalas={pnl.opexByCategory[0].amountHalalas} decimals={0} /> : undefined}
        />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 18, alignItems: "start" }} className="acctrav-split">
        <div style={{ display: "grid", gap: 18 }}>
          <Card flush title={`قيود ${monthLabel(ym)}`}>
            {list.length === 0 ? (
              <Empty title="لا مصروفات مسجّلة لهذا الشهر" hint="سجّل الرواتب والإيجار والتسويق ليكتمل احتساب صافي الربح في قائمة الدخل." />
            ) : (
              <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
                <table>
                  <thead><tr><th>التاريخ</th><th>البيان</th><th>التصنيف</th><th>الجهة</th><th>الدفع</th><th>المبلغ</th><th /></tr></thead>
                  <tbody>
                    {list.map((e) => (
                      <tr key={e.id}>
                        <td className="ltr num" style={{ fontSize: 11, textAlign: "start" }}>{e.spent_on}</td>
                        <td><b style={{ color: "var(--ink)" }}>{e.description}</b></td>
                        <td>
                          <span className="pill pill-neutral">
                            <span className="dot" style={{ color: e.category_color ?? "var(--text-3)" }} />
                            {e.category_name ?? "غير مصنف"}
                          </span>
                        </td>
                        <td style={{ fontSize: 11.5, color: "var(--text-2)" }}>{e.vendor ?? "—"}</td>
                        <td style={{ fontSize: 11.5 }}>{e.method === "cash" ? "نقدًا" : "تحويل بنكي"}</td>
                        <td><Money halalas={e.amount_halalas} /></td>
                        <td style={{ textAlign: "end" }}>
                          <ActionForm action={deleteExpenseAction}>
                            <input type="hidden" name="expenseId" value={e.id} />
                            <SubmitButton className="btn btn-danger btn-xs" confirm={`حذف قيد "${e.description}"؟`}>حذف</SubmitButton>
                          </ActionForm>
                        </td>
                      </tr>
                    ))}
                    <tr className="total-row"><td colSpan={5}>الإجمالي</td><td><Money halalas={total} /></td><td /></tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {pnl.opexByCategory.length > 0 && (
            <Card title="التوزيع حسب التصنيف">
              <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
                <Donut items={pnl.opexByCategory.map((c) => ({ label: c.name, value: c.amountHalalas, color: c.color }))} />
                <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 200 }}>
                  {pnl.opexByCategory.map((c) => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, gap: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color }} />{c.name}
                      </span>
                      <b className="num">{riyals(c.amountHalalas)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>

        <Card title="تسجيل مصروف">
          <ActionForm action={saveExpenseAction} resetOnSuccess>
            <div style={{ display: "grid", gap: 12 }}>
              <div className="field">
                <label htmlFor="ex-date">التاريخ</label>
                <input id="ex-date" name="spentOn" type="date" defaultValue={`${ym}-15`} required />
              </div>
              <div className="field">
                <label htmlFor="ex-amount">المبلغ (ر.س)</label>
                <input id="ex-amount" name="amount" type="text" inputMode="decimal" placeholder="0.00" required className="ltr" />
              </div>
              <div className="field">
                <label htmlFor="ex-desc">البيان</label>
                <input id="ex-desc" name="description" type="text" placeholder="رواتب فريق المبيعات" required />
              </div>
              <div className="field">
                <label htmlFor="ex-cat">التصنيف</label>
                <select id="ex-cat" name="categoryId">
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ex-method">طريقة الدفع</label>
                <select id="ex-method" name="method" defaultValue="bank">
                  <option value="bank">تحويل بنكي</option>
                  <option value="cash">نقدًا</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="ex-vendor">الجهة / المورد (اختياري)</label>
                <input id="ex-vendor" name="vendor" type="text" />
              </div>
              <SubmitButton>تسجيل المصروف</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      </div>

      <style>{`@media (max-width: 1100px) { .acctrav-split { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}
