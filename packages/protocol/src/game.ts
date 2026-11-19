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

/** 結果画面の1行。景品を取った人は prize に達した抽選回と順位、取れなかった人は null */
export const ResultEntry = z.object({
  id: PlayerId,
  name: PlayerName,
  prize: z
    .object({ round: DrawRound, rank: z.number().int().positive() })
    .nullable(),
});
export type ResultEntry = z.infer<typeof ResultEntry>;

/**
 * 結果。景品を取った人を達した抽選回の順に並べ（同じ回は同順位）、その下に取れなかった人を参加した順に並べる
 * （decisions.md「3（遊べる最小限）の範囲」）
 */
export const Results = z.array(ResultEntry);
export type Results = z.infer<typeof Results>;

/** ホストに送る、ゲームの進み具合 */
export const HostPhase = z.discriminatedUnion("status", [
  z.object({ status: z.literal("lobby") }),
  z.object({
    status: z.literal("playing"),
    /** スマホに公開した抽選番号（抽選した順） */
    draws: z.array(BingoNumber),
    /** 景品を獲得した人数 */
    prizeWinners: z.number().int().nonnegative(),
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
