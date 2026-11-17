import {
  type CreateRoomResponse,
  JoinRequest,
  PlayerName,
  RoomId,
  RoomSettings,
  generateRoomId,
} from "@bingo/protocol";
import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { validator } from "hono/validator";
import { HEADER, type RoomApi, type TokenHashes } from "./room-api";
import {
  COOKIE,
  TOKEN_TTL_SECONDS,
  hashToken,
  newToken,
  secureRandomIndex,
} from "./token";

// HTTP の受け口（Hono）。Cloudflare の型に依存しない形で書く
// （画面側の型付きクライアントが、Cloudflare の型を読まずにこの定義から型を読めるように）

/**
 * API が Cloudflare の環境（env）に求めるもの。ルームを名前（ルーム ID）で取り出せること。
 * wrangler が生成する Env がこの形を満たすことは、index.ts で型で確かめる
 */
export interface AppBindings {
  readonly ROOM: {
    // プロパティの書き方にする（メソッドの書き方だと、引数の型の食い違いを片方向しか検出しないため）
    readonly getByName: (
      name: string,
      options: { locationHint: "apac" },
    ) => RoomApi;
  };
}

/** ルームを作るとき、同じ ID が既にあった場合に作り直す回数 */
const CREATE_ATTEMPTS = 5;

/** ルームを作れなかったときの応答（CreateRoomResponse のうち、失敗の形） */
type CreateRoomFailure = Extract<CreateRoomResponse, { ok: false }>;

/** トークンを Cookie に入れる（JavaScript から読めず、そのルームの URL にだけ送られる） */
function setTokenCookie(
  c: Context,
  name: string,
  roomId: RoomId,
  token: string,
): void {
  setCookie(c, name, token, {
    path: `/r/${roomId}`,
    maxAge: TOKEN_TTL_SECONDS,
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
  });
}

/** Cookie のトークンを、ハッシュ値にして取り出す */
async function tokenHashes(c: Context): Promise<TokenHashes> {
  const host = getCookie(c, COOKIE.host);
  const player = getCookie(c, COOKIE.player);
  return {
    host: host === undefined ? null : await hashToken(host),
    player: player === undefined ? null : await hashToken(player),
  };
}

/** URL のルーム ID を確かめる（小文字は大文字にそろえる） */
function roomIdOf(c: Context): RoomId | null {
  const parsed = RoomId.safeParse(c.req.param("roomId"));
  return parsed.success ? parsed.data : null;
}

/**
 * ルームを取り出す（本番では Durable Object）。最初に作られるときはアジア太平洋に置く
 */
function roomOf(env: AppBindings, id: RoomId): RoomApi {
  return env.ROOM.getByName(id, { locationHint: "apac" });
}

/** API を作る */
export function createApp() {
  return (
    new Hono<{ Bindings: AppBindings }>()
      .get("/api/health", (c) => c.json({ ok: true }))

      // ルームを作る（ゲーム設定画面の「募集開始」）。ホストのトークンを Cookie で返す
      .post(
        "/api/rooms",
        validator("json", (value, c) => {
          const parsed = RoomSettings.safeParse(value);
          return parsed.success
            ? parsed.data
            : c.json(
                {
                  ok: false,
                  error: "invalidSettings",
                } as const satisfies CreateRoomFailure,
                400,
              );
        }),
        async (c) => {
          const settings = c.req.valid("json");
          const token = newToken();
          const hash = await hashToken(token);
          for (let i = 0; i < CREATE_ATTEMPTS; i++) {
            const roomId = generateRoomId(secureRandomIndex);
            if (
              await roomOf(c.env, roomId).create(settings, hash, Date.now())
            ) {
              setTokenCookie(c, COOKIE.host, roomId, token);
              return c.json({ ok: true, roomId } as const, 201);
            }
          }
          return c.json(
            { ok: false, error: "busy" } as const satisfies CreateRoomFailure,
            503,
          );
        },
      )

      // ルームの公開情報と、画面を開いた人が誰か
      .get("/r/:roomId/api/me", async (c) => {
        const roomId = roomIdOf(c);
        if (roomId === null) return c.json({ error: "notFound" } as const, 404);
        const info = await roomOf(c.env, roomId).info(
          await tokenHashes(c),
          Date.now(),
        );
        if (info === null) return c.json({ error: "notFound" } as const, 404);
        return c.json(info, 200);
      })

      // 参加する。プレイヤーのトークンを Cookie で返す
      .post(
        "/r/:roomId/api/join",
        validator("json", (value, c) => {
          const name = PlayerName.safeParse(
            JoinRequest.safeParse(value).data?.name,
          );
          return name.success
            ? { name: name.data }
            : c.json({ ok: false, error: "invalidName" } as const, 400);
        }),
        async (c) => {
          const roomId = roomIdOf(c);
          if (roomId === null) {
            return c.json({ error: "notFound" } as const, 404);
          }
          const token = newToken();
          const result = await roomOf(c.env, roomId).join(
            c.req.valid("json").name,
            await tokenHashes(c),
            await hashToken(token),
            Date.now(),
          );
          if (result === null) {
            return c.json({ error: "notFound" } as const, 404);
          }
          if (!result.ok) return c.json(result, 409);
          setTokenCookie(c, COOKIE.player, roomId, token);
          return c.json(result, 200);
        },
      )

      // WebSocket の接続。別のサイトから開かれていないか（Origin）を確かめてからルームに渡す
      .get("/r/:roomId/ws", async (c) => {
        const roomId = roomIdOf(c);
        if (roomId === null) return c.text("not found", 404);
        if (c.req.header("Upgrade") !== "websocket") {
          return c.text("WebSocket で接続してください", 426);
        }
        if (c.req.header("Origin") !== new URL(c.req.url).origin) {
          return c.text("forbidden", 403);
        }
        const hashes = await tokenHashes(c);
        const headers = new Headers({ Upgrade: "websocket" });
        if (hashes.host !== null) headers.set(HEADER.host, hashes.host);
        if (hashes.player !== null) headers.set(HEADER.player, hashes.player);
        return roomOf(c.env, roomId).fetch(new Request(c.req.url, { headers }));
      })
  );
}

/** フロントの型付きクライアント（hc）が使う API 全体の型 */
export type AppType = ReturnType<typeof createApp>;
