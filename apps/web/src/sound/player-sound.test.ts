import { EMPTY_MASK, type OpenEvent } from "@bingo/game";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerSound, soundsOfTap } from "./player-sound";

const opened = (event: OpenEvent | null) =>
  ({ kind: "opened", opened: EMPTY_MASK, event }) as const;

describe("soundsOfTap（マスを押した結果から鳴らす音）", () => {
  it("何もしないマスでは鳴らさない", () => {
    expect(soundsOfTap({ kind: "ignored" })).toEqual([]);
  });

  it("まだ出ていない番号では、その音だけを鳴らす", () => {
    expect(soundsOfTap({ kind: "notDrawn" })).toEqual(["notDrawn"]);
  });

  it("開けただけなら、開ける音だけを鳴らす", () => {
    expect(soundsOfTap(opened(null))).toEqual(["open"]);
  });

  it("リーチになったら、開ける音に続けてリーチの音を鳴らす", () => {
    expect(soundsOfTap(opened({ type: "reach" }))).toEqual(["open", "reach"]);
  });

  it("景品獲得ライン未満のビンゴは、本数によらずビンゴの音", () => {
    expect(
      soundsOfTap(
        opened({ type: "bingo", newLines: 1, lines: 1, prize: false }),
      ),
    ).toEqual(["open", "bingo"]);
    expect(
      soundsOfTap(
        opened({ type: "bingo", newLines: 2, lines: 2, prize: false }),
      ),
    ).toEqual(["open", "bingo"]);
  });

  it("景品獲得のビンゴは、本数によらず景品の音", () => {
    expect(
      soundsOfTap(
        opened({ type: "bingo", newLines: 1, lines: 3, prize: true }),
      ),
    ).toEqual(["open", "prize"]);
    expect(
      soundsOfTap(
        opened({ type: "bingo", newLines: 2, lines: 3, prize: true }),
      ),
    ).toEqual(["open", "prize"]);
  });
});

describe("PlayerSound.unlock（音を有効にする）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("音を出す仕組みがない環境でも、例外を出さずに鳴らないだけになる", () => {
    vi.stubGlobal("AudioContext", undefined);
    const sound = new PlayerSound();
    expect(() => {
      sound.unlock();
      sound.play(["open"]);
    }).not.toThrow();
  });

  it("音を出す仕組みを作るときに失敗しても、例外を出さない", () => {
    // new で呼ばれると例外を出す（new で呼べるよう、アロー関数ではなく function で書く）
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function () {
        throw new Error("使えない");
      }),
    );
    const sound = new PlayerSound();
    expect(() => {
      sound.unlock();
      sound.play(["open"]);
    }).not.toThrow();
  });
});
