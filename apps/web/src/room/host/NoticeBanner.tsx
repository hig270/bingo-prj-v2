import type { GameRule } from "@bingo/game";
import { useAnimate } from "motion/react";
import { useEffect, useEffectEvent } from "react";
import type { Notice } from "../../state/room";
import { hostNoticeText } from "../notice-text";
import styles from "./NoticeBanner.module.scss";

/** 入ってくる・出ていく長さ（秒） */
const SLIDE_SECONDS = 0.45;
/** 真ん中で止まる長さ（秒） */
const HOLD_SECONDS = 2;

/**
 * リーチ・ビンゴ・景品獲得の知らせを、届いた順に1件ずつ流す帯。
 * 右から入ってきて真ん中で2秒止まり、左へ出ていく。流し終えたら onShown を呼ぶ（次の知らせに進む）
 */
export function NoticeBanner({
  notices,
  rule,
  onShown,
}: {
  readonly notices: readonly Notice[];
  readonly rule: GameRule;
  readonly onShown: (id: number) => void;
}) {
  const head = notices[0];
  return (
    <div className={styles.banner} aria-live="polite">
      {head !== undefined && (
        <NoticeItem key={head.id} notice={head} rule={rule} onShown={onShown} />
      )}
    </div>
  );
}

function NoticeItem({
  notice,
  rule,
  onShown,
}: {
  readonly notice: Notice;
  readonly rule: GameRule;
  readonly onShown: (id: number) => void;
}) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const shown = useEffectEvent(() => {
    onShown(notice.id);
  });

  useEffect(() => {
    const total = SLIDE_SECONDS * 2 + HOLD_SECONDS;
    const controls = animate(
      scope.current,
      { x: ["100%", "0%", "0%", "-100%"] },
      {
        duration: total,
        times: [
          0,
          SLIDE_SECONDS / total,
          (SLIDE_SECONDS + HOLD_SECONDS) / total,
          1,
        ],
        ease: ["easeOut", "linear", "easeIn"],
      },
    );
    // 止めたとき（画面を離れた・開発中の StrictMode の再実行）にも then が呼ばれることがあるので、
    // 止めた後は「流し終えた」と扱わない
    let stopped = false;
    void controls.then(() => {
      if (!stopped) shown();
    });
    return () => {
      stopped = true;
      controls.stop();
    };
  }, [animate, scope]);

  const prize = notice.event.type === "bingo" && notice.event.prize;
  return (
    <div
      ref={scope}
      className={`${styles.item} ${prize ? styles.prize : ""}`}
      style={{ transform: "translateX(100%)" }}
    >
      {hostNoticeText(notice.name, notice.event, rule)}
    </div>
  );
}
