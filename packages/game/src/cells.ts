import { z } from "zod";

/** カードの一辺のマス数 */
export const CARD_SIZE = 5;
/** カードのマス数 */
export const CELL_COUNT = CARD_SIZE * CARD_SIZE;

/**
 * マスの位置（0〜24）。行 × 5 ＋ 列 で数える。
 * 例: 左上は 0、右上は 4、中央（FREE）は 12、右下は 24
 */
export const CellIndex = z
  .number()
  .int()
  .min(0)
  .max(CELL_COUNT - 1)
  .brand<"CellIndex">();
export type CellIndex = z.infer<typeof CellIndex>;

/**
 * 開けたマスの集合を25ビットの整数で表したもの。
 * マス i が開いていれば、下から i 番目のビットが 1 になる。
 */
export const CellMask = z
  .number()
  .int()
  .min(0)
  .max(2 ** CELL_COUNT - 1)
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
  let rest: number = mask;
  let count = 0;
  while (rest !== 0) {
    rest &= rest - 1; // 一番下の 1 のビットを消す
    count += 1;
  }
  return count;
}
