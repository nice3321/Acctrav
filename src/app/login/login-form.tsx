"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      disabled={pending}
      style={{ width: "100%", padding: "11px", fontSize: 13.5, marginTop: 4 }}
    >
      {pending ? "جارٍ التحقق…" : "دخول"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-2)", textAlign: "center", marginBottom: 2 }}>
        تسجيل الدخول
      </h1>

      {state.error && (
        <div className="alert alert-negative" role="alert">
          <span>!</span>
          <div>{state.error}</div>
        </div>
      )}

      <div className="field">
        <label htmlFor="username">اسم المستخدم</label>
        <input id="username" name="username" type="text" autoComplete="username" required autoFocus className="ltr" />
      </div>

      <div className="field">
        <label htmlFor="password">كلمة المرور</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="ltr" />
      </div>

      <SubmitButton />
    </form>
  );
}
