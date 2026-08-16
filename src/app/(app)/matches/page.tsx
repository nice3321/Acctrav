import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listEmployees } from "@/lib/cycles";
import { rows } from "@/lib/db";
import { Card, Empty } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { resolveMatchAction } from "@/app/actions";

interface MatchRow {
  id: string; raw_name: string; source: string; suggested_id: string | null;
  confidence: string; resolved: number; resolution: string | null;
}

export default async function MatchesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "match.resolve")) redirect("/");

  const all = rows<MatchRow>("SELECT * FROM name_matches ORDER BY resolved, created_at DESC");
  const open = all.filter((m) => !m.resolved);
  const done = all.filter((m) => m.resolved);
  const employees = listEmployees();

  return (
    <>
      <Card flush title={`أسماء بانتظار المطابقة (${open.length})`}
        subtitle="أسماء وردت في ملفات مستوردة ولم تُطابق تلقائيًا بثقة عالية"
        style={{ marginBottom: 18 }}>
        {open.length === 0 ? (
          <Empty title="لا أسماء معلّقة" hint="كل الأسماء الواردة من الملفات موحَّدة. ستظهر هنا أي أسماء جديدة عند الاستيراد." />
        ) : (
          <div className="table-wrap" style={{ border: "none", borderRadius: 0 }}>
            <table>
              <thead><tr><th>الاسم الوارد</th><th>المصدر</th><th>الثقة</th><th>الإجراء</th></tr></thead>
              <tbody>
                {open.map((m) => (
                  <tr key={m.id}>
                    <td><b style={{ color: "var(--ink)" }}>{m.raw_name}</b></td>
                    <td style={{ fontSize: 11, color: "var(--text-2)", maxWidth: 240 }}>{m.source}</td>
                    <td><span className="pill pill-caution">{m.confidence}</span></td>
                    <td>
                      <ActionForm action={resolveMatchAction}>
                        <input type="hidden" name="matchId" value={m.id} />
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <select name="employeeId" defaultValue={m.suggested_id ?? ""} style={{ width: "auto", minWidth: 160 }} aria-label="الموظف">
                            <option value="">— اختر موظفًا —</option>
                            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                          <SubmitButton className="btn btn-primary btn-xs" name="decision" value="merge">دمج</SubmitButton>
                          <SubmitButton className="btn btn-ghost btn-xs" name="decision" value="separate">اسم مستقل</SubmitButton>
                        </div>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card flush title={`مطابقات محسومة (${done.length})`}>
        {done.length === 0 ? (
          <Empty title="لا سجلات محسومة بعد" />
        ) : (
          <div className="table-wrap" style={{ border: "none", borderRadius: 0, maxHeight: 380, overflowY: "auto" }}>
            <table>
              <thead><tr><th>الاسم الوارد</th><th>القرار</th><th>المصدر</th></tr></thead>
              <tbody>
                {done.map((m) => (
                  <tr key={m.id}>
                    <td>{m.raw_name}</td>
                    <td>
                      <span className={`pill ${m.resolution === "merged" ? "pill-positive" : "pill-accent"}`}>
                        {m.resolution === "merged" ? "دُمج" : "اسم مستقل"}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text-2)" }}>{m.source}</td>
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
