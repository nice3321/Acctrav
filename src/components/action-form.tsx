"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

export function SubmitButton({
  children, className = "btn btn-primary btn-sm", confirm, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending || rest.disabled}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
      {...rest}
    >
      {pending ? "…" : children}
    </button>
  );
}

/**
 * Wraps a server action and renders its result inline. Feedback appears next to
 * the control that caused it rather than as a detached toast.
 */
export function ActionForm({
  action, children, className, style, resetOnSuccess = false,
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form
      action={formAction}
      className={className}
      style={style}
      key={resetOnSuccess && state.ok ? state.ok : undefined}
    >
      {state.error && (
        <div className="alert alert-negative" style={{ marginBottom: 10 }} role="alert">
          <span>!</span><div>{state.error}</div>
        </div>
      )}
      {state.ok && (
        <div className="alert alert-positive" style={{ marginBottom: 10 }} role="status">
          <span>✓</span><div>{state.ok}</div>
        </div>
      )}
      {children}
    </form>
  );
}
