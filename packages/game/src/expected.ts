import { z } from "zod";
import { type CellMask, MAX_CELL_COUNT, countBits } from "./cells";
import { type CardLayout, LAYOUTS } from "./layout";

// 景品獲得ラインに達するまでの期待抽選回数（A。decisions.md「ランキングの指標」）と、
// 次のビンゴ（新しいライン1本）までの期待抽選回数（I。decisions.md 手順4-2）。
//
// 開けていないマスの番号は、どれも残りの番号の中にあるものとして数える（見落としたマスも「まだ抽選されていない」
// として扱う）。残りの番号が N 個のとき、特定の k 個のマスが全部そろうまでの抽選回数の平均は k(N+1)/(k+1) になる
// （N 個を並べた順番のうち、k 個の一番後ろの位置の平均）。ラインの組み合わせに包除原理を当てると、
//
//   A = (N+1) × Σ_k W[k] × k/(k+1)
//
// の形になる。W[k] は、まだ完成していないラインの組み合わせのうち、開けていないマスを合わせて k 個になるものの
// 係数の合計（整数）で、開けたマスの形だけで決まる。そのため順位は残りの番号の数に左右されず、タップした人の分だけ
// 計算し直せばよい。Σ の部分は、分母（k+1）の最小公倍数を掛けると整数になるので、整数のまま比べれば小数の誤差なく
// 同じ値かどうかが分かる（decisions.md 手順4「期待抽選回数（A）は小数第1位まで見せ、順位は計算した値そのもので付ける」）。
//
// 見落としが多く、開けていないマスの数が残りの番号の数を上回ると、上の前提は成り立たないが、同じ式で計算する
// （開けていないマスが多いほど大きくなる形で続く。decisions.md 手順4）。

/** 1〜n の最小公倍数 */
function lcmUpTo(n: number): bigint {
  const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
  let l = 1n;
  for (let i = 2n; i <= BigInt(n); i++) l = (l / gcd(l, i)) * i;
  return l;
}

/** 分母 k+1（k は 0 〜 マスの数）の最小公倍数。比べるための整数は、期待抽選回数 ÷ (N+1) にこれを掛けた値 */
const SCALE = lcmUpTo(MAX_CELL_COUNT + 1);

/**
 * 期待抽選回数を比べるための整数（期待抽選回数 ÷（残りの番号の数＋1）× SCALE）。
 * 小さいほど景品獲得ラインに近い。同じ値なら同順位
 */
export const ExpectedKey = z.bigint().nonnegative().brand<"ExpectedKey">();
export type ExpectedKey = z.infer<typeof ExpectedKey>;

/** 二項係数（ラインの数は 12 本までなので、小さい値だけ） */
function binomial(n: number, k: number): number {
  let value = 1;
  for (let i = 0; i < k; i++) value = (value * (n - i)) / (i + 1);
  return value;
}

/**
 * まだ完成していないラインの組み合わせの係数を、開けていないマスの数ごとに合計したもの（W[k]）。
 * 「ラインが合計 targetLines 本以上そろう」という出来事を、「組み合わせのマスが全部出る」という出来事の和と差
 * （包除原理）で表したときの係数で、開けたマスの形だけで決まる。すでに targetLines 本そろっているか、
 * まだ完成していないラインを全部そろえても targetLines 本に届かなければ null
 * （次のビンゴ（今そろっている本数 + 1 本）を求めるときに、ラインが全部そろっている場合）。
 * 期待抽選回数（A・I）と確率（B・C・G・H）の計算で使う（chance.ts）
 */
export function lineWeights(
  layout: CardLayout,
  targetLines: number,
  opened: CellMask,
): readonly number[] | null {
  const lines = LAYOUTS[layout].lines;
  // まだ完成していないラインの、開けていないマス
  const missing = lines.map((line) => line & ~opened).filter((m) => m !== 0);
  const need = targetLines - (lines.length - missing.length);
  if (need <= 0 || need > missing.length) return null;

  // 「need 本以上そろう」の包除原理: 組み合わせ S（|S| = j ≥ need 本）に係数 (-1)^(j-need) × C(j-1, need-1) を掛ける。
  // 組み合わせを 1 から 2^r - 1 までの整数のビットで表し、一番下のビットを除いた組み合わせから順に作る
  const r = missing.length;
  const union = new Int32Array(1 << r);
  const size = new Uint8Array(1 << r);
  const weights = new Array<number>(MAX_CELL_COUNT + 1).fill(0);
  for (let s = 1; s < 1 << r; s++) {
    const low = s & -s;
    const rest = s ^ low;
    union[s] = (union[rest] ?? 0) | (missing[31 - Math.clz32(low)] ?? 0);
    const j = (size[rest] ?? 0) + 1;
    size[s] = j;
    if (j < need) continue;
    const k = countBits(union[s] ?? 0);
    const sign = (j - need) % 2 === 0 ? 1 : -1;
    weights[k] = (weights[k] ?? 0) + sign * binomial(j - 1, need - 1);
  }
  return weights;
}

/**
 * 開けたマスから、ラインが合計 targetLines 本そろうまでの期待抽選回数を比べるための整数を求める。
 * すでに targetLines 本そろっているか、ラインが足りず届かなければ null。
 * targetLines は、景品獲得ラインまで（A）なら景品獲得ラインの本数（通常のビンゴのルールの値）、
 * 次のビンゴまで（I）なら今そろっている本数 + 1
 */
export function expectedKey(
  layout: CardLayout,
  targetLines: number,
  opened: CellMask,
): ExpectedKey | null {
  const weights = lineWeights(layout, targetLines, opened);
  if (weights === null) return null;

  let key = 0n;
  weights.forEach((w, k) => {
    if (w !== 0) key += BigInt(w) * BigInt(k) * (SCALE / BigInt(k + 1));
  });
  return ExpectedKey.parse(key);
}

/**
 * 期待抽選回数（あと平均何回の抽選で、expectedKey に渡した本数のラインがそろうか）。
 * remaining は残りの番号の数（公開済みの番号だけを除いた数。公開待ちの番号はまだ残りに数える）。
 * 四則演算だけで計算するので、サーバーとスマホで同じ値になる
 */
export function expectedDraws(key: ExpectedKey, remaining: number): number {
  // key ÷ SCALE は「抽選回数 ÷ (N+1)」の平均で 1 より小さいので、key は SCALE（約 2.7×10^10）より小さい。
  // number に直しても値は変わらない
  return ((remaining + 1) * Number(key)) / Number(SCALE);
}
