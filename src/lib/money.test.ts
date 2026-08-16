import { describe, expect, it } from "vitest";
import { allocateByWeight, applyRate, formatHalalas, sarToHalalas, shareBp, sum } from "./money";

describe("sarToHalalas", () => {
  it("converts whole and fractional riyals exactly", () => {
    expect(sarToHalalas(1)).toBe(100);
    expect(sarToHalalas(42817.35)).toBe(4281735);
    expect(sarToHalalas("1,695.00")).toBe(169500);
    expect(sarToHalalas(0)).toBe(0);
  });

  it("survives binary-float traps that break naive rounding", () => {
    // 8.115 * 100 === 811.4999999999999 in IEEE-754
    expect(sarToHalalas(8.115)).toBe(812);
    expect(sarToHalalas(1.005)).toBe(101);
    expect(sarToHalalas(2.675)).toBe(268);
  });

  it("keeps the sign on refunds", () => {
    expect(sarToHalalas(-450.5)).toBe(-45050);
  });

  it("treats junk as zero rather than NaN poisoning a payroll", () => {
    expect(sarToHalalas("abc")).toBe(0);
    expect(sarToHalalas(Number.NaN)).toBe(0);
  });
});

describe("applyRate", () => {
  it("applies basis points without float drift", () => {
    expect(applyRate(1_000_00, 1000)).toBe(100_00); // 10% of 1000.00
    expect(applyRate(18_246_72, 1500)).toBe(273_700); // 15% VAT
  });

  it("truncates rather than rounding up, so a pool is never overspent", () => {
    expect(applyRate(999, 1000)).toBe(99); // 99.9 -> 99
  });

  it("handles amounts far beyond float-safe multiplication", () => {
    expect(applyRate(9_000_000_000_00, 1250)).toBe(1_125_000_000_00);
  });
});

describe("shareBp", () => {
  it("returns a basis-point share", () => {
    expect(shareBp(25, 100)).toBe(2500);
    expect(shareBp(1, 3)).toBe(3333);
  });
  it("never divides by zero", () => {
    expect(shareBp(10, 0)).toBe(0);
  });
});

describe("allocateByWeight — the payout invariant", () => {
  it("splits exactly, with no halala created or lost", () => {
    const parts = allocateByWeight(100_00, [1n, 1n, 1n]);
    expect(sum(parts)).toBe(100_00);
    expect(parts).toEqual([3334, 3333, 3333]);
  });

  it("holds for an awkward pool across many uneven weights", () => {
    const weights = [7n, 13n, 2n, 91n, 44n, 1n, 6n];
    const pool = 1_234_567;
    const parts = allocateByWeight(pool, weights);
    expect(sum(parts)).toBe(pool);
    expect(parts.every((p) => p >= 0)).toBe(true);
  });

  it("is deterministic — identical input always splits identically", () => {
    const w = [5n, 5n, 5n, 1n];
    expect(allocateByWeight(9_999, w)).toEqual(allocateByWeight(9_999, w));
  });

  it("gives the larger share to the larger weight", () => {
    const [small, large] = allocateByWeight(1_000_00, [1n, 9n]);
    expect(large).toBeGreaterThan(small);
    expect(small + large).toBe(1_000_00);
  });

  it("returns zeros for an empty pool and for zero total weight", () => {
    expect(allocateByWeight(0, [1n, 2n])).toEqual([0, 0]);
    expect(allocateByWeight(500, [0n, 0n])).toEqual([0, 0]);
    expect(allocateByWeight(500, [])).toEqual([]);
  });

  it("survives a fuzz sweep: every split sums to its pool", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let run = 0; run < 400; run++) {
      const n = 1 + Math.floor(rand() * 25);
      const weights = Array.from({ length: n }, () => BigInt(Math.floor(rand() * 1_000_000)));
      const pool = Math.floor(rand() * 50_000_000);
      const parts = allocateByWeight(pool, weights);
      const total = weights.reduce((a, b) => a + b, 0n);
      expect(sum(parts)).toBe(total > 0n ? pool : 0);
    }
  });
});

describe("formatHalalas", () => {
  it("renders riyals with grouping", () => {
    expect(formatHalalas(1_234_567)).toBe("12,345.67");
    expect(formatHalalas(1_234_567, 0)).toBe("12,346");
  });
});
