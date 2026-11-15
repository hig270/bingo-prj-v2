import { DurableObject } from "cloudflare:workers";

/**
 * ルームの Durable Object（1ルーム＝1インスタンス）。
 * Worker からは RPC（このクラスのメソッドを直接呼ぶ）で呼び出す。
 * WebSocket の接続開始だけは fetch で受ける（段階4以降で実装）。
 */
export class RoomDO extends DurableObject<Env> {
  /** 動作確認用の RPC。後で消す */
  ping(): string {
    return "pong";
  }
}
