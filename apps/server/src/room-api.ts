import type {
  ExtendResponse,
  JoinResponse,
  MeResponse,
  PlayerName,
  RoomSettings,
} from "@bingo/protocol";

// Worker（app.ts）からルーム（room.ts の RoomDO）を呼ぶときの約束。
// Cloudflare に依存しない型だけで書く（画面側の型チェックが app.ts を読めるように）

/** Worker からルームに渡す、Cookie のトークンのハッシュ値（無ければ null） */
export interface TokenHashes {
  readonly host: string | null;
  readonly player: string | null;
}

/** 参加の結果（HTTP の応答 JoinResponse と同じ形） */
export type JoinResult = JoinResponse;

/** WebSocket の接続を Worker から受け渡すときに、トークンのハッシュ値を載せるヘッダー */
export const HEADER = {
  host: "X-Bingo-Host-Token-Hash",
  player: "X-Bingo-Player-Token-Hash",
} as const;

/** ルームが Worker に用意する操作（RoomDO の RPC と、WebSocket の接続開始の fetch） */
// 関数はプロパティの書き方で宣言する（メソッドの書き方だと、引数の型の食い違いを片方向しか検出しないため）
export interface RoomApi {
  /** ルームを作る。同じ ID のルームが既にあれば false */
  readonly create: (
    settings: RoomSettings,
    hostTokenHash: string,
    now: number,
  ) => Promise<boolean>;
  /** ルームの公開情報と、画面を開いた人が誰か。ルームが無ければ null */
  readonly info: (
    tokens: TokenHashes,
    now: number,
  ) => Promise<MeResponse | null>;
  /** 参加する。ルームが無ければ null */
  readonly join: (
    name: PlayerName,
    tokens: TokenHashes,
    newTokenHash: string,
    now: number,
  ) => Promise<JoinResult | null>;
  /** ゲームの開始の後で、参加の記録の期限を延ばす。ルームが無ければ null */
  readonly extend: (
    tokens: TokenHashes,
    now: number,
  ) => Promise<ExtendResponse | null>;
  /** WebSocket の接続開始 */
  readonly fetch: (request: Request) => Promise<Response>;
}
