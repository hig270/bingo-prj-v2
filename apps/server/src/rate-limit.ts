/**
 * 接続ごとの送信回数の制限（トークンバケット）。decisions.md「技術スタック・基盤」の ② を参照。
 *
 * 回数券のたとえ: 最初に CAPACITY 枚持ち、メッセージ1つで1枚使い、毎秒 REFILL_PER_SECOND 枚ずつ補充される
 * （上限は CAPACITY 枚）。0 枚のときに来たメッセージは捨てる。
 * DROP_WINDOW_MS の間に DROP_LIMIT 回捨てたら、切断する。
 *
 * 時刻は外から渡す（テストで固定できるように）
 */
export const RATE_LIMIT = {
  CAPACITY: 10,
  REFILL_PER_SECOND: 2,
  DROP_LIMIT: 10,
  DROP_WINDOW_MS: 10_000,
} as const;

/** メッセージを受け取ったときの判定 */
export type RateDecision = "accept" | "drop" | "disconnect";

export class RateLimiter {
  private tokens: number = RATE_LIMIT.CAPACITY;
  private updatedAt: number;
  /** 捨てた時刻（DROP_WINDOW_MS より古いものは消す） */
  private drops: number[] = [];

  constructor(now: number) {
    this.updatedAt = now;
  }

  /** メッセージを1つ受け取った。受け付けるか・捨てるか・切断するかを返す */
  take(now: number): RateDecision {
    const elapsed = Math.max(0, now - this.updatedAt) / 1000;
    this.tokens = Math.min(
      RATE_LIMIT.CAPACITY,
      this.tokens + elapsed * RATE_LIMIT.REFILL_PER_SECOND,
    );
    this.updatedAt = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return "accept";
    }
    this.drops = this.drops.filter((t) => now - t < RATE_LIMIT.DROP_WINDOW_MS);
    this.drops.push(now);
    return this.drops.length >= RATE_LIMIT.DROP_LIMIT ? "disconnect" : "drop";
  }
}
