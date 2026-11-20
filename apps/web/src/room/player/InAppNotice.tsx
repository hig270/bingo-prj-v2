import type { RoomId } from "@bingo/protocol";
import { useState } from "react";
import ui from "../../ui/ui.module.scss";
import { isInAppBrowser } from "../in-app-browser";
import styles from "./player.module.scss";

/**
 * アプリの中のブラウザで開いたときに、参加画面に出す案内（decisions.md 手順5の (a) の (4)）。
 * 参加は止めない。URL をコピーして Safari / Chrome に貼り付ければ、どのアプリからでも同じ手順で移れる。
 * コピーが使えないときのために、URL の文字も出して長押しで選べるようにする
 */
export function InAppNotice({ roomId }: { readonly roomId: RoomId }) {
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  if (!isInAppBrowser(navigator.userAgent)) return null;
  const url = `${location.origin}/r/${roomId}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopy("done");
    } catch {
      // アプリの中のブラウザでは、コピーが使えないことがある
      setCopy("failed");
    }
  }

  return (
    <section className={ui.card}>
      <p>Safari / Chrome で開くと、閉じても戻りやすくなります。</p>
      <p className={styles.copyUrl}>{url}</p>
      <div>
        <button
          type="button"
          className={`${ui.button} ${ui.secondary}`}
          onClick={() => void copyUrl()}
        >
          URL をコピー
        </button>
      </div>
      {copy === "done" && (
        <p className={ui.muted}>
          コピーしました。Safari / Chrome
          を開いて、アドレス欄に貼り付けてください。
        </p>
      )}
      {copy === "failed" && (
        <p className={ui.muted}>
          コピーできませんでした。上の URL を長押しして選んでください。
        </p>
      )}
    </section>
  );
}
