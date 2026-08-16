import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { BrandMark } from "@/components/brand";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/");

  const { changed } = await searchParams;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background:
          "radial-gradient(1100px 620px at 82% -12%, var(--brand-600), transparent 62%)," +
          "radial-gradient(820px 560px at -8% 108%, var(--brand-800), transparent 58%)," +
          "var(--brand-700)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 396 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 26 }}>
          <BrandMark size={62} on="dark" />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 25, fontWeight: 700, color: "#fff", letterSpacing: "-.02em" }}>ترافليون</div>
            <div style={{ fontSize: 12, color: "var(--brand-200)", fontWeight: 500, marginTop: 2 }}>
              المنظومة المالية · Traveliun
            </div>
          </div>
        </div>

        <div
          className="chrome"
          style={{
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,.16)",
            boxShadow: "0 24px 70px rgba(0,0,0,.35)",
            padding: "30px 28px 26px",
            background: "rgba(255,255,255,.94)",
          }}
        >
          {changed && (
            <div className="alert alert-positive" style={{ marginBottom: 16 }}>
              <span>✓</span>
              <div>تم تغيير كلمة المرور. سجّل الدخول بها الآن.</div>
            </div>
          )}
          <LoginForm />
        </div>

        <p style={{ fontSize: 11, color: "var(--brand-200)", textAlign: "center", marginTop: 18, lineHeight: 1.8 }}>
          الدخول مخصَّص حسب الدور — تنفيذي، مالي، مبيعات، أو موظف.
          <br />
          لأي استفسار عن بيانات الدخول راجع الإدارة المالية.
        </p>
      </div>
    </main>
  );
}
