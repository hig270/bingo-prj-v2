import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CELL_COUNT, CellIndex, CellMask, EMPTY_MASK, openCell } from "./cells";
import { LINES_5X5, countCompletedLines } from "./lines";

function open(...cells: number[]): CellMask {
  return cells.reduce<CellMask>(
    (mask, cell) => openCell(mask, CellIndex.parse(cell)),
    EMPTY_MASK,
  );
}

// fast-check 用: ランダムなマスの集合とマスの位置
const arbitraryMask = fc
  .integer({ min: 0, max: 2 ** CELL_COUNT - 1 })
  .map((n) => CellMask.parse(n));
const arbitraryCell = fc
  .integer({ min: 0, max: CELL_COUNT - 1 })
  .map((n) => CellIndex.parse(n));

describe("LINES_5X5", () => {
  it("ラインは12本で、どれも5マス", () => {
    expect(LINES_5X5).toHaveLength(12);
    for (const line of LINES_5X5) {
      expect(line.toString(2).replaceAll("0", "")).toHaveLength(5);
    }
  });
});

describe("countCompletedLines", () => {
  it("何も開いていなければ0本", () => {
    expect(countCompletedLines(EMPTY_MASK)).toBe(0);
  });

  it("横一列がそろえば1本", () => {
    expect(countCompletedLines(open(0, 1, 2, 3, 4))).toBe(1);
  });

  it("4マスだけでは0本", () => {
    expect(countCompletedLines(open(0, 1, 2, 3))).toBe(0);
  });

  it("縦と横の交点で2本同時にそろう（ダブルビンゴ）", () => {
    const mask = open(0, 1, 2, 3, 4, 5, 10, 15, 20);
    expect(countCompletedLines(mask)).toBe(2);
  });

  it("すべて開いていれば12本", () => {
    expect(countCompletedLines(CellMask.parse(2 ** CELL_COUNT - 1))).toBe(12);
  });

  // プロパティベーステスト: どんな開け方でも成り立つ性質
  it("本数は必ず0〜12本", () => {
    fc.assert(
      fc.property(arbitraryMask, (mask) => {
        const count = countCompletedLines(mask);
        return count >= 0 && count <= 12;
      }),
    );
  });

  it("マスを1つ開けても、本数は減らない", () => {
    fc.assert(
      fc.property(arbitraryMask, arbitraryCell, (mask, cell) => {
        return (
          countCompletedLines(openCell(mask, cell)) >= countCompletedLines(mask)
        );
      }),
    );
  });
});
