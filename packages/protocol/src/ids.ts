import { z } from "zod";

/** ルームの ID。形式（長さ・使う文字）はルーム作成の実装時に確定する */
export const RoomId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/)
  .brand<"RoomId">();
export type RoomId = z.infer<typeof RoomId>;
