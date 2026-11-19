import { MeResponse, ServerMessage } from "@bingo/protocol";
import { exports } from "cloudflare:workers";
import { expect } from "vitest";

// テストで共通に使う手続き（ルームを作る・参加する・WebSocket でつなぐ）

export const ORIGIN = "https://example.com";
export const JSON_HEADERS = { "Content-Type": "application/json" };

export const settings = {
  name: "忘年会",
  rule: { layout: "5x5", win: { type: "bingo", prizeLines: 1 } },
  prizes: null,
};

export function call(path: string, init: RequestInit = {}) {
  return exports.default.fetch(`${ORIGIN}${path}`, init);
}

/** Set-Cookie から「名前=値」だけを取り出す（次の要求の Cookie に付ける） */
export function cookieOf(res: Response): string {
  const header = res.headers.get("Set-Cookie") ?? "";
  return header.split(";")[0] ?? "";
}

export async function createRoom(body: unknown = settings) {
  const res = await call("/api/rooms", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  const { roomId } = await res.json<{ roomId: string }>();
  return { roomId, hostCookie: cookieOf(res), res };
}

export async function join(roomId: string, name: string, cookie = "") {
  const res = await call(`/r/${roomId}/api/join`, {
    method: "POST",
    headers: { ...JSON_HEADERS, Cookie: cookie },
    body: JSON.stringify({ name }),
  });
  return { res, cookie: cookieOf(res), body: await res.json<unknown>() };
}

export async function me(roomId: string, cookie = "") {
  const res = await call(`/r/${roomId}/api/me`, {
    headers: { Cookie: cookie },
  });
  return { status: res.status, body: MeResponse.safeParse(await res.json()) };
}

/** WebSocket でつなぎ、届いたメッセージと切断の理由を記録する */
export async function connect(roomId: string, cookie: string) {
  const res = await call(`/r/${roomId}/ws`, {
    headers: { Upgrade: "websocket", Origin: ORIGIN, Cookie: cookie },
  });
  const ws = res.webSocket;
  if (ws === null) throw new Error(`接続できない: ${String(res.status)}`);
  const messages: ServerMessage[] = [];
  const closed: { code: number | null } = { code: null };
  ws.addEventListener("message", (e) => {
    messages.push(ServerMessage.parse(JSON.parse(String(e.data))));
  });
  ws.addEventListener("close", (e) => {
    closed.code = e.code;
  });
  ws.accept();
  return { ws, messages, closed };
}

/** 非同期の処理（メッセージの到着など）が進むのを少し待つ */
export const settle = () => new Promise((r) => setTimeout(r, 50));
