import { z } from "zod";
import { CardLayout } from "./layout";

/**
 * 勝ち方。type で見分ける（判別できるユニオン型）。
 * - "bingo": 通常。ラインが prizeLines 本そろったら景品獲得（景品獲得ライン。1〜3本）
 * - "reverse": 逆ビンゴ。抽選番号でラインが1本そろったら脱落し、残りの人数が景品の数以下になったら
 *   残った人が景品をもらう（景品獲得ラインは使わない）
 */
export const WinCondition = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bingo"),
    prizeLines: z.number().int().min(1).max(3),
  }),
  z.object({ type: z.literal("reverse") }),
]);
export type WinCondition = z.infer<typeof WinCondition>;

/**
 * ゲームのルール。カードの大きさと勝ち方は独立していて、自由に組み合わせられる。
 * 画面で選ぶ「基本ルール」（通常・スピード・逆ビンゴ）は、この2つの値をまとめて入れる入口で、型には残さない
 */
export const GameRule = z.object({
  layout: CardLayout,
  win: WinCondition,
});
export type GameRule = z.infer<typeof GameRule>;
