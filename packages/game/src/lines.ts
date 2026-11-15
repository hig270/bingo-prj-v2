import type { CellMask } from "./cells";

/** 完成しているラインの本数（lines はカードの大きさのライン。layout.ts の LAYOUTS を参照） */
export function countCompletedLines(
  opened: CellMask,
  lines: readonly CellMask[],
): number {
  return lines.filter((line) => (opened & line) === line).length;
}
