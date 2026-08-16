import Image from "next/image";

/**
 * The official Traveliun mark, extracted from the company artwork with its
 * background made transparent. Two variants exist because the mark's front form
 * is white: on a light surface that would vanish, so the light variant swaps it
 * for the brand green while keeping the sage counter-form identical.
 */
export function BrandMark({
  size = 34,
  on = "light",
  className,
}: {
  size?: number;
  /** Surface the mark sits on — picks the correct colourway. */
  on?: "light" | "dark";
  className?: string;
}) {
  const src = on === "dark" ? "/traveliun-mark-on-dark.png" : "/traveliun-mark-on-light.png";
  // Native artwork is 97×124, so height leads and width follows the aspect ratio.
  const height = size;
  const width = Math.round((97 / 124) * size);
  return (
    <Image
      src={src}
      alt="ترافليون"
      width={width}
      height={height}
      priority
      className={className}
      style={{ width, height, objectFit: "contain" }}
    />
  );
}

export function BrandLockup({
  size = 38,
  on = "light",
  titleTone = "var(--ink)",
  subTone = "var(--text-2)",
  sub = "المنظومة المالية",
}: {
  size?: number;
  on?: "light" | "dark";
  titleTone?: string;
  subTone?: string;
  sub?: string | null;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <BrandMark size={size} on={on} />
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontSize: size * 0.42, fontWeight: 700, color: titleTone, letterSpacing: "-.015em" }}>
          ترافليون
        </div>
        {sub && <div style={{ fontSize: size * 0.27, color: subTone, fontWeight: 500, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}
