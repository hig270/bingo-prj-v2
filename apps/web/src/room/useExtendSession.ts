import type { RoomId } from "@bingo/protocol";
import { useEffect } from "react";
import { extendSession } from "../api/http";

/**
 * ゲーム中の画面を開いたら、参加の記録（Cookie）の期限を延ばしてもらう（decisions.md「プレイヤーの再接続」）。
 * 開始の知らせを受け取ったときも、開始の後に画面を開いたときも、ここで1回問い合わせる
 * （延ばすかどうかはサーバーが決める。開始より後に発行・延長した記録は延ばさない）
 */
export function useExtendSession(roomId: RoomId, playing: boolean): void {
  useEffect(() => {
    if (!playing) return;
    // 失敗しても、ゲームはそのまま続けられる（期限が延びないだけ）ので、結果は使わない
    void extendSession(roomId);
  }, [roomId, playing]);
}
