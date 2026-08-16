import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { auditTrail } from "@/lib/cycles";
import { Card, Empty } from "@/components/ui";

export default async function AuditPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "audit.view")) redirect("/");

  const events = auditTrail(400);

  return (
    <Card flush title={`سجل التدقيق (${events.length})`}
      subtitle="كل استيراد، تعديل سياسة، تسوية، اعتماد، وصرف — الأحدث أولًا. السجل للقراءة فقط ولا يُحذف منه شيء.">
      {events.length === 0 ? (
        <Empty title="السجل فارغ" />
      ) : (
        <div style={{ maxHeight: "72vh", overflowY: "auto", padding: "4px 20px 16px" }}>
          {events.map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-2)" }}>
              <span style={{
                width: 32, height: 32, borderRadius: 10, flex: "none",
                background: "var(--accent-tint)", color: "var(--accent-ink)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13,
              }}>◆</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ color: "var(--ink)" }}>{e.action}</b>
                  <span className="ltr num" style={{ color: "var(--text-3)", fontSize: 10.5 }}>{e.at}</span>
                  <span className="pill pill-neutral" style={{ fontSize: 9.5 }}>{e.actor_name}</span>
                  {e.entity && <span className="pill pill-neutral ltr" style={{ fontSize: 9.5 }}>{e.entity}</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.8, marginTop: 2 }}>{e.details}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
