import {
  CLOSE,
  CreateRoomResponse,
  PlayerName,
  RoomSettings,
  generateRoomId,
} from "@bingo/protocol";
import {
  evictAllDurableObjects,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createApp, type AppBindings } from "../src/app";
import type { RoomApi } from "../src/room-api";
import {
  COOKIE,
  TOKEN_TTL_SECONDS,
  hashToken,
  newToken,
  secureRandomIndex,
} from "../src/token";
import {
  JSON_HEADERS,
  call,
  connect,
  createRoom,
  join,
  me,
  settings,
  settle,
} from "./helpers";

describe("ルームを作る", () => {
  it("ルーム ID とホストの Cookie を返す", async () => {
    const { roomId, res } = await createRoom();
    expect(roomId).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain("bingo_host=");
    expect(setCookie).toContain(`Path=/r/${roomId}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Max-Age=10800");
  });

  it("設定が決まりに合わなければ 400 で、理由は画面が読める形で返す", async () => {
    const res = await call("/api/rooms", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ ...settings, name: "" }),
    });
    expect(res.status).toBe(400);
    expect(CreateRoomResponse.parse(await res.json())).toEqual({
      ok: false,
      error: "invalidSettings",
    });
  });

  it("ホストの Cookie で開くと host、無ければ none", async () => {
    const { roomId, hostCookie } = await createRoom();
    const host = await me(roomId, hostCookie);
    expect(host.body.data?.me).toEqual({ role: "host" });
    expect(host.body.data?.room.name).toBe("忘年会");
    const stranger = await me(roomId);
    expect(stranger.body.data?.me).toEqual({ role: "none" });
  });

  it("小文字のルーム ID でも開ける", async () => {
    const { roomId } = await createRoom();
    expect((await me(roomId.toLowerCase())).status).toBe(200);
  });

  it("無いルームは 404", async () => {
    expect((await me("AAAAAA")).status).toBe(404);
    expect((await me("bad")).status).toBe(404);
  });
});

describe("参加する", () => {
  it("参加すると Cookie を返し、その Cookie で player として開ける", async () => {
    const { roomId } = await createRoom();
    const joined = await join(roomId, "  たろう ");
    expect(joined.res.status).toBe(200);
    expect(joined.body).toMatchObject({ ok: true, name: "たろう" });
    expect(joined.cookie).toMatch(/^bingo_player=/);
    const result = await me(roomId, joined.cookie);
    expect(result.body.data?.me).toMatchObject({
      role: "player",
      name: "たろう",
    });
  });

  it("見分けのつかない名前は断る（全角と半角・大文字と小文字・空白）", async () => {
    const { roomId } = await createRoom();
    await join(roomId, "タロウ");
    await join(roomId, "Taro Yamada");
    for (const name of ["ﾀﾛｳ", "taroyamada"]) {
      const result = await join(roomId, name);
      expect(result.res.status).toBe(409);
      expect(result.body).toEqual({ ok: false, error: "nameTaken" });
    }
  });

  it("名前の決まりに合わなければ invalidName", async () => {
    const { roomId } = await createRoom();
    const result = await join(roomId, "あ".repeat(13));
    expect(result.res.status).toBe(400);
    expect(result.body).toEqual({ ok: false, error: "invalidName" });
  });

  it("参加済みの端末からは、もう一度参加できない", async () => {
    const { roomId } = await createRoom();
    const first = await join(roomId, "たろう");
    const again = await join(roomId, "はなこ", first.cookie);
    expect(again.body).toEqual({ ok: false, error: "alreadyJoined" });
  });
});

describe("WebSocket", () => {
  it("ホストには参加者の一覧が届き、参加があれば追加が届く", async () => {
    const { roomId, hostCookie } = await createRoom();
    await join(roomId, "たろう");
    const host = await connect(roomId, hostCookie);
    await settle();
    expect(host.messages[0]).toMatchObject({
      type: "hostSnapshot",
      players: [{ name: "たろう" }],
      maxPlayers: 1000,
    });
    await join(roomId, "はなこ");
    await settle();
    expect(host.messages[1]).toMatchObject({
      type: "playerJoined",
      player: { name: "はなこ" },
    });
  });

  it("プレイヤーには自分の情報が届く", async () => {
    const { roomId } = await createRoom();
    const joined = await join(roomId, "たろう");
    const player = await connect(roomId, joined.cookie);
    await settle();
    expect(player.messages[0]).toMatchObject({
      type: "playerSnapshot",
      me: { name: "たろう" },
      room: { name: "忘年会" },
      phase: { status: "lobby" },
    });
  });

  it("Cookie が無ければ unauthorized で切る", async () => {
    const { roomId } = await createRoom();
    const stranger = await connect(roomId, "");
    await settle();
    expect(stranger.closed.code).toBe(CLOSE.unauthorized);
    expect(stranger.messages).toEqual([
      { type: "bye", reason: "unauthorized" },
    ]);
  });

  it("別のサイトから開かれた接続（Origin が違う）は断る", async () => {
    const { roomId, hostCookie } = await createRoom();
    const res = await call(`/r/${roomId}/ws`, {
      headers: {
        Upgrade: "websocket",
        Origin: "https://evil.example",
        Cookie: hostCookie,
      },
    });
    expect(res.status).toBe(403);
  });

  it("同じ人が2つ目の接続を開くと、古い方を replaced で切る", async () => {
    const { roomId, hostCookie } = await createRoom();
    const first = await connect(roomId, hostCookie);
    await connect(roomId, hostCookie);
    await settle();
    expect(first.closed.code).toBe(CLOSE.replaced);
    expect(first.messages.at(-1)).toEqual({ type: "bye", reason: "replaced" });
  });

  it("ホストが外すと、その人は切られ、同じ端末から参加し直せず、名前は空く", async () => {
    const { roomId, hostCookie } = await createRoom();
    const joined = await join(roomId, "たろう");
    const playerId = (joined.body as { id: string }).id;
    const host = await connect(roomId, hostCookie);
    const player = await connect(roomId, joined.cookie);
    await settle();

    host.ws.send(JSON.stringify({ type: "kick", playerId }));
    await settle();
    expect(player.closed.code).toBe(CLOSE.kicked);
    expect(player.messages.at(-1)).toEqual({ type: "bye", reason: "kicked" });
    expect(host.messages.at(-1)).toEqual({ type: "playerRemoved", playerId });

    expect((await me(roomId, joined.cookie)).body.data?.me).toEqual({
      role: "kicked",
    });
    expect((await join(roomId, "じろう", joined.cookie)).body).toEqual({
      ok: false,
      error: "kicked",
    });
    // 外された端末から WebSocket でつなぎ直しても、理由つきで断る
    const again = await connect(roomId, joined.cookie);
    await settle();
    expect(again.messages).toEqual([{ type: "bye", reason: "kicked" }]);
    expect(again.closed.code).toBe(CLOSE.kicked);
    expect((await join(roomId, "たろう")).body).toMatchObject({ ok: true });
  });

  it("プレイヤーからの kick は無視する", async () => {
    const { roomId } = await createRoom();
    const a = await join(roomId, "たろう");
    const b = await join(roomId, "はなこ");
    const attacker = await connect(roomId, a.cookie);
    attacker.ws.send(
      JSON.stringify({ type: "kick", playerId: (b.body as { id: string }).id }),
    );
    await settle();
    expect((await me(roomId, b.cookie)).body.data?.me).toMatchObject({
      role: "player",
    });
  });

  it("送りすぎると rateLimited で切り、しばらくつなぎ直せない", async () => {
    const { roomId, hostCookie } = await createRoom();
    const host = await connect(roomId, hostCookie);
    for (let i = 0; i < 30; i++) host.ws.send("x");
    await settle();
    expect(host.closed.code).toBe(CLOSE.rateLimited);
    const again = await connect(roomId, hostCookie);
    await settle();
    expect(again.closed.code).toBe(CLOSE.rateLimited);
    expect(again.messages).toEqual([{ type: "bye", reason: "rateLimited" }]);
  });

  it("送りすぎで止めている間にルームが休止しても、つなぎ直せない", async () => {
    const { roomId, hostCookie } = await createRoom();
    const host = await connect(roomId, hostCookie);
    for (let i = 0; i < 30; i++) host.ws.send("x");
    await settle();
    expect(host.closed.code).toBe(CLOSE.rateLimited);
    // メモリを消して起き直させる（保存領域は残る）
    await evictAllDurableObjects();
    const again = await connect(roomId, hostCookie);
    await settle();
    expect(again.closed.code).toBe(CLOSE.rateLimited);
  });
});

describe("ルームのデータを消す", () => {
  it("ルームを作ると 24 時間後に消す予約が入り、その時刻に参加者ごと消える", async () => {
    const before = Date.now();
    const { roomId, hostCookie } = await createRoom();
    const player = await join(roomId, "たろう");
    const stub = env.ROOM.getByName(roomId);
    const alarm = await runInDurableObject(stub, (_, state) =>
      state.storage.getAlarm(),
    );
    const DAY = 24 * 60 * 60 * 1000;
    expect(alarm).toBeGreaterThanOrEqual(before + DAY);
    expect(alarm).toBeLessThanOrEqual(Date.now() + DAY);

    const host = await connect(roomId, hostCookie);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await settle();
    expect(host.messages.at(-1)).toEqual({
      type: "bye",
      reason: "unauthorized",
    });
    expect((await me(roomId, hostCookie)).status).toBe(404);
    expect((await me(roomId, player.cookie)).status).toBe(404);
    const left = await runInDurableObject(stub, async (_, state) => ({
      keys: (await state.storage.list()).size,
      alarm: await state.storage.getAlarm(),
    }));
    expect(left).toEqual({ keys: 0, alarm: null });
  });

  it("消したルームの ID で、新しいルームを作り直せる", async () => {
    const { roomId } = await createRoom();
    const stub = env.ROOM.getByName(roomId);
    await runDurableObjectAlarm(stub);
    const created = await runInDurableObject(stub, (instance) =>
      instance.create(
        RoomSettings.parse({ ...settings, name: "次の会" }),
        "hash",
        Date.now(),
      ),
    );
    expect(created).toBe(true);
  });
});

describe("ルームを作る（空いている ID が見つからないとき）", () => {
  it("何度作り直しても ID がかぶれば、5 回試してから 503 busy を返す", async () => {
    let attempts = 0;
    const unused = () => Promise.reject(new Error("呼ばれないはず"));
    const taken: RoomApi = {
      create: () => {
        attempts += 1;
        return Promise.resolve(false);
      },
      info: unused,
      join: unused,
      extend: unused,
      fetch: unused,
    };
    const bindings: AppBindings = { ROOM: { getByName: () => taken } };
    const res = await createApp().request(
      "/api/rooms",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(settings),
      },
      bindings,
    );
    expect(res.status).toBe(503);
    expect(CreateRoomResponse.parse(await res.json())).toEqual({
      ok: false,
      error: "busy",
    });
    expect(attempts).toBe(5);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });
});

describe("トークンの期限（サーバーでも確かめる）", () => {
  /** 有効期限（3 時間）をちょうど過ぎた時刻に発行したことにする */
  const expiredIssueTime = () => Date.now() - TOKEN_TTL_SECONDS * 1000 - 1;

  it("期限切れのホストのトークンでは、ホストとして扱わず、WebSocket も断る", async () => {
    const roomId = generateRoomId(secureRandomIndex);
    const token = newToken();
    const hash = await hashToken(token);
    await runInDurableObject(env.ROOM.getByName(roomId), (instance) =>
      instance.create(RoomSettings.parse(settings), hash, expiredIssueTime()),
    );
    const cookie = `${COOKIE.host}=${token}`;
    expect((await me(roomId, cookie)).body.data?.me).toEqual({ role: "none" });
    const ws = await connect(roomId, cookie);
    await settle();
    expect(ws.messages).toEqual([{ type: "bye", reason: "unauthorized" }]);
  });

  it("期限切れのプレイヤーのトークンでは、参加していない扱いになり、WebSocket も断る", async () => {
    const { roomId } = await createRoom();
    const token = newToken();
    const hash = await hashToken(token);
    await runInDurableObject(env.ROOM.getByName(roomId), (instance) =>
      instance.join(
        PlayerName.parse("たろう"),
        { host: null, player: null },
        hash,
        expiredIssueTime(),
      ),
    );
    const cookie = `${COOKIE.player}=${token}`;
    expect((await me(roomId, cookie)).body.data?.me).toEqual({ role: "none" });
    const ws = await connect(roomId, cookie);
    await settle();
    expect(ws.messages).toEqual([{ type: "bye", reason: "unauthorized" }]);
    // 参加していない扱いなので、新しく参加し直せる
    expect((await join(roomId, "じろう", cookie)).body).toMatchObject({
      ok: true,
    });
  });
});
