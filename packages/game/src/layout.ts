import { z } from "zod";
import { CellIndex, CellMask, maskOf } from "./cells";
import { BingoNumber } from "./number";

/**
 * カードの大きさ。
 * - "5x5": 通常のカード（1〜75、中央は FREE）
 * - "3x3": 9マス（スピード）のカード（1〜45、FREE なし）
 */
export const CardLayout = z.enum(["5x5", "3x3"]);
export type CardLayout = z.infer<typeof CardLayout>;

/** 1列あたりの番号の数。列 c（0 始まり）には c×15+1 〜 c×15+15 の番号が入る（B 1〜15、I 16〜30 …） */
export const NUMBERS_PER_COLUMN = 15;

/** カードの大きさごとの形 */
export interface LayoutSpec {
  /** 一辺のマス数 */
  readonly size: number;
  /** マスの数 */
  readonly cellCount: number;
  /** FREE のマス（最初から開いている）。無ければ null */
  readonly free: CellIndex | null;
  /** ライン（縦・横・斜め）を、マスの集合で表したもの */
  readonly lines: readonly CellMask[];
  /** 抽選する番号の一番大きい値（1 からこの値までを抽選する） */
  readonly maxNumber: BingoNumber;
}

/** 一辺 size のカードのライン（横 size 本・縦 size 本・斜め 2 本） */
function linesOf(size: number): readonly CellMask[] {
  const indices = [...Array(size).keys()];
  return [
    ...indices.map((row) => maskOf(indices.map((col) => row * size + col))),
    ...indices.map((col) => maskOf(indices.map((row) => row * size + col))),
    maskOf(indices.map((i) => i * size + i)),
    maskOf(indices.map((i) => i * size + (size - 1 - i))),
  ];
}

function spec(size: number, hasFree: boolean): LayoutSpec {
  const cellCount = size * size;
  return {
    size,
    cellCount,
    free: hasFree ? CellIndex.parse((cellCount - 1) / 2) : null,
    lines: linesOf(size),
    maxNumber: BingoNumber.parse(size * NUMBERS_PER_COLUMN),
  };
}

export const LAYOUTS: Readonly<Record<CardLayout, LayoutSpec>> = {
  "5x5": spec(5, true),
  "3x3": spec(3, false),
};

/** マスの位置が、その大きさのカードの中にあるか */
export function isCellOf(layout: CardLayout, cell: CellIndex): boolean {
  return cell < LAYOUTS[layout].cellCount;
}

/** マスの位置にある列（0 始まり） */
export function columnOf(layout: CardLayout, cell: CellIndex): number {
  return cell % LAYOUTS[layout].size;
}

/** 抽選する番号の一覧（1 〜 maxNumber） */
export function drawPool(layout: CardLayout): readonly BingoNumber[] {
  return Array.from({ length: LAYOUTS[layout].maxNumber }, (_, i) =>
    BingoNumber.parse(i + 1),
  );
}
