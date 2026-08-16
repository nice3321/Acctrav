import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { activePolicy, policyMeta } from "@/lib/cycles";
import { Card, riyals } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { approvePolicyAction, savePolicyAction } from "@/app/actions";

export default async function PolicyPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "view.all")) redirect("/me");

  const policy = activePolicy();
  const meta = policyMeta();
  const editable = can(user.role, "policy.edit");

  return (
    <>
      <div className={`alert ${meta.status === "approved" ? "alert-positive" : "alert-caution"}`} style={{ marginBottom: 18 }}>
        <span>◆</span>
        <div>
          {meta.status === "approved"
            ? <>السياسة معتمدة من <b>{meta.approved_by}</b> بتاريخ <span className="ltr num">{meta.approved_at}</span>.</>
            : <>هذه النسخة <b>مسودة</b> بانتظار اعتماد المدير التنفيذي — الدورات المسودة تُحتسب بها، والدورات المعتمدة لا تتأثر.</>}
          {" "}أي حفظ يُنشئ نسخة جديدة ويعيد احتساب الدورات المسودة فقط.
        </div>
      </div>

      <ActionForm action={savePolicyAction}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18 }}>
          <Card title="مستويات الهدف الشهري" subtitle={`ساري من ${policy.targetModelEffectiveFrom} — المضاعِف يُطبَّق على تكلفة الشهر`}>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 96px 96px", gap: 8, fontSize: 10.5, color: "var(--text-2)", fontWeight: 600 }}>
                <span>المستوى</span><span>مضاعِف التكلفة</span><span>نسبة الوعاء %</span>
              </div>
              {policy.levels.map((l) => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr 96px 96px", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: 600 }}>{l.label}</span>
                  <input name={`level_${l.id}_multiplier`} type="text" inputMode="decimal"
                    defaultValue={(l.costMultiplierBp / 10000).toFixed(2)} disabled={!editable} className="ltr" />
                  <input name={`level_${l.id}_rate`} type="text" inputMode="decimal"
                    defaultValue={(l.rateBp / 100).toFixed(1)} disabled={!editable} className="ltr" />
                </div>
              ))}
            </div>

            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="blend">
                مزيج التوزيع — {(policy.weightBlendBp / 100).toFixed(0)}% لعدد الطلبات / {(100 - policy.weightBlendBp / 100).toFixed(0)}% لنسبة المبيعات
              </label>
              <input id="blend" name="weightBlend" type="range" min={0} max={100} step={5}
                defaultValue={policy.weightBlendBp / 100} disabled={!editable} style={{ padding: 0 }} />
            </div>
          </Card>

          <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
            <Card title="شبكة الأمان الفردية" subtitle="حين لا تبلغ الشركة هدفها الشهري">
              <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, marginBottom: 12 }}>
                <input type="checkbox" name="fallbackEnabled" defaultChecked={policy.individualFallback.enabled}
                  disabled={!editable} style={{ width: 18, height: 18 }} />
                تفعيل شبكة الأمان
              </label>
              <div className="field">
                <label htmlFor="fb-rate">نسبة العمولة من ربح الموظف الشخصي (%)</label>
                <input id="fb-rate" name="fallbackRate" type="text" inputMode="decimal"
                  defaultValue={(policy.individualFallback.rateBp / 100).toFixed(1)} disabled={!editable} className="ltr" />
              </div>
              <p style={{ fontSize: 11, color: "var(--text-2)", marginTop: 8, lineHeight: 1.8 }}>
                يتقاضاها كل موظف حقق ربحًا يبلغ هدفه الفردي، حتى لو لم تحقق الشركة أي فائض.
                لا تُصرف حوافز أقسام في هذه الحالة لأنها مبنية على فائض غير موجود.
              </p>
            </Card>

            <Card title="ضريبة القيمة المضافة" subtitle="تُضاف فوق صافي العمولة للفوترة — لا تُخصم منها">
              <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, marginBottom: 12 }}>
                <input type="checkbox" name="vatEnabled" defaultChecked={policy.vat.enabled}
                  disabled={!editable} style={{ width: 18, height: 18 }} />
                تفعيل الضريبة
              </label>
              <div className="field">
                <label htmlFor="vat-rate">النسبة (%)</label>
                <input id="vat-rate" name="vatRate" type="text" inputMode="decimal"
                  defaultValue={(policy.vat.rateBp / 100).toFixed(0)} disabled={!editable} className="ltr" />
              </div>
            </Card>
          </div>
        </div>

        <Card title="حوافز الأقسام المؤثرة" subtitle="نسبة من الفائض لكل قسم حسب المستوى المتحقق" style={{ marginTop: 18 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>القسم</th>{policy.levels.map((l) => <th key={l.id}>{l.label.split("—")[0].trim()} %</th>)}</tr>
              </thead>
              <tbody>
                {policy.departments.map((d) => (
                  <tr key={d.id}>
                    <td><b style={{ color: "var(--ink)" }}>{d.name}</b></td>
                    {policy.levels.map((l) => (
                      <td key={l.id}>
                        <input name={`dept_${d.id}_${l.id}`} type="text" inputMode="decimal"
                          defaultValue={((d.levelRatesBp[l.id] ?? 0) / 100).toFixed(2)}
                          disabled={!editable} className="ltr" style={{ maxWidth: 96 }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="النظام السابق (الأرشيف)" subtitle={`شرائح تُطبَّق تلقائيًا على أي فترة قبل ${policy.targetModelEffectiveFrom}`} style={{ marginTop: 18 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>الشريحة</th><th>من</th><th>إلى</th><th>النسبة</th></tr></thead>
              <tbody>
                {policy.legacyTiers.map((t, i) => (
                  <tr key={i}>
                    <td>{t.label}</td>
                    <td className="num">{riyals(t.fromHalalas)}</td>
                    <td className="num">{t.toHalalas === null ? "∞" : riyals(t.toHalalas)}</td>
                    <td className="num">{(t.rateBp / 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-2)", marginTop: 10 }}>
            شرائح الأرشيف ثابتة — الفترات القديمة صُرفت بها فعليًا، وتغييرها يعيد كتابة التاريخ.
          </p>
        </Card>

        {editable && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }} className="no-print">
            <SubmitButton className="btn btn-primary btn-sm">حفظ السياسة كمسودة</SubmitButton>
          </div>
        )}
      </ActionForm>

      {can(user.role, "policy.approve") && meta.status !== "approved" && (
        <Card style={{ marginTop: 18 }}>
          <ActionForm action={approvePolicyAction}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <p style={{ fontSize: 12.5, color: "var(--text-2)" }}>
                الاعتماد يثبّت النسخة الحالية كسياسة رسمية معتمدة للشركة.
              </p>
              <SubmitButton className="btn btn-positive btn-sm" confirm="اعتماد نسخة السياسة الحالية؟">
                اعتماد السياسة
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
