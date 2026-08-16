import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ROLE_LABELS, can, permissionsOf, type Role } from "@/lib/rbac";
import { rows } from "@/lib/db";
import { Card } from "@/components/ui";

const ROLE_PILL: Record<Role, string> = {
  owner: "pill-accent", cfo: "pill-info", sales_manager: "pill-positive", employee: "pill-neutral",
};

export default async function UsersPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "user.manage")) redirect("/");

  const users = rows<{
    id: string; username: string; display_name: string; role: Role;
    employee_id: string | null; active: number; must_change_password: number;
    locked_until: string | null; failed_attempts: number;
  }>(`SELECT id, username, display_name, role, employee_id, active, must_change_password, locked_until, failed_attempts
        FROM users ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'cfo' THEN 1 WHEN 'sales_manager' THEN 2 ELSE 3 END, username`);

  return (
    <>
      <Card flush title={`حسابات الدخول (${users.length})`}
        subtitle="حسابات المناصب + حساب لكل موظف مبيعات يرى كشفه وحده"
        style={{ marginBottom: 18 }}>
        <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
          <table>
            <thead><tr><th>المستخدم</th><th>اسم الدخول</th><th>الدور</th><th>الحالة</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: "50%", flex: "none", color: "#fff",
                        display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700,
                        background: "linear-gradient(135deg, var(--brand-600), var(--brand-400))",
                      }}>{u.display_name.trim().slice(0, 1)}</span>
                      <b style={{ color: "var(--ink)" }}>{u.display_name}</b>
                    </div>
                  </td>
                  <td className="ltr num" style={{ fontSize: 12, textAlign: "start" }}>{u.username}</td>
                  <td><span className={`pill ${ROLE_PILL[u.role]}`}>{ROLE_LABELS[u.role]}</span></td>
                  <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {!u.active && <span className="pill pill-negative">معطّل</span>}
                    {u.must_change_password === 1 && <span className="pill pill-caution">يجب تغيير كلمة المرور</span>}
                    {u.locked_until && <span className="pill pill-negative">موقوف مؤقتًا</span>}
                    {u.active === 1 && !u.must_change_password && !u.locked_until && (
                      <span className="pill pill-positive"><span className="dot" />نشط</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="مصفوفة الصلاحيات" subtitle="ما يستطيع كل دور فعله — مفروضة خادميًا على كل إجراء، لا في الواجهة فقط">
        <div className="table-wrap">
          <table>
            <thead><tr><th>الدور</th><th>الصلاحيات</th></tr></thead>
            <tbody>
              {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                <tr key={role}>
                  <td><b style={{ color: "var(--ink)" }}>{ROLE_LABELS[role]}</b></td>
                  <td style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {permissionsOf(role).map((p) => (
                      <span key={p} className="pill pill-neutral ltr" style={{ fontSize: 9.5 }}>{p}</span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 12, lineHeight: 1.8 }}>
          لاحظ أن <b>المدير المالي</b> يملك كل صلاحيات التشغيل المالي لكنه لا يملك <span className="ltr">policy.approve</span> —
          اعتماد السياسة التي تحكم مكافآته يبقى بيد المدير التنفيذي وحده، وهو فصل مقصود للمهام.
        </p>
      </Card>
    </>
  );
}
