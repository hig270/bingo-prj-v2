// トークン（参加の記録。Cookie に入れる値）の作成とハッシュ値。
// 決まりは decisions.md「プレイヤーの再接続」の節（一般的な名前ではセッション ID）

/** Cookie の名前（ホストとプレイヤーで分ける） */
export const COOKIE = { host: "bingo_host", player: "bingo_player" } as const;

/** トークンの有効期限（3 時間。ゲーム開始のときに延長する） */
export const TOKEN_TTL_SECONDS = 3 * 60 * 60;

/** URL に使える文字で表した乱数（bytes バイト） */
export function randomString(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/** 推測できないトークン（256 ビットの乱数） */
export function newToken(): string {
  return randomString(32);
}

/** トークンのハッシュ値（SHA-256 の16進数）。サーバーはトークンそのものではなくこれを保存する */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 0 以上 n 未満の整数を、偏りなく返す暗号用の乱数（ルーム ID を作るのに使う） */
export function secureRandomIndex(n: number): number {
  // 2^32 を n で割り切れる範囲だけを使い、はみ出たら引き直す（偏りを出さないため）
  const limit = Math.floor(2 ** 32 / n) * n;
  for (;;) {
    const [x = 0] = crypto.getRandomValues(new Uint32Array(1));
    if (x < limit) return x % n;
  }
}

/** 0 以上 1 未満の暗号用の乱数（カードを作るのに使う） */
export function secureRandom(): number {
  const [x = 0] = crypto.getRandomValues(new Uint32Array(1));
  return x / 2 ** 32;
}
