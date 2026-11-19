import type { PlayerStanding } from "@bingo/protocol";

// 順位と期待抽選回数の、画面に出す形（decisions.md 手順4）

/** 景品獲得ラインに達するまでの期待抽選回数（小数第1位まで） */
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
