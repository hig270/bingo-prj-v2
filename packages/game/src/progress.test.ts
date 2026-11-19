import { describe, expect, it } from "vitest";
import { maskOf } from "./cells";
import { eventOfOpen, progressOf } from "./progress";
import { GameRule } from "./rules";

const normal = (prizeLines: number) =>
  GameRule.parse({ layout: "5x5", win: { type: "bingo", prizeLines } });
const speed = GameRule.parse({
  layout: "3x3",
  win: { type: "bingo", prizeLines: 1 },
});

// 5×5 のマスの位置: 1 行目は 0〜4、中央（FREE）は 12
const FREE = 12;

describe("progressOf", () => {
  it("完成したラインとリーチのラインを数える", () => {
    // 1 行目の 4 マス → リーチ 1 本
    expect(progressOf("5x5", maskOf([0, 1, 2, 3]))).toEqual({
      lines: 0,
      reach: 1,
    });
    // 1 行目がそろい、1 列目は 0 だけ → ライン 1 本
    expect(progressOf("5x5", maskOf([0, 1, 2, 3, 4]))).toEqual({
      lines: 1,
      reach: 0,
    });
  });

  it("FREE を含むラインは、FREE も開いているものとして数える", () => {
    // 3 行目（10〜14）で FREE（12）を含めて 4 マス → リーチ
    expect(progressOf("5x5", maskOf([10, 11, FREE, 13]))).toEqual({
      lines: 0,
      reach: 1,
    });
  });
});

describe("eventOfOpen", () => {
  it("リーチが 0 本から 1 本以上になったら reach", () => {
    expect(
      eventOfOpen(normal(1), maskOf([0, 1, 2]), maskOf([0, 1, 2, 3])),
    ).toEqual({ type: "reach" });
  });

  it("すでにリーチがあれば、リーチが増えても知らせない", () => {
    // 1 行目がリーチのまま、1 列目（0,5,10,15,20）もリーチになる
    expect(
      eventOfOpen(
        normal(1),
        maskOf([0, 1, 2, 3, 5, 10]),
        maskOf([0, 1, 2, 3, 5, 10, 15]),
      ),
    ).toBeNull();
  });

  it("景品獲得ラインが 1 本なら、最初のビンゴで景品獲得", () => {
    expect(
      eventOfOpen(normal(1), maskOf([0, 1, 2, 3]), maskOf([0, 1, 2, 3, 4])),
    ).toEqual({ type: "bingo", newLines: 1, lines: 1, prize: true });
  });

  it("景品獲得ラインが 2 本なら、1 本目は景品獲得ではない", () => {
    expect(
      eventOfOpen(normal(2), maskOf([0, 1, 2, 3]), maskOf([0, 1, 2, 3, 4])),
    ).toEqual({ type: "bingo", newLines: 1, lines: 1, prize: false });
  });

  it("1 マスで 2 本そろえば newLines は 2 で、2 本ルールなら一気に景品獲得", () => {
    // 1 行目（0〜4）と 1 列目（0,5,10,15,20）が、0 を開けて同時にそろう
    const before = maskOf([1, 2, 3, 4, 5, 10, 15, 20]);
    const after = maskOf([0, 1, 2, 3, 4, 5, 10, 15, 20]);
    expect(eventOfOpen(normal(2), before, after)).toEqual({
      type: "bingo",
      newLines: 2,
      lines: 2,
      prize: true,
    });
  });

  it("景品獲得ラインを超えた後のビンゴは、景品獲得にしない", () => {
    const before = maskOf([0, 1, 2, 3, 4, 5, 10, 15]);
    const after = maskOf([0, 1, 2, 3, 4, 5, 10, 15, 20]);
    expect(eventOfOpen(normal(1), before, after)).toEqual({
      type: "bingo",
      newLines: 1,
      lines: 2,
      prize: false,
    });
  });

  it("9マスでも同じように判定する", () => {
    // 3×3 の 1 行目は 0〜2
    expect(eventOfOpen(speed, maskOf([0]), maskOf([0, 1]))).toEqual({
      type: "reach",
    });
    expect(eventOfOpen(speed, maskOf([0, 1]), maskOf([0, 1, 2]))).toEqual({
      type: "bingo",
      newLines: 1,
      lines: 1,
      prize: true,
    });
  });

  it("逆ビンゴでは景品獲得にしない（景品獲得ラインを使わない）", () => {
    const reverse = GameRule.parse({
      layout: "5x5",
      win: { type: "reverse" },
    });
    expect(
      eventOfOpen(reverse, maskOf([0, 1, 2, 3]), maskOf([0, 1, 2, 3, 4])),
    ).toMatchObject({ type: "bingo", prize: false });
  });
});
