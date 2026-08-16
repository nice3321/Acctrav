import { describe, expect, it } from "vitest";
import { ROLES, can, canTransition, isMutable, nextStates, permissionsOf, type Role } from "./rbac";

describe("permission matrix", () => {
  it("gives the owner every operational permission", () => {
    expect(can("owner", "policy.approve")).toBe(true);
    expect(can("owner", "commission.pay")).toBe(true);
    expect(can("owner", "user.manage")).toBe(true);
  });

  it("separates duties: the CFO runs the money but cannot ratify the policy", () => {
    expect(can("cfo", "commission.pay")).toBe(true);
    expect(can("cfo", "policy.edit")).toBe(true);
    // The rule that stops the CFO from approving the policy governing their own payout.
    expect(can("cfo", "policy.approve")).toBe(false);
  });

  it("keeps the sales manager away from payouts and approvals", () => {
    expect(can("sales_manager", "commission.review")).toBe(true);
    expect(can("sales_manager", "commission.approve")).toBe(false);
    expect(can("sales_manager", "commission.pay")).toBe(false);
    expect(can("sales_manager", "commission.adjust")).toBe(false);
    expect(can("sales_manager", "expense.manage")).toBe(false);
  });

  it("confines the employee to their own statement", () => {
    expect(permissionsOf("employee")).toEqual(["view.self"]);
    expect(can("employee", "view.all")).toBe(false);
    expect(can("employee", "commission.adjust")).toBe(false);
    expect(can("employee", "report.export")).toBe(false);
  });

  it("denies everything for a missing role", () => {
    expect(can(null, "view.all")).toBe(false);
    expect(can(undefined, "view.self")).toBe(false);
    expect(can("ghost" as Role, "view.all")).toBe(false);
  });

  it("never grants view.all and view.self to the same role", () => {
    for (const role of ROLES) {
      expect(can(role, "view.all") && can(role, "view.self")).toBe(false);
    }
  });
});

describe("cycle state machine", () => {
  it("walks the happy path with the right role at each step", () => {
    expect(canTransition("sales_manager", "draft", "review")).toBe(true);
    expect(canTransition("cfo", "review", "approved")).toBe(true);
    expect(canTransition("cfo", "approved", "paid")).toBe(true);
  });

  it("refuses to skip review or approval", () => {
    expect(canTransition("owner", "draft", "approved")).toBe(false);
    expect(canTransition("owner", "draft", "paid")).toBe(false);
    expect(canTransition("owner", "review", "paid")).toBe(false);
  });

  it("treats a paid cycle as final — no edits, no reversal, no re-pay", () => {
    expect(nextStates("owner", "paid")).toEqual([]);
    expect(canTransition("owner", "paid", "draft")).toBe(false);
    expect(canTransition("owner", "paid", "void")).toBe(false);
    expect(canTransition("owner", "paid", "paid")).toBe(false);
  });

  it("treats a void cycle as final too", () => {
    expect(nextStates("owner", "void")).toEqual([]);
  });

  it("lets an approver send work back before money moves", () => {
    expect(canTransition("cfo", "review", "draft")).toBe(true);
    expect(canTransition("cfo", "approved", "void")).toBe(true);
  });

  it("blocks the sales manager from approving or paying", () => {
    expect(canTransition("sales_manager", "review", "approved")).toBe(false);
    expect(canTransition("sales_manager", "approved", "paid")).toBe(false);
    expect(nextStates("sales_manager", "review")).toEqual(["draft"]);
  });

  it("blocks an employee from every transition", () => {
    expect(nextStates("employee", "draft")).toEqual([]);
    expect(nextStates("employee", "review")).toEqual([]);
    expect(nextStates("employee", "approved")).toEqual([]);
  });

  it("freezes the figures the moment a cycle leaves draft", () => {
    expect(isMutable("draft")).toBe(true);
    expect(isMutable("review")).toBe(false);
    expect(isMutable("approved")).toBe(false);
    expect(isMutable("paid")).toBe(false);
    expect(isMutable("void")).toBe(false);
  });
});
