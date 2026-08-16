import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import {
  auditTrail, budgetForMonth, ensureCycle, getPeriod, latestPeriod, listEmployees,
  listPeriods, outstandingDues, payableFor, pnlForMonth,
} from "@/lib/cycles";
import { one } from "@/lib/db";
import { monthLabel, monthShort, ymOf } from "@/lib/dates";
import { AreaChart, Card, Delta, Donut, Empty, Kpi, KpiGrid, Money, Pct, Ring, riyals } from "@/components/ui";
import { PeriodPicker } from "@/components/period-picker";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Employees have no company-wide view; send them to their own statement.
  if (!can(user.role, "view.all")) redirect("/me");

  const { period: periodParam } = await searchParams;
  const periods = listPeriods();
  const period = (periodParam ? getPeriod(periodParam) : undefined) ?? latestPeriod();
  if (!period) {
    return <Card title="لا توجد فترات بعد"><Empty title="ابدأ باستيراد تقرير مبيعات" hint="بعد إضافة أول فترة ستظهر هنا مؤشرات الأداء والعمولات." /></Card>;
  }

  const ym = ymOf(period.start_date);
  const pnl = pnlForMonth(ym);
  const { cycle, result } = ensureCycle(period.id);
  const payable = payableFor(cycle.id, result);
  const dues = outstandingDues();
  const budget = budgetForMonth(ym);

  const chronological = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const index = chronological.findIndex((p) => p.id === period.id);
  const window12 = chronological.slice(Math.max(0, index - 11), index + 1);
  const trend = window12.map((p) => {
    const t = one<{ n: number }>("SELECT COALESCE(SUM(profit_halalas),0) AS n FROM sales_rows WHERE period_id = ?", p.id)!;
    return { label: p.label, short: monthShort(ymOf(p.start_date)), value: t.n };
  });

  const previous = index > 0 ? chronological[index - 1] : null;
  const previousPnl = previous ? pnlForMonth(ymOf(previous.start_date)) : null;

  const top = [...result.employees]
    .filter((e) => !e.excluded)
    .sort((a, b) => b.profitHalalas - a.profitHalalas)
    .slice(0, 5);
  const employeeNames = new Map(listEmployees().map((e) => [e.id, e.name] as const));
  const maxTopProfit = Math.max(...top.map((t) => t.profitHalalas), 1);

  const pendingMatches = one<{ n: number }>("SELECT count(*) AS n FROM name_matches WHERE resolved = 0")!.n;

  const alerts: { tone: string; text: string; href: string }[] = [];
  if (pendingMatches > 0 && can(user.role, "match.resolve"))
    alerts.push({ tone: "alert-caution", text: `${pendingMatches} اسم بحاجة لمطابقة يدوية`, href: "/matches" });
  if (cycle.state === "draft" && payable.grandTotalHalalas > 0)
    alerts.push({ tone: "alert-info", text: `دورة ${period.label} ما زالت مسودة — أرسلها للمراجعة عند اكتمال البيانات`, href: `/cycles/${period.id}` });
  if (dues.approved > 0)
    alerts.push({ tone: "alert-info", text: "توجد مستحقات معتمدة بانتظار الصرف", href: "/cycles" });
  if (budget.expenses_halalas > 0 && pnl.opexHalalas > budget.expenses_halalas)
    alerts.push({ tone: "alert-negative", text: `تجاوز ميزانية مصروفات ${monthLabel(ym)}`, href: "/budgets" });
  if (result.model === "target" && !result.achieved)
    alerts.push({ tone: "alert-caution", text: "لم يتحقق المستوى الأول من الهدف الشهري لهذه الفترة", href: `/cycles/${period.id}` });

  return (
    <>
      <Card style={{ padding: "14px 18px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>الفترة</span>
            <PeriodPicker periods={periods.map((p) => ({ id: p.id, label: p.label }))} value={period.id} basePath="/" />
            {result.model === "target" ? (
              result.achieved ? (
                <span className="pill pill-positive"><span className="dot" />{result.activeLevel!.label}</span>
              ) : (
                <span className="pill pill-caution"><span className="dot" />لم يتحقق الهدف الشهري</span>
              )
            ) : (
              <span className="pill pill-neutral">نظام الشرائح (أرشيف)</span>
            )}
          </div>
          <Link href={`/cycles/${period.id}`} className="btn btn-primary btn-sm">فتح دورة العمولة</Link>
        </div>
      </Card>

      <KpiGrid>
        <Kpi
          label="المبيعات"
          value={<Money halalas={pnl.revenueHalalas} decimals={0} />}
          foot={<><Delta current={pnl.revenueHalalas} previous={previousPnl?.revenueHalalas ?? null} /> مقابل {previous?.label ?? "—"}</>}
          accent="var(--brand-500)"
        />
        <Kpi
          label="مجمل الربح"
          value={<Money halalas={pnl.grossProfitHalalas} decimals={0} />}
          foot={<><Delta current={pnl.grossProfitHalalas} previous={previousPnl?.grossProfitHalalas ?? null} /> هامش <Pct bp={pnl.grossMarginBp} /></>}
          accent="var(--positive-vivid)"
        />
        <Kpi
          label="عمولات الفترة"
          value={<Money halalas={payable.grandTotalHalalas} decimals={0} />}
          foot={<>مبيعات {riyals(payable.totalNetHalalas)} · أقسام {riyals(payable.totalDeptHalalas)}</>}
          accent="var(--brand-300)"
        />
        {can(user.role, "expense.manage") && (
          <>
            <Kpi
              label="المصروفات التشغيلية"
              value={<Money halalas={pnl.opexHalalas} decimals={0} />}
              foot={pnl.opexHalalas === 0 ? "لا مصروفات مسجّلة لهذا الشهر" : undefined}
              accent="var(--caution-vivid)"
            />
            <Kpi
              label="صافي التشغيل"
              value={<Money halalas={pnl.operatingHalalas} decimals={0} tone={pnl.operatingHalalas >= 0 ? undefined : "negative"} />}
              foot={<>بعد العمولات والمصروفات · هامش <Pct bp={pnl.netMarginBp} /></>}
              accent={pnl.operatingHalalas >= 0 ? "var(--positive-vivid)" : "var(--negative-vivid)"}
            />
          </>
        )}
        <Kpi
          label="مستحقات غير مصروفة"
          value={<Money halalas={dues.total} decimals={0} />}
          foot={`معتمدة ${riyals(dues.approved)} · مسودة ${riyals(dues.draft)}`}
          accent="var(--info)"
        />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 18, alignItems: "start" }} className="acctrav-split">
        <div style={{ display: "grid", gap: 18 }}>
          <Card title="اتجاه الربح الشهري" subtitle={`آخر ${trend.length} فترة حتى ${period.label}${period.monthly_cost_halalas ? " — الخط المتقطع هو هدف التكاليف" : ""}`}>
            <AreaChart points={trend} reference={period.monthly_cost_halalas || null} id="dash" />
          </Card>

          {result.model === "target" && (
            <Card
              title={`تحقيق الهدف الشهري — ${period.label}`}
              subtitle={`الربح ${riyals(result.totalProfitHalalas)} من هدف ${riyals(result.monthlyCostHalalas)} ر.س`}
            >
              <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                <Ring
                  ratio={result.monthlyCostHalalas > 0 ? result.totalProfitHalalas / result.monthlyCostHalalas : 0}
                  color={result.achieved ? "var(--positive-vivid)" : "var(--caution-vivid)"}
                  label="من الهدف"
                />
                <div style={{ flex: 1, minWidth: 240, display: "grid", gap: 9 }}>
                  {result.levels.map((l) => (
                    <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span
                        className={`pill ${result.activeLevel?.id === l.id ? "pill-positive" : l.reached ? "pill-accent" : "pill-neutral"}`}
                        style={{ minWidth: 128, justifyContent: "center" }}
                      >
                        {l.label.split("—")[0].trim()} · {(l.rateBp / 100).toFixed(0)}%
                      </span>
                      <div className="bar-track">
                        <div
                          className="bar-fill"
                          style={{
                            width: `${Math.min(100, (result.totalProfitHalalas / (l.thresholdHalalas || 1)) * 100).toFixed(1)}%`,
                            background: l.reached ? "var(--positive-vivid)" : "var(--text-3)",
                          }}
                        />
                      </div>
                      <span className="num" style={{ fontSize: 11, color: "var(--text-2)", minWidth: 62 }}>
                        {riyals(l.thresholdHalalas)}
                      </span>
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 2 }}>
                    الفائض بعد التكاليف: <b className="num" style={{ color: "var(--ink)" }}>{riyals(result.surplusHalalas)}</b> ر.س
                    {result.achieved && (
                      <> · وعاء عمولة المبيعات ({(result.activeLevel!.rateBp / 100).toFixed(0)}%): <b className="num" style={{ color: "var(--positive)" }}>{riyals(result.salesPoolHalalas)}</b> ر.س</>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {can(user.role, "expense.manage") && pnl.opexByCategory.length > 0 && (
            <Card title={`توزيع مصروفات ${monthLabel(ym)}`} subtitle="حسب التصنيف" actions={<Link href="/expenses" className="btn btn-ghost btn-sm">إدارة المصروفات</Link>}>
              <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
                <Donut items={pnl.opexByCategory.map((c) => ({ label: c.name, value: c.amountHalalas, color: c.color }))} />
                <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 200 }}>
                  {pnl.opexByCategory.map((c) => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, gap: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color }} />
                        {c.name}
                      </span>
                      <b className="num">{riyals(c.amountHalalas)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          {alerts.length > 0 && (
            <Card title="تنبيهات تحتاج انتباهك">
              <div style={{ display: "grid", gap: 8 }}>
                {alerts.map((a, i) => (
                  <Link key={i} href={a.href} className={`alert ${a.tone}`} style={{ textDecoration: "none" }}>
                    <span>●</span>
                    <div>{a.text}</div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          <Card title={`أفضل أداء — ${period.label}`} subtitle="حسب مجمل الربح">
            {top.length === 0 ? (
              <Empty title="لا بيانات" />
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {top.map((t) => (
                  <div key={t.employeeId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 30, height: 30, borderRadius: "50%", flex: "none", color: "#fff",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                        background: "linear-gradient(135deg, var(--brand-600), var(--brand-400))",
                      }}
                    >
                      {(employeeNames.get(t.employeeId) ?? "؟").trim().slice(0, 1)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                        <b style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {employeeNames.get(t.employeeId) ?? t.employeeId}
                        </b>
                        <span className="num" style={{ color: "var(--text-2)" }}>
                          {riyals(t.profitHalalas)}
                        </span>
                      </div>
                      <div className="bar-track" style={{ marginTop: 4 }}>
                        <div className="bar-fill" style={{ width: `${((t.profitHalalas / maxTopProfit) * 100).toFixed(1)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {can(user.role, "audit.view") && (
            <Card title="آخر النشاطات" actions={<Link href="/audit" className="btn btn-ghost btn-xs">السجل كاملًا</Link>}>
              <div style={{ display: "grid", gap: 11 }}>
                {auditTrail(5).map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 9, fontSize: 11.5, lineHeight: 1.7 }}>
                    <span style={{ color: "var(--brand-400)", marginTop: 1 }}>●</span>
                    <div>
                      <b style={{ color: "var(--ink)" }}>{a.action}</b> — {a.details.length > 88 ? `${a.details.slice(0, 88)}…` : a.details}
                      <div className="ltr num" style={{ color: "var(--text-3)", fontSize: 10.5, marginTop: 1, textAlign: "start" }}>
                        {a.at} · {a.actor_name}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <style>{`@media (max-width: 1100px) { .acctrav-split { grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}
