import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { navFor } from "@/components/nav";
import { Shell } from "@/components/shell";
import { logoutAction } from "../login/actions";
import { one } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");

  const pending =
    one<{ n: number }>("SELECT count(*) AS n FROM name_matches WHERE resolved = 0")?.n ?? 0;

  return (
    <Shell
      user={{ displayName: user.displayName, roleLabel: ROLE_LABELS[user.role] }}
      nav={navFor(user.role)}
      pendingMatches={pending}
      logout={logoutAction}
    >
      {children}
    </Shell>
  );
}
