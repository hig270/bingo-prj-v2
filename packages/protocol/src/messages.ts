import { BingoNumber, CellIndex, CellMask, OpenEvent } from "@bingo/game";
import { z } from "zod";
import {
  HostPhase,
  HostRanking,
  PlayerPhase,
  PlayerSelf,
  PlayerStanding,
} from "./game";
import { PlayerId } from "./ids";
import { PlayerSummary, RoomProfile } from "./room";
import { PlayerName } from "./text";

// WebSocket で送るメッセージは、type で種類を見分ける「判別可能なユニオン型」で表す。
// 機能を作りながら足していく（今は「遊べる最小限」の段階の分）

/** クライアント → サーバー */
export const ClientMessage = z.discriminatedUnion("type", [
  /** ホストが参加者を外す */
  z.object({ type: z.literal("kick"), playerId: PlayerId }),
  /** ホストがゲームを始める */
  z.object({ type: z.literal("start") }),
  /** ホストが抽選ボタンを押した */
  z.object({ type: z.literal("draw") }),
  /**
   * ホスト画面で、番号 number の抽選演出が片付けまで終わった（サーバーはこれを受けてスマホに番号を公開する。
   * decisions.md「演出と音」）
   */
  z.object({ type: z.literal("drawShown"), number: BingoNumber }),
  /** ホストがゲームを終える */
  z.object({ type: z.literal("end") }),
  /** プレイヤーがマスを開けた */
  z.object({ type: z.literal("open"), cell: CellIndex }),
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
  /** ホストに、全体の状態を送る（つないだ直後と、ゲームの開始・終了のとき） */
  z.object({
    type: z.literal("hostSnapshot"),
    room: RoomProfile,
    players: z.array(PlayerSummary),
    maxPlayers: z.number().int().positive(),
    phase: HostPhase,
  }),
  /** プレイヤーに、全体の状態を送る（つないだ直後と、ゲームの開始・終了のとき） */
  z.object({
    type: z.literal("playerSnapshot"),
    room: RoomProfile,
    me: PlayerSelf,
    phase: PlayerPhase,
  }),
  /** ホストに: 参加者が増えた */
  z.object({ type: z.literal("playerJoined"), player: PlayerSummary }),
  /** ホストに: 参加者が外された */
  z.object({ type: z.literal("playerRemoved"), playerId: PlayerId }),
  /** ホストに: 抽選した番号（この番号の演出を流す。スマホにはまだ公開していない） */
  z.object({ type: z.literal("drawStarted"), number: BingoNumber }),
  /** ホストに: 参加者のリーチ・ビンゴ・景品獲得（マスを押した順に届く。帯の知らせに流す） */
  z.object({
    type: z.literal("progress"),
    playerId: PlayerId,
    name: PlayerName,
    event: OpenEvent,
  }),
  /** ホストに: ランキング（変化があったときに、0.5 秒ごとにまとめて送る。decisions.md 手順4） */
  z.object({ type: z.literal("ranking"), ranking: HostRanking }),
  /** プレイヤーに: 本人の順位（変わったときだけ、ランキングと同じ間隔で送る） */
  z.object({ type: z.literal("standing"), standing: PlayerStanding }),
  /** プレイヤーに: 抽選が始まった（番号は公開まで送らない。この間はマスを押せない） */
  z.object({ type: z.literal("drawing") }),
  /** プレイヤーに: 抽選番号の公開 */
  z.object({ type: z.literal("numberPublished"), number: BingoNumber }),
  /**
   * プレイヤーに: サーバーが記録している開けたマス。
   * 送ったマスを受け付けなかったとき（まだ公開していない番号など）に、画面の状態をサーバーに合わせるために送る
   */
  z.object({ type: z.literal("cells"), opened: CellMask }),
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
