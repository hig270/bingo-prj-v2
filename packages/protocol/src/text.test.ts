import { describe, expect, it } from "vitest";
import { PlayerName, RoomName, countGraphemes, nameKey } from "./text";

const name = (raw: string) => PlayerName.parse(raw);

describe("PlayerName", () => {
  it("前後の空白を取り除き、途中の空白を1つにまとめる", () => {
    expect(name("  山田　 太郎  ")).toBe("山田 太郎");
  });

  it("空・空白だけの名前は受け付けない", () => {
    expect(PlayerName.safeParse("").success).toBe(false);
    expect(PlayerName.safeParse(" 　 ").success).toBe(false);
  });

  it("12 文字までは受け付け、13 文字は受け付けない", () => {
    expect(PlayerName.safeParse("あ".repeat(12)).success).toBe(true);
    expect(PlayerName.safeParse("あ".repeat(13)).success).toBe(false);
  });

  it("絵文字や濁点付きの文字は1文字と数える", () => {
    // 家族の絵文字（複数の文字をゼロ幅接合子でつないだもの）と、「か」＋濁点の組み合わせ
    const family = "👨\u200d👩\u200d👧";
    const ga = "か\u3099";
    expect(countGraphemes(family)).toBe(1);
    expect(countGraphemes(ga)).toBe(1);
    expect(PlayerName.safeParse(family.repeat(12)).success).toBe(true);
    expect(PlayerName.safeParse(ga.repeat(12)).success).toBe(true);
  });

  it("改行や見えない文字を含む名前は受け付けない", () => {
    expect(PlayerName.safeParse("たろ\u0007う").success).toBe(false);
    // 文字の向きを右から左に変える文字
    expect(PlayerName.safeParse("たろう\u202e").success).toBe(false);
    // ゼロ幅の空白
    expect(PlayerName.safeParse("たろう\u200b").success).toBe(false);
  });

  it("1文字に結合文字を重ねすぎた名前は受け付けない（表示が上下にはみ出すため）", () => {
    // a に結合文字（U+0301）を 5000 個。見た目は1文字と数えられる
    expect(PlayerName.safeParse(`a${"\u0301".repeat(5000)}`).success).toBe(
      false,
    );
    expect(PlayerName.safeParse(`a${"\u0301".repeat(5)}`).success).toBe(false);
    // 4 個までは使える（ベトナム語やタイ語の声調記号など）
    expect(PlayerName.safeParse(`a${"\u0301".repeat(4)}`).success).toBe(true);
    // 濁点を結合文字で書いた「が」（か ＋ U+3099）
    expect(PlayerName.safeParse("か\u3099").success).toBe(true);
  });

  it("極端に長い絵文字の組み合わせは受け付けない。標準の絵文字は使える", () => {
    // 肌の色つきの「キス」（標準の絵文字で一番長い 10 個の組み合わせ）
    const kiss = "👩🏻\u200d❤\ufe0f\u200d💋\u200d👨🏼";
    expect(PlayerName.safeParse(kiss.repeat(12)).success).toBe(true);
    // ゼロ幅接合子で絵文字を 20 個つないだもの（見た目は1文字と数えられる）
    const chain = Array.from({ length: 20 }, () => "😀").join("\u200d");
    expect(PlayerName.safeParse(chain).success).toBe(false);
  });

  it("巨大な入力は、整える前に断る。途中の空白が多いだけの名前は通る", () => {
    const huge = PlayerName.safeParse("あ".repeat(100_000));
    expect(huge.success).toBe(false);
    expect(huge.error?.issues[0]?.message).toBe("12文字以内で入力してください");
    expect(name(`た${" ".repeat(500)}ろう`)).toBe("た ろう");
  });

  it("改行は空白として扱われ、1つにまとめられる", () => {
    expect(name("たろう\nはなこ")).toBe("たろう はなこ");
  });
});

describe("nameKey（重複の判定）", () => {
  it("全角と半角、大文字と小文字、空白の有無の違いをなくす", () => {
    expect(nameKey(name("ﾀﾛｳ"))).toBe(nameKey(name("タロウ")));
    expect(nameKey(name("Taro"))).toBe(nameKey(name("taro")));
    expect(nameKey(name("ＴＡＲＯ"))).toBe(nameKey(name("taro")));
    expect(nameKey(name("山田 太郎"))).toBe(nameKey(name("山田太郎")));
  });

  it("ひらがなとカタカナは区別する", () => {
    expect(nameKey(name("たろう"))).not.toBe(nameKey(name("タロウ")));
  });
});

describe("RoomName", () => {
  it("30 文字までは受け付け、31 文字は受け付けない", () => {
    expect(RoomName.safeParse("あ".repeat(30)).success).toBe(true);
    expect(RoomName.safeParse("あ".repeat(31)).success).toBe(false);
  });
});
