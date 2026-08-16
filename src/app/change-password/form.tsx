"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { changePasswordAction, type LoginState } from "../login/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary" disabled={pending} style={{ width: "100%", padding: 11, fontSize: 13.5 }}>
      {pending ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}
    </button>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(changePasswordAction, {});

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {state.error && (
        <div className="alert alert-negative" role="alert"><span>!</span><div>{state.error}</div></div>
      )}

      <div className="field">
        <label htmlFor="pw">كلمة المرور الجديدة</label>
        <input id="pw" name="password" type="password" autoComplete="new-password" required autoFocus className="ltr" />
      </div>
      <div className="field">
        <label htmlFor="pw2">تأكيد كلمة المرور</label>
        <input id="pw2" name="confirm" type="password" autoComplete="new-password" required className="ltr" />
      </div>

      <p style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.8 }}>
        10 أحرف على الأقل، وتشمل حرفًا لاتينيًا ورقمًا. سيُطلب منك تسجيل الدخول مجددًا بعد الحفظ،
        وستُنهى أي جلسة مفتوحة على أجهزة أخرى.
      </p>

      <Submit />
    </form>
  );
}
