import { describe, expect, it } from "vitest";
import { ROOM_ID_ALPHABET, RoomId, generateRoomId } from "./ids";
import { ClientMessage } from "./messages";
import { RoomSettings } from "./room";

describe("RoomId", () => {
  it("小文字で打っても大文字にそろえて受け付ける", () => {
    expect(RoomId.parse("k7mq4p")).toBe("K7MQ4P");
  });

  it("紛らわしい文字（0・O・1・I・L）や長さの違うものは受け付けない", () => {
    for (const bad of ["K7MQ40", "K7MQ4O", "K7MQ41", "K7MQ4I", "K7MQ4L"]) {
      expect(RoomId.safeParse(bad).success).toBe(false);
    }
    expect(RoomId.safeParse("K7MQ4").success).toBe(false);
    expect(RoomId.safeParse("K7MQ4PP").success).toBe(false);
  });

  it("generateRoomId は決まった文字で 6 文字を作る", () => {
    let i = 0;
    const id = generateRoomId((n) => i++ % n);
    expect(id).toBe(ROOM_ID_ALPHABET.slice(0, 6));
  });
});

describe("RoomSettings", () => {
  const base = { name: "忘年会", prizes: null };

  it("通常モードは景品の数を省略できる", () => {
    expect(
      RoomSettings.safeParse({
        ...base,
        rule: { layout: "5x5", win: { type: "bingo", prizeLines: 1 } },
      }).success,
    ).toBe(true);
  });

  it("逆ビンゴは景品の数が必要", () => {
    const rule = { layout: "3x3", win: { type: "reverse" } };
    expect(RoomSettings.safeParse({ ...base, rule }).success).toBe(false);
    expect(RoomSettings.safeParse({ ...base, rule, prizes: 10 }).success).toBe(
      true,
    );
  });

  it("景品の数は 1〜999", () => {
    const rule = { layout: "5x5", win: { type: "bingo", prizeLines: 1 } };
    for (const prizes of [0, 1000, 2.5]) {
      expect(RoomSettings.safeParse({ ...base, rule, prizes }).success).toBe(
        false,
      );
    }
  });
});

describe("ClientMessage", () => {
  it("知らない種類のメッセージを拒否する", () => {
    expect(ClientMessage.safeParse({ type: "cheat" }).success).toBe(false);
  });

  it("外す相手の ID の形を確かめる", () => {
    expect(
      ClientMessage.safeParse({ type: "kick", playerId: "abc" }).success,
    ).toBe(false);
    expect(
      ClientMessage.safeParse({ type: "kick", playerId: "abcdEFGH1234" })
        .success,
    ).toBe(true);
  });
});
