import { GameRule } from "@bingo/game";
import { z } from "zod";
import { PlayerId, RoomId } from "./ids";
import { PlayerName, RoomName } from "./text";

// ルームの設定と、HTTP の API でやり取りする形

/** 景品の数（1〜999 個） */
export const PrizeCount = z
  .number({ error: "数を入力してください" })
  .int({ error: "1〜999 の整数で入力してください" })
  .min(1, { error: "1〜999 の整数で入力してください" })
  .max(999, { error: "1〜999 の整数で入力してください" });

/**
 * ルームを作るときに送る設定（ゲーム設定画面の内容）。
 * 景品の数は、通常モードでは任意（null）、逆ビンゴでは必須
 */
export const RoomSettings = z
  .object({
    name: RoomName,
    rule: GameRule,
    prizes: PrizeCount.nullable(),
  })
  .refine((s) => s.rule.win.type !== "reverse" || s.prizes !== null, {
    error: "逆ビンゴでは景品の数が必要です",
    path: ["prizes"],
  });
export type RoomSettings = z.infer<typeof RoomSettings>;

/** ルームの進み具合（募集中・ゲーム中・終了） */
export const RoomStatus = z.enum(["lobby", "playing", "finished"]);
export type RoomStatus = z.infer<typeof RoomStatus>;

/** ルームの設定のうち、画面に見せるもの（進み具合を除く） */
export const RoomProfile = z.object({
  name: RoomName,
  rule: GameRule,
  prizes: PrizeCount.nullable(),
});
export type RoomProfile = z.infer<typeof RoomProfile>;

/** 参加画面などに出す、ルームの公開情報 */
export const RoomInfo = RoomProfile.extend({ status: RoomStatus });
export type RoomInfo = z.infer<typeof RoomInfo>;

/** 参加者の公開情報（ホストの募集画面の一覧に出す） */
export const PlayerSummary = z.object({
  id: PlayerId,
  name: PlayerName,
});
export type PlayerSummary = z.infer<typeof PlayerSummary>;

/**
 * 画面を開いた人が誰か（Cookie のトークンからサーバーが判断する）。
 * - host: このルームのホスト
 * - player: 参加済みのプレイヤー
 * - kicked: ホストに外された（同じ端末からは参加し直せない）
 * - none: まだ参加していない
 */
export const Me = z.discriminatedUnion("role", [
  z.object({ role: z.literal("host") }),
  z.object({
    role: z.literal("player"),
    id: PlayerId,
    name: PlayerName,
  }),
  z.object({ role: z.literal("kicked") }),
  z.object({ role: z.literal("none") }),
]);
export type Me = z.infer<typeof Me>;

/** GET /r/<ルームID>/api/me の応答 */
export const MeResponse = z.object({ room: RoomInfo, me: Me });
export type MeResponse = z.infer<typeof MeResponse>;

/** ルームを作れなかった理由 */
export const CreateRoomError = z.enum([
  "invalidSettings", // 設定が決まりに合わない（画面とサーバーの版が違うときに起きる）
  "busy", // ルーム ID を何度作り直しても、空いている ID が見つからなかった
]);
export type CreateRoomError = z.infer<typeof CreateRoomError>;

/** POST /api/rooms の応答（成功ならルーム ID、失敗なら理由。参加の応答と同じく ok で見分ける） */
export const CreateRoomResponse = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), roomId: RoomId }),
  z.object({ ok: z.literal(false), error: CreateRoomError }),
]);
export type CreateRoomResponse = z.infer<typeof CreateRoomResponse>;

/** POST /r/<ルームID>/api/join で送るもの */
export const JoinRequest = z.object({ name: z.string() });

/** 参加を断った理由 */
export const JoinError = z.enum([
  "invalidName", // 名前の決まりに合わない
  "nameTaken", // 同じ名前の人がいる
  "roomFull", // 参加人数の上限に達している
  "started", // ゲームがすでに始まっている
  "kicked", // ホストに外された端末
  "alreadyJoined", // この端末はすでに参加している
]);
export type JoinError = z.infer<typeof JoinError>;

/** POST /r/<ルームID>/api/join の応答 */
export const JoinResponse = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), id: PlayerId, name: PlayerName }),
  z.object({ ok: z.literal(false), error: JoinError }),
]);
export type JoinResponse = z.infer<typeof JoinResponse>;

/**
 * POST /r/<ルームID>/api/extend の応答。参加の記録（Cookie）の期限を延ばしたかどうか
 * （ゲームの開始より前に発行した記録だけを延ばす。decisions.md「プレイヤーの再接続」）
 */
export const ExtendResponse = z.object({
  host: z.boolean(),
  player: z.boolean(),
});
export type ExtendResponse = z.infer<typeof ExtendResponse>;
