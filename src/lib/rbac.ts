/**
 * Role-based access control.
 *
 * The permission matrix lives here and NOWHERE else. Every server action and route
 * handler asks `can()`; no page decides for itself what a role may do. Client code
 * may read this to hide controls, but hiding is cosmetic — the server always re-checks.
 */

export const ROLES = ["owner", "cfo", "sales_manager", "employee"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "المدير التنفيذي",
  cfo: "المدير المالي",
  sales_manager: "مدير المبيعات",
  employee: "موظف مبيعات",
};

export const PERMISSIONS = [
  "view.all",           // see company-wide figures
  "view.self",          // see only own statement
  "period.import",      // upload sales files, create periods
  "period.delete",
  "employee.manage",    // create/edit employees, aliases, targets
  "match.resolve",      // resolve imported-name conflicts
  "policy.edit",
  "policy.approve",
  "commission.review",  // move draft -> review
  "commission.approve", // review -> approved
  "commission.pay",     // approved -> paid
  "commission.adjust",
  "expense.manage",
  "budget.manage",
  "report.export",
  "user.manage",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  owner: [
    "view.all", "period.import", "period.delete", "employee.manage", "match.resolve",
    "policy.edit", "policy.approve", "commission.review", "commission.approve",
    "commission.pay", "commission.adjust", "expense.manage", "budget.manage",
    "report.export", "user.manage", "audit.view",
  ],
  // The CFO runs the money but cannot ratify the policy that governs their own payouts.
  cfo: [
    "view.all", "period.import", "period.delete", "employee.manage", "match.resolve",
    "policy.edit", "commission.review", "commission.approve", "commission.pay",
    "commission.adjust", "expense.manage", "budget.manage", "report.export",
    "user.manage", "audit.view",
  ],
  sales_manager: [
    "view.all", "period.import", "employee.manage", "match.resolve",
    "commission.review", "report.export",
  ],
  employee: ["view.self"],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(permission) ?? false;
}

export function permissionsOf(role: Role): readonly Permission[] {
  return MATRIX[role] ?? [];
}

/** Thrown by server-side guards; mapped to 403 by callers. */
export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super("لا تملك صلاحية تنفيذ هذا الإجراء");
    this.name = "ForbiddenError";
  }
}

/* ------------------------------------------------------------------ *
 * Commission lifecycle — the state machine that guards real payouts.
 * ------------------------------------------------------------------ */

export const CYCLE_STATES = ["draft", "review", "approved", "paid", "void"] as const;
export type CycleState = (typeof CYCLE_STATES)[number];

export const CYCLE_STATE_LABELS: Record<CycleState, string> = {
  draft: "مسودة",
  review: "قيد المراجعة",
  approved: "معتمدة",
  paid: "مصروفة",
  void: "ملغاة",
};

const TRANSITIONS: Record<CycleState, { to: CycleState; permission: Permission }[]> = {
  draft: [{ to: "review", permission: "commission.review" }],
  review: [
    { to: "approved", permission: "commission.approve" },
    { to: "draft", permission: "commission.review" },
  ],
  approved: [
    { to: "paid", permission: "commission.pay" },
    { to: "void", permission: "commission.approve" },
  ],
  // Terminal: a paid cycle is history. Corrections go through a new adjustment,
  // never by rewriting what was already transferred.
  paid: [],
  void: [],
};

export function canTransition(role: Role, from: CycleState, to: CycleState): boolean {
  const edge = TRANSITIONS[from]?.find((t) => t.to === to);
  if (!edge) return false;
  return can(role, edge.permission);
}

export function nextStates(role: Role, from: CycleState): CycleState[] {
  return (TRANSITIONS[from] ?? []).filter((t) => can(role, t.permission)).map((t) => t.to);
}

/** Figures are frozen once a cycle leaves draft — recalculation would move approved money. */
export function isMutable(state: CycleState): boolean {
  return state === "draft";
}
