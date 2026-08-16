import { describe, expect, it } from "vitest";
import { computeCycle, netPayable, usesTargetModel, type CycleInput, type Policy, type SalesRow } from "./commission-engine";
import { sarToHalalas, sum } from "./money";

const policy: Policy = {
  targetModelEffectiveFrom: "2026-01-01",
  levels: [
    { id: "lvl1", label: "المستوى الأول", costMultiplierBp: 10000, rateBp: 1000 },
    { id: "lvl2", label: "المستوى الثاني", costMultiplierBp: 12500, rateBp: 1300 },
    { id: "lvl3", label: "المستوى الثالث", costMultiplierBp: 15000, rateBp: 1600 },
  ],
  weightBlendBp: 5000,
  departments: [
    { id: "mkt", name: "التسويق", levelRatesBp: { lvl1: 200, lvl2: 250, lvl3: 300 } },
    { id: "fin", name: "المالية", levelRatesBp: { lvl1: 200, lvl2: 250, lvl3: 300 } },
  ],
  individualFallback: { enabled: true, rateBp: 1000 },
  vat: { enabled: false, rateBp: 1500 },
  legacyTiers: [
    { label: "أول 1,000", fromHalalas: 0, toHalalas: 100_000, rateBp: 1000 },
    { label: "ثاني 1,000", fromHalalas: 100_000, toHalalas: 200_000, rateBp: 700 },
    { label: "ما زاد", fromHalalas: 200_000, toHalalas: null, rateBp: 500 },
  ],
  legacyDeductRefunds: true,
  minEligibleProfitHalalas: 0,
};

function row(id: string, sales: number, profit: number, orders: number | null = null, extra: Partial<SalesRow> = {}): SalesRow {
  return {
    employeeId: id,
    salesHalalas: sarToHalalas(sales),
    profitHalalas: sarToHalalas(profit),
    saleCount: orders,
    refundCount: 0,
    excluded: false,
    targetHalalas: 0,
    ...extra,
  };
}

function cycle(over: Partial<CycleInput> = {}): CycleInput {
  return {
    periodStart: "2026-07-01",
    monthlyCostHalalas: sarToHalalas(250_000),
    rows: [row("a", 500_000, 120_000, 40), row("b", 300_000, 90_000, 25), row("c", 200_000, 60_000, 10)],
    policy,
    ...over,
  };
}

describe("model selection", () => {
  it("uses the target model from the effective date onward", () => {
    expect(usesTargetModel("2026-01-01", policy)).toBe(true);
    expect(usesTargetModel("2026-07-01", policy)).toBe(true);
  });
  it("falls back to legacy tiers for earlier periods", () => {
    expect(usesTargetModel("2025-12-01", policy)).toBe(false);
  });
  it("picks the model from the period, not from today", () => {
    expect(computeCycle(cycle({ periodStart: "2025-12-01" })).model).toBe("legacy");
    expect(computeCycle(cycle({ periodStart: "2026-07-01" })).model).toBe("target");
  });
});

describe("target model — level thresholds", () => {
  it("reaches no level when profit misses the monthly cost", () => {
    const r = computeCycle(cycle({ rows: [row("a", 100_000, 50_000, 10)] }));
    expect(r.achieved).toBe(false);
    expect(r.activeLevel).toBeNull();
    expect(r.salesPoolHalalas).toBe(0);
  });

  it("activates level 1 exactly at the cost boundary", () => {
    const r = computeCycle(cycle({ rows: [row("a", 900_000, 250_000, 10)] }));
    expect(r.activeLevel?.id).toBe("lvl1");
    expect(r.surplusHalalas).toBe(0);
    expect(r.salesPoolHalalas).toBe(0); // threshold met, but nothing above cost to share
  });

  // Thresholds against a 250,000 cost: lvl1 = 250,000 · lvl2 = 312,500 · lvl3 = 375,000
  it("climbs to the highest level the profit actually reaches", () => {
    expect(computeCycle(cycle({ rows: [row("a", 9e5, 300_000, 10)] })).activeLevel?.id).toBe("lvl1");
    expect(computeCycle(cycle({ rows: [row("a", 9e5, 312_500, 10)] })).activeLevel?.id).toBe("lvl2");
    expect(computeCycle(cycle({ rows: [row("a", 9e5, 375_000, 10)] })).activeLevel?.id).toBe("lvl3");
    expect(computeCycle(cycle({ rows: [row("a", 9e5, 374_999, 10)] })).activeLevel?.id).toBe("lvl2");
  });

  it("pays the active level's rate on the surplus only", () => {
    const lvl1 = computeCycle(cycle({ rows: [row("a", 9e5, 300_000, 10)] }));
    expect(lvl1.surplusHalalas).toBe(sarToHalalas(50_000));
    expect(lvl1.salesPoolHalalas).toBe(sarToHalalas(5_000)); // 10% of the 50,000 surplus

    const lvl2 = computeCycle(cycle({ rows: [row("a", 9e5, 312_500, 10)] }));
    expect(lvl2.salesPoolHalalas).toBe(sarToHalalas(8_125)); // 13% of 62,500
  });
});

describe("target model — distribution invariant", () => {
  it("splits the pool to the last halala", () => {
    const r = computeCycle(cycle({ rows: [row("a", 500_000, 150_000, 41), row("b", 300_000, 130_000, 27), row("c", 200_000, 90_000, 13)] }));
    expect(r.achieved).toBe(true);
    expect(sum(r.employees.map((e) => e.baseCommissionHalalas))).toBe(r.salesPoolHalalas);
  });

  it("holds the invariant across a fuzz sweep of team shapes", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let achievedRuns = 0;
    let missedRuns = 0;
    for (let run = 0; run < 250; run++) {
      const n = 1 + Math.floor(rand() * 20);
      const rows = Array.from({ length: n }, (_, i) =>
        row(`e${i}`, Math.floor(rand() * 400_000), Math.floor(rand() * 90_000), Math.floor(rand() * 60)),
      );
      const r = computeCycle(cycle({ rows }));
      const paid = sum(r.employees.map((e) => e.baseCommissionHalalas));
      if (r.achieved) {
        achievedRuns++;
        expect(paid).toBe(r.salesPoolHalalas);
      } else {
        // No pool to divide: every riyal paid must come from the individual safety net.
        missedRuns++;
        expect(r.salesPoolHalalas).toBe(0);
        const fallbackTotal = sum(
          r.employees.filter((e) => e.viaFallback).map((e) => e.baseCommissionHalalas),
        );
        expect(paid).toBe(fallbackTotal);
      }
    }
    // Guard the guard: a sweep that never exercised both branches proves nothing.
    expect(achievedRuns).toBeGreaterThan(0);
    expect(missedRuns).toBeGreaterThan(0);
  });

  it("weights by sales alone when no order counts exist", () => {
    const r = computeCycle(cycle({ rows: [row("a", 750_000, 200_000, null), row("b", 250_000, 150_000, null)] }));
    const [a, b] = r.employees;
    expect(a.salesShareBp).toBe(7500);
    expect(b.salesShareBp).toBe(2500);
    expect(a.baseCommissionHalalas).toBeGreaterThan(b.baseCommissionHalalas);
    expect(a.baseCommissionHalalas + b.baseCommissionHalalas).toBe(r.salesPoolHalalas);
  });

  it("shifts money toward order count as the blend moves", () => {
    // 'b' books many small orders; 'a' books one big deal.
    const rows = [row("a", 900_000, 200_000, 2), row("b", 100_000, 150_000, 60)];
    const bySales = computeCycle(cycle({ rows, policy: { ...policy, weightBlendBp: 0 } }));
    const byOrders = computeCycle(cycle({ rows, policy: { ...policy, weightBlendBp: 10000 } }));
    const bIndex = 1;
    expect(byOrders.employees[bIndex].baseCommissionHalalas).toBeGreaterThan(
      bySales.employees[bIndex].baseCommissionHalalas,
    );
    expect(sum(byOrders.employees.map((e) => e.baseCommissionHalalas))).toBe(byOrders.salesPoolHalalas);
  });

  it("excludes excluded employees from the pool and from the weights", () => {
    const rows = [row("a", 500_000, 300_000, 20), row("x", 500_000, 300_000, 20, { excluded: true })];
    const r = computeCycle(cycle({ rows }));
    const excluded = r.employees.find((e) => e.employeeId === "x")!;
    const included = r.employees.find((e) => e.employeeId === "a")!;
    expect(r.achieved).toBe(true);
    expect(excluded.baseCommissionHalalas).toBe(0);
    expect(excluded.weightBp).toBe(0);
    expect(included.baseCommissionHalalas).toBe(r.salesPoolHalalas);
    // Excluded profit must not inflate the company total either — otherwise an
    // excluded employee could push the company over a level it did not earn.
    expect(r.totalProfitHalalas).toBe(sarToHalalas(300_000));
  });
});

describe("target model — individual safety net", () => {
  it("pays each qualifying employee a share of their own profit when the company misses", () => {
    const r = computeCycle(cycle({ rows: [row("a", 100_000, 40_000, 5), row("b", 50_000, 10_000, 2)] }));
    expect(r.achieved).toBe(false);
    expect(r.employees[0].viaFallback).toBe(true);
    expect(r.employees[0].baseCommissionHalalas).toBe(sarToHalalas(4_000)); // 10% of 40,000
    expect(r.employees[1].baseCommissionHalalas).toBe(sarToHalalas(1_000));
  });

  it("withholds the safety net from anyone below their personal target", () => {
    const rows = [row("a", 100_000, 9_000, 5, { targetHalalas: sarToHalalas(10_000) })];
    const r = computeCycle(cycle({ rows }));
    expect(r.employees[0].baseCommissionHalalas).toBe(0);
    expect(r.employees[0].viaFallback).toBe(false);
  });

  it("pays nothing at all when the safety net is switched off", () => {
    const r = computeCycle(cycle({
      rows: [row("a", 100_000, 40_000, 5)],
      policy: { ...policy, individualFallback: { enabled: false, rateBp: 1000 } },
    }));
    expect(sum(r.employees.map((e) => e.baseCommissionHalalas))).toBe(0);
  });

  it("never pays department incentives when there is no surplus", () => {
    const r = computeCycle(cycle({ rows: [row("a", 100_000, 40_000, 5)] }));
    expect(r.totalDepartmentIncentiveHalalas).toBe(0);
  });
});

describe("department incentives", () => {
  it("pays each department its level rate on the surplus", () => {
    const r = computeCycle(cycle({ rows: [row("a", 9e5, 300_000, 10)] }));
    // lvl1 → 2% of the 50,000 surplus, per department
    expect(r.departments.map((d) => d.amountHalalas)).toEqual([sarToHalalas(1_000), sarToHalalas(1_000)]);
    expect(r.totalDepartmentIncentiveHalalas).toBe(sarToHalalas(2_000));
  });

  it("scales the rate up with the achieved level", () => {
    const lvl3 = computeCycle(cycle({ rows: [row("a", 9e5, 400_000, 10)] }));
    expect(lvl3.activeLevel?.id).toBe("lvl3");
    expect(lvl3.departments[0].rateBp).toBe(300);
    expect(lvl3.departments[0].amountHalalas).toBe(sarToHalalas(4_500)); // 3% of 150,000
  });
});

describe("legacy tier model", () => {
  const legacyCycle = (rows: SalesRow[]) => computeCycle(cycle({ periodStart: "2025-12-01", rows }));

  it("walks the brackets progressively", () => {
    const r = legacyCycle([row("a", 50_000, 5_000)]);
    // 1000@10% + 1000@7% + 3000@5% = 100 + 70 + 150 = 320
    expect(r.employees[0].baseCommissionHalalas).toBe(sarToHalalas(320));
  });

  it("stops inside the first bracket for a small profit", () => {
    const r = legacyCycle([row("a", 5_000, 400)]);
    expect(r.employees[0].baseCommissionHalalas).toBe(sarToHalalas(40)); // 10% of 400
  });

  it("deducts the refund share before applying tiers", () => {
    const withRefunds = legacyCycle([row("a", 50_000, 5_000, 8, { refundCount: 2 })]);
    const clean = legacyCycle([row("a", 50_000, 5_000, 8, { refundCount: 0 })]);
    expect(withRefunds.employees[0].refundAdjustmentHalalas).toBe(sarToHalalas(1_000)); // 2/10 of profit
    expect(withRefunds.employees[0].baseCommissionHalalas).toBeLessThan(clean.employees[0].baseCommissionHalalas);
  });

  it("caps the refund deduction at half the profit", () => {
    const r = legacyCycle([row("a", 50_000, 5_000, 1, { refundCount: 40 })]);
    expect(r.employees[0].refundAdjustmentHalalas).toBe(sarToHalalas(2_500));
  });

  it("pays nothing on a loss", () => {
    const r = legacyCycle([row("a", 10_000, -3_000)]);
    expect(r.employees[0].baseCommissionHalalas).toBe(0);
  });

  it("honours the minimum eligible profit floor", () => {
    const r = computeCycle(cycle({
      periodStart: "2025-12-01",
      rows: [row("a", 10_000, 400)],
      policy: { ...policy, minEligibleProfitHalalas: sarToHalalas(500) },
    }));
    expect(r.employees[0].baseCommissionHalalas).toBe(0);
  });

  it("pays no department incentives under the legacy model", () => {
    expect(legacyCycle([row("a", 50_000, 5_000)]).departments).toEqual([]);
  });
});

describe("VAT", () => {
  it("adds tax on top without touching the commission itself", () => {
    const withVat = computeCycle(cycle({
      rows: [row("a", 9e5, 300_000, 10)],
      policy: { ...policy, vat: { enabled: true, rateBp: 1500 } },
    }));
    const without = computeCycle(cycle({ rows: [row("a", 9e5, 300_000, 10)] }));
    expect(withVat.employees[0].baseCommissionHalalas).toBe(without.employees[0].baseCommissionHalalas);
    expect(withVat.employees[0].vatHalalas).toBe(
      Math.trunc((withVat.employees[0].baseCommissionHalalas * 1500) / 10000),
    );
    expect(without.totalVatHalalas).toBe(0);
  });
});

describe("netPayable", () => {
  it("applies positive and negative adjustments", () => {
    expect(netPayable(10_000, [5_000, -2_000])).toBe(13_000);
  });
  it("never returns a negative payout", () => {
    expect(netPayable(1_000, [-9_999])).toBe(0);
  });
});
