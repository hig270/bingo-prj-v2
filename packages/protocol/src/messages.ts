import { z } from "zod";
import { PlayerId } from "./ids";
import { PlayerSummary, RoomInfo } from "./room";
import { PlayerName } from "./text";

// WebSocket で送るメッセージは、type で種類を見分ける「判別可能なユニオン型」で表す。
// 機能を作りながら足していく（今は「ルームに集まる」段階の分）

/** クライアント → サーバー */
export const ClientMessage = z.discriminatedUnion("type", [
  /** ホストが参加者を外す */
  z.object({ type: z.literal("kick"), playerId: PlayerId }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** サーバーが接続を切る理由 */
export const ByeReason = z.enum([
  "replaced", // 同じ人が別の画面でつないだので、古い方を切った
  "unauthorized", // トークンが無い・期限切れ・ルームが無い
  "kicked", // ホストに外された
  "rateLimited", // 送信回数の制限を超えた（60 秒たてばつなぎ直せる）
]);
export type ByeReason = z.infer<typeof ByeReason>;

/** サーバー → クライアント */
export const ServerMessage = z.discriminatedUnion("type", [
  /** ホストに、つないだ直後の全体の状態を送る */
  z.object({
    type: z.literal("hostSnapshot"),
    room: RoomInfo,
    players: z.array(PlayerSummary),
    maxPlayers: z.number().int().positive(),
  }),
  /** プレイヤーに、つないだ直後の状態を送る */
  z.object({
    type: z.literal("playerSnapshot"),
    room: RoomInfo,
    me: z.object({ id: PlayerId, name: PlayerName }),
  }),
  /** ホストに: 参加者が増えた */
  z.object({ type: z.literal("playerJoined"), player: PlayerSummary }),
  /** ホストに: 参加者が外された */
  z.object({ type: z.literal("playerRemoved"), playerId: PlayerId }),
  /**
   * サーバーがこの接続を切る直前の知らせ（画面はこれを受け取ったら自分から切る）。
   * 休止できる方式（Hibernation）の接続では、サーバーから切った知らせ（close コード）が
   * 画面に届かない場面があるため（手元の実行環境で確認。docs/architecture.md）、理由はこのメッセージで伝える
   */
  z.object({ type: z.literal("bye"), reason: ByeReason }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

/**
 * サーバーが接続を切るときの close コード（4000〜4999 はアプリが自由に使える）。
 * 理由は bye メッセージでも伝える（close コードは届かない場面があるため）
 */
export const CLOSE = {
  /** 同じ人が別の画面でつないだので、古い方を切った */
  replaced: 4001,
  /** トークンが無い・期限切れ・ルームが無い */
  unauthorized: 4003,
  /** ホストに外された */
  kicked: 4004,
  /** 送信回数の制限を超えた（60 秒たてばつなぎ直せる） */
  rateLimited: 4008,
} as const satisfies Record<ByeReason, number>;
export type CloseCode = (typeof CLOSE)[keyof typeof CLOSE];

/** 送りすぎで切断したあと、つなぎ直しを受け付けない秒数 */
export const RATE_LIMIT_COOLDOWN_SECONDS = 60;
