import { BingoNumber, Card, CellMask, GameRule } from "@bingo/game";
import {
  DrawRound,
  PlayerId,
  PlayerName,
  PrizeCount,
  RoomName,
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

/** ゲームの進み具合（ゲームを始めてから） */
const GameRecord = z.object({
  /** 始めた時刻（UNIX 時刻のミリ秒） */
  startedAt: z.number(),
  /** スマホに公開した抽選番号（抽選した順） */
  draws: z.array(BingoNumber),
  /**
   * 抽選したが、まだスマホに公開していない番号（ホスト画面で演出を流している間）。無ければ null。
   * 公開したら draws の最後に移す
   */
  pending: BingoNumber.nullable(),
  /**
   * 放置の判定の区切り。ホストが最後に抽選ボタンかゲーム終了を押した時点で、公開済みだった番号の数
   * （decisions.md 手順4「放置の条件」。番号が出てから次の抽選が始まるまでに開ければ、放置とはみなさない）
   */
  judgedDraws: z.number().int().nonnegative(),
});
export type GameRecord = z.infer<typeof GameRecord>;

/** ルームの進み具合。ゲームの記録は、始めてからだけ持つ */
const Phase = z.discriminatedUnion("status", [
  z.object({ status: z.literal("lobby") }),
  z.object({ status: z.literal("playing"), game: GameRecord }),
  z.object({
    status: z.literal("finished"),
    game: GameRecord,
    /** 終えた時刻（UNIX 時刻のミリ秒） */
    endedAt: z.number(),
  }),
]);
export type Phase = z.infer<typeof Phase>;

/** ルームそのもの（キー: "room"） */
export const RoomRecord = z.object({
  name: RoomName,
  rule: GameRule,
  prizes: PrizeCount.nullable(),
  phase: Phase,
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
  /** 開けたマス（FREE を含む。参加したときは FREE だけ） */
  opened: CellMask,
  /** 景品獲得ラインに達した抽選回。まだなら null */
  prizeRound: DrawRound.nullable(),
  /** 最後にマスを開けた時点で、公開済みだった番号の数（まだ開けていなければ 0。放置の判定に使う） */
  lastOpenDraws: z.number().int().nonnegative(),
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
