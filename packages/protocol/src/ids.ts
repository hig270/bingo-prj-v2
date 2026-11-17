import { z } from "zod";

/**
 * ルーム ID に使う文字。紛らわしい 0・O・1・I・L を除いた大文字の英字と数字（31 文字）。
 * 決まりは decisions.md「保存方法」の節（ルーム ID）
 */
export const ROOM_ID_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** ルーム ID の長さ */
export const ROOM_ID_LENGTH = 6;

/**
 * ルーム ID（例: K7MQ4P）。小文字で打っても入れるよう、確かめる前に大文字にそろえる
 */
export const RoomId = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .length(ROOM_ID_LENGTH)
      .regex(new RegExp(`^[${ROOM_ID_ALPHABET}]+$`), {
        error: "ルーム ID に使えない文字がある",
      }),
  )
  .brand<"RoomId">();
export type RoomId = z.infer<typeof RoomId>;

/**
 * ルーム ID を作る。randomIndex(n) は 0 以上 n 未満の整数を偏りなく返す乱数
 * （サーバーでは暗号用の乱数を使う。テストでは固定できる）
 */
export function generateRoomId(randomIndex: (n: number) => number): RoomId {
  let id = "";
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += ROOM_ID_ALPHABET.charAt(randomIndex(ROOM_ID_ALPHABET.length));
  }
  return RoomId.parse(id);
}

/** プレイヤーの ID（ルームの中で参加者を見分ける。サーバーが作る短い乱数の文字列） */
export const PlayerId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,32}$/)
  .brand<"PlayerId">();
export type PlayerId = z.infer<typeof PlayerId>;
