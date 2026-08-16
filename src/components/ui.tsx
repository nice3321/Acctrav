import { formatHalalas } from "@/lib/money";

export function Money({ halalas, decimals = 2, tone }: { halalas: number; decimals?: 0 | 2; tone?: "positive" | "negative" | "muted" }) {
  const color = tone === "positive" ? "var(--positive)" : tone === "negative" ? "var(--negative)" : tone === "muted" ? "var(--text-2)" : undefined;
  return (
    <span className="num" style={{ color }}>
      {formatHalalas(halalas, decimals)}
      <span style={{ fontSize: "0.78em", color: "var(--text-3)", marginInlineStart: 3 }}>ر.س</span>
    </span>
  );
}

/** Grouped riyal figure for inline prose ("موظفون 18,247") — no currency suffix. */
export function riyals(halalas: number, decimals: 0 | 2 = 0): string {
  return (halalas / 100).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function Pct({ bp, decimals = 1 }: { bp: number | null; decimals?: number }) {
  if (bp === null) return <span className="num">—</span>;
  return <span className="num">{(bp / 100).toFixed(decimals)}%</span>;
}

export function Card({
  title, subtitle, actions, children, flush = false, className = "", style,
}: {
  title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode;
  children: React.ReactNode; flush?: boolean; className?: string; style?: React.CSSProperties;
}) {
  return (
    <section className={`card ${flush ? "card-flush" : ""} ${className}`} style={style}>
      {(title || actions) && (
        <header
          style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 12, flexWrap: "wrap", marginBottom: flush ? 0 : 14,
            padding: flush ? "18px 20px 12px" : undefined,
          }}
        >
          <div>
            {title && <h2 style={{ fontSize: 15 }}>{title}</h2>}
            {subtitle && <p style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 2 }}>{subtitle}</p>}
          </div>
          {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label, value, foot, accent = "var(--brand-500)",
}: {
  label: React.ReactNode; value: React.ReactNode; foot?: React.ReactNode; accent?: string;
}) {
  return (
    <div className="card" style={{ padding: "16px 18px", position: "relative", overflow: "hidden" }}>
      <span style={{ position: "absolute", insetInlineStart: 0, top: 14, bottom: 14, width: 3.5, borderRadius: 4, background: accent }} />
      <div style={{ fontSize: 11.5, color: "var(--text-2)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 23, fontWeight: 700, color: "var(--ink)", letterSpacing: "-.02em", marginTop: 6, lineHeight: 1.15 }}>
        {value}
      </div>
      {foot && <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-2)", display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>{foot}</div>}
    </div>
  );
}

export function KpiGrid({ children, min = 210 }: { children: React.ReactNode; min?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 14, marginBottom: 18 }}>
      {children}
    </div>
  );
}

export function Delta({ current, previous, invert = false }: { current: number; previous: number | null; invert?: boolean }) {
  if (previous === null || previous === 0) return <span className="pill pill-neutral">—</span>;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(change)) return <span className="pill pill-neutral">—</span>;
  const up = change >= 0;
  const good = invert ? !up : up;
  return (
    <span className={`pill ${good ? "pill-positive" : "pill-negative"}`}>
      {up ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
    </span>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {hint && <p>{hint}</p>}
    </div>
  );
}

/* ------------------------------- charts ------------------------------- */

function compact(n: number): string {
  const sar = n / 100;
  const a = Math.abs(sar);
  if (a >= 1e6) return `${(sar / 1e6).toFixed(1).replace(/\.0$/, "")}م`;
  if (a >= 1e3) return `${Math.round(sar / 1e3)}ك`;
  return String(Math.round(sar));
}

export interface Point { label: string; short: string; value: number }

export function AreaChart({
  points, height = 210, reference = null, referenceLabel = "الهدف", color = "var(--brand-500)", id = "area",
}: {
  points: Point[]; height?: number; reference?: number | null; referenceLabel?: string; color?: string; id?: string;
}) {
  if (!points.length) return <Empty title="لا بيانات للعرض" />;

  const w = Math.max(560, points.length * 64);
  const padT = 18, padB = 30, padL = 10, padR = 48;
  const values = points.map((p) => p.value);
  const maxV = Math.max(...values, reference ?? 0, 1) * 1.12;
  const minV = Math.min(0, ...values);
  const X = (i: number) => padL + (points.length === 1 ? (w - padL - padR) / 2 : (i * (w - padL - padR)) / (points.length - 1));
  const Y = (v: number) => padT + (height - padT - padB) * (1 - (v - minV) / (maxV - minV || 1));

  const line = points.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.value).toFixed(1)}`).join(" ");
  const baseY = Y(Math.max(0, minV));
  const area = `${line} L${X(points.length - 1).toFixed(1)},${baseY.toFixed(1)} L${X(0).toFixed(1)},${baseY.toFixed(1)} Z`;
  const grid = [maxV * 0.75, maxV * 0.5, maxV * 0.25];

  return (
    <div style={{ overflowX: "auto" }} dir="ltr">
      <svg viewBox={`0 0 ${w} ${height}`} style={{ display: "block", width: "100%", height: "auto", minWidth: Math.min(w, 560) }} role="img">
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity=".26" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke="var(--border-2)" strokeWidth={1} />
            <text x={w - padR + 6} y={Y(v) + 3.5} fontSize={9.5} fill="var(--text-3)">{compact(v)}</text>
          </g>
        ))}
        {reference !== null && reference > 0 && (
          <g>
            <line x1={padL} x2={w - padR} y1={Y(reference)} y2={Y(reference)} stroke="var(--caution-vivid)" strokeWidth={1.4} strokeDasharray="5 4" opacity=".85" />
            <text x={w - padR + 6} y={Y(reference) + 3.5} fontSize={9.5} fill="var(--caution)" fontWeight={600}>{referenceLabel}</text>
          </g>
        )}
        <path d={area} fill={`url(#${id}-fill)`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={p.label}>
            <circle cx={X(i)} cy={Y(p.value)} r={3.4} fill="var(--surface)" stroke={color} strokeWidth={2.2}>
              <title>{`${p.label}: ${formatHalalas(p.value, 0)}`}</title>
            </circle>
            <text x={X(i)} y={height - 9} fontSize={9.5} fill="var(--text-2)" textAnchor="middle">{p.short}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function Bars({
  points, height = 200, color = "var(--brand-500)", color2 = "var(--brand-300)", dual = false,
}: {
  points: (Point & { value2?: number })[]; height?: number; color?: string; color2?: string; dual?: boolean;
}) {
  if (!points.length) return <Empty title="لا بيانات للعرض" />;
  const w = Math.max(560, points.length * (dual ? 74 : 52));
  const padT = 16, padB = 30, padL = 8, padR = 46;
  const values = points.flatMap((p) => (dual ? [p.value, p.value2 ?? 0] : [p.value]));
  const maxV = Math.max(...values, 1) * 1.12;
  const bw = dual ? 13 : 20;
  const slot = (w - padL - padR) / points.length;
  const Y = (v: number) => padT + (height - padT - padB) * (1 - Math.max(0, v) / maxV);
  const H = (v: number) => (height - padT - padB) * (Math.max(0, v) / maxV);
  const grid = [maxV * 0.75, maxV * 0.5, maxV * 0.25];

  return (
    <div style={{ overflowX: "auto" }} dir="ltr">
      <svg viewBox={`0 0 ${w} ${height}`} style={{ display: "block", width: "100%", height: "auto", minWidth: Math.min(w, 560) }} role="img">
        {grid.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={Y(v)} y2={Y(v)} stroke="var(--border-2)" />
            <text x={w - padR + 6} y={Y(v) + 3.5} fontSize={9.5} fill="var(--text-3)">{compact(v)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = padL + slot * i + slot / 2;
          const x1 = dual ? cx - bw - 1.5 : cx - bw / 2;
          return (
            <g key={p.label}>
              <rect x={x1} y={Y(p.value)} width={bw} height={Math.max(2, H(p.value))} rx={4.5} fill={color}>
                <title>{`${p.label}: ${formatHalalas(p.value, 0)}`}</title>
              </rect>
              {dual && (
                <rect x={cx + 1.5} y={Y(p.value2 ?? 0)} width={bw} height={Math.max(2, H(p.value2 ?? 0))} rx={4.5} fill={color2} opacity=".9">
                  <title>{`${p.label}: ${formatHalalas(p.value2 ?? 0, 0)}`}</title>
                </rect>
              )}
              <text x={cx} y={height - 9} fontSize={9.5} fill="var(--text-2)" textAnchor="middle">{p.short}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Ring({ ratio, size = 118, stroke = 11, color = "var(--brand-500)", label = "" }: {
  ratio: number; size?: number; stroke?: number; color?: string; label?: string;
}) {
  const shown = Math.max(0, Math.min(1, ratio));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${Math.round(ratio * 100)}٪ ${label}`}>
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--bg-sunk)" strokeWidth={stroke} />
      <circle
        cx={mid} cy={mid} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(shown * c).toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${mid} ${mid})`}
      />
      <text x={mid} y={mid + 1} textAnchor="middle" fontSize={size / 6.2} fontWeight={700} fill="var(--ink)" className="num">
        {Math.round(ratio * 100)}%
      </text>
      <text x={mid} y={mid + size / 6.2 + 4} textAnchor="middle" fontSize={8.5} fill="var(--text-2)">{label}</text>
    </svg>
  );
}

export function Donut({ items, size = 168, stroke = 22 }: {
  items: { label: string; value: number; color: string }[]; size?: number; stroke?: number;
}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  if (total <= 0) return <Empty title="لا بيانات" />;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;

  // Each arc starts where the previous ones ended. The offset is a prefix sum rather
  // than a running accumulator, so nothing is mutated during render. A donut has a
  // handful of slices, so the quadratic scan costs nothing.
  const slices = items.filter((i) => i.value > 0);
  const arcs = slices.map((item, i) => ({
    ...item,
    frac: item.value / total,
    offset: slices.slice(0, i).reduce((a, b) => a + b.value, 0) / total,
  }));

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img">
      {arcs.map((item) => (
        <circle
          key={item.label} cx={mid} cy={mid} r={r} fill="none" stroke={item.color} strokeWidth={stroke}
          strokeDasharray={`${(item.frac * c).toFixed(2)} ${(c - item.frac * c).toFixed(2)}`}
          strokeDashoffset={(-item.offset * c).toFixed(2)} transform={`rotate(-90 ${mid} ${mid})`}
        >
          <title>{`${item.label}: ${formatHalalas(item.value, 0)} (${(item.frac * 100).toFixed(1)}%)`}</title>
        </circle>
      ))}
      <text x={mid} y={mid - 3} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--ink)" className="num">
        {compact(total)}
      </text>
      <text x={mid} y={mid + 13} textAnchor="middle" fontSize={9.5} fill="var(--text-2)">الإجمالي ر.س</text>
    </svg>
  );
}
