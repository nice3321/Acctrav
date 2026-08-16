/**
 * Money is ALWAYS an integer number of halalas (1 SAR = 100 halalas).
 * Never a float: 0.1 + 0.2 !== 0.3 is not acceptable in a payroll system.
 *
 * Rates are basis points (bp): 10000 bp = 100%, 1000 bp = 10%.
 */

export type Halalas = number;
export type BasisPoints = number;

export const BP_SCALE = 10_000;

/** Parse a SAR amount (from a spreadsheet or a form) into halalas. */
export function sarToHalalas(sar: number | string): Halalas {
  const n = typeof sar === "string" ? Number(sar.replace(/[,\s]/g, "")) : sar;
  if (!Number.isFinite(n)) return 0;
  // Round half away from zero at the halala boundary; scaling via string-free math
  // still drifts on values like 8.115, so nudge with EPSILON-scaled correction.
  const scaled = n * 100;
  const rounded = Math.round(Math.abs(scaled) + Number.EPSILON * Math.abs(scaled));
  return n < 0 ? -rounded : rounded;
}

export function halalasToSar(h: Halalas): number {
  return h / 100;
}

/** Display helper: 1234567 halalas -> "12,345.67" */
export function formatHalalas(h: Halalas, decimals: 0 | 2 = 2): string {
  const sar = halalasToSar(h);
  return sar.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** amount * rateBp / 10000, truncated toward zero. Exact via BigInt. */
export function applyRate(amount: Halalas, rateBp: BasisPoints): Halalas {
  const product = BigInt(Math.trunc(amount)) * BigInt(Math.trunc(rateBp));
  return Number(product / BigInt(BP_SCALE));
}

/** Percentage of a whole in basis points, truncated. Returns 0 when whole is 0. */
export function shareBp(part: Halalas, whole: Halalas): BasisPoints {
  if (whole === 0) return 0;
  return Number((BigInt(Math.trunc(part)) * BigInt(BP_SCALE)) / BigInt(Math.trunc(whole)));
}

/**
 * Split `total` across `weights` so that the parts sum to EXACTLY `total`.
 *
 * Uses the largest-remainder (Hamilton) method on exact BigInt rationals, so no
 * halala is created or lost. Ties break toward the earlier index, which makes the
 * result deterministic — the same inputs always produce the same payout split.
 */
export function allocateByWeight(total: Halalas, weights: bigint[]): Halalas[] {
  const n = weights.length;
  if (n === 0) return [];
  if (total === 0) return new Array(n).fill(0);

  const totalWeight = weights.reduce((a, b) => a + b, 0n);
  if (totalWeight <= 0n) return new Array(n).fill(0);

  const t = BigInt(Math.trunc(total));
  const base: Halalas[] = new Array(n);
  const remainders: { i: number; rem: bigint }[] = new Array(n);
  let assigned = 0n;

  for (let i = 0; i < n; i++) {
    const numerator = t * weights[i];
    const q = numerator / totalWeight;
    base[i] = Number(q);
    remainders[i] = { i, rem: numerator - q * totalWeight };
    assigned += q;
  }

  let leftover = t - assigned;
  if (leftover > 0n) {
    remainders.sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
    for (let k = 0; leftover > 0n && k < n; k++, leftover--) {
      base[remainders[k].i] += 1;
    }
  }
  return base;
}

/** Sum helper that keeps the integer contract explicit at call sites. */
export function sum(values: Halalas[]): Halalas {
  return values.reduce((a, b) => a + b, 0);
}
