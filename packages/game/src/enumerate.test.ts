import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { initialMask } from "./card";
import { type CellMask, countOpen, maskOf } from "./cells";
import { chanceOfHit, chanceWithin } from "./chance";
import { expectedDraws, expectedKey } from "./expected";
import { type CardLayout, LAYOUTS } from "./layout";

// 確率（chance.ts）と期待抽選回数（expected.ts）を、式を使わずに出方を全部数えた値と照らす。
//
// 残りの番号 N 個のうち、開けていないマス c 個以外の N - c 個（カードに無い番号）は、どれが出てもラインに関係しない。
// そこで「開けていないマスのうち、どの j 個が出たか」を全部調べてラインの本数を数え、カードに無い番号の出方
// C(N - c, t - j) を掛ける。t 回の抽選で出る番号の組み合わせ C(N, t) 通りは、どれも同じ確率で出るので、
//
//   P(t 回以内に target 本以上そろう) = Σ_j Σ_{L ≥ target} hist[j][L] × C(N - c, t - j) / C(N, t)
//
// になる（hist[j][L] は、開けていないマスから j 個を選んだとき、完成したラインが L 本になる選び方の数）。
// 期待抽選回数は Σ_{t = 0}^{N - 1} P(t 回ではまだそろっていない)。
// 確率（t は 5 回まで）は、数がどれも 2^53 より小さい整数なので、number のまま正確に数えられる（9マスの期待抽選回数も同じ）。
// 5×5 の期待抽選回数は t が大きくなり、C(62, 31)（約 4.7×10^17）のような二項係数で丸めが入るので、9 桁で比べる。

/** 二項係数（k < 0 や k > n なら 0） */
function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let i = 0; i < k; i++) value = (value * (n - i)) / (i + 1);
  return value;
}

interface Counted {
  readonly layout: CardLayout;
  /** 開けていないマスの数 */
  readonly closed: number;
  /** すでに完成しているラインの本数 */
  readonly done: number;
  /** hist[j][L]（j は maxSize まで） */
  readonly hist: readonly (readonly number[])[];
}

/** 開けていないマスから maxSize 個までを選ぶ選び方を全部調べて、hist を作る */
function count(layout: CardLayout, opened: CellMask, maxSize: number): Counted {
  const { lines, cellCount } = LAYOUTS[layout];
  const closedCells = [...Array(cellCount).keys()].filter(
    (c) => (opened & (1 << c)) === 0,
  );
  const hist = Array.from({ length: maxSize + 1 }, () =>
    new Array<number>(lines.length + 1).fill(0),
  );
  const linesOf = (mask: number) =>
    lines.filter((line) => (mask & line) === line).length;
  const visit = (start: number, mask: number, size: number) => {
    const row = hist[size];
    if (row === undefined) return;
    const done = linesOf(mask);
    row[done] = (row[done] ?? 0) + 1;
    if (size === maxSize) return;
    for (let i = start; i < closedCells.length; i++) {
      visit(i + 1, mask | (1 << (closedCells[i] ?? 0)), size + 1);
    }
  };
  visit(0, opened, 0);
  return {
    layout,
    closed: closedCells.length,
    done: linesOf(opened),
    hist,
  };
}

/** 数えて求めた、t 回以内に target 本以上そろう確率の分子と分母（t は残りの番号の数で頭打ち） */
function countedChance(
  c: Counted,
  remaining: number,
  target: number,
  draws: number,
): { readonly num: number; readonly den: number } {
  const t = Math.min(draws, remaining);
  const extra = remaining - c.closed;
  let num = 0;
  for (let j = 0; j <= Math.min(t, c.closed); j++) {
    const row = c.hist[j];
    if (row === undefined) throw new Error("hist が足りない");
    let ways = 0;
    row.forEach((n, lines) => {
      if (lines >= target) ways += n;
    });
    num += ways * binom(extra, t - j);
  }
  return { num, den: binom(remaining, t) };
}

/** 数えて求めた期待抽選回数（hist は開けていないマス全部まで数えたもの） */
function countedExpected(c: Counted, remaining: number, target: number) {
  let sum = 0;
  for (let t = 0; t < remaining; t++) {
    const { num, den } = countedChance(c, remaining, target, t);
    sum += 1 - num / den;
  }
  return sum;
}

/** 目標の本数に届かない（もうそろっているか、ラインが足りない）ので、計算の関数が null を返すべきか */
function unreachable(c: Counted, target: number): boolean {
  return c.done >= target || target > LAYOUTS[c.layout].lines.length;
}

/** 目標の本数として試す値（1 本 〜 ライン全部 + 1 本） */
function targets(layout: CardLayout): number[] {
  return [...Array(LAYOUTS[layout].lines.length + 1).keys()].map((i) => i + 1);
}

/** 確率を、数えた値（分子 ÷ 分母を1回だけ割った値）と完全に一致するか照らす */
function checkChance(
  c: Counted,
  opened: CellMask,
  remainings: readonly number[],
  draws: readonly number[],
) {
  for (const target of targets(c.layout)) {
    for (const remaining of remainings) {
      for (const t of draws) {
        const value = chanceWithin(c.layout, target, opened, remaining, t);
        if (unreachable(c, target)) {
          expect(value).toBeNull();
          continue;
        }
        const { num, den } = countedChance(c, remaining, target, t);
        // 同じ分数を1回だけ割った値なので、小数の誤差まで含めて同じ値になる
        expect(value).toBe(num / den);
      }
    }
  }
}

/** 期待抽選回数を、数えた値と照らす（数えた側は小数を足し重ねるので、9 桁で比べる） */
function checkExpected(
  c: Counted,
  opened: CellMask,
  remainings: readonly number[],
) {
  for (const target of targets(c.layout)) {
    const key = expectedKey(c.layout, target, opened);
    if (unreachable(c, target)) {
      expect(key).toBeNull();
      continue;
    }
    if (key === null) throw new Error("届くのに null になった");
    for (const remaining of remainings) {
      expect(expectedDraws(key, remaining)).toBeCloseTo(
        countedExpected(c, remaining, target),
        9,
      );
    }
  }
}

function range(from: number, to: number): number[] {
  return to < from ? [] : [...Array(to - from + 1).keys()].map((i) => from + i);
}

describe("9マス: 開けたマスの形 512 通りを全部調べる", () => {
  const all = range(0, 2 ** 9 - 1).map((bits) =>
    maskOf(range(0, 8).filter((i) => (bits & (1 << i)) !== 0)),
  );

  it("確率（B・C・G・H）は、どの形・目標の本数・残りの番号の数・抽選回数（1〜5回）でも、数えた値と一致する", () => {
    for (const opened of all) {
      const c = count("3x3", opened, 9);
      // 残りの番号は、開けていないマスの数から、45 個から開けたマスの分を除いた数まで全部
      const remainings = range(c.closed, 45 - (9 - c.closed));
      checkChance(c, opened, remainings, [1, 2, 3, 4, 5]);
    }
  }, 120_000);

  it("期待抽選回数（A・I）は、どの形・目標の本数・残りの番号の数でも、数えた値と一致する", () => {
    for (const opened of all) {
      const c = count("3x3", opened, 9);
      checkExpected(c, opened, range(c.closed, 45 - (9 - c.closed)));
    }
  }, 120_000);

  it("見落としで開けていないマスが残りの番号より多くても、確率は 0〜1 に収まる", () => {
    for (const opened of all) {
      const closed = 9 - countOpen(opened);
      for (const target of targets("3x3")) {
        for (const remaining of range(0, closed - 1)) {
          for (const t of [1, 2, 3, 4, 5]) {
            const value = chanceWithin("3x3", target, opened, remaining, t);
            if (value === null) continue;
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  }, 120_000);

  it("次の番号が当たる確率（F）は、どの形・残りの番号の数でも「開けていないマス ÷ 残り」（1 で頭打ち、残り 0 なら 0）", () => {
    for (const opened of all) {
      const closed = 9 - countOpen(opened);
      for (const remaining of range(0, 45)) {
        const expected = remaining === 0 ? 0 : Math.min(1, closed / remaining);
        expect(chanceOfHit("3x3", opened, remaining)).toBe(expected);
      }
    }
  });
});

describe("5×5: 序盤・終盤・端の形で数えた値と照らす", () => {
  /** 5×5 の残りの番号として試す値（開けていないマスの数から 75 個 − 開けたマスまでの、端と途中） */
  const remainingsOf = (opened: CellMask) => {
    const closed = 25 - countOpen(opened);
    const max = 75 - (25 - closed);
    return [
      ...new Set([
        closed,
        closed + 1,
        closed + 4,
        Math.floor((closed + max) / 2),
        max,
      ]),
    ].filter((n) => n <= max);
  };

  /** マスの位置の一覧から、FREE を開けた形を作る */
  const withFree = (cells: readonly number[]) => maskOf([12, ...cells]);

  it("確率は、端の形で数えた値と一致する", () => {
    const edge = [
      initialMask("5x5"),
      maskOf([...Array(25).keys()]),
      // 1 マスだけ残っている（そのマスで何本もそろう、中央・角）
      maskOf([...Array(25).keys()].filter((c) => c !== 12)),
      maskOf([...Array(25).keys()].filter((c) => c !== 0)),
      // 1 行目だけそろっている、斜め 2 本がリーチ
      withFree([0, 1, 2, 3, 4]),
      withFree([0, 6, 18, 4, 8, 16]),
      // FREE も含めて何も開いていない（ありえない形だが、計算としては成り立つ）
      maskOf([]),
    ];
    for (const opened of edge) {
      checkChance(
        count("5x5", opened, 5),
        opened,
        remainingsOf(opened),
        [1, 2, 3, 4, 5],
      );
    }
  });

  it("序盤（開けたマスが少ない形）の確率は、数えた値と一致する", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 24 }), { maxLength: 7 }),
        (cells) => {
          const opened = withFree(cells);
          checkChance(
            count("5x5", opened, 5),
            opened,
            remainingsOf(opened),
            [1, 2, 3, 4, 5],
          );
        },
      ),
      { numRuns: 100 },
    );
  }, 120_000);

  it("中盤から終盤（開けていないマスが 13 個以下で、どのマスも開けていない可能性がある形）の確率と期待抽選回数は、数えた値と一致する", () => {
    fc.assert(
      // 開けていないマスを、25 マスから無作為に 13 個まで選ぶ（期待抽選回数は全部の出方を数えるため、13 個までにする）
      fc.property(
        fc.shuffledSubarray(range(0, 24), { maxLength: 13 }),
        (closedCells) => {
          const opened = maskOf(
            range(0, 24).filter((i) => !closedCells.includes(i)),
          );
          const c = count("5x5", opened, 25 - countOpen(opened));
          checkChance(c, opened, remainingsOf(opened), [1, 2, 3, 4, 5]);
          checkExpected(c, opened, remainingsOf(opened));
        },
      ),
      { numRuns: 100 },
    );
  }, 120_000);
});
