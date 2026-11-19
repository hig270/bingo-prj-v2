import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { pickNextNumber, remainingNumbers } from "./draw";
import { CardLayout, LAYOUTS } from "./layout";
import { BingoNumber } from "./number";

const n = (value: number) => BingoNumber.parse(value);

describe("remainingNumbers", () => {
  it("抽選した番号を除いた残りを小さい順に返す", () => {
    expect(remainingNumbers("3x3", [n(1), n(45)])).toEqual(
      Array.from({ length: 43 }, (_, i) => n(i + 2)),
    );
  });
});

describe("pickNextNumber", () => {
  it("まだ抽選していない番号から選ぶ", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CardLayout.options),
        fc.integer({ min: 0, max: 74 }),
        fc.nat(),
        (layout, drawnCount, seed) => {
          const max = LAYOUTS[layout].maxNumber;
          const drawn = Array.from(
            { length: Math.min(drawnCount, max - 1) },
            (_, i) => n(i + 1),
          );
          const picked = pickNextNumber(layout, drawn, (k) => seed % k);
          expect(picked).not.toBeNull();
          expect(drawn).not.toContain(picked);
          expect(picked ?? 0).toBeLessThanOrEqual(max);
        },
      ),
    );
  });

  it("全部抽選し終えていれば null", () => {
    const all = Array.from({ length: 45 }, (_, i) => n(i + 1));
    expect(pickNextNumber("3x3", all, () => 0)).toBeNull();
  });
});
