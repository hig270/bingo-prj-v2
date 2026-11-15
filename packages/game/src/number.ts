import { z } from "zod";

/** ビンゴの番号（1〜75）。ただの number と取り違えられないよう区別した型にする */
export const BingoNumber = z
  .number()
  .int()
  .min(1)
  .max(75)
  .brand<"BingoNumber">();
export type BingoNumber = z.infer<typeof BingoNumber>;
