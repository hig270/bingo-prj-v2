import { describe, expect, it } from "vitest";
import { formatChance, formatChanceDetailed } from "./format";

describe("formatChance", () => {
  it("0% と 100% は本当にそのときだけ出す", () => {
    expect(formatChance(0)).toBe("0%");
    expect(formatChance(1)).toBe("100%");
    expect(formatChance(0.001)).toBe("1%未満");
    expect(formatChance(0.999)).toBe("99%超");
  });

  it("それ以外は整数の % に丸める", () => {
    expect(formatChance(0.01)).toBe("1%");
    expect(formatChance(0.324)).toBe("32%");
    expect(formatChance(0.325)).toBe("33%");
    expect(formatChance(0.99)).toBe("99%");
  });
});

describe("formatChanceDetailed", () => {
  it("小数第1位までの %", () => {
    expect(formatChanceDetailed(1 / 43)).toBe("2.3%");
    expect(formatChanceDetailed(0)).toBe("0.0%");
  });
});
