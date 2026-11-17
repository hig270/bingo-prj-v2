import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  Card,
  cellOf,
  completedLines,
  drawnMask,
  generateCard,
  initialMask,
  numberAt,
} from "./card";
import { CellIndex, countOpen, isOpen } from "./cells";
import { CardLayout, LAYOUTS, drawPool } from "./layout";
import { BingoNumber } from "./number";

/** シードから決まった並びを返す乱数（mulberry32）。テストで結果を再現するため */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const arbitrarySeed = fc.integer({ min: 0, max: 2 ** 32 - 1 });
const n = (value: number) => BingoNumber.parse(value);

describe("generateCard", () => {
  for (const layout of CardLayout.options) {
    const spec = LAYOUTS[layout];

    it(`${layout}: どんな乱数でも、正しい形のカードができる`, () => {
      fc.assert(
        fc.property(arbitrarySeed, (seed) => {
          const card = generateCard(layout, seeded(seed));
          // Card.parse は形（マスの数・FREE・列の範囲・重複なし）を確かめる
          expect(Card.safeParse(card).success).toBe(true);
          const numbers = card.cells.filter((c) => c !== null);
          expect(numbers).toHaveLength(
            spec.cellCount - (spec.free === null ? 0 : 1),
          );
          expect(numbers.every((x) => x <= spec.maxNumber)).toBe(true);
        }),
      );
    });

    it(`${layout}: 同じ乱数の並びなら、同じカードになる`, () => {
      fc.assert(
        fc.property(arbitrarySeed, (seed) => {
          expect(generateCard(layout, seeded(seed))).toEqual(
            generateCard(layout, seeded(seed)),
          );
        }),
      );
    });
  }

  it("5×5 は中央が FREE、3×3 は FREE がない", () => {
    const card5 = generateCard("5x5", seeded(1));
    expect(card5.cells[12]).toBeNull();
    const card3 = generateCard("3x3", seeded(1));
    expect(card3.cells.every((c) => c !== null)).toBe(true);
  });

  it("乱数がいつも 0 なら、各列の範囲の小さい方から並ぶ", () => {
    const card = generateCard("3x3", () => 0);
    expect(card.cells).toEqual([1, 16, 31, 2, 17, 32, 3, 18, 33]);
  });

  it("乱数が 1 に近くても範囲の外に出ない", () => {
    const card = generateCard("5x5", () => 0.999999);
    expect(Card.safeParse(card).success).toBe(true);
  });
});

describe("Card の形の確認", () => {
  it("列の範囲の外の番号を受け付けない（3×3 の左の列に 16）", () => {
    const result = Card.safeParse({
      layout: "3x3",
      cells: [16, 17, 31, 2, 18, 32, 3, 19, 33],
    });
    expect(result.success).toBe(false);
  });

  it("重複した番号を受け付けない", () => {
    const result = Card.safeParse({
      layout: "3x3",
      cells: [1, 16, 31, 1, 17, 32, 3, 18, 33],
    });
    expect(result.success).toBe(false);
  });

  it("FREE のマスに番号があるもの・マスの数が違うものを受け付けない", () => {
    const card = generateCard("5x5", seeded(2));
    expect(
      Card.safeParse({ layout: "5x5", cells: card.cells.with(12, n(40)) })
        .success,
    ).toBe(false);
    expect(
      Card.safeParse({ layout: "5x5", cells: card.cells.slice(0, 24) }).success,
    ).toBe(false);
  });
});

describe("カードの番号とマス", () => {
  it("cellOf と numberAt は互いに逆", () => {
    fc.assert(
      fc.property(arbitrarySeed, (seed) => {
        const card = generateCard("5x5", seeded(seed));
        card.cells.forEach((value, i) => {
          if (value === null) return;
          expect(cellOf(card, value)).toBe(i);
          expect(numberAt(card, CellIndex.parse(i))).toBe(value);
        });
      }),
    );
  });

  it("numberAt は FREE なら free、カードの範囲の外なら null", () => {
    const big = generateCard("5x5", () => 0);
    expect(numberAt(big, CellIndex.parse(12))).toBe("free");
    const small = generateCard("3x3", () => 0);
    expect(numberAt(small, CellIndex.parse(8))).not.toBeNull();
    expect(numberAt(small, CellIndex.parse(9))).toBeNull();
    expect(numberAt(small, CellIndex.parse(24))).toBeNull();
  });

  it("カードに無い番号は null", () => {
    const card = generateCard("3x3", () => 0);
    expect(cellOf(card, n(75))).toBeNull();
  });
});

describe("initialMask", () => {
  it("5×5 は FREE だけ、3×3 は何も開いていない", () => {
    const m5 = initialMask("5x5");
    expect(countOpen(m5)).toBe(1);
    expect(isOpen(m5, CellIndex.parse(12))).toBe(true);
    expect(countOpen(initialMask("3x3"))).toBe(0);
  });
});

describe("drawnMask（抽選番号だけで見たカードの状態）", () => {
  it("抽選された番号のマスと FREE が開く", () => {
    const card = generateCard("3x3", () => 0); // [1,16,31, 2,17,32, 3,18,33]
    const mask = drawnMask(card, new Set([n(1), n(17), n(75)]));
    expect(countOpen(mask)).toBe(2);
    expect(isOpen(mask, CellIndex.parse(0))).toBe(true);
    expect(isOpen(mask, CellIndex.parse(4))).toBe(true);
  });

  it("3×3 で斜めの番号が出そろうと1本", () => {
    const card = generateCard("3x3", () => 0);
    const mask = drawnMask(card, new Set([n(1), n(17), n(33)]));
    expect(completedLines("3x3", mask)).toBe(1);
  });

  it("すべての番号が出れば、すべてのラインがそろう", () => {
    for (const layout of CardLayout.options) {
      const card = generateCard(layout, seeded(3));
      const mask = drawnMask(card, new Set(drawPool(layout)));
      expect(completedLines(layout, mask)).toBe(LAYOUTS[layout].lines.length);
    }
  });
});

describe("drawPool", () => {
  it("5×5 は 1〜75、3×3 は 1〜45", () => {
    expect(drawPool("5x5")).toEqual([...Array(75).keys()].map((i) => i + 1));
    expect(drawPool("3x3")).toEqual([...Array(45).keys()].map((i) => i + 1));
  });
});
