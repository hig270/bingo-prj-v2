import { LAYOUTS, expectedDraws, expectedKey, maskOf } from "@bingo/game";
import { describe, expect, it } from "vitest";
import { formatChance, formatChanceDetailed, formatExpected } from "./format";

// 画面に出す値は分数なので、整数だけで四捨五入した値（正解）と、小数で計算して丸めた値を照らす。
// 正解: 分子 num ÷ 分母 den を 10^d 倍して四捨五入した整数は floor((2 × 10^d × num + den) / (2 × den))

/** 整数だけで求めた、num/den × scale の四捨五入 */
function exactRound(num: bigint, den: bigint, scale: bigint): bigint {
  return (2n * scale * num + den) / (2n * den);
}

/** n(n-1)…(n-k+1)（確率の計算で使う分母と同じ形） */
function falling(n: number, k: number): bigint {
  let value = 1n;
  for (let i = 0; i < k; i++) value *= BigInt(n - i);
  return value;
}

/** 小数第1位までの文字列（tenths は 10 倍した整数） */
function tenthsText(tenths: bigint): string {
  return `${String(tenths / 10n)}.${String(tenths % 10n)}`;
}

describe("formatChance", () => {
  it("0% と 100% は本当にそのときだけ出す", () => {
    expect(formatChance(0)).toBe("0%");
    expect(formatChance(1)).toBe("100%");
    expect(formatChance(0.001)).toBe("1%未満");
    expect(formatChance(0.999)).toBe("99%超");
  });

  it("それ以外は整数の % に四捨五入する", () => {
    expect(formatChance(0.01)).toBe("1%");
    expect(formatChance(0.324)).toBe("32%");
    expect(formatChance(0.99)).toBe("99%");
    // 小数の誤差で切り捨てになっていた値（残り 40 個で、開けていないマスが 23 個のときの F など）
    expect(formatChance(23 / 40)).toBe("58%");
    expect(formatChance(0.145)).toBe("15%");
  });

  it("確率として出うる分母（残りの番号の数 N で、1〜5 回の抽選）では、どの境目でも整数だけで四捨五入した値と一致する", () => {
    for (let t = 1; t <= 5; t++) {
      for (let n = t; n <= 75; n++) {
        const den = falling(n, t);
        // 各 % の境目（k + 0.5 %）と、「1%未満」「99%超」の境目（1%、99%）の前後の分子を調べる
        const edges = [
          ...Array.from(
            { length: 100 },
            (_, k) => ((2n * BigInt(k) + 1n) * den) / 200n,
          ),
          den / 100n,
          (99n * den) / 100n,
        ];
        for (const middle of edges) {
          for (const num of [middle - 1n, middle, middle + 1n]) {
            if (num <= 0n || num >= den) continue;
            const chance = Number(num) / Number(den);
            const percent = exactRound(num, den, 100n);
            const expected =
              100n * num < den
                ? "1%未満"
                : 100n * num > 99n * den
                  ? "99%超"
                  : `${String(percent)}%`;
            expect(formatChance(chance)).toBe(expected);
          }
        }
      }
    }
  }, 60_000);
});

describe("formatChanceDetailed", () => {
  it("小数第1位までの % に四捨五入する", () => {
    expect(formatChanceDetailed(1 / 43)).toBe("2.3%");
    expect(formatChanceDetailed(0)).toBe("0.0%");
    expect(formatChanceDetailed(1 / 16)).toBe("6.3%");
  });

  it("ホストの表の確率として出うる値（マスの数 ÷ 残りの番号の数）では、整数だけで四捨五入した値と一致する", () => {
    for (let den = 1n; den <= 75n; den++) {
      for (let num = 0n; num <= den; num++) {
        expect(formatChanceDetailed(Number(num) / Number(den))).toBe(
          `${tenthsText(exactRound(num, den, 1000n))}%`,
        );
      }
    }
  });
});

describe("formatExpected", () => {
  /** expected.ts の SCALE（1〜26 の最小公倍数）。期待抽選回数 = (N + 1) × key ÷ SCALE */
  const SCALE = (() => {
    const gcd = (a: bigint, b: bigint): bigint =>
      b === 0n ? a : gcd(b, a % b);
    let l = 1n;
    for (let i = 2n; i <= 26n; i++) l = (l / gcd(l, i)) * i;
    return l;
  })();

  it("9マスのどの形・目標の本数・残りの番号の数でも、整数だけで四捨五入した値と一致する", () => {
    for (let bits = 0; bits < 2 ** 9; bits++) {
      const opened = maskOf(
        [...Array(9).keys()].filter((i) => (bits & (1 << i)) !== 0),
      );
      for (let target = 1; target <= LAYOUTS["3x3"].lines.length; target++) {
        const key = expectedKey("3x3", target, opened);
        if (key === null) continue;
        for (let remaining = 0; remaining <= 45; remaining++) {
          const num = BigInt(remaining + 1) * key;
          expect(formatExpected(expectedDraws(key, remaining))).toBe(
            tenthsText(exactRound(num, SCALE, 10n)),
          );
        }
      }
    }
  }, 60_000);

  it("ちょうど半分は切り上げる", () => {
    expect(formatExpected(12.25)).toBe("12.3");
    expect(formatExpected(0.05)).toBe("0.1");
  });
});
