import { describe, expect, it } from "vitest";
import { GameRule } from "./rules";

describe("GameRule", () => {
  it("カードの大きさと勝ち方を自由に組み合わせられる", () => {
    for (const layout of ["5x5", "3x3"]) {
      expect(
        GameRule.safeParse({ layout, win: { type: "bingo", prizeLines: 2 } })
          .success,
      ).toBe(true);
      expect(
        GameRule.safeParse({ layout, win: { type: "reverse" } }).success,
      ).toBe(true);
    }
  });

  it("景品獲得ラインは 1〜3 本", () => {
    for (const prizeLines of [0, 4, 1.5]) {
      expect(
        GameRule.safeParse({
          layout: "5x5",
          win: { type: "bingo", prizeLines },
        }).success,
      ).toBe(false);
    }
  });

  it("通常の勝ち方には景品獲得ラインが必要", () => {
    expect(
      GameRule.safeParse({ layout: "5x5", win: { type: "bingo" } }).success,
    ).toBe(false);
  });

  it("知らない大きさ・勝ち方は受け付けない", () => {
    expect(
      GameRule.safeParse({ layout: "4x4", win: { type: "reverse" } }).success,
    ).toBe(false);
    expect(
      GameRule.safeParse({ layout: "5x5", win: { type: "rare" } }).success,
    ).toBe(false);
  });
});
