import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { angleAt, COAST_DEGREES, speedAt, type SpinPlan } from "./spin";

function plan(ejectSeconds: number, ejectDegrees: number): SpinPlan {
  // DrawStage と同じ決め方: 惰性の区間の始めの速さを、玉が出る瞬間の速さにそろえる
  const ejectSpeed = (ejectDegrees / ejectSeconds) * (1 / (1 - 0.35 / 2));
  return {
    ejectSeconds,
    ejectDegrees,
    coastSeconds: (2 * COAST_DEGREES) / ejectSpeed,
    coastDegrees: COAST_DEGREES,
  };
}

describe("胴の回り方", () => {
  it("玉が出る瞬間に予定の角度に達し、最後は予定の角度で止まる", () => {
    const p = plan(2, 720);
    expect(angleAt(p, 2)).toBeCloseTo(720);
    expect(angleAt(p, 2 + p.coastSeconds)).toBeCloseTo(720 + COAST_DEGREES);
    expect(angleAt(p, 100)).toBeCloseTo(720 + COAST_DEGREES);
  });

  it("角度は時間とともに減らない（逆回りしない）", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.5, max: 8, noNaN: true }),
        fc.double({ min: 180, max: 3600, noNaN: true }),
        fc.double({ min: 0, max: 10, noNaN: true }),
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        (seconds, degrees, t, dt) => {
          const p = plan(seconds, degrees);
          expect(angleAt(p, t + dt)).toBeGreaterThanOrEqual(
            angleAt(p, t) - 1e-9,
          );
        },
      ),
    );
  });

  it("玉が出る瞬間の前後で速さが急に変わらない", () => {
    const p = plan(2, 720);
    const dt = 1e-4;
    const before = (angleAt(p, 2) - angleAt(p, 2 - dt)) / dt;
    const after = (angleAt(p, 2 + dt) - angleAt(p, 2)) / dt;
    expect(after / before).toBeCloseTo(1, 2);
    expect(speedAt(p, 2 - dt)).toBeCloseTo(1);
  });
});
