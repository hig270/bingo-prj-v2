import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CellIndex,
  CellMask,
  EMPTY_MASK,
  countOpen,
  maskOf,
  openCell,
} from "./cells";
import { CardLayout, LAYOUTS } from "./layout";
import { countCompletedLines } from "./lines";

const L5 = LAYOUTS["5x5"].lines;
const L3 = LAYOUTS["3x3"].lines;

/** その大きさのカードの中の、ランダムなマスの集合とマスの位置 */
function arbitraryMask(layout: CardLayout) {
  return fc
    .integer({ min: 0, max: 2 ** LAYOUTS[layout].cellCount - 1 })
    .map((n) => CellMask.parse(n));
}
function arbitraryCell(layout: CardLayout) {
  return fc
    .integer({ min: 0, max: LAYOUTS[layout].cellCount - 1 })
    .map((n) => CellIndex.parse(n));
}

/** マスの集合を 90 度回す（行 r・列 c のマスを、行 c・列 size-1-r へ移す） */
function rotate(mask: CellMask, size: number): CellMask {
  const cells: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if ((mask & (1 << (r * size + c))) !== 0) {
        cells.push(c * size + (size - 1 - r));
      }
    }
  }
  return maskOf(cells);
}

describe("LAYOUTS のライン", () => {
  it("5×5 は 12 本で、どれも 5 マス", () => {
    expect(L5).toHaveLength(12);
    for (const line of L5) expect(countOpen(line)).toBe(5);
  });

  it("3×3 は 8 本で、どれも 3 マス", () => {
    expect(L3).toHaveLength(8);
    for (const line of L3) expect(countOpen(line)).toBe(3);
  });

  it("どのラインも重複しない", () => {
    expect(new Set(L5).size).toBe(L5.length);
    expect(new Set(L3).size).toBe(L3.length);
  });

  it("ラインの集まりは、盤面を 90 度回しても同じ", () => {
    for (const layout of CardLayout.options) {
      const { lines, size } = LAYOUTS[layout];
      expect(new Set(lines.map((l) => rotate(l, size)))).toEqual(
        new Set(lines),
      );
    }
  });
});

describe("countCompletedLines", () => {
  it("何も開いていなければ0本", () => {
    expect(countCompletedLines(EMPTY_MASK, L5)).toBe(0);
  });

  it("5×5 で横一列がそろえば1本", () => {
    expect(countCompletedLines(maskOf([0, 1, 2, 3, 4]), L5)).toBe(1);
  });

  it("5×5 で4マスだけでは0本", () => {
    expect(countCompletedLines(maskOf([0, 1, 2, 3]), L5)).toBe(0);
  });

  it("5×5 で縦と横の交点で2本同時にそろう（ダブルビンゴ）", () => {
    const mask = maskOf([0, 1, 2, 3, 4, 5, 10, 15, 20]);
    expect(countCompletedLines(mask, L5)).toBe(2);
  });

  it("3×3 で斜めがそろえば1本", () => {
    expect(countCompletedLines(maskOf([0, 4, 8]), L3)).toBe(1);
  });

  it("すべて開いていれば全部のライン", () => {
    expect(countCompletedLines(maskOf([...Array(25).keys()]), L5)).toBe(12);
    expect(countCompletedLines(maskOf([...Array(9).keys()]), L3)).toBe(8);
  });

  // プロパティベーステスト: どんな開け方でも成り立つ性質
  for (const layout of CardLayout.options) {
    const { lines } = LAYOUTS[layout];

    it(`${layout}: 本数は必ず 0 〜 ラインの数`, () => {
      fc.assert(
        fc.property(arbitraryMask(layout), (mask) => {
          const count = countCompletedLines(mask, lines);
          return count >= 0 && count <= lines.length;
        }),
      );
    });

    it(`${layout}: マスを1つ開けても、本数は減らない`, () => {
      fc.assert(
        fc.property(
          arbitraryMask(layout),
          arbitraryCell(layout),
          (mask, cell) =>
            countCompletedLines(openCell(mask, cell), lines) >=
            countCompletedLines(mask, lines),
        ),
      );
    });
  }
});
