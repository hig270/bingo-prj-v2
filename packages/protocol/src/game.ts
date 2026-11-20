import { BingoNumber, Card, CellMask } from "@bingo/game";
import { z } from "zod";
import { PlayerId } from "./ids";
import { PlayerName } from "./text";

// ゲーム中と終了後に画面へ送る状態（つないだ直後・開始・終了のときに送る全体の状態）

/**
 * 抽選回（1 始まり）。ホストが抽選ボタンを押した瞬間で区切る。
 * k 回目の抽選が始まってから k+1 回目が始まるまでに景品獲得ラインに達した人は、k 回目の景品獲得になる
 * （1 回目の抽選の前に達することはないので 1 以上）
 */
export const DrawRound = z.number().int().positive();
export type DrawRound = z.infer<typeof DrawRound>;

/** 順位（1 始まり。同順位の人は同じ値） */
export const Rank = z.number().int().positive();
export type Rank = z.infer<typeof Rank>;

/**
 * 結果画面の1行での扱い。
 * - prize: 景品を取った（達した抽選回の早い順。同じ回は同順位）
 * - ranked: 景品を取れなかった（終了時点の期待抽選回数の小さい順。順位は景品を取った人の続きから数える）
 * - idle: 終了時に放置していた（順位を付けずに一番下にまとめる。decisions.md 手順4「放置している人」）
 */
export const ResultStanding = z.discriminatedUnion("type", [
  z.object({ type: z.literal("prize"), round: DrawRound, rank: Rank }),
  z.object({ type: z.literal("ranked"), rank: Rank }),
  z.object({ type: z.literal("idle") }),
]);
export type ResultStanding = z.infer<typeof ResultStanding>;

/** 結果画面の1行 */
export const ResultEntry = z.object({
  id: PlayerId,
  name: PlayerName,
  standing: ResultStanding,
});
export type ResultEntry = z.infer<typeof ResultEntry>;

/** 結果画面などに出すカード（プレイヤーが開けた状態で見せる） */
export const ShownCard = z.object({
  id: PlayerId,
  name: PlayerName,
  card: Card,
  opened: CellMask,
});
export type ShownCard = z.infer<typeof ShownCard>;

/**
 * 並べるカードの枚数の上限（結果画面の最下位のカードと、ホスト画面の上位・下位のカード。
 * 同順位の人が多いときは、残りを「ほか ○ 人」と添える）
 */
export const MAX_SHOWN_CARDS = 3;

/**
 * 結果。entries は、景品を取った人 → 取れなかった人（順位つき）→ 放置していた人 の順。
 * lowest は最下位の人のカード（同順位なら参加した順に MAX_SHOWN_CARDS 枚まで。more はそれ以外の同順位の人数）。
 * 景品を取れなかった人がいない（全員が取った・全員が放置していた）ときは null
 */
export const Results = z.object({
  entries: z.array(ResultEntry),
  lowest: z
    .object({
      cards: z.array(ShownCard).max(MAX_SHOWN_CARDS),
      more: z.number().int().nonnegative(),
    })
    .nullable(),
});
export type Results = z.infer<typeof Results>;

/** ホスト画面のランキング表に載せる人数の上限 */
export const RANKING_ROWS = 10;

/** ホスト画面のランキング表の1行 */
export const RankingRow = z.object({
  id: PlayerId,
  name: PlayerName,
  rank: Rank,
  /** 景品獲得ラインに達するまでの期待抽選回数（A） */
  expected: z.number().nonnegative(),
  /** 完成したラインの本数 */
  lines: z.number().int().nonnegative(),
  /** リーチのラインの本数 */
  reach: z.number().int().nonnegative(),
  /** 開けたマスの数（FREE は数えない） */
  opened: z.number().int().nonnegative(),
  /** 次の抽選で景品獲得ラインに達する確率（0 〜 1。景品獲得ラインが1本なら B、2本以上なら G と同じ値） */
  nextPrize: z.number().min(0).max(1),
});
export type RankingRow = z.infer<typeof RankingRow>;

/** ホスト画面の上位・下位のカード（ランキングの順位つき） */
export const RankedCard = ShownCard.extend({ rank: Rank });
export type RankedCard = z.infer<typeof RankedCard>;

/**
 * ホスト画面の上位または下位のカード（decisions.md 手順4「ホスト画面の上位・下位のカード」）。
 * cards はランキング表と同じ並び（順位の高い順。同順位は参加した順）。
 * moreTied は、境目で同順位をまたいだときに、カードを出さなかった同順位の人数
 */
export const PickedCards = z.object({
  cards: z.array(RankedCard).max(MAX_SHOWN_CARDS),
  moreTied: z.number().int().nonnegative(),
});
export type PickedCards = z.infer<typeof PickedCards>;

/**
 * ホスト画面のランキング（順位を争っている人＝景品をまだ取っておらず、放置もしていない人だけ）。
 * rows は上位 RANKING_ROWS 人（同順位は参加した順）。moreTied は、最後の行と同順位なのに載らなかった人数。
 * contenders は順位を争っている人数。top と bottom は上位・下位のカード（出す人がいなければ cards が空）
 */
export const HostRanking = z.object({
  rows: z.array(RankingRow).max(RANKING_ROWS),
  moreTied: z.number().int().nonnegative(),
  contenders: z.number().int().nonnegative(),
  top: PickedCards,
  bottom: PickedCards,
});
export type HostRanking = z.infer<typeof HostRanking>;

/**
 * プレイヤー本人の順位（D）。
 * - contending: 順位を争っている（of は順位を争っている人数）
 * - idle: 放置している（順位は「—」。マスを開ければ戻る）
 * - won: 景品を取った（確定した順位）
 */
export const PlayerStanding = z.discriminatedUnion("status", [
  z.object({ status: z.literal("contending"), rank: Rank, of: Rank }),
  z.object({ status: z.literal("idle") }),
  z.object({ status: z.literal("won"), rank: Rank }),
]);
export type PlayerStanding = z.infer<typeof PlayerStanding>;

/** ホストに送る、ゲームの進み具合 */
export const HostPhase = z.discriminatedUnion("status", [
  z.object({ status: z.literal("lobby") }),
  z.object({
    status: z.literal("playing"),
    /** スマホに公開した抽選番号（抽選した順） */
    draws: z.array(BingoNumber),
    /** 景品を獲得した人数 */
    prizeWinners: z.number().int().nonnegative(),
    ranking: HostRanking,
  }),
  z.object({
    status: z.literal("finished"),
    draws: z.array(BingoNumber),
    results: Results,
  }),
]);
export type HostPhase = z.infer<typeof HostPhase>;

/** プレイヤーに送る、ゲームの進み具合 */
export const PlayerPhase = z.discriminatedUnion("status", [
  z.object({ status: z.literal("lobby") }),
  z.object({
    status: z.literal("playing"),
    /** 公開された抽選番号（抽選した順） */
    draws: z.array(BingoNumber),
    /** 抽選中か（ホストが抽選を押してから番号が公開されるまで。この間はマスを押せない） */
    drawing: z.boolean(),
    /** 開けたマス（FREE を含む） */
    opened: CellMask,
    /** 景品獲得ラインに達した抽選回。まだなら null */
    prizeRound: DrawRound.nullable(),
    standing: PlayerStanding,
  }),
  z.object({
    status: z.literal("finished"),
    draws: z.array(BingoNumber),
    opened: CellMask,
    results: Results,
  }),
]);
export type PlayerPhase = z.infer<typeof PlayerPhase>;

/** プレイヤー本人の情報（カードは参加したときに決まる） */
export const PlayerSelf = z.object({
  id: PlayerId,
  name: PlayerName,
  card: Card,
});
export type PlayerSelf = z.infer<typeof PlayerSelf>;
