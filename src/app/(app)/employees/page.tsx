import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listEmployees } from "@/lib/cycles";
import { rows } from "@/lib/db";
import { Card, Money } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveEmployeeAction } from "@/app/actions";

export default async function EmployeesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "view.all")) redirect("/me");

  const employees = listEmployees();
  const editable = can(user.role, "employee.manage");
  const accounts = new Map(
    rows<{ employee_id: string; username: string }>(
      "SELECT employee_id, username FROM users WHERE employee_id IS NOT NULL",
    ).map((r) => [r.employee_id, r.username] as const),
  );

  return (
    <>
      <Card flush title={`سجل الموظفين (${employees.length})`}
        subtitle="الأسماء البديلة تُستخدم للمطابقة التلقائية عند الاستيراد · الهدف الفردي يحكم شبكة الأمان"
        style={{ marginBottom: 18 }}>
        <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <table>
            <thead>
              <tr><th>الموظف</th><th>الأسماء البديلة</th><th>الهدف الفردي</th><th>حساب الدخول</th><th>الحالة</th></tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: "50%", flex: "none", color: "#fff",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700,
                        background: "linear-gradient(135deg, var(--brand-600), var(--brand-400))",
                      }}>{e.name.trim().slice(0, 1)}</span>
                      <b style={{ color: "var(--ink)" }}>{e.name}</b>
                    </div>
                  </td>
                  <td style={{ fontSize: 11, color: "var(--text-2)", maxWidth: 260 }}>{e.aliases ?? "—"}</td>
                  <td>{e.target_halalas > 0 ? <Money halalas={e.target_halalas} decimals={0} /> : <span style={{ fontSize: 11, color: "var(--text-3)" }}>أي ربح موجب</span>}</td>
                  <td className="ltr num" style={{ fontSize: 11.5, color: "var(--text-2)", textAlign: "start" }}>{accounts.get(e.id) ?? "—"}</td>
                  <td>
                    {e.status === "active"
                      ? <span className="pill pill-positive"><span className="dot" />نشط</span>
                      : <span className="pill pill-neutral">مستبعد</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editable && (
        <Card title="إضافة أو تعديل موظف" subtitle="اترك المعرّف فارغًا للإضافة، أو ألصق معرّف موظف قائم لتعديله">
          <ActionForm action={saveEmployeeAction} resetOnSuccess>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
              <div className="field">
                <label htmlFor="emp-id">معرّف الموظف (للتعديل فقط)</label>
                <select id="emp-id" name="employeeId" defaultValue="">
                  <option value="">— موظف جديد —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="emp-name">الاسم الرسمي</label>
                <input id="emp-name" name="name" type="text" required />
              </div>
              <div className="field">
                <label htmlFor="emp-aliases">الأسماء البديلة (بفواصل)</label>
                <input id="emp-aliases" name="aliases" type="text" placeholder="اسم بديل، Alias" />
              </div>
              <div className="field">
                <label htmlFor="emp-target">الهدف الفردي الشهري (ر.س)</label>
                <input id="emp-target" name="target" type="text" inputMode="decimal" defaultValue="0" className="ltr" />
              </div>
              <div className="field">
                <label htmlFor="emp-status">الحالة</label>
                <select id="emp-status" name="status" defaultValue="active">
                  <option value="active">نشط — يدخل في احتساب العمولات</option>
                  <option value="excluded">مستبعد — تُعرض بياناته دون عمولة</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 14 }}><SubmitButton>حفظ</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
