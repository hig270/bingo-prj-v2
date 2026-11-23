import {
  BingoNumber,
  cellOf,
  generateCard,
  initialMask,
  openCell,
  type CellMask,
} from "@bingo/game";
import { describe, expect, it } from "vitest";
import {
  CHAT_TEXTS,
  FORGOT_TEXT,
  acceptSpeech,
  hasForgotten,
  pickChat,
  visibleSpeech,
  type TimedSpeech,
} from "./speech";

const card = generateCard("5x5", () => 0.5);
const n = (value: number) => BingoNumber.parse(value);
// カードにある番号と、ない番号
const onCard = card.cells.filter((c): c is BingoNumber => c !== null);
function nth(i: number): BingoNumber {
  const v = onCard[i];
  if (v === undefined) throw new Error("カードの番号が足りない");
  return v;
}
const [a, b, c] = [nth(0), nth(1), nth(2)];
const offCard = Array.from({ length: 75 }, (_, i) => n(i + 1)).find(
  (v) => !onCard.includes(v),
);
if (offCard === undefined) throw new Error("カードにない番号がない");

function opened(...numbers: BingoNumber[]): CellMask {
  return numbers.reduce((mask, v) => {
    const cell = cellOf(card, v);
    if (cell === null) throw new Error("カードにない番号");
    return openCell(mask, cell);
  }, initialMask("5x5"));
}

describe("hasForgotten", () => {
  it("番号が公開されたあとは、最新の1つを数えない", () => {
    expect(hasForgotten(card, [a], opened(), false)).toBe(false);
    expect(hasForgotten(card, [offCard, a], opened(), false)).toBe(false);
  });

  it("抽選中は、公開済みの番号すべてを数える", () => {
    expect(hasForgotten(card, [a], opened(), true)).toBe(true);
    expect(hasForgotten(card, [a], opened(a), true)).toBe(false);
  });

  it("次の番号が公開されても、開け忘れは残る", () => {
    expect(hasForgotten(card, [a, b], opened(b), false)).toBe(true);
  });

  it("カードにない番号は開け忘れにならない", () => {
    expect(hasForgotten(card, [offCard, offCard], opened(), true)).toBe(false);
  });

  it("全部開ければ消える", () => {
    expect(hasForgotten(card, [a, b, c], opened(a, b), false)).toBe(false);
    expect(hasForgotten(card, [a, b, c], opened(a, b), true)).toBe(true);
    expect(hasForgotten(card, [a, b, c], opened(a, b, c), true)).toBe(false);
  });
});

function speech(kind: TimedSpeech["kind"], id = 1): TimedSpeech {
  return { id, kind, text: kind, mood: "talk" };
}

describe("acceptSpeech", () => {
  it("同じか上の順位なら入れ替える", () => {
    expect(acceptSpeech(speech("chat"), speech("chat", 2), false)?.id).toBe(2);
    expect(acceptSpeech(speech("number"), speech("event", 2), false)?.id).toBe(
      2,
    );
    expect(acceptSpeech(speech("event"), speech("event", 2), false)?.id).toBe(
      2,
    );
  });

  it("下の順位なら出さない", () => {
    expect(acceptSpeech(speech("event"), speech("number", 2), false)?.id).toBe(
      1,
    );
    expect(acceptSpeech(speech("number"), speech("chat", 2), false)?.id).toBe(
      1,
    );
  });

  it("開け忘れが出ている間は、番号と雑談を出さない", () => {
    expect(acceptSpeech(null, speech("number"), true)).toBeNull();
    expect(acceptSpeech(null, speech("chat"), true)).toBeNull();
  });

  it("開け忘れが出ていても、自分の出来事は出す", () => {
    expect(acceptSpeech(null, speech("event"), true)?.kind).toBe("event");
  });
});

describe("visibleSpeech", () => {
  it("何もなければ出さない", () => {
    expect(visibleSpeech(null, false)).toBeNull();
  });

  it("開け忘れは、自分の出来事より下で、番号より上", () => {
    expect(visibleSpeech(null, true)?.text).toBe(FORGOT_TEXT);
    expect(visibleSpeech(speech("number"), true)?.text).toBe(FORGOT_TEXT);
    expect(visibleSpeech(speech("event"), true)?.text).toBe("event");
  });

  it("開け忘れのときは知らせる表情にする", () => {
    expect(visibleSpeech(null, true)?.mood).toBe("alert");
  });
});

describe("pickChat", () => {
  it("前と同じものを選ばず、すべての文言を選びうる", () => {
    for (let last = 0; last < CHAT_TEXTS.length; last++) {
      const picked = new Set<number>();
      for (let k = 0; k < CHAT_TEXTS.length - 1; k++) {
        picked.add(pickChat(last, () => k / (CHAT_TEXTS.length - 1)).index);
      }
      expect(picked.has(last)).toBe(false);
      expect(picked.size).toBe(CHAT_TEXTS.length - 1);
    }
  });

  it("最初はどれでも選ぶ", () => {
    expect(pickChat(null, () => 0)).toEqual({ index: 0, text: "雑談1" });
    expect(pickChat(null, () => 0.999)).toEqual({ index: 8, text: "雑談9" });
  });
});
