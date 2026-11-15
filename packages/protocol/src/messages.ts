import { BingoNumber, CellIndex } from "@bingo/game";
import { z } from "zod";

// WebSocket で送るメッセージは、type で種類を見分ける「判別可能なユニオン型」で表す。
// ここはまだサンプル。実際のメッセージは機能を作りながら足していく。

/** クライアント → サーバー */
export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tap"), cell: CellIndex }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** サーバー → クライアント */
export const ServerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("drawn"), number: BingoNumber }),
  z.object({
    type: z.literal("tapRejected"),
    reason: z.enum(["notDrawn", "alreadyOpen"]),
  }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
