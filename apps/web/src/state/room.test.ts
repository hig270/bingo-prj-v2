import { BingoNumber } from "@bingo/game";
import { describe, expect, it } from "vitest";
import { initialRoomState, reduceRoom } from "./room";

describe("reduceRoom", () => {
  it("抽選された番号を順に追加する", () => {
    const a = BingoNumber.parse(7);
    const b = BingoNumber.parse(42);
    const once = reduceRoom(initialRoomState, { type: "drawn", number: a });
    const twice = reduceRoom(once, { type: "drawn", number: b });
    expect(twice.drawn).toEqual([a, b]);
  });

  it("タップが拒否されても状態は変わらない", () => {
    const next = reduceRoom(initialRoomState, {
      type: "tapRejected",
      reason: "notDrawn",
    });
    expect(next).toBe(initialRoomState);
  });
});
