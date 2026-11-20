import type { PlayerStanding } from "@bingo/protocol";

// 順位・期待抽選回数・確率の、画面に出す形（decisions.md 手順4）

/**
 * 丸める前に足す、ごく小さな幅（四捨五入で、ちょうど半分の値を確実に切り上げるため。2026-11-20 に決定）。
 *
 * 画面に出す数値はどれも分数で、丸める桁に直した値がちょうど半分でなければ、半分から 1/(2 × 分母) 以上離れている。
 * 分母は、確率（整数の %）が最大 75×74×73×72×71（約 2.1×10^9）、ホストの表の確率が残りの番号の数（75 以下）、
 * 期待抽選回数が expected.ts の SCALE（約 2.7×10^10）なので、離れ方は 1.8×10^-11 以上ある。
 * 一方、小数で計算した誤差は、丸める桁に直した値の大きさ（ホストの表で最大 1000、期待抽選回数で最大約 760）に、
 * 数回の丸めの相対誤差（1回あたり約 1.1×10^-16）を掛けた程度で、4×10^-13 より小さい。その間のこの幅を足せば、ちょうど半分の値（誤差で少し下に
 * ずれていることがある）だけが切り上がり、ほかの値の丸めは変わらない
 */
const HALF_UP_MARGIN = 1e-12;

/** 四捨五入（ちょうど半分は切り上げ）で、小数第 digits 位までにする */
function roundHalfUp(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale + HALF_UP_MARGIN) / scale;
}

/** 期待抽選回数（小数第1位まで。四捨五入） */
export function formatExpected(draws: number): string {
  return roundHalfUp(draws, 1).toFixed(1);
}

/** 本人の順位（D）。順位を争っていれば「#12 / 290人」、放置していれば「—」、景品を取ったら確定した順位 */
export function formatStanding(standing: PlayerStanding): string {
  switch (standing.status) {
    case "contending":
      return `#${String(standing.rank)} / ${String(standing.of)}人`;
    case "idle":
      return "—";
    case "won":
      return `${String(standing.rank)}位（確定）`;
  }
}

/**
 * プレイヤーの画面の確率（B・C・F・G・H）。整数の % で出し、0% と 100% は本当にそのときだけ出す。
 * 0 より大きく 1% 未満なら「1%未満」、99% を超えて 100% 未満なら「99%超」（decisions.md 手順4）。
 * それ以外は四捨五入
 */
export function formatChance(chance: number): string {
  if (chance <= 0) return "0%";
  if (chance >= 1) return "100%";
  if (chance < 0.01) return "1%未満";
  if (chance > 0.99) return "99%超";
  return `${String(roundHalfUp(chance * 100, 0))}%`;
}

/** ホスト画面のランキング表の確率（小数第1位までの %。四捨五入） */
export function formatChanceDetailed(chance: number): string {
  return `${roundHalfUp(chance * 100, 1).toFixed(1)}%`;
}
