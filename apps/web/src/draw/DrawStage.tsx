import type { BingoNumber } from "@bingo/game";
import confetti from "canvas-confetti";
import { useAnimate } from "motion/react";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { flushSync } from "react-dom";
import styles from "./DrawStage.module.scss";
import { Garagara, GaragaraDefs, TrayFront } from "./Garagara";
import { GEOMETRY as G } from "./geometry";
import { letterOf } from "./letter";
import {
  COAST_DEGREES,
  coastEase,
  SPIN_END_SPEED,
  spinEase,
  type SpinPlan,
} from "./spin";
import type { DrawCue, DrawTiming } from "./timing";

export interface PlayOptions {
  readonly timing: DrawTiming;
  /** 番号が見えた瞬間に呼ばれる（プレイヤーのスマホへの公開をここに合わせる） */
  readonly onReveal?: (n: BingoNumber) => void;
  /** 音を鳴らすきっかけ（回し始め・飛び出し・受け皿に落ちる・発表） */
  readonly onCue?: (cue: DrawCue) => void;
}

/** 外から演出を動かすための操作 */
export interface DrawStageHandle {
  /** 番号 n の抽選演出を最後まで再生する */
  play(n: BingoNumber, options: PlayOptions): Promise<void>;
}

interface Props {
  readonly ref: Ref<DrawStageHandle>;
}

interface Bounce {
  /** 跳ねる高さ（0 は落ちた瞬間だけで、跳ねない） */
  readonly height: number;
  /** 跳ねる間に横へ進む距離 */
  readonly dx: number;
  /** 落ちた音の強さ（0〜1） */
  readonly strength: number;
}

/**
 * 受け皿（毛せん）に落ちてからの跳ね方。毛せんは勢いを吸うので、小さく1回跳ねて少し転がって止まる
 */
const BOUNCES: readonly Bounce[] = [
  { height: 0, dx: 0, strength: 0.6 },
  { height: 7, dx: 6, strength: 0.15 },
];
/** 跳ね終わってから転がる距離 */
const SETTLE_ROLL = 10;

/** a を b で割った余り（常に 0 以上） */
const mod = (a: number, b: number) => ((a % b) + b) % b;

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
  // 胴の回転角度（毎回の回転を前回の続きから始める）。反時計回りなので減っていく
  const drumAngle = useRef(0);
  const [current, setCurrent] = useState<BingoNumber | null>(null);

  useImperativeHandle(ref, () => ({
    async play(n, { timing, onReveal, onCue }) {
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
      const from = at(G.ejectFrom);
      await Promise.all([
        animate(
          ball,
          { ...from, scale: 0.4, opacity: 0, rotate: 0 },
          { duration: 0 },
        ),
        animate(labelText, { opacity: 0 }, { duration: 0 }),
        animate(rays, { opacity: 0, scale: 0.3 }, { duration: 0 }),
      ]);

      // 1. 溜め: ガラガラを回す（反時計回り）。回っている途中で出口が受け皿側を向いた瞬間に玉が出る
      const start = drumAngle.current;
      const target = start - 360 * timing.spinTurns;
      // 出口の向き = 口金の元の向き + 回転角度。これが ejectAngle になる回転角度のうち、target に一番近いもの
      let ejectAt = target + mod(G.ejectAngle - G.spoutAngle - target, 360);
      if (ejectAt - target > 180) ejectAt -= 360;
      const spinDegrees = start - ejectAt;
      // 惰性の区間（だんだん遅く）の始めの速さを、玉が出る瞬間の速さにそろえる
      const ejectSpeed = (SPIN_END_SPEED * spinDegrees) / timing.spinSeconds; // 度/秒
      const coastSeconds = (2 * COAST_DEGREES) / ejectSpeed;
      const stopAt = ejectAt - COAST_DEGREES;
      drumAngle.current = stopAt;
      const total = timing.spinSeconds + coastSeconds;

      const plan: SpinPlan = {
        ejectSeconds: timing.spinSeconds,
        ejectDegrees: spinDegrees,
        coastSeconds,
        coastDegrees: COAST_DEGREES,
      };
      onCue?.({ type: "spinStart", plan });
      const rattle = animate(
        body,
        { y: [0, -3, 1, -2, 0], x: [0, 1, -1, 0] },
        { duration: 0.18, repeat: Infinity },
      );
      const spin = animate(
        drum,
        { rotate: [start, ejectAt, stopAt] },
        {
          duration: total,
          times: [0, timing.spinSeconds / total, 1],
          ease: [spinEase, coastEase],
        },
      );
      void spin.then(() => {
        rattle.stop();
        void animate(body, { x: 0, y: 0 }, { duration: 0.1 });
      });
      await wait(timing.spinSeconds);

      // 2. 玉が口金から右上へ放り出され、坂に落ちて転がる
      onCue?.({ type: "eject" });
      const peak = at(G.ejectPeak);
      const chuteStart = at(G.chuteStart);
      await animate(
        ball,
        {
          x: [from.x, peak.x, chuteStart.x],
          y: [from.y, peak.y, chuteStart.y],
          scale: [0.4, 1, 1],
          opacity: [0, 1, 1],
          rotate: [0, -60, -120],
        },
        { duration: 0.42, times: [0, 0.45, 1], ease: ["easeOut", "easeIn"] },
      );
      onCue?.({ type: "land", surface: "chute", strength: 0.5 });
      onCue?.({ type: "roll", seconds: timing.rollSeconds });

      // 坂を転がる距離から、玉の回転数を決める（滑らずに転がって見えるように）
      const chuteEnd = at(G.chuteEnd);
      const distance = Math.hypot(
        G.chuteEnd.x - G.chuteStart.x,
        G.chuteEnd.y - G.chuteStart.y,
      );
      const rolled = -120 + (360 * distance) / (2 * Math.PI * G.ballR);
      await animate(
        ball,
        { x: chuteEnd.x, y: chuteEnd.y, rotate: rolled },
        { duration: timing.rollSeconds, ease: [0.4, 0, 1, 1] },
      );

      // 3. 坂の端から受け皿に落ち、跳ねて止まる
      const rest = at(G.rest);
      // 最初は坂の端から皿の中央へ放物線で落ちる
      await animate(
        ball,
        {
          x: [chuteEnd.x, (chuteEnd.x + rest.x) / 2, rest.x],
          y: [chuteEnd.y, chuteEnd.y - 14 * unit, rest.y],
          rotate: rolled + 90,
        },
        { duration: 0.32, times: [0, 0.35, 1], ease: ["easeOut", "easeIn"] },
      );
      let x = rest.x;
      let angle = rolled + 90;
      for (const b of BOUNCES) {
        onCue?.({ type: "land", surface: "tray", strength: b.strength });
        if (b.height === 0) continue;
        const nextX = x + b.dx * unit;
        angle += b.dx * 3;
        const seconds = 0.08 + Math.sqrt(b.height) * 0.04;
        await animate(
          ball,
          {
            x: [x, (x + nextX) / 2, nextX],
            y: [rest.y, rest.y - b.height * unit, rest.y],
            rotate: angle,
          },
          {
            duration: seconds,
            times: [0, 0.5, 1],
            ease: ["easeOut", "easeIn"],
          },
        );
        x = nextX;
      }

      {
        angle += (360 * SETTLE_ROLL) / (2 * Math.PI * G.ballR);
        x += SETTLE_ROLL * unit;
        await animate(
          ball,
          { x, rotate: angle },
          { duration: 0.35, ease: "easeOut" },
        );
      }

      // 4. じらし: 受け皿の中で小さく揺れる。ここから発表までの秒数は決まっているので、先に知らせる
      onCue?.({
        type: "revealSoon",
        seconds: timing.teaseSeconds + timing.zoomSeconds,
      });
      await animate(
        ball,
        { rotate: [angle, angle - 18, angle + 10, angle] },
        { duration: timing.teaseSeconds, ease: "easeInOut" },
      );

      // 5. 発表: 玉が中央に寄って大きくなり、番号が見える。光・揺れ・紙吹雪を同時に
      const reveal = at(G.reveal);
      const raysPos = {
        x: G.reveal.x * unit - rays.offsetWidth / 2,
        y: G.reveal.y * unit - rays.offsetHeight / 2,
      };
      // ばねの揺れが収まるのを待たず、決めた秒数で発表する（音と発表の時刻を正確にそろえるため）
      const zoom = animate(
        ball,
        {
          x: reveal.x,
          y: reveal.y,
          scale: G.reveal.scale,
          rotate: 360 * Math.ceil(angle / 360 + 1),
        },
        { type: "spring", duration: timing.zoomSeconds, bounce: 0.35 },
      );
      await wait(timing.zoomSeconds);

      onReveal?.(n);
      onCue?.({ type: "reveal" });
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

      // 6. 片付け: 玉と光を消す
      await Promise.all([
        animate(
          ball,
          { opacity: 0, scale: G.reveal.scale * 0.8 },
          { duration: 0.35 },
        ),
        animate(rays, { opacity: 0 }, { duration: 0.35 }),
        spin,
        zoom,
      ]);
      spinRays.stop();
    },
  }));

  const viewBox = `0 0 ${String(G.width)} ${String(G.height)}`;
  return (
    <div ref={scope} className={styles.stage}>
      <div ref={shakerRef} className={styles.shaker}>
        <svg className={styles.svg} viewBox={viewBox} aria-hidden>
          <GaragaraDefs />
          <Garagara drumRef={drumRef} bodyRef={bodyRef} />
        </svg>
        <div ref={raysRef} className={styles.rays} />
        <div
          ref={ballRef}
          className={styles.ball}
          data-letter={current === null ? undefined : letterOf(current)}
        >
          <div className={styles.label}>
            <div ref={labelTextRef} className={styles.number}>
              {current}
            </div>
          </div>
        </div>
        {/* 受け皿の手前の縁は玉より手前に描く（玉の下の方が縁に隠れて、皿に入って見える） */}
        <svg className={styles.svg} viewBox={viewBox} aria-hidden>
          <TrayFront />
        </svg>
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
