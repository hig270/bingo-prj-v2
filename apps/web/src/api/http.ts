import {
  CreateRoomResponse,
  JoinResponse,
  MeResponse,
  type PlayerName,
  type RoomId,
  type RoomSettings,
} from "@bingo/protocol";
import type { AppType } from "@bingo/server/app";
import { hc } from "hono/client";
import type { z } from "zod";

// サーバーの HTTP の API を呼ぶ。URL・送る中身は型付きクライアント（hc）で型をチェックし、
// 返ってきた中身は共通パッケージのスキーマで実行時に確かめる（decisions.md「HTTP の API の型の共有」）

const client = hc<AppType>("/");

/**
 * 呼び出しの結果。
 * - ok: 成功
 * - notFound: ルームが無い
 * - outdated: 返ってきた中身の形が合わない（画面が古い。再読み込みしてもらう）
 * - network: 通信できなかった（サーバーの一時的な不調を含む。もう一度試してもらう）
 */
export type Result<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "notFound" }
  | { readonly kind: "outdated" }
  | { readonly kind: "network" };

/**
 * 返ってきた中身をスキーマで確かめる。
 * 形が合わないとき、サーバーの不調（500 番台）なら network、そうでなければ outdated にする
 * （Cloudflare の一時的なエラーやサーバーの例外で「画面が古い」と案内しないように）
 */
async function check<S extends z.ZodType>(
  res: Response,
  schema: S,
): Promise<Result<z.infer<S>>> {
  if (res.status === 404) return { kind: "notFound" };
  const mismatch = (): Result<never> =>
    res.status >= 500 ? { kind: "network" } : { kind: "outdated" };
  try {
    const parsed = schema.safeParse(await res.json());
    return parsed.success ? { kind: "ok", value: parsed.data } : mismatch();
  } catch {
    return mismatch();
  }
}

async function attempt<T>(run: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await run();
  } catch {
    return { kind: "network" };
  }
}

/** ルームを作る（ホストの Cookie はブラウザが受け取る）。作れなかったときは、サーバーが返した理由 */
export function createRoom(
  settings: RoomSettings,
): Promise<Result<CreateRoomResponse>> {
  return attempt(async () => {
    const res = await client.api.rooms.$post({ json: settings });
    return check(res, CreateRoomResponse);
  });
}

/** ルームの公開情報と、画面を開いた人が誰か */
export function fetchMe(roomId: RoomId): Promise<Result<MeResponse>> {
  return attempt(async () => {
    const res = await client.r[":roomId"].api.me.$get({ param: { roomId } });
    return check(res, MeResponse);
  });
}

/** 参加する（プレイヤーの Cookie はブラウザが受け取る）。名前は画面で決まりを確かめてから渡す */
export function joinRoom(
  roomId: RoomId,
  name: PlayerName,
): Promise<Result<JoinResponse>> {
  return attempt(async () => {
    const res = await client.r[":roomId"].api.join.$post({
      param: { roomId },
      json: { name },
    });
    return check(res, JoinResponse);
  });
}
