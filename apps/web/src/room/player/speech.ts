import {
  cellOf,
  isOpen,
  type BingoNumber,
  type Card,
  type CellMask,
} from "@bingo/game";
import type { Mood } from "../character/Character";

// キャラクターの吹き出しで何を言うかの決まり（decisions.md 手順5の (b)）。
// 画面から切り離した関数にして、優先順位と開け忘れの判定をテストで確かめる

/**
 * 吹き出しの種類と優先順位（数が大きいほど優先）。
 * - event: 自分の出来事（リーチ・ビンゴ・景品獲得）と「まだ出ていません」
 * - forgot: 開け忘れ（開け忘れがなくなるまで出し続ける）
 * - number: 最新の抽選番号
 * - chat: キャラクターをタップしたときの雑談
 */
const PRIORITY = { chat: 0, number: 1, forgot: 2, event: 3 } as const;
export type SpeechKind = keyof typeof PRIORITY;

/** 数秒で消える吹き出し（開け忘れ以外） */
export interface TimedSpeech {
  /** 出した順の通し番号（同じ文言が続いても出し直せるように） */
  readonly id: number;
  readonly kind: Exclude<SpeechKind, "forgot">;
  readonly text: string;
  readonly mood: Mood;
}

/** 画面に出す吹き出し */
export interface VisibleSpeech {
  /** 吹き出しが入れ替わったことを画面に伝える目印 */
  readonly key: string;
  readonly text: string;
  readonly mood: Mood;
}

export const FORGOT_TEXT = "カードをよく確認しよう！";

/** 雑談の文言（仮。中身はキャラクターを決めるときに書く） */
export const CHAT_TEXTS: readonly string[] = Array.from(
  { length: 9 },
  (_, i) => `雑談${String(i + 1)}`,
);

export function numberText(n: BingoNumber): string {
  return `${String(n)}番！`;
}

/**
 * 開け忘れがあるか。抽選中（ホストが次の抽選を押してから、番号が公開されるまで）は公開済みの番号すべてを、
 * それ以外は最新の1つを除いた番号を数え、カードにあって開けていないものが1つでもあれば true
 */
export function hasForgotten(
  card: Card,
  draws: readonly BingoNumber[],
  opened: CellMask,
  drawing: boolean,
): boolean {
  const counted = drawing ? draws : draws.slice(0, -1);
  return counted.some((n) => {
    const cell = cellOf(card, n);
    return cell !== null && !isOpen(opened, cell);
  });
}

/**
 * 新しい吹き出し incoming を出すかを決め、出しておく吹き出しを返す。
 * 今の吹き出し（current と、開け忘れが出ていればそれ）と同じか上の順位なら入れ替え、下なら出さずに今のものを返す
 */
export function acceptSpeech(
  current: TimedSpeech | null,
  incoming: TimedSpeech,
  forgot: boolean,
): TimedSpeech | null {
  const p = PRIORITY[incoming.kind];
  if (current !== null && p < PRIORITY[current.kind]) return current;
  if (forgot && p < PRIORITY.forgot) return current;
  return incoming;
}

/**
 * 画面に出す吹き出し。数秒で消える吹き出しと開け忘れのうち、順位の高い方を出す
 * （自分の出来事が消えたあと、開け忘れが残っていれば開け忘れに戻る）
 */
export function visibleSpeech(
  timed: TimedSpeech | null,
  forgot: boolean,
): VisibleSpeech | null {
  if (forgot && (timed === null || PRIORITY[timed.kind] < PRIORITY.forgot)) {
    return { key: "forgot", text: FORGOT_TEXT, mood: "alert" };
  }
  if (timed === null) return null;
  return { key: String(timed.id), text: timed.text, mood: timed.mood };
}

/**
 * 雑談を無作為に選ぶ（前と同じものは選ばない）。index は CHAT_TEXTS の位置で、次に選ぶときの last に渡す。
 * 位置から文言を引き損なうことがないよう、文言も一緒に返す
 */
export function pickChat(
  last: number | null,
  random: () => number,
): { readonly index: number; readonly text: string } {
  const pick = (index: number) => {
    const text = CHAT_TEXTS[index];
    if (text === undefined) throw new Error("雑談の位置が範囲の外");
    return { index, text };
  };
  if (last === null) return pick(Math.floor(random() * CHAT_TEXTS.length));
  // 前のもの以外から選ぶ（前の位置より後ろは1つずらす）
  const i = Math.floor(random() * (CHAT_TEXTS.length - 1));
  return pick(i >= last ? i + 1 : i);
}
