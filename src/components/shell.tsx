"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BrandMark } from "./brand";
import { ICON_PATHS, type NavItem } from "./nav";

/**
 * Apple's fluid-interface defaults, expressed once:
 * critically damped (no overshoot) for anything that simply moves into place,
 * a touch of bounce only where a gesture carried momentum (the drawer).
 */
const SPRING = { type: "spring", bounce: 0, duration: 0.4 } as const;
const SPRING_DRAWER = { type: "spring", bounce: 0.18, duration: 0.42 } as const;

function Icon({ name, size = 18 }: { name: NavItem["icon"]; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "none" }}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}

/**
 * Holds no React state: the current theme already lives on <html data-theme>, set
 * before first paint by the boot script. CSS decides which glyph is visible, so
 * there is nothing to hydrate and no flash of the wrong icon.
 */
function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const current =
      root.getAttribute("data-theme") ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("acctrav-theme", next);
  }

  return (
    <button className="btn btn-ghost btn-sm no-print" onClick={toggle} aria-label="تبديل المظهر" style={{ padding: 8 }}>
      <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
        <g className="theme-glyph-sun">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" />
        </g>
        <path className="theme-glyph-moon" d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
      </svg>
    </button>
  );
}

interface ShellProps {
  user: { displayName: string; roleLabel: string };
  nav: { group: string; items: NavItem[] }[];
  pendingMatches: number;
  logout: () => Promise<void>;
  children: React.ReactNode;
}

export function Shell({ user, nav, pendingMatches, logout, children }: ShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const reduce = useReducedMotion();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const navList = (
    <nav style={{ flex: 1, overflowY: "auto", padding: "4px 12px 12px" }}>
      {nav.map((group) => (
        <div key={group.group}>
          <div
            style={{
              fontSize: 10.5, fontWeight: 600, color: "var(--text-3)",
              letterSpacing: ".04em", padding: "16px 10px 6px",
            }}
          >
            {group.group}
          </div>
          {group.items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                // Closing on the click itself — rather than reacting to the route
                // afterwards — keeps the drawer's dismissal tied to the gesture.
                onClick={() => setDrawerOpen(false)}
                style={{
                  position: "relative", display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 10, marginBottom: 1,
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  color: active ? "#fff" : "var(--text)",
                }}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={reduce ? { duration: 0 } : SPRING}
                    style={{
                      position: "absolute", inset: 0, borderRadius: 10,
                      background: "var(--brand-600)",
                      boxShadow: "0 4px 14px rgba(38,96,85,.30)",
                      zIndex: -1,
                    }}
                  />
                )}
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.href === "/matches" && pendingMatches > 0 && (
                  <span
                    style={{
                      marginInlineStart: "auto", background: active ? "rgba(255,255,255,.28)" : "var(--negative-vivid)",
                      color: "#fff", fontSize: 10, fontWeight: 700, minWidth: 17, height: 17,
                      borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px",
                    }}
                  >
                    {pendingMatches}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const sidebarInner = (
    <>
      <div style={{ padding: "20px 18px 14px" }}>
        <BrandMark size={36} />
        <div style={{ marginTop: 9 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.015em" }}>ترافليون</div>
          <div style={{ fontSize: 10.5, color: "var(--text-2)", fontWeight: 500 }}>المنظومة المالية</div>
        </div>
      </div>
      {navList}
      <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border-2)", fontSize: 10.5, color: "var(--text-3)" }}>
        Acctrav · إصدار 1.0
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", minHeight: "100dvh" }}>
      {/* --- desktop sidebar --- */}
      <aside
        className="chrome acctrav-sidebar"
        style={{
          position: "fixed", insetInlineStart: 0, top: 0, bottom: 0, width: "var(--sidebar-w)",
          borderInlineEnd: "1px solid var(--border-2)", display: "flex", flexDirection: "column", zIndex: 40,
        }}
      >
        {sidebarInner}
      </aside>

      {/* --- mobile drawer --- */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.button
              className="acctrav-drawer-scrim no-print"
              aria-label="إغلاق القائمة"
              onClick={() => setDrawerOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.25 }}
              style={{ position: "fixed", inset: 0, background: "var(--scrim)", zIndex: 60, border: 0 }}
            />
            <motion.aside
              className="chrome acctrav-drawer no-print"
              initial={reduce ? { opacity: 0 } : { x: "100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "100%" }}
              transition={reduce ? { duration: 0 } : SPRING_DRAWER}
              style={{
                position: "fixed", insetInlineEnd: 0, top: 0, bottom: 0, width: "var(--sidebar-w)",
                display: "flex", flexDirection: "column", zIndex: 61, boxShadow: "var(--shadow-lg)",
              }}
            >
              {sidebarInner}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* --- main --- */}
      <div className="acctrav-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          className="chrome no-print"
          style={{
            position: "sticky", top: 0, zIndex: 30,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
            padding: "11px 24px", borderBottom: "1px solid var(--border-2)",
          }}
        >
          <button
            className="btn btn-ghost btn-sm acctrav-burger"
            onClick={() => setDrawerOpen(true)}
            aria-label="فتح القائمة"
            style={{ padding: 8 }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginInlineStart: "auto" }}>
            <ThemeToggle />
            <div
              style={{
                display: "flex", alignItems: "center", gap: 9, padding: "5px 12px 5px 7px",
                background: "var(--surface)", border: "1px solid var(--border-2)",
                borderRadius: 99, boxShadow: "var(--shadow-xs)",
              }}
            >
              <span
                style={{
                  width: 26, height: 26, borderRadius: "50%", display: "inline-flex",
                  alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, color: "#fff",
                  background: "linear-gradient(135deg, var(--brand-600), var(--brand-400))",
                }}
              >
                {user.displayName.trim().slice(0, 1)}
              </span>
              <span style={{ lineHeight: 1.3 }}>
                <b style={{ fontSize: 12, color: "var(--ink)", display: "block" }}>{user.displayName}</b>
                <span style={{ fontSize: 10.5, color: "var(--text-2)" }}>{user.roleLabel}</span>
              </span>
            </div>
            <form action={logout}>
              <button type="submit" className="btn btn-ghost btn-sm">خروج</button>
            </form>
          </div>
        </header>

        <main style={{ flex: 1, padding: "24px", maxWidth: 1340, width: "100%", margin: "0 auto" }}>{children}</main>
      </div>

      <style>{`
        .acctrav-main { margin-inline-start: var(--sidebar-w); }
        .acctrav-burger { display: none; }
        .acctrav-drawer, .acctrav-drawer-scrim { display: none; }
        @media (max-width: 1024px) {
          .acctrav-sidebar { display: none; }
          .acctrav-main { margin-inline-start: 0; }
          .acctrav-burger { display: inline-flex; }
          .acctrav-drawer, .acctrav-drawer-scrim { display: flex; }
          main { padding: 16px !important; }
        }
      `}</style>
    </div>
  );
}
