import { useAnimate } from "motion/react";
import { useEffect } from "react";
import styles from "./Character.module.scss";

// 仮のキャラクター（decisions.md 手順5の (b)）。本物の絵ができたら、この部品の中身だけを差し替える。
// 受け取るのは表情（mood）と、跳ねるきっかけ（bounceKey が変わったら跳ねる）だけにしておく

/** キャラクターの表情（状態）。絵を差し替えても、この状態を受け取る形は変えない */
export type Mood = "normal" | "talk" | "happy" | "alert";

/** 跳ねる高さ（px）。喋るときは小さく、喜ぶときは大きく */
const BOUNCE: Record<Mood, number> = {
  normal: 0,
  talk: 4,
  alert: 4,
  happy: 12,
};

export function Character({
  mood,
  bounceKey,
}: {
  readonly mood: Mood;
  /** 変わるたびに、表情に合わせて跳ねる（同じ表情のまま話す内容が変わったときも跳ねるように） */
  readonly bounceKey: string | null;
}) {
  const [scope, animate] = useAnimate<SVGSVGElement>();
  useEffect(() => {
    const height = BOUNCE[mood];
    if (bounceKey === null || height === 0) return;
    const controls = animate(
      scope.current,
      { y: [0, -height, 0, -height / 3, 0] },
      { duration: 0.5, ease: "easeOut" },
    );
    return () => {
      // 途中で止めると顔がずれたまま残るので、最後（元の位置）まで進めて終える
      controls.complete();
    };
  }, [bounceKey, mood, animate, scope]);

  return (
    <svg
      ref={scope}
      className={styles.character}
      viewBox="0 0 56 56"
      role="img"
      aria-label={LABEL[mood]}
    >
      <circle className={styles.face} cx="28" cy="28" r="26" />
      <Face mood={mood} />
    </svg>
  );
}

/** 読み上げ用の名前（表情が切り替わったことが分かるように） */
const LABEL: Record<Mood, string> = {
  normal: "キャラクター",
  talk: "キャラクター（話している）",
  happy: "キャラクター（喜んでいる）",
  alert: "キャラクター（知らせている）",
};

/** 表情ごとの目と口。違いがはっきり見えるように、目と口の両方を変える */
function Face({ mood }: { readonly mood: Mood }) {
  switch (mood) {
    case "normal":
      // 点の目と、小さく閉じた口
      return (
        <>
          <circle className={styles.ink} cx="20" cy="24" r="3" />
          <circle className={styles.ink} cx="36" cy="24" r="3" />
          <path className={styles.line} d="M22 37 Q28 40 34 37" />
        </>
      );
    case "talk":
      // 点の目と、開いた口
      return (
        <>
          <circle className={styles.ink} cx="20" cy="24" r="3" />
          <circle className={styles.ink} cx="36" cy="24" r="3" />
          <ellipse className={styles.ink} cx="28" cy="38" rx="5" ry="4" />
        </>
      );
    case "happy":
      // 笑った目（上に丸い弧）と、大きく開けて笑った口
      return (
        <>
          <path className={styles.line} d="M15 26 Q20 19 25 26" />
          <path className={styles.line} d="M31 26 Q36 19 41 26" />
          <path className={styles.ink} d="M17 33 Q28 50 39 33 Z" />
        </>
      );
    case "alert":
      // 大きく見開いた目と、すぼめた口
      return (
        <>
          <circle className={styles.eyeWhite} cx="20" cy="24" r="6" />
          <circle className={styles.eyeWhite} cx="36" cy="24" r="6" />
          <circle className={styles.ink} cx="20" cy="24" r="3" />
          <circle className={styles.ink} cx="36" cy="24" r="3" />
          <circle className={styles.ink} cx="28" cy="39" r="3" />
        </>
      );
  }
}
