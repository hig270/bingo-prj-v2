import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { initialMask } from "./card";
import { type CellMask, countOpen, maskOf } from "./cells";
import { chanceOfHit, chanceWithin } from "./chance";
import { LAYOUTS } from "./layout";

function bitsOf(bits: number): number[] {
  return [...Array(25).keys()].filter((i) => (bits & (1 << i)) !== 0);
}

/**
 * 全部の抽選の順番を数え上げて求めた、draws 回のうちにラインが合計 targetLines 本以上そろう確率
 * （9マスのカード用。式を使わずに確かめるため）。
 * 開けていないマスの番号と、カードに無い番号（extra 個）を合わせた N 個から t 回で出る組み合わせをすべて調べる。
 * どの組み合わせも同じ確率で出るので、そろう組み合わせの割合が確率になる
 */
function bruteForce(
  opened: CellMask,
  targetLines: number,
  extra: number,
  draws: number,
): number {
  const lines = LAYOUTS["3x3"].lines;
  const closed = [...Array(9).keys()].filter((c) => (opened & (1 << c)) === 0);
  const n = closed.length + extra;
  const t = Math.min(draws, n);
  let reached = 0;
  let total = 0;
  for (let drawn = 0; drawn < 1 << n; drawn++) {
    if (bitsOf(drawn).length !== t) continue;
    let mask: number = opened;
    closed.forEach((cell, i) => {
      if ((drawn & (1 << i)) !== 0) mask |= 1 << cell;
    });
    total += 1;
    if (lines.filter((line) => (mask & line) === line).length >= targetLines) {
      reached += 1;
    }
  }
  return reached / total;
}

describe("chanceWithin", () => {
  it("全部の抽選の順番を数え上げた値と一致する（9マス）", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 9 - 1 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 1, max: 5 }),
        (bits, targetLines, extra, draws) => {
          const opened = maskOf(bitsOf(bits));
          const remaining = 9 - countOpen(opened) + extra;
          const value = chanceWithin(
            "3x3",
            targetLines,
            opened,
            remaining,
            draws,
          );
          const done = LAYOUTS["3x3"].lines.filter(
            (line) => (opened & line) === line,
          ).length;
          if (done >= targetLines) {
            expect(value).toBeNull();
          } else {
            expect(value).toBeCloseTo(
              bruteForce(opened, targetLines, extra, draws),
              12,
            );
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("0 と 1 は、本当にそのときだけ出る", () => {
    // 1 行目の左 2 マスが開いていて、残りの番号は開けていない 7 マスの分だけ。7 回で必ず全部出る
    const twoOpen = maskOf([0, 1]);
    expect(chanceWithin("3x3", 1, twoOpen, 7, 7)).toBe(1);
    // 4 回では、右上・中央・左下の 3 マスが残るとどのラインもそろわない
    expect(chanceWithin("3x3", 1, twoOpen, 7, 4)).toBeLessThan(1);
    // 何も開いていない 9マスは、2 回ではどのラインもそろわない
    expect(chanceWithin("3x3", 1, initialMask("3x3"), 45, 2)).toBe(0);
    // 3 回ならそろうことがある（とても小さいが 0 ではない）
    const three = chanceWithin("3x3", 1, initialMask("3x3"), 45, 3);
    expect(three).toBeGreaterThan(0);
    expect(three).toBeLessThan(0.01);
  });

  it("残りの番号が draws 個より少なければ、残りの全部の抽選で計算する", () => {
    const opened = maskOf([0, 1, 3]);
    // 残り 3 個で「5 回以内」は「残り 3 回で」と同じ
    expect(chanceWithin("3x3", 1, opened, 3, 5)).toBe(
      chanceWithin("3x3", 1, opened, 3, 3),
    );
    // 残りがなければ 0
    expect(chanceWithin("3x3", 1, opened, 0, 5)).toBe(0);
  });

  it("見落としが多く、開けていないマスが残りの番号の数より多くても、0〜1 に収まる", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 25 - 1 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 1, max: 5 }),
        (bits, targetLines, remaining, draws) => {
          const opened = maskOf(bitsOf(bits));
          const value = chanceWithin(
            "5x5",
            targetLines,
            opened,
            remaining,
            draws,
          );
          if (value === null) return;
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("すでにそろっているか、ラインが全部そろっていて届かなければ null", () => {
    expect(chanceWithin("3x3", 1, maskOf([0, 1, 2]), 40, 1)).toBeNull();
    expect(chanceWithin("3x3", 2, maskOf([0, 1, 2]), 40, 1)).not.toBeNull();
    const all = maskOf([...Array(25).keys()]);
    expect(
      chanceWithin("5x5", LAYOUTS["5x5"].lines.length + 1, all, 50, 5),
    ).toBeNull();
  });

  it("分母を正確に表せないほど多い抽選回数は求めない", () => {
    // 75×74×…（10 個）は約 1.3×10^18 で、2^53 を超える
    expect(() => chanceWithin("5x5", 1, initialMask("5x5"), 75, 10)).toThrow();
    expect(chanceWithin("5x5", 1, initialMask("5x5"), 75, 5)).not.toBeNull();
  });
});

describe("chanceOfHit", () => {
  it("開けていないマスの数 ÷ 残りの番号の数", () => {
    // 5×5 の開始直後: 24 マス ÷ 75 個
    expect(chanceOfHit("5x5", initialMask("5x5"), 75)).toBeCloseTo(24 / 75, 12);
  });

  it("見落としで開けていないマスが残りの番号より多ければ 1、残りがなければ 0", () => {
    expect(chanceOfHit("3x3", maskOf([0]), 5)).toBe(1);
    expect(chanceOfHit("3x3", maskOf([0]), 0)).toBe(0);
  });
});
