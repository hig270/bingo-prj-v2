import type { BingoNumber } from "@bingo/game";
import confetti from "canvas-confetti";
import { useAnimate } from "motion/react";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { flushSync } from "react-dom";
import styles from "./DrawStage.module.scss";
import { Garagara } from "./Garagara";
import { GEOMETRY as G } from "./geometry";
import { letterOf } from "./letter";
import type { DrawTiming } from "./timing";

/** 外から演出を動かすための操作 */
export interface DrawStageHandle {
  /**
   * 番号 n の抽選演出を最後まで再生する。
   * onReveal は番号が見えた瞬間に呼ばれる（プレイヤーのスマホへの公開をここに合わせる）。
   */
  play(
    n: BingoNumber,
    timing: DrawTiming,
    onReveal?: (n: BingoNumber) => void,
  ): Promise<void>;
}

interface Props {
  readonly ref: Ref<DrawStageHandle>;
}

/**
 * ホスト画面の抽選演出（ガラガラ → 玉が飛び出す → 発表）。
 * どの番号を出すかは外（本番ではサーバー）が決め、この部品は見せ方だけを受け持つ。
 */
export function DrawStage({ ref }: Props) {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const shakerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
  const drumRef = useRef<SVGGElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const labelTextRef = useRef<HTMLDivElement>(null);
  const raysRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  // 胴の回転角度の合計（毎回の回転を前回の続きから始める）
  const drumAngle = useRef(0);
  const [current, setCurrent] = useState<BingoNumber | null>(null);

  useImperativeHandle(ref, () => ({
    async play(n, timing, onReveal) {
      const stage = scope.current;
      const shaker = shakerRef.current;
      const body = bodyRef.current;
      const drum = drumRef.current;
      const ball = ballRef.current;
      const labelText = labelTextRef.current;
      const rays = raysRef.current;
      const flash = flashRef.current;
      if (
        shaker === null ||
        body === null ||
        drum === null ||
        ball === null ||
        labelText === null ||
        rays === null ||
        flash === null
      ) {
        return;
      }

      // 玉の色と番号を先に画面へ反映してから動かす
      flushSync(() => {
        setCurrent(n);
      });

      // 1600 の枠の座標を、舞台の実際の大きさ（px）に直す。玉は左上が基準なので半径ぶんずらす
      const unit = stage.clientWidth / G.width;
      const at = (p: { x: number; y: number }) => ({
        x: (p.x - G.ballR) * unit,
        y: (p.y - G.ballR) * unit,
      });

      // 前回の状態を戻す
      const outlet = at(G.outlet);
      await Promise.all([
        animate(
          ball,
          { ...outlet, scale: 0.3, opacity: 0, rotate: 0 },
          { duration: 0 },
        ),
        animate(labelText, { opacity: 0 }, { duration: 0 }),
        animate(rays, { opacity: 0, scale: 0.3 }, { duration: 0 }),
      ]);

      // 1. 溜め: ガラガラを回す。だんだん速くなり、最後は少しゆっくりに。台は小刻みに揺れる
      const from = drumAngle.current;
      const to = from + 360 * timing.spinTurns;
      drumAngle.current = to;
      const rattle = animate(
        body,
        { y: [0, -3, 1, -2, 0], x: [0, 1, -1, 0] },
        { duration: 0.18, repeat: Infinity },
      );
      await animate(
        drum,
        { rotate: [from, to] },
        { duration: timing.spinSeconds, ease: [0.55, 0, 0.35, 1] },
      );
      rattle.stop();
      await animate(body, { x: 0, y: 0 }, { duration: 0.1 });

      // 2. 玉が飛び出し、坂を転がって受け皿に入り、跳ねる
      const start = at(G.chuteStart);
      const end = at(G.chuteEnd);
      const rest = at(G.rest);
      const pop = { x: outlet.x + 10 * unit, y: outlet.y - 40 * unit };
      await animate(
        ball,
        {
          x: [outlet.x, pop.x, start.x],
          y: [outlet.y, pop.y, start.y],
          scale: [0.3, 1, 1],
          opacity: [0, 1, 1],
        },
        { duration: 0.45, ease: "easeOut" },
      );
      // 坂を転がる距離から、玉の回転数を決める（滑らずに転がって見えるように）
      const distance = Math.hypot(
        G.chuteEnd.x - G.chuteStart.x,
        G.chuteEnd.y - G.chuteStart.y,
      );
      const turns = distance / (2 * Math.PI * G.ballR);
      await animate(
        ball,
        { x: end.x, y: end.y, rotate: 360 * turns },
        { duration: timing.rollSeconds, ease: [0.4, 0, 1, 1] },
      );
      await animate(
        ball,
        {
          x: [end.x, rest.x, rest.x + 6 * unit, rest.x],
          y: [end.y, rest.y - 40 * unit, rest.y, rest.y],
          rotate: 360 * turns + 120,
        },
        { duration: 0.6, ease: "easeOut" },
      );

      // 3. じらし: 受け皿の中で小さく揺れる
      await animate(
        ball,
        {
          rotate: [
            360 * turns + 120,
            360 * turns + 100,
            360 * turns + 130,
            360 * turns + 120,
          ],
        },
        { duration: timing.teaseSeconds, ease: "easeInOut" },
      );

      // 4. 発表: 玉が中央に寄って大きくなり、番号が見える。光・揺れ・紙吹雪を同時に
      const target = at(G.reveal);
      const raysPos = {
        x: G.reveal.x * unit - rays.offsetWidth / 2,
        y: G.reveal.y * unit - rays.offsetHeight / 2,
      };
      await animate(
        ball,
        {
          x: target.x,
          y: target.y,
          scale: G.reveal.scale,
          rotate: 360 * Math.ceil(turns + 1),
        },
        { type: "spring", duration: timing.zoomSeconds, bounce: 0.35 },
      );

      onReveal?.(n);
      void animate(
        labelText,
        { opacity: [0, 1], scale: [1.6, 1] },
        { duration: 0.25 },
      );
      void animate(
        flash,
        { opacity: [0, 0.9, 0] },
        { duration: 0.6, ease: "easeOut" },
      );
      void animate(
        shaker,
        { x: [0, -16, 14, -10, 7, -3, 0] },
        { duration: 0.5 },
      );
      void animate(
        rays,
        { ...raysPos, opacity: [0, 1], scale: [0.3, 1] },
        { duration: 0.4 },
      );
      const spinRays = animate(
        rays,
        { rotate: [0, 360] },
        { duration: 12, repeat: Infinity, ease: "linear" },
      );
      burstConfetti(stage, G.reveal.x / G.width, G.reveal.y / G.height);

      await wait(timing.holdSeconds);

      // 5. 片付け: 玉と光を消す
      await Promise.all([
        animate(
          ball,
          { opacity: 0, scale: G.reveal.scale * 0.8 },
          { duration: 0.35 },
        ),
        animate(rays, { opacity: 0 }, { duration: 0.35 }),
      ]);
      spinRays.stop();
    },
  }));

  return (
    <div ref={scope} className={styles.stage}>
      <div ref={shakerRef} className={styles.shaker}>
        <svg
          className={styles.svg}
          viewBox={`0 0 ${String(G.width)} ${String(G.height)}`}
          aria-hidden
        >
          <Garagara drumRef={drumRef} bodyRef={bodyRef} />
        </svg>
        <div ref={raysRef} className={styles.rays} />
        <div
          ref={ballRef}
          className={styles.ball}
          data-letter={current === null ? undefined : letterOf(current)}
        >
          <div className={styles.label}>
            <div ref={labelTextRef} className={styles.labelText}>
              {current !== null && (
                <>
                  <span className={styles.letter}>{letterOf(current)}</span>
                  <span className={styles.number}>{current}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <div ref={flashRef} className={styles.flash} />
    </div>
  );
}

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/** 発表の瞬間の紙吹雪。中央から一気に、両脇から追いかけて */
function burstConfetti(stage: HTMLElement, rx: number, ry: number) {
  const rect = stage.getBoundingClientRect();
  const origin = {
    x: (rect.left + rect.width * rx) / window.innerWidth,
    y: (rect.top + rect.height * ry) / window.innerHeight,
  };
  const common = { disableForReducedMotion: true, zIndex: 10 };
  void confetti({
    ...common,
    particleCount: 140,
    spread: 100,
    startVelocity: 55,
    origin,
  });
  setTimeout(() => {
    const y = (rect.top + rect.height * 0.9) / window.innerHeight;
    void confetti({
      ...common,
      particleCount: 80,
      angle: 60,
      spread: 60,
      origin: { x: rect.left / window.innerWidth, y },
    });
    void confetti({
      ...common,
      particleCount: 80,
      angle: 120,
      spread: 60,
      origin: { x: rect.right / window.innerWidth, y },
    });
  }, 250);
}
