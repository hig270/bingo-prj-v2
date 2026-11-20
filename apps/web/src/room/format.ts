import type { PlayerStanding } from "@bingo/protocol";

// 順位・期待抽選回数・確率の、画面に出す形（decisions.md 手順4）

/** 期待抽選回数（小数第1位まで） */
export function formatExpected(draws: number): string {
  return draws.toFixed(1);
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
 * 0 より大きく 1% 未満なら「1%未満」、99% を超えて 100% 未満なら「99%超」（decisions.md 手順4）
 */
export function formatChance(chance: number): string {
  if (chance <= 0) return "0%";
  if (chance >= 1) return "100%";
  if (chance < 0.01) return "1%未満";
  if (chance > 0.99) return "99%超";
  return `${String(Math.round(chance * 100))}%`;
}

/** ホスト画面のランキング表の確率（小数第1位までの %） */
export function formatChanceDetailed(chance: number): string {
  return `${(chance * 100).toFixed(1)}%`;
}
