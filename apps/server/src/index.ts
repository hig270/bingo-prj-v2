import { RoomId } from "@bingo/protocol";
import { Hono } from "hono";

export { RoomDO } from "./room";

/** ルームの Durable Object を取り出す（最初に作られるときはアジア太平洋に置く） */
function roomStub(env: Env, roomId: RoomId) {
  return env.ROOM.getByName(roomId, { locationHint: "apac" });
}

const app = new Hono<{ Bindings: Env }>()
  .get("/api/health", (c) => c.json({ ok: true }))
  // 動作確認用: Worker → ルームの RPC 呼び出し。後で消す
  .get("/r/:roomId/api/ping", async (c) => {
    const parsed = RoomId.safeParse(c.req.param("roomId"));
    if (!parsed.success) {
      return c.json({ error: "invalidRoomId" }, 400);
    }
    const reply = await roomStub(c.env, parsed.data).ping();
    return c.json({ reply });
  });

/** フロントの型付きクライアント（hc）が使う API 全体の型 */
export type AppType = typeof app;

export default app;
