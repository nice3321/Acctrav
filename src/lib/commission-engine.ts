/**
 * Commission engine — pure, deterministic, integer-only.
 *
 * Two models coexist, selected by the period's start date:
 *   - "target": monthly-target model, active from policy.targetModelEffectiveFrom onward.
 *   - "legacy": progressive tiers, applied to any earlier (archive) period.
 *
 * Invariant enforced by tests: the individual allocations of a cycle sum to EXACTLY
 * the distributable pool — no halala is invented or lost.
 */

import {
  BP_SCALE,
  type BasisPoints,
  type Halalas,
  allocateByWeight,
  applyRate,
  shareBp,
  sum,
} from "./money";

export type CommissionModel = "target" | "legacy";

export interface PolicyLevel {
  id: string;
  label: string;
  /** Multiple of the monthly cost that unlocks this level. 10000 bp = 1.00x */
  costMultiplierBp: BasisPoints;
  /** Share of the surplus paid to the sales team at this level. */
  rateBp: BasisPoints;
}

export interface PolicyDepartment {
  id: string;
  name: string;
  /** levelId -> rate in bp, applied to the surplus when that level is reached. */
  levelRatesBp: Record<string, BasisPoints>;
}

export interface LegacyTier {
  label: string;
  fromHalalas: Halalas;
  /** null = open-ended top bracket */
  toHalalas: Halalas | null;
  rateBp: BasisPoints;
}

export interface Policy {
  targetModelEffectiveFrom: string; // 'YYYY-MM-DD'
  levels: PolicyLevel[];
  /** 0 = distribute purely by sales share, 10000 = purely by order count. */
  weightBlendBp: BasisPoints;
  departments: PolicyDepartment[];
  individualFallback: { enabled: boolean; rateBp: BasisPoints };
  vat: { enabled: boolean; rateBp: BasisPoints };
  legacyTiers: LegacyTier[];
  /** Deduct the refund share of profit before applying legacy tiers. */
  legacyDeductRefunds: boolean;
  minEligibleProfitHalalas: Halalas;
}

export interface SalesRow {
  employeeId: string;
  salesHalalas: Halalas;
  profitHalalas: Halalas;
  saleCount: number | null;
  refundCount: number | null;
  /** Excluded employees appear in reports but never earn commission. */
  excluded: boolean;
  /** Personal monthly profit target; 0 means "any positive profit qualifies". */
  targetHalalas: Halalas;
}

export interface CycleInput {
  periodStart: string; // 'YYYY-MM-DD'
  monthlyCostHalalas: Halalas;
  rows: SalesRow[];
  policy: Policy;
}

export interface LevelStatus extends PolicyLevel {
  thresholdHalalas: Halalas;
  reached: boolean;
}

export interface EmployeeAllocation {
  employeeId: string;
  model: CommissionModel;
  excluded: boolean;
  salesHalalas: Halalas;
  profitHalalas: Halalas;
  /** Basis for the payout: allocated pool share (target) or eligible profit (legacy). */
  eligibleProfitHalalas: Halalas;
  baseCommissionHalalas: Halalas;
  vatHalalas: Halalas;
  /** target model only */
  weightBp: BasisPoints;
  salesShareBp: BasisPoints;
  orderShareBp: BasisPoints;
  viaFallback: boolean;
  /** legacy model only */
  refundAdjustmentHalalas: Halalas;
  tierBreakdown: { label: string; baseHalalas: Halalas; rateBp: BasisPoints; commissionHalalas: Halalas }[];
}

export interface DepartmentAllocation {
  departmentId: string;
  name: string;
  rateBp: BasisPoints;
  amountHalalas: Halalas;
  vatHalalas: Halalas;
}

export interface CycleResult {
  model: CommissionModel;
  totalProfitHalalas: Halalas;
  monthlyCostHalalas: Halalas;
  surplusHalalas: Halalas;
  achieved: boolean;
  activeLevel: LevelStatus | null;
  levels: LevelStatus[];
  salesPoolHalalas: Halalas;
  totalSalesHalalas: Halalas;
  totalOrders: number;
  employees: EmployeeAllocation[];
  departments: DepartmentAllocation[];
  /** sum of employee base commissions */
  totalEmployeeCommissionHalalas: Halalas;
  totalDepartmentIncentiveHalalas: Halalas;
  totalVatHalalas: Halalas;
}

export function usesTargetModel(periodStart: string, policy: Policy): boolean {
  return Boolean(policy.targetModelEffectiveFrom && periodStart >= policy.targetModelEffectiveFrom);
}

function vatOn(amount: Halalas, policy: Policy): Halalas {
  return policy.vat.enabled ? applyRate(amount, policy.vat.rateBp) : 0;
}

/** Progressive tiers over an eligible profit amount. */
export function computeTiers(eligible: Halalas, tiers: LegacyTier[]) {
  let remaining = Math.max(0, eligible);
  const breakdown: EmployeeAllocation["tierBreakdown"] = [];
  let total = 0;
  for (const t of tiers) {
    const bracketSize = t.toHalalas === null ? Infinity : t.toHalalas - t.fromHalalas;
    const inBracket = Math.min(remaining, bracketSize);
    const commission = inBracket > 0 ? applyRate(inBracket, t.rateBp) : 0;
    breakdown.push({
      label: t.label,
      baseHalalas: inBracket === Infinity ? 0 : inBracket,
      rateBp: t.rateBp,
      commissionHalalas: commission,
    });
    total += commission;
    remaining -= inBracket;
    if (remaining <= 0) break;
  }
  return { breakdown, total };
}

function legacyRow(row: SalesRow, policy: Policy): EmployeeAllocation {
  const gross = row.profitHalalas;
  let refundAdjustment = 0;
  let eligible = gross;

  if (policy.legacyDeductRefunds && row.refundCount && row.saleCount) {
    // Refund share is capped at half so a bad month can never wipe out the whole payout.
    const denominator = Math.max(1, row.saleCount + row.refundCount);
    const rawShareBp = Math.trunc((row.refundCount * BP_SCALE) / denominator);
    const cappedBp = Math.min(BP_SCALE / 2, rawShareBp);
    refundAdjustment = applyRate(Math.max(0, gross), cappedBp);
    eligible = gross - refundAdjustment;
  }

  eligible = Math.max(0, eligible);
  if (eligible < policy.minEligibleProfitHalalas) eligible = 0;

  const { breakdown, total } = row.excluded
    ? { breakdown: [], total: 0 }
    : computeTiers(eligible, policy.legacyTiers);

  return {
    employeeId: row.employeeId,
    model: "legacy",
    excluded: row.excluded,
    salesHalalas: row.salesHalalas,
    profitHalalas: gross,
    eligibleProfitHalalas: row.excluded ? 0 : eligible,
    baseCommissionHalalas: total,
    vatHalalas: vatOn(total, policy),
    weightBp: 0,
    salesShareBp: 0,
    orderShareBp: 0,
    viaFallback: false,
    refundAdjustmentHalalas: row.excluded ? 0 : refundAdjustment,
    tierBreakdown: breakdown,
  };
}

export function computeCycle(input: CycleInput): CycleResult {
  const { policy, rows, monthlyCostHalalas } = input;
  const model: CommissionModel = usesTargetModel(input.periodStart, policy) ? "target" : "legacy";

  if (model === "legacy") {
    const employees = rows.map((r) => legacyRow(r, policy));
    const totalEmployee = sum(employees.map((e) => e.baseCommissionHalalas));
    return {
      model,
      totalProfitHalalas: sum(rows.map((r) => r.profitHalalas)),
      monthlyCostHalalas,
      surplusHalalas: 0,
      achieved: false,
      activeLevel: null,
      levels: [],
      salesPoolHalalas: 0,
      totalSalesHalalas: sum(rows.map((r) => r.salesHalalas)),
      totalOrders: rows.reduce((a, r) => a + (r.saleCount ?? 0), 0),
      employees,
      departments: [],
      totalEmployeeCommissionHalalas: totalEmployee,
      totalDepartmentIncentiveHalalas: 0,
      totalVatHalalas: sum(employees.map((e) => e.vatHalalas)),
    };
  }

  const eligibleRows = rows.filter((r) => !r.excluded);
  const totalProfit = sum(eligibleRows.map((r) => r.profitHalalas));
  const totalSales = sum(eligibleRows.map((r) => Math.max(0, r.salesHalalas)));
  const totalOrders = eligibleRows.reduce((a, r) => a + (r.saleCount ?? 0), 0);
  const hasOrders = eligibleRows.some((r) => r.saleCount !== null && r.saleCount !== undefined) && totalOrders > 0;

  const levels: LevelStatus[] = [...policy.levels]
    .sort((a, b) => a.costMultiplierBp - b.costMultiplierBp)
    .map((l) => {
      const threshold = applyRate(monthlyCostHalalas, l.costMultiplierBp);
      return { ...l, thresholdHalalas: threshold, reached: totalProfit >= threshold };
    });

  let activeLevel: LevelStatus | null = null;
  for (const l of levels) if (l.reached) activeLevel = l;

  const achieved = activeLevel !== null;
  const surplus = Math.max(0, totalProfit - monthlyCostHalalas);
  const salesPool = achieved ? applyRate(surplus, activeLevel!.rateBp) : 0;

  // --- Weights (exact integer rationals over a shared denominator) ---
  const weights: bigint[] = eligibleRows.map((r) => {
    const s = BigInt(Math.max(0, r.salesHalalas));
    if (!hasOrders) return s;
    const o = BigInt(r.saleCount ?? 0);
    const blend = BigInt(policy.weightBlendBp);
    const inv = BigInt(BP_SCALE - policy.weightBlendBp);
    // blend·(o/totalOrders) + inv·(s/totalSales), scaled by totalOrders·totalSales
    return blend * o * BigInt(totalSales) + inv * s * BigInt(totalOrders);
  });

  const allocations = allocateByWeight(salesPool, weights);

  const byEmployee = new Map<string, number>();
  eligibleRows.forEach((r, i) => byEmployee.set(r.employeeId, allocations[i]));

  const fallbackOn = !achieved && policy.individualFallback.enabled;

  const employees: EmployeeAllocation[] = rows.map((r) => {
    const salesShareBp = shareBp(Math.max(0, r.salesHalalas), totalSales);
    const orderShareBp = hasOrders
      ? shareBp(r.saleCount ?? 0, totalOrders)
      : salesShareBp;
    const weightBp = hasOrders
      ? Math.trunc(
          (policy.weightBlendBp * orderShareBp + (BP_SCALE - policy.weightBlendBp) * salesShareBp) / BP_SCALE,
        )
      : salesShareBp;

    let base = 0;
    let viaFallback = false;

    if (!r.excluded) {
      if (achieved) {
        base = byEmployee.get(r.employeeId) ?? 0;
      } else if (fallbackOn && r.profitHalalas > 0 && r.profitHalalas >= r.targetHalalas) {
        base = applyRate(r.profitHalalas, policy.individualFallback.rateBp);
        viaFallback = true;
      }
    }

    return {
      employeeId: r.employeeId,
      model: "target",
      excluded: r.excluded,
      salesHalalas: r.salesHalalas,
      profitHalalas: r.profitHalalas,
      eligibleProfitHalalas: base,
      baseCommissionHalalas: base,
      vatHalalas: vatOn(base, policy),
      weightBp: r.excluded ? 0 : weightBp,
      salesShareBp: r.excluded ? 0 : salesShareBp,
      orderShareBp: r.excluded ? 0 : orderShareBp,
      viaFallback,
      refundAdjustmentHalalas: 0,
      tierBreakdown: [],
    };
  });

  const departments: DepartmentAllocation[] = policy.departments.map((d) => {
    const rateBp = achieved ? d.levelRatesBp[activeLevel!.id] ?? 0 : 0;
    const amount = achieved ? applyRate(surplus, rateBp) : 0;
    return { departmentId: d.id, name: d.name, rateBp, amountHalalas: amount, vatHalalas: vatOn(amount, policy) };
  });

  const totalEmployee = sum(employees.map((e) => e.baseCommissionHalalas));
  const totalDept = sum(departments.map((d) => d.amountHalalas));

  return {
    model,
    totalProfitHalalas: totalProfit,
    monthlyCostHalalas,
    surplusHalalas: surplus,
    achieved,
    activeLevel,
    levels,
    salesPoolHalalas: salesPool,
    totalSalesHalalas: totalSales,
    totalOrders,
    employees,
    departments,
    totalEmployeeCommissionHalalas: totalEmployee,
    totalDepartmentIncentiveHalalas: totalDept,
    totalVatHalalas: sum(employees.map((e) => e.vatHalalas)) + sum(departments.map((d) => d.vatHalalas)),
  };
}

/** Net payable after manual adjustments, floored at zero. */
export function netPayable(base: Halalas, adjustments: Halalas[]): Halalas {
  return Math.max(0, base + sum(adjustments));
}
