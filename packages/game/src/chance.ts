import { type CellMask, countOpen } from "./cells";
import { lineWeights } from "./expected";
import { type CardLayout, LAYOUTS } from "./layout";

// プレイヤーの画面の確率（B・C・F・G・H。decisions.md「プレイヤー画面の確率・状況表示」と手順4-2）。
//
// 期待抽選回数（expected.ts）と同じく、開けていないマスの番号はどれも残りの番号の中にあるものとして数える。
// 残りの番号が N 個のとき、特定の k 個のマスが t 回の抽選で全部出る確率は
//
//   P_k(t) = C(N-k, t-k) / C(N, t) = t(t-1)…(t-k+1) / N(N-1)…(N-k+1)
//
// で、k > t なら 0 になる。ラインが合計 targetLines 本以上そろう確率は、期待抽選回数と同じ係数 W[k] を使って
//
//   Σ_k W[k] × P_k(t)
//
// になる。分母を N(N-1)…(N-t+1) にそろえると分子も整数になるので、整数のまま足してから最後に1回だけ割る。
// こうすると、0 と 1 は本当にそのときだけ出る（decisions.md 手順4「0%と100%は本当にそのときだけ出し」）。
//
// 見落としが多く、開けていないマスの数が残りの番号の数を上回ると、上の前提は成り立たず、計算した値が 0〜1 を
// はみ出すことがある。そのときは 0 か 1 で頭打ちにする（decisions.md「プレイヤー画面の確率・状況表示」）。

/** n(n-1)…(n-k+1)（k 個の掛け算。k = 0 なら 1） */
function falling(n: number, k: number): bigint {
  let value = 1n;
  for (let i = 0; i < k; i++) value *= BigInt(n - i);
  return value;
}

/** 0 〜 1 に収める */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * これから draws 回の抽選のうちに、ラインが合計 targetLines 本以上そろう確率（0 〜 1）。
 * すでに targetLines 本そろっているか、ラインが足りず届かなければ null。
 * 分母 N(N-1)…(N-t+1) が number で正確に表せる範囲（2^53 未満）を超える抽選回数は求めない（例外にする）。
 * 画面で使う 1 回と 5 回は、最大でも 75×74×73×72×71（約 2.1×10^9）で十分小さい。
 * remaining は残りの番号の数（公開済みの番号だけを除いた数）。残りの番号が draws 個より少なければ、
 * 残りの全部の抽選で計算する（decisions.md 手順4「残りの番号が5個より少ないときの C・H」）。
 * targetLines は、次のビンゴ（B・C）なら今そろっている本数 + 1、景品獲得ライン（G・H）なら景品獲得ラインの本数
 */
export function chanceWithin(
  layout: CardLayout,
  targetLines: number,
  opened: CellMask,
  remaining: number,
  draws: number,
): number | null {
  const weights = lineWeights(layout, targetLines, opened);
  if (weights === null) return null;
  const t = Math.min(draws, remaining);
  let numerator = 0n;
  weights.forEach((w, k) => {
    // k > t の組み合わせは t 回では全部出ない
    if (w === 0 || k > t) return;
    numerator += BigInt(w) * falling(t, k) * falling(remaining - k, t - k);
  });
  const denominator = falling(remaining, t);
  // 超えると number に直したときに値が変わり、0 と 1 の扱いが崩れうる
  if (denominator > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("抽選回数が多すぎて、確率を正確に計算できません");
  }
  if (numerator <= 0n) return 0;
  if (numerator >= denominator) return 1;
  // 分母は 2^53 より小さく（上で確かめた）、分子は分母より小さいので、number に直しても値は変わらない。
  // 分子が分母より小さければ、割った値も 1 にはならない（差が 1/分母 以上あるため）
  return clamp01(Number(numerator) / Number(denominator));
}

/**
 * 次の抽選番号が自分のカードのどこかに当たる確率（F）。開けていないマスの数 ÷ 残りの番号の数（1 で頭打ち）。
 * 残りの番号がなければ 0
 */
export function chanceOfHit(
  layout: CardLayout,
  opened: CellMask,
  remaining: number,
): number {
  if (remaining <= 0) return 0;
  const closed = LAYOUTS[layout].cellCount - countOpen(opened);
  return clamp01(closed / remaining);
}
