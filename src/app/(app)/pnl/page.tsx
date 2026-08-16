import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { financeMonths, pnlForMonth } from "@/lib/cycles";
import { monthLabel, monthShort } from "@/lib/dates";
import { Bars, Card, Empty, Money } from "@/components/ui";
import { MonthPicker } from "@/components/month-picker";
import { PrintTrigger } from "@/components/print-trigger";
import { BrandMark } from "@/components/brand";

/** One row of the income statement. Defined at module scope: a component created
 *  inside render would remount its subtree on every parent render. */
function Line({ label, current, ytdValue, bold, indent, tone, sub }: {
  label: string; current: number; ytdValue: number;
  bold?: boolean; indent?: boolean; tone?: "positive" | "negative"; sub?: string;
}) {
  return (
    <tr style={bold ? { fontWeight: 700 } : undefined}>
      <td style={{ paddingInlineStart: indent ? 30 : undefined, color: bold ? "var(--ink)" : undefined }}>
        {label}
        {sub && <div style={{ fontSize: 10.5, color: "var(--text-3)", fontWeight: 400 }}>{sub}</div>}
      </td>
      <td><Money halalas={current} tone={tone} /></td>
      <td><Money halalas={ytdValue} tone="muted" /></td>
    </tr>
  );
}

export default async function PnlPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "expense.manage")) redirect("/");

  const months = financeMonths();
  if (months.length === 0) return <Card title="قائمة الدخل"><Empty title="لا بيانات مالية بعد" /></Card>;

  const { month: param } = await searchParams;
  const ym = param && months.includes(param) ? param : months[0];
  const s = pnlForMonth(ym);
  const year = ym.slice(0, 4);

  const ytdMonths = months.filter((m) => m.startsWith(year) && m <= ym).sort();
  const ytd = ytdMonths.map(pnlForMonth).reduce(
    (a, x) => ({
      revenue: a.revenue + x.revenueHalalas,
      cogs: a.cogs + x.cogsHalalas,
      gross: a.gross + x.grossProfitHalalas,
      commSales: a.commSales + x.commissionSalesHalalas,
      commDept: a.commDept + x.commissionDeptHalalas,
      opex: a.opex + x.opexHalalas,
      operating: a.operating + x.operatingHalalas,
    }),
    { revenue: 0, cogs: 0, gross: 0, commSales: 0, commDept: 0, opex: 0, operating: 0 },
  );

  const ytdByCategory = (id: string) =>
    ytdMonths.map(pnlForMonth).reduce((a, x) => a + (x.opexByCategory.find((c) => c.id === id)?.amountHalalas ?? 0), 0);

  const yearMonths = months.filter((m) => m.startsWith(year)).sort();

  return (
    <>
      <Card style={{ marginBottom: 18, padding: "14px 18px" }} className="no-print">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>الشهر</span>
            <MonthPicker value={ym} basePath="/pnl" />
          </div>
          <PrintTrigger />
        </div>
      </Card>

      {s.revenueHalalas === 0 && (
        <div className="alert alert-caution" style={{ marginBottom: 16 }}>
          <span>◆</span><div>لا توجد فترة مبيعات مستوردة لشهر {monthLabel(ym)} — تظهر المصروفات فقط.</div>
        </div>
      )}
      {s.revenueHalalas > 0 && s.opexHalalas === 0 && (
        <div className="alert alert-info no-print" style={{ marginBottom: 16 }}>
          <span>◆</span>
          <div>لم تُسجَّل مصروفات تشغيلية لهذا الشهر — صافي التشغيل حاليًا = مجمل الربح ناقص العمولات فقط.</div>
        </div>
      )}

      <Card className="print-block" style={{ marginBottom: 18 }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", paddingBottom: 16, marginBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
            <BrandMark size={40} />
            <div>
              <b style={{ fontSize: 15, color: "var(--ink)" }}>ترافليون</b>
              <div style={{ fontSize: 10.5, color: "var(--text-2)" }}>قائمة الدخل التشغيلية — {monthLabel(ym)}</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.8, textAlign: "start" }}>
            العملة: ريال سعودي
            <br />
            أُعدت بواسطة: {user.displayName}
          </div>
        </header>

        <div className="table-wrap">
          <table>
            <thead><tr><th style={{ width: "52%" }}>البند</th><th>{monthLabel(ym)}</th><th>منذ بداية {year}</th></tr></thead>
            <tbody>
              <Line label="إيرادات المبيعات" current={s.revenueHalalas} ytdValue={ytd.revenue} bold />
              <Line label="تكلفة الخدمات المباعة" current={-s.cogsHalalas} ytdValue={-ytd.cogs} indent />
              <Line label="مجمل الربح" current={s.grossProfitHalalas} ytdValue={ytd.gross} bold tone="positive"
                sub={s.grossMarginBp !== null ? `هامش مجمل ${(s.grossMarginBp / 100).toFixed(1)}%` : undefined} />
              <Line label="عمولات فريق المبيعات" current={-s.commissionSalesHalalas} ytdValue={-ytd.commSales} indent />
              <Line label="حوافز الأقسام المؤثرة" current={-s.commissionDeptHalalas} ytdValue={-ytd.commDept} indent />
              {s.opexByCategory.map((c) => (
                <Line key={c.id} label={c.name} current={-c.amountHalalas} ytdValue={-ytdByCategory(c.id)} indent />
              ))}
              <Line label="إجمالي التكاليف التشغيلية"
                current={-(s.opexHalalas + s.commissionSalesHalalas + s.commissionDeptHalalas)}
                ytdValue={-(ytd.opex + ytd.commSales + ytd.commDept)} bold />
              <Line label="صافي الربح التشغيلي" current={s.operatingHalalas} ytdValue={ytd.operating} bold
                tone={s.operatingHalalas >= 0 ? "positive" : "negative"}
                sub={s.netMarginBp !== null ? `هامش صافي ${(s.netMarginBp / 100).toFixed(1)}%` : undefined} />
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`مجمل الربح مقابل صافي التشغيل — ${year}`}
        subtitle="الأخضر الداكن: مجمل الربح · الفاتح: صافي التشغيل بعد كل التكاليف">
        <Bars
          dual
          points={yearMonths.map((m) => {
            const x = pnlForMonth(m);
            return { label: monthLabel(m), short: monthShort(m), value: x.grossProfitHalalas, value2: Math.max(0, x.operatingHalalas) };
          })}
        />
      </Card>
    </>
  );
}
