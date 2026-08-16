"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function MonthPicker({ value, basePath, param = "month" }: { value: string; basePath: string; param?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="month"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        if (!/^\d{4}-\d{2}$/.test(next)) return;
        startTransition(() => router.push(`${basePath}?${param}=${next}`));
      }}
      style={{ width: "auto", opacity: pending ? 0.6 : 1 }}
      aria-label="اختيار الشهر"
    />
  );
}
