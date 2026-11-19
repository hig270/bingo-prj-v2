import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { initialMask } from "./card";
import { type CellMask, countOpen, maskOf } from "./cells";
import { expectedDraws, expectedKey } from "./expected";
import { LAYOUTS } from "./layout";

/** 期待抽選回数（すでに達していれば null） */
function expected(
  layout: "5x5" | "3x3",
  prizeLines: number,
  opened: CellMask,
  remaining: number,
): number | null {
  const key = expectedKey(layout, prizeLines, opened);
  return key === null ? null : expectedDraws(key, remaining);
}

/**
 * 全部の抽選の順番を数え上げて求めた期待抽選回数（9マスのカード用。式を使わずに確かめるため）。
 * 開けていないマスの番号と、カードに無い番号（extra 個）を合わせた N 個から、t 回の抽選で出る組み合わせを
 * すべて調べ、P(t 回までに景品獲得ラインに達する) を数える。期待値は Σ_t P(t 回では達していない)
 */
function bruteForce(
  opened: CellMask,
  prizeLines: number,
  extra: number,
): number {
  const lines = LAYOUTS["3x3"].lines;
  const closed = [...Array(9).keys()].filter((c) => (opened & (1 << c)) === 0);
  const n = closed.length + extra;
  const reached = new Array<number>(n + 1).fill(0);
  const total = new Array<number>(n + 1).fill(0);
  // 抽選で出た番号の集合を n ビットで表す（下位のビットが開けていないマス、上位はカードに無い番号）
  for (let drawn = 0; drawn < 1 << n; drawn++) {
    let mask: number = opened;
    closed.forEach((cell, i) => {
      if ((drawn & (1 << i)) !== 0) mask |= 1 << cell;
    });
    const done = lines.filter((line) => (mask & line) === line).length;
    const t = countOpen(maskOf(bitsOf(drawn)));
    total[t] = (total[t] ?? 0) + 1;
    if (done >= prizeLines) reached[t] = (reached[t] ?? 0) + 1;
  }
  let sum = 0;
  for (let t = 0; t <= n; t++) sum += 1 - (reached[t] ?? 0) / (total[t] ?? 1);
  return sum;
}

function bitsOf(bits: number): number[] {
  return [...Array(25).keys()].filter((i) => (bits & (1 << i)) !== 0);
}

describe("expectedKey / expectedDraws", () => {
  it("全部の抽選の順番を数え上げた値と一致する（9マス）", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 9 - 1 }),
        fc.integer({ min: 1, max: 3 }),
        fc.integer({ min: 0, max: 4 }),
        (bits, prizeLines, extra) => {
          const opened = maskOf(bitsOf(bits));
          const closedCount = 9 - countOpen(opened);
          const value = expected(
            "3x3",
            prizeLines,
            opened,
            closedCount + extra,
          );
          const done = LAYOUTS["3x3"].lines.filter(
            (line) => (opened & line) === line,
          ).length;
          if (done >= prizeLines) {
            expect(value).toBeNull();
          } else {
            expect(value).toBeCloseTo(bruteForce(opened, prizeLines, extra), 9);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("5×5 の開始直後は、別の実装（分数で計算）で求めた値と一致する", () => {
    // 75 個の番号で1本そろうまでの平均は約 41 回（よく知られた値と同じ）
    const start = initialMask("5x5");
    expect(expected("5x5", 1, start, 75)).toBeCloseTo(41.36857386432834, 9);
    expect(expected("5x5", 2, start, 75)).toBeCloseTo(49.77068987278706, 9);
    expect(expected("5x5", 3, start, 75)).toBeCloseTo(54.78946365370918, 9);
    expect(expected("3x3", 1, initialMask("3x3"), 45)).toBeCloseTo(
      21.94126984126984,
      9,
    );
  });

  it("左右を反転した形は、整数のまま同じ値になる（同順位になる）", () => {
    // 5×5 の 1 行目の左 2 マスと、右 2 マス
    const left = maskOf([12, 0, 1]);
    const right = maskOf([12, 3, 4]);
    expect(expectedKey("5x5", 1, left)).toBe(expectedKey("5x5", 1, right));
  });

  it("同じマスの数でも、多くのラインに関わる角のマスの方が有利になる", () => {
    const corner = expectedKey("5x5", 1, maskOf([12, 0]));
    const edge = expectedKey("5x5", 1, maskOf([12, 1]));
    if (corner === null || edge === null) throw new Error("まだ達していない");
    expect(corner < edge).toBe(true);
  });

  it("順位に使う整数は、残りの番号の数に左右されない（期待抽選回数は残りの数＋1 に比例する）", () => {
    const key = expectedKey("5x5", 2, maskOf([12, 0, 6, 18]));
    if (key === null) throw new Error("まだ達していない");
    expect(expectedDraws(key, 59) / expectedDraws(key, 29)).toBeCloseTo(2, 12);
  });

  it("見落としが多く、開けていないマスが残りの番号の数より多くても、同じ式で計算する", () => {
    // 残り 2 個なのに、開けていないマスが 8 個ある
    const value = expected("3x3", 1, maskOf([4]), 2);
    expect(value).not.toBeNull();
    expect(value).toBeGreaterThan(0);
  });

  it("すでに景品獲得ラインに達していれば null", () => {
    expect(expectedKey("3x3", 1, maskOf([0, 1, 2]))).toBeNull();
    expect(expectedKey("3x3", 2, maskOf([0, 1, 2]))).not.toBeNull();
  });
});
