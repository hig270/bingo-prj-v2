import { z } from "zod";

/**
 * 一番大きいカード（5×5）のマス数。
 * マスの位置と開けたマスの集合は、どの大きさのカードでもこの範囲に収まる
 */
export const MAX_CELL_COUNT = 25;

/**
 * マスの位置。行 × 一辺のマス数 ＋ 列 で数える。
 * 例: 5×5 では左上が 0、右上が 4、中央（FREE）が 12、右下が 24。3×3 では 0〜8。
 * カードの大きさに合った範囲かどうかは layout.ts の isCellOf で確かめる
 */
export const CellIndex = z
  .number()
  .int()
  .min(0)
  .max(MAX_CELL_COUNT - 1)
  .brand<"CellIndex">();
export type CellIndex = z.infer<typeof CellIndex>;

/**
 * 開けたマスの集合を整数で表したもの（最大25ビット）。
 * マス i が開いていれば、下から i 番目のビットが 1 になる。
 */
export const CellMask = z
  .number()
  .int()
  .min(0)
  .max(2 ** MAX_CELL_COUNT - 1)
  .brand<"CellMask">();
export type CellMask = z.infer<typeof CellMask>;

/** 何も開いていない状態 */
export const EMPTY_MASK = CellMask.parse(0);

/** マスを1つ開けた集合を返す（すでに開いていれば同じ集合を返す） */
export function openCell(mask: CellMask, cell: CellIndex): CellMask {
  return CellMask.parse((mask | (1 << cell)) >>> 0);
}

/** マスが開いているか */
export function isOpen(mask: CellMask, cell: CellIndex): boolean {
  return (mask & (1 << cell)) !== 0;
}

/** 開いているマスの数 */
export function countOpen(mask: CellMask): number {
  return countBits(mask);
}

/**
 * 1 のビットの数（マスの集合の途中の計算で、CellMask の形を確かめずに数えるときに使う。
 * 期待抽選回数の計算では 4096 通りの集合を数えるので、1つずつ確かめると遅くなる）
 */
export function countBits(bits: number): number {
  let rest = bits;
  let count = 0;
  while (rest !== 0) {
    rest &= rest - 1; // 一番下の 1 のビットを消す
    count += 1;
  }
  return count;
}

/** マスの位置の一覧から、そのマスだけが開いた集合を作る */
export function maskOf(cells: Iterable<number>): CellMask {
  let mask = EMPTY_MASK;
  for (const cell of cells) mask = openCell(mask, CellIndex.parse(cell));
  return mask;
}
