import type { BingoNumber } from "@bingo/game";

/** ビンゴの列の文字。1〜15 が B、16〜30 が I … 61〜75 が O */
export type BingoLetter = "B" | "I" | "N" | "G" | "O";

export function letterOf(n: BingoNumber): BingoLetter {
  if (n <= 15) return "B";
  if (n <= 30) return "I";
  if (n <= 45) return "N";
  if (n <= 60) return "G";
  return "O";
}
