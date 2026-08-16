import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { BrandMark } from "@/components/brand";
import { ChangePasswordForm } from "./form";

export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <main
      style={{
        minHeight: "100dvh", display: "grid", placeItems: "center", padding: 20,
        background:
          "radial-gradient(1100px 620px at 82% -12%, var(--brand-600), transparent 62%)," +
          "radial-gradient(820px 560px at -8% 108%, var(--brand-800), transparent 58%), var(--brand-700)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <BrandMark size={54} on="dark" />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>مرحبًا {user.displayName}</div>
            <div style={{ fontSize: 12, color: "var(--brand-200)", marginTop: 3 }}>
              اختر كلمة مرور جديدة قبل الدخول للنظام
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 22, border: "1px solid rgba(255,255,255,.16)",
            boxShadow: "0 24px 70px rgba(0,0,0,.35)", padding: "28px 26px",
            background: "rgba(255,255,255,.94)",
          }}
        >
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}
