import type { CardLayout, GameRule } from "@bingo/game";

// ルールの見せ方。モード選択の「基本ルール」と、ルールを一言で表す文言
// （募集開始の前の表示と、プレイヤーのメニューの「ルールの確認」で共通に使う）

/** 基本ルール（モード選択画面で選ぶ入口。カードの大きさと勝ち方の値をまとめて入れる） */
export const BASIC_RULES = {
  normal: {
    label: "通常",
    description: "5×5 のカードで、ビンゴをそろえた人から景品をもらう",
    rule: { layout: "5x5", win: { type: "bingo", prizeLines: 1 } },
  },
  speed: {
    label: "スピード",
    description: "9マス（3×3）のカードで、早く決着がつく",
    rule: { layout: "3x3", win: { type: "bingo", prizeLines: 1 } },
  },
  reverse: {
    label: "逆ビンゴ",
    description: "ビンゴしたら脱落。最後まで残った人が景品をもらう",
    rule: { layout: "5x5", win: { type: "reverse" } },
  },
} as const satisfies Record<
  string,
  { label: string; description: string; rule: GameRule }
>;

export type BasicRule = keyof typeof BASIC_RULES;

export const LAYOUT_LABEL: Record<CardLayout, string> = {
  "5x5": "5×5",
  "3x3": "9マス",
};

/** ルールを一言で表す（例:「逆ビンゴ・9マス（1本そろったら脱落）」） */
export function ruleSummary(rule: GameRule): string {
  const layout = LAYOUT_LABEL[rule.layout];
  switch (rule.win.type) {
    case "bingo":
      return `通常・${layout}（ビンゴ ${String(rule.win.prizeLines)} 本で景品）`;
    case "reverse":
      return `逆ビンゴ・${layout}（1本そろったら脱落）`;
  }
}
