import { RoomId, RoomSettings } from "@bingo/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoom, fetchMe } from "./http";

const settings = RoomSettings.parse({
  name: "忘年会",
  rule: { layout: "5x5", win: { type: "bingo", prizeLines: 1 } },
  prizes: null,
});

/** fetch を、決まった応答を返す偽物に差し替える */
function respond(response: Response | Error) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response),
    ),
  );
}
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRoom", () => {
  it("作れたらルーム ID を確かめて返す（小文字は大文字にそろえる）", async () => {
    respond(json({ ok: true, roomId: "k7mq4p" }, 201));
    expect(await createRoom(settings)).toEqual({
      kind: "ok",
      value: { ok: true, roomId: RoomId.parse("K7MQ4P") },
    });
  });

  it("作れなかったときは、サーバーが返した理由を返す", async () => {
    respond(json({ ok: false, error: "busy" }, 503));
    expect(await createRoom(settings)).toEqual({
      kind: "ok",
      value: { ok: false, error: "busy" },
    });
  });

  it("ルーム ID の形が合わなければ、画面が古いとみなす", async () => {
    respond(json({ ok: true, roomId: "0000" }, 201));
    expect(await createRoom(settings)).toEqual({ kind: "outdated" });
  });

  it("サーバーの不調（500 番台で形が合わない）は、通信できなかったとみなす", async () => {
    respond(new Response("Bad Gateway", { status: 502 }));
    expect(await createRoom(settings)).toEqual({ kind: "network" });
  });

  it("通信できなかったら network", async () => {
    respond(new TypeError("Failed to fetch"));
    expect(await createRoom(settings)).toEqual({ kind: "network" });
  });
});

describe("fetchMe", () => {
  const roomId = RoomId.parse("K7MQ4P");

  it("404 はルームが無い", async () => {
    respond(json({ error: "notFound" }, 404));
    expect(await fetchMe(roomId)).toEqual({ kind: "notFound" });
  });

  it("500 番台でない応答の形が合わなければ、画面が古いとみなす", async () => {
    respond(json({ unexpected: true }, 200));
    expect(await fetchMe(roomId)).toEqual({ kind: "outdated" });
  });

  it("500 番台で JSON でない応答は、通信できなかったとみなす", async () => {
    respond(new Response("<html>error</html>", { status: 500 }));
    expect(await fetchMe(roomId)).toEqual({ kind: "network" });
  });
});
