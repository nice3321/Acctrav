import type { Permission, Role } from "@/lib/rbac";
import { can } from "@/lib/rbac";

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICON_PATHS;
  permission: Permission;
  /** Restrict to roles that only see themselves (the employee self-service view). */
  selfOnly?: boolean;
}

export const NAV_GROUPS: { group: string; items: NavItem[] }[] = [
  {
    group: "نظرة عامة",
    items: [
      { href: "/", label: "لوحة القيادة", icon: "dashboard", permission: "view.all" },
      { href: "/me", label: "كشف عمولتي", icon: "statement", permission: "view.self", selfOnly: true },
    ],
  },
  {
    group: "العمولات",
    items: [
      { href: "/cycles", label: "دورات العمولة", icon: "statement", permission: "view.all" },
      { href: "/policy", label: "سياسة العمولة", icon: "policy", permission: "view.all" },
    ],
  },
  {
    group: "البيانات",
    items: [
      { href: "/periods", label: "الفترات والمبيعات", icon: "periods", permission: "view.all" },
      { href: "/employees", label: "الموظفون", icon: "employees", permission: "view.all" },
      { href: "/matches", label: "مطابقة الأسماء", icon: "match", permission: "match.resolve" },
    ],
  },
  {
    group: "المالية",
    items: [
      { href: "/expenses", label: "المصروفات", icon: "expenses", permission: "expense.manage" },
      { href: "/pnl", label: "قائمة الدخل", icon: "pnl", permission: "expense.manage" },
      { href: "/budgets", label: "الميزانية", icon: "budget", permission: "budget.manage" },
    ],
  },
  {
    group: "الإدارة",
    items: [
      { href: "/users", label: "المستخدمون", icon: "users", permission: "user.manage" },
      { href: "/audit", label: "سجل التدقيق", icon: "audit", permission: "audit.view" },
    ],
  },
];

export function navFor(role: Role) {
  return NAV_GROUPS.map((g) => ({
    group: g.group,
    items: g.items.filter((it) => {
      if (!can(role, it.permission)) return false;
      // The self-service statement is noise for anyone who can see the whole company.
      if (it.selfOnly && can(role, "view.all")) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);
}

export const ICON_PATHS = {
  dashboard:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  statement:
    '<path d="M6 3.5h9l4 4v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20.5v-15A1.5 1.5 0 0 1 6.5 3.5z"/><path d="M9 12h6M9 16h6M9 8h3"/>',
  policy:
    '<path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h10M18 17h2"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="17" r="2"/>',
  periods:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M7.5 14h2M11 14h2M14.5 14h2"/>',
  employees:
    '<circle cx="9" cy="8.5" r="3.5"/><path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17" cy="9.5" r="2.6"/><path d="M16.5 14.6c2.5.2 4.5 2 4.5 4.4"/>',
  match: '<path d="M16 4l4 4-4 4M20 8H9M8 20l-4-4 4-4M4 16h11"/>',
  expenses: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M6.5 15.5h4"/>',
  pnl: '<path d="M4 4.5h16"/><path d="M6.5 4.5V14a5.5 5.5 0 0 0 11 0V4.5"/><path d="M12 14v6.5M8.5 20.5h7"/>',
  budget: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8" opacity=".6"/>',
  users: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-3.6 3.4-5.6 7-5.6s6.4 2 7 5.6"/>',
  audit:
    '<path d="M12 3.5l7.5 3v5c0 4.6-3 8-7.5 9.5C7.5 19.5 4.5 16.1 4.5 11.5v-5z"/><path d="M9 11.8l2.2 2.2 4-4.5"/>',
} as const;
