import { CARD_SIZE, CellIndex, CellMask, EMPTY_MASK, openCell } from "./cells";

function maskOf(cells: readonly number[]): CellMask {
  return cells.reduce<CellMask>(
    (mask, cell) => openCell(mask, CellIndex.parse(cell)),
    EMPTY_MASK,
  );
}

const indices = [...Array(CARD_SIZE).keys()];

/** 5×5 のカードのライン（横5本・縦5本・斜め2本の計12本）を、マスの集合で表したもの */
export const LINES_5X5: readonly CellMask[] = [
  ...indices.map((row) => maskOf(indices.map((col) => row * CARD_SIZE + col))),
  ...indices.map((col) => maskOf(indices.map((row) => row * CARD_SIZE + col))),
  maskOf(indices.map((i) => i * CARD_SIZE + i)),
  maskOf(indices.map((i) => i * CARD_SIZE + (CARD_SIZE - 1 - i))),
];

/** 完成しているラインの本数 */
export function countCompletedLines(
  opened: CellMask,
  lines: readonly CellMask[] = LINES_5X5,
): number {
  return lines.filter((line) => (opened & line) === line).length;
}
