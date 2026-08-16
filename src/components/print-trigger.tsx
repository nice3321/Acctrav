"use client";

export function PrintTrigger({ label = "طباعة / PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn btn-primary btn-sm no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
