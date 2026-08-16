"use server";

import { redirect } from "next/navigation";
import { changePassword, currentUser, login, logout, passwordProblem } from "@/lib/auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "أدخل اسم المستخدم وكلمة المرور" };

  const result = await login(username, password);
  if (!result.ok) return { error: result.error };

  redirect(result.user.mustChangePassword ? "/change-password" : "/");
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}

export async function changePasswordAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const user = await currentUser();
  if (!user) redirect("/login");

  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next !== confirm) return { error: "كلمتا المرور غير متطابقتين" };

  const problem = passwordProblem(next);
  if (problem) return { error: problem };

  await changePassword(user.id, next);
  // changePassword drops every session, including this one — so sign in again.
  redirect("/login?changed=1");
}
