import { drawPool, type CardLayout } from "./layout";
import type { BingoNumber } from "./number";

/** まだ抽選していない番号（小さい順） */
export function remainingNumbers(
  layout: CardLayout,
  drawn: Iterable<BingoNumber>,
): BingoNumber[] {
  const used = new Set(drawn);
  return drawPool(layout).filter((n) => !used.has(n));
}

/**
 * 次に抽選する番号を選ぶ。全部抽選し終えていれば null。
 * randomIndex(n) は 0 以上 n 未満の整数を返す乱数（テストで結果を固定できるよう外から渡す）
 */
export function pickNextNumber(
  layout: CardLayout,
  drawn: Iterable<BingoNumber>,
  randomIndex: (n: number) => number,
): BingoNumber | null {
  const rest = remainingNumbers(layout, drawn);
  if (rest.length === 0) return null;
  return rest[randomIndex(rest.length)] ?? null;
}
