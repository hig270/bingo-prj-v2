import { GameRule, type OpenEvent } from "@bingo/game";
import { describe, expect, it } from "vitest";
import { hostNoticeText, playerNoticeText } from "./notice-text";

const rule = (prizeLines: number) =>
  GameRule.parse({ layout: "5x5", win: { type: "bingo", prizeLines } });
const bingo = (newLines: number, lines: number, prize: boolean): OpenEvent => ({
  type: "bingo",
  newLines,
  lines,
  prize,
});

describe("hostNoticeText", () => {
  it("リーチ・ビンゴ・景品獲得を見分けられる文言にする", () => {
    expect(hostNoticeText("たろう", { type: "reach" }, rule(1))).toBe(
      "たろう リーチ!",
    );
    expect(hostNoticeText("たろう", bingo(1, 1, false), rule(2))).toBe(
      "たろう ビンゴ! (1/2)",
    );
    expect(hostNoticeText("たろう", bingo(1, 1, true), rule(1))).toBe(
      "たろう ビンゴ! 景品獲得!",
    );
    expect(hostNoticeText("たろう", bingo(2, 2, true), rule(2))).toBe(
      "たろう ダブルビンゴ! 景品獲得!",
    );
    expect(hostNoticeText("たろう", bingo(4, 4, true), rule(1))).toBe(
      "たろう クアドラビンゴ! 景品獲得!",
    );
  });
});

describe("playerNoticeText", () => {
  it("景品獲得ライン未満のビンゴでは、残りの本数を言う", () => {
    expect(playerNoticeText(bingo(1, 1, false), rule(2))).toBe(
      "ビンゴ! あと1本で景品",
    );
    expect(playerNoticeText(bingo(1, 1, false), rule(3))).toBe(
      "ビンゴ! あと2本で景品",
    );
  });

  it("景品獲得と、獲得した後のビンゴ", () => {
    expect(playerNoticeText(bingo(1, 1, true), rule(1))).toBe("景品獲得!");
    expect(playerNoticeText(bingo(3, 3, true), rule(2))).toBe(
      "トリプルビンゴ! 景品獲得!",
    );
    expect(playerNoticeText(bingo(1, 2, false), rule(1))).toBe("ビンゴ!");
    expect(playerNoticeText({ type: "reach" }, rule(1))).toBe("リーチ!");
  });
});
