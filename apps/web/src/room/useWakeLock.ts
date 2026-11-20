import { useEffect } from "react";

/**
 * active の間、画面が自動で消えないようにする（Screen Wake Lock API。decisions.md 手順5の (a) の (1)）。
 * ほかのアプリに切り替えるなどして画面が裏に回ると、ブラウザが外すので、画面に戻ったらかけ直す。
 * 対応していないブラウザや、断られたとき（電池の節約モードなど）は何もしない（ほかの動きには影響しない）
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;

    const request = async () => {
      if (document.visibilityState !== "visible") return;
      if (lock !== null && !lock.released) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        // 待つ間に画面が外れた、または別の呼び出しが先にかけていたら、今かけた方は外す
        if (disposed || (lock !== null && !lock.released)) {
          void next.release();
          return;
        }
        lock = next;
      } catch {
        // 断られても、画面が消えるようになるだけなので何もしない
      }
    };
    const onVisibility = () => {
      void request();
    };

    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release();
    };
  }, [active]);
}
