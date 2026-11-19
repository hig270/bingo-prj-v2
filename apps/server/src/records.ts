import { Card, GameRule } from "@bingo/game";
import {
  PlayerId,
  PlayerName,
  PrizeCount,
  RoomName,
  RoomStatus,
} from "@bingo/protocol";
import { z } from "zod";

// ルームの保存領域に書く値の形。読み込むときに必ずこの形で確かめる（decisions.md「保存方法」）

/** 期限つきのトークン（ハッシュ値で持つ） */
const Session = z.object({
  tokenHash: z.string(),
  /** 有効期限（UNIX 時刻のミリ秒） */
  expiresAt: z.number(),
});
export type Session = z.infer<typeof Session>;

/** ルームそのもの（キー: "room"） */
export const RoomRecord = z.object({
  name: RoomName,
  rule: GameRule,
  prizes: PrizeCount.nullable(),
  status: RoomStatus,
  maxPlayers: z.number().int().positive(),
  createdAt: z.number(),
  host: Session,
});
export type RoomRecord = z.infer<typeof RoomRecord>;

/** 参加者（キー: "player:<ID>"） */
export const PlayerRecord = z.object({
  id: PlayerId,
  name: PlayerName,
  /** 名前の重複の判定に使う形（nameKey） */
  nameKey: z.string(),
  session: Session,
  card: Card,
  /** ホストに外されたか（外された人も記録は残し、同じ端末からの参加し直しを断る） */
  kicked: z.boolean(),
  joinedAt: z.number(),
});
export type PlayerRecord = z.infer<typeof PlayerRecord>;

/** 送りすぎで切った人の、つなぎ直しを受け付けない期限（キー: "blocked:<接続の目印>"。UNIX 時刻のミリ秒） */
export const BlockedUntil = z.number();

export const ROOM_KEY = "room";
export const PLAYER_KEY_PREFIX = "player:";
export const playerKey = (id: PlayerId) => `${PLAYER_KEY_PREFIX}${id}`;
export const BLOCKED_KEY_PREFIX = "blocked:";
export const blockedKey = (tag: string) => `${BLOCKED_KEY_PREFIX}${tag}`;

/** WebSocket の接続に付けておく「この接続は誰か」（休止から戻っても残る） */
export const Attachment = z.discriminatedUnion("role", [
  z.object({ role: z.literal("host") }),
  z.object({ role: z.literal("player"), id: PlayerId }),
]);
export type Attachment = z.infer<typeof Attachment>;
