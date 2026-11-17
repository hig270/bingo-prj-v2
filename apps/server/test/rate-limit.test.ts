import { describe, expect, it } from "vitest";
import { RATE_LIMIT, RateLimiter } from "../src/rate-limit";

/** start から、interval ミリ秒ごとに count 回送ったときの判定の一覧 */
function sendMany(
  limiter: RateLimiter,
  count: number,
  interval: number,
  start = 0,
) {
  return Array.from({ length: count }, (_, i) =>
    limiter.take(start + i * interval),
  );
}

describe("RateLimiter", () => {
  it("開け忘れの 8 マスを一気に押しても止まらない", () => {
    const results = sendMany(new RateLimiter(0), 8, 0);
    expect(results.every((r) => r === "accept")).toBe(true);
  });

  it("15 マスを 3 秒で押しても止まらない", () => {
    const results = sendMany(new RateLimiter(0), 15, 200);
    expect(results.every((r) => r === "accept")).toBe(true);
  });

  it("容量を超えて一気に送ると、超えた分を捨てる", () => {
    const results = sendMany(new RateLimiter(0), RATE_LIMIT.CAPACITY + 3, 0);
    expect(results.filter((r) => r === "accept")).toHaveLength(
      RATE_LIMIT.CAPACITY,
    );
    expect(results.at(-1)).toBe("drop");
  });

  it("10 秒間に 10 回捨てたら切断する", () => {
    const results = sendMany(new RateLimiter(0), RATE_LIMIT.CAPACITY + 10, 0);
    expect(results.at(-1)).toBe("disconnect");
    expect(results.at(-2)).toBe("drop");
  });

  it("休むと回数が補充される", () => {
    const limiter = new RateLimiter(0);
    sendMany(limiter, RATE_LIMIT.CAPACITY, 0);
    expect(limiter.take(0)).toBe("drop");
    // 1 秒で 2 回分補充される
    expect(limiter.take(1000)).toBe("accept");
    expect(limiter.take(1000)).toBe("accept");
    expect(limiter.take(1000)).toBe("drop");
  });

  it("古い「捨てた」記録は数えない", () => {
    const limiter = new RateLimiter(0);
    sendMany(limiter, RATE_LIMIT.CAPACITY, 0);
    // 9 回捨てる
    sendMany(limiter, 9, 0);
    // 11 秒後: 補充された分を使い切ってから捨てても、古い 9 回は数えない
    sendMany(limiter, RATE_LIMIT.CAPACITY, 0, 11_000);
    expect(limiter.take(11_000)).toBe("drop");
  });
});
