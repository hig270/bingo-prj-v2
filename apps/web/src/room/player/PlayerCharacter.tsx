import { AnimatePresence, motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { Character } from "../character/Character";
import styles from "./player.module.scss";
import type { VisibleSpeech } from "./speech";

// 吹き出しの出し方（DS のゲームの吹き出しのように。decisions.md 手順5の (b)）。
// 薄くなったり濃くなったりはさせず、大きさだけを短い時間で変える。
// 出るとき: キャラクターの側から拡大して開き、開き切ってから文字を一度に出す。
// 消えるとき: 先に文字を消し、キャラクターに向かって縮んで消える。
// 別の知らせに入れ替わるとき: 吹き出しはそのままで、文字だけを入れ替える

/** 吹き出しが開く・閉じる長さ（秒） */
const BUBBLE_SECONDS = 0.12;

const bubble: Variants = {
  closed: {
    scale: 0,
    transition: {
      duration: BUBBLE_SECONDS,
      ease: "easeIn",
      // 文字を消してから、ひと呼吸おいて縮む
      when: "afterChildren",
      delay: 0.05,
    },
  },
  open: {
    scale: 1,
    transition: {
      duration: BUBBLE_SECONDS,
      ease: "easeOut",
      when: "beforeChildren",
    },
  },
};

// 入れ替わったときに、同じ文言でも変わったと分かるよう、ほんの少し空けてから出す
const text: Variants = {
  closed: { opacity: 0, transition: { duration: 0 } },
  open: { opacity: 1, transition: { duration: 0, delay: 0.05 } },
};

/**
 * ゲーム画面の一番上の行。左にキャラクター、真ん中にルーム名、右に menu（メニューのボタンなど）を並べる。
 * 吹き出しはキャラクターの右に出し、ルーム名の上に重ねる（カードの位置を動かさないため。decisions.md 手順5の (b)）
 */
export function PlayerCharacter({
  speech,
  roomName,
  menu,
  onTap,
}: {
  readonly speech: VisibleSpeech | null;
  readonly roomName: string;
  readonly menu: ReactNode;
  /** キャラクターをタップした */
  readonly onTap: () => void;
}) {
  return (
    <div className={styles.top}>
      <button type="button" className={styles.characterButton} onClick={onTap}>
        <Character
          mood={speech?.mood ?? "normal"}
          bounceKey={speech?.key ?? null}
        />
      </button>
      <div className={styles.speechArea}>
        <span className={styles.roomName}>{roomName}</span>
        <AnimatePresence>
          {speech !== null && (
            <motion.p
              className={styles.speech}
              aria-live="polite"
              variants={bubble}
              initial="closed"
              animate="open"
              exit="closed"
            >
              <motion.span key={speech.key} variants={text}>
                {speech.text}
              </motion.span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      {menu}
    </div>
  );
}
