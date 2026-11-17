import { z } from "zod";

// プレイヤーの名前とルーム名の決まり（decisions.md「プレイヤーの名前の決まり」「ゲーム設定の値の範囲」）。
// サーバーで確かめ、画面でも同じ決まりで先に知らせるため、ここに1つだけ置く

/** プレイヤーの名前の最大の長さ（見た目の文字数） */
export const PLAYER_NAME_MAX = 12;
/** ルーム名の最大の長さ（見た目の文字数） */
export const ROOM_NAME_MAX = 30;

/** 空白とみなす文字（半角・全角の空白、タブ、改行など。JavaScript の \s は全角の空白も含む） */
const SPACES = /\s+/gu;

/**
 * 見えない文字・表示を崩す文字。
 * 制御文字（改行など）、行・段落の区切り、書式の文字（文字の向きを変える文字など）。
 * ただし、絵文字の組み合わせに使うゼロ幅接合子（U+200D）は書式の文字でも許す
 */
const INVISIBLE = /[\p{Cc}\p{Zl}\p{Zp}]|(?!\u200d)\p{Cf}/u;

/**
 * 見た目の1文字に重ねてよい結合文字（濁点や声調記号など、前の文字に重なる文字）の数。
 * 日本語は1個、ベトナム語・タイ語でも3個まで。これを超えるのは、文字を上下にはみ出させて表示を崩す使い方
 */
const MAX_MARKS_PER_CHAR = 4;
/**
 * 見た目の1文字を作る文字（符号位置）の数の上限。
 * 標準の絵文字で一番長いもの（肌の色つきの「キス」など）が 10 個。名前の大きさの上限にもなる
 */
const MAX_CODE_POINTS_PER_CHAR = 10;
const MARK = /\p{M}/gu;

/** 前後の空白を取り除き、途中の連続した空白を半角の空白1つにまとめる */
export function tidyText(raw: string): string {
  return raw.replace(SPACES, " ").trim();
}

/** 見た目の1文字ずつに分ける（絵文字や濁点付きの文字も1文字） */
function graphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
  return Array.from(segmenter.segment(text), (s) => s.segment);
}

/** 見た目の文字数（絵文字や濁点付きの文字も1文字と数える） */
export function countGraphemes(text: string): number {
  return graphemes(text).length;
}

/** 文字（符号位置）の数。見た目の文字数ではなく、1文字を作る部品の数を数える */
function countCodePoints(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

/** 見えない文字を含むか */
export function hasInvisible(text: string): boolean {
  return INVISIBLE.test(text);
}

/**
 * 見た目の1文字に、結合文字を重ねすぎた文字や、極端に長い文字の組み合わせがあるか。
 * 見た目の文字数の決まりだけでは、1文字に結合文字をいくつでも重ねられ、表示が崩れる（いわゆる Zalgo 文字）
 */
export function hasOverloadedChar(text: string): boolean {
  return graphemes(text).some(
    (g) =>
      countCodePoints(g) > MAX_CODE_POINTS_PER_CHAR ||
      (g.match(MARK)?.length ?? 0) > MAX_MARKS_PER_CHAR,
  );
}

/** 整えた後の文字列を、長さと見えない文字で確かめる型を作る */
function displayText<B extends string>(max: number, _brand: B) {
  const tooLong = `${String(max)}文字以内で入力してください`;
  // 整える前の入力の大きさの上限（UTF-16 の単位）。決まりを満たす名前の最大（1文字が符号位置 10 個まで、
  // 1個が最大 2 単位）に、まとめる前の空白の余裕を足したもの。巨大な文字列を整えたり数えたりする前に断る
  const rawMax = max * MAX_CODE_POINTS_PER_CHAR * 2 + 1000;
  return z
    .string()
    .max(rawMax, { error: tooLong })
    .transform(tidyText)
    .pipe(
      z
        .string()
        .refine((s) => s.length > 0, { error: "入力してください" })
        .refine((s) => countGraphemes(s) <= max, { error: tooLong })
        .refine((s) => !hasInvisible(s) && !hasOverloadedChar(s), {
          error: "使えない文字が含まれています",
        }),
    )
    .brand<B>();
}

/** プレイヤーの名前（1〜12 文字。整えた後の、表示に使う形） */
export const PlayerName = displayText(PLAYER_NAME_MAX, "PlayerName");
export type PlayerName = z.infer<typeof PlayerName>;

/** ルーム名（1〜30 文字） */
export const RoomName = displayText(ROOM_NAME_MAX, "RoomName");
export type RoomName = z.infer<typeof RoomName>;

/**
 * 名前の重複を判定するための形。全角と半角、大文字と小文字、空白の有無の違いをなくす
 * （「タロウ」と「ﾀﾛｳ」、「Taro」と「taro」、「山田太郎」と「山田 太郎」が同じになる）
 */
export function nameKey(name: PlayerName): string {
  return name.normalize("NFKC").toLowerCase().replace(SPACES, "");
}
