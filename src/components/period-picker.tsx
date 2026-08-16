"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** Navigates on change and shows a pending state, so a slow query never looks frozen. */
export function PeriodPicker({
  periods, value, basePath, param = "period",
}: {
  periods: { id: string; label: string }[];
  value: string;
  basePath: string;
  param?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(() => router.push(`${basePath}?${param}=${encodeURIComponent(next)}`));
      }}
      style={{ width: "auto", minWidth: 170, opacity: pending ? 0.6 : 1 }}
      aria-label="اختيار الفترة"
    >
      {periods.map((p) => (
        <option key={p.id} value={p.id}>{p.label}</option>
      ))}
    </select>
  );
}
