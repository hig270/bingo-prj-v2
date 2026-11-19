import type { GameRule, OpenEvent } from "@bingo/game";

// リーチ・ビンゴ・景品獲得の知らせの文言（decisions.md「3（遊べる最小限）の範囲」の細かい作り）

/** 一度にそろったラインの本数に応じた「ビンゴ!」の言い方 */
export function bingoWord(newLines: number): string {
  switch (newLines) {
    case 1:
      return "ビンゴ!";
    case 2:
      return "ダブルビンゴ!";
    case 3:
      return "トリプルビンゴ!";
    case 4:
      // 9マスの中央は、縦・横・斜め2本の 4 本が一度にそろうことがある
      return "クアドラビンゴ!";
    default:
      // 1マスが入るラインは最大 4 本なので、ここには来ない（念のため本数で言う）
      return `${String(newLines)}本同時ビンゴ!`;
  }
}

/** ホスト画面の帯に流す文言（例:「たろう ビンゴ! (1/2)」） */
export function hostNoticeText(
  name: string,
  event: OpenEvent,
  rule: GameRule,
): string {
  switch (event.type) {
    case "reach":
      return `${name} リーチ!`;
    case "bingo": {
      const word = bingoWord(event.newLines);
      if (event.prize) return `${name} ${word} 景品獲得!`;
      // 景品獲得ライン未満のビンゴは、進み具合を添えて景品獲得と見分けられるようにする
      return rule.win.type === "bingo"
        ? `${name} ${word} (${String(event.lines)}/${String(rule.win.prizeLines)})`
        : `${name} ${word}`;
    }
  }
}

/** プレイヤーの画面に出す文言（例:「ビンゴ! あと1本で景品」） */
export function playerNoticeText(event: OpenEvent, rule: GameRule): string {
  switch (event.type) {
    case "reach":
      return "リーチ!";
    case "bingo": {
      const word = bingoWord(event.newLines);
      if (event.prize) {
        return event.newLines === 1 ? "景品獲得!" : `${word} 景品獲得!`;
      }
      const rest =
        rule.win.type === "bingo" ? rule.win.prizeLines - event.lines : 0;
      return rest > 0 ? `${word} あと${String(rest)}本で景品` : word;
    }
  }
}
