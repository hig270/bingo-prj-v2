import { z } from "zod";
import type { CellMask } from "./cells";
import { LAYOUTS, type CardLayout } from "./layout";
import { countCompletedLines, countReachLines } from "./lines";
import type { GameRule } from "./rules";

/** 開けたマスで見た、ラインの進み具合 */
export interface Progress {
  /** 完成しているラインの本数 */
  readonly lines: number;
  /** リーチのラインの本数（あと1マスで完成するライン） */
  readonly reach: number;
}

export function progressOf(layout: CardLayout, opened: CellMask): Progress {
  const lines = LAYOUTS[layout].lines;
  return {
    lines: countCompletedLines(opened, lines),
    reach: countReachLines(opened, lines),
  };
}

/**
 * マスを1つ開けたことで起きた出来事（ホスト画面の帯の知らせと、プレイヤーの画面の知らせに使う）。
 * - reach: リーチのラインが 0 本から 1 本以上になった
 * - bingo: ラインが newLines 本完成した（lines は完成したラインの合計）。
 *   prize は、このマスで景品獲得ラインに達したか
 */
export const OpenEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("reach") }),
  z.object({
    type: z.literal("bingo"),
    newLines: z.number().int().positive(),
    lines: z.number().int().positive(),
    prize: z.boolean(),
  }),
]);
export type OpenEvent = z.infer<typeof OpenEvent>;

/**
 * マスを開ける前（before）と後（after）を比べて、起きた出来事を返す。何も起きなければ null。
 * ラインが完成したときはビンゴだけを返す（同時にリーチが増えても、知らせはビンゴを優先する）
 */
export function eventOfOpen(
  rule: GameRule,
  before: CellMask,
  after: CellMask,
): OpenEvent | null {
  const was = progressOf(rule.layout, before);
  const now = progressOf(rule.layout, after);
  if (now.lines > was.lines) {
    const prize =
      rule.win.type === "bingo" &&
      was.lines < rule.win.prizeLines &&
      now.lines >= rule.win.prizeLines;
    return {
      type: "bingo",
      newLines: now.lines - was.lines,
      lines: now.lines,
      prize,
    };
  }
  if (was.reach === 0 && now.reach > 0) return { type: "reach" };
  return null;
}
