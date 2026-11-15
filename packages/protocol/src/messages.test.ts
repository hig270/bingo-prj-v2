import { describe, expect, it } from "vitest";
import { ClientMessage, ServerMessage } from "./messages";

describe("ClientMessage", () => {
  it("正しい形のタップを受け付ける", () => {
    expect(ClientMessage.safeParse({ type: "tap", cell: 12 }).success).toBe(
      true,
    );
  });

  it("範囲外のマスを拒否する", () => {
    expect(ClientMessage.safeParse({ type: "tap", cell: 25 }).success).toBe(
      false,
    );
  });

  it("知らない種類のメッセージを拒否する", () => {
    expect(ClientMessage.safeParse({ type: "cheat" }).success).toBe(false);
  });
});

describe("ServerMessage", () => {
  it("1〜75 以外の抽選番号を拒否する", () => {
    expect(ServerMessage.safeParse({ type: "drawn", number: 76 }).success).toBe(
      false,
    );
    expect(ServerMessage.safeParse({ type: "drawn", number: 75 }).success).toBe(
      true,
    );
  });
});
