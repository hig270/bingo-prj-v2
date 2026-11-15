import type { Ref } from "react";
import styles from "./Garagara.module.scss";
import { GEOMETRY as G } from "./geometry";
import { grainPaths } from "./wood";

/** 中心 (cx, cy)・半径 r の正八角形の頂点（辺の中点が 0・45・90… 度の向きになる置き方） */
function octagonPoints(cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: 8 }, (_, i) => {
    const angle = (Math.PI / 4) * i + Math.PI / 8;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
}

function toPoints(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

/** 縁の板 i 枚目の色。左上を向く板ほど明るくして、光が当たっているように見せる */
function rimColor(i: number): string {
  const facing = ((i * 45 + 22.5) * Math.PI) / 180;
  const light = Math.cos(facing - (225 * Math.PI) / 180); // 左上（225 度）を向くと 1
  return `hsl(26 58% ${(30 + 12 * light).toFixed(1)}%)`;
}

// 木目は描くたびに変わらないよう、読み込み時に1回だけ作る
const DRUM_GRAIN = grainPaths(520, 520, 34, 7);
const BOARD_GRAIN = grainPaths(600, 120, 10, 11);

/**
 * SVG の中で使い回す色の定義（グラデーション・木目の模様）。
 * id はページ内で重複してはいけないが、演出の舞台は1ページに1つだけなので固定の名前にしている。
 */
export function GaragaraDefs() {
  const { drum } = G;
  return (
    <defs>
      {/* 木の地の色（左上が明るく、右下が暗い） */}
      <linearGradient id="gg-wood" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#d08a4a" />
        <stop offset="0.55" stopColor="#a8622a" />
        <stop offset="1" stopColor="#7c4318" />
      </linearGradient>
      <linearGradient id="gg-wood-dark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#8d4f20" />
        <stop offset="1" stopColor="#4e2a0e" />
      </linearGradient>
      {/* 木目（胴の大きさに合わせた1枚の模様。胴と一緒に回る） */}
      <pattern
        id="gg-drum-grain"
        patternUnits="userSpaceOnUse"
        x={drum.cx - 260}
        y={drum.cy - 260}
        width={520}
        height={520}
      >
        {DRUM_GRAIN.map((d, i) => (
          <path key={i} d={d} className={styles.grain} />
        ))}
      </pattern>
      <pattern
        id="gg-board-grain"
        patternUnits="userSpaceOnUse"
        width={600}
        height={120}
      >
        {BOARD_GRAIN.map((d, i) => (
          <path key={i} d={d} className={styles.grain} />
        ))}
      </pattern>
      {/* 縦に使う板（脚）の木目は、模様を 90 度回して使う */}
      <pattern
        id="gg-leg-grain"
        href="#gg-board-grain"
        patternTransform="rotate(78)"
      />
      {/* 銀色の金属（口金・坂・受け皿） */}
      <linearGradient id="gg-silver" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f7f8fa" />
        <stop offset="0.35" stopColor="#b9bec4" />
        <stop offset="0.55" stopColor="#eef0f2" />
        <stop offset="1" stopColor="#7d838a" />
      </linearGradient>
      <linearGradient id="gg-silver-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#80868d" />
        <stop offset="0.3" stopColor="#eef0f2" />
        <stop offset="0.6" stopColor="#b3b8be" />
        <stop offset="1" stopColor="#f3f4f6" />
      </linearGradient>
      <radialGradient id="gg-bowl" cx="0.5" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#9aa0a7" />
        <stop offset="0.7" stopColor="#5f656c" />
        <stop offset="1" stopColor="#3c4146" />
      </radialGradient>
      {/* 金色の金具（角・中心・ハンドル） */}
      <linearGradient id="gg-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff1b0" />
        <stop offset="0.45" stopColor="#e2b23c" />
        <stop offset="1" stopColor="#8c6510" />
      </linearGradient>
      {/* 光の反射（胴が回っても動かないよう、胴の外に重ねる） */}
      <radialGradient id="gg-sheen" cx="0.32" cy="0.28" r="0.75">
        <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0.06" />
        <stop offset="1" stopColor="#000" stopOpacity="0.22" />
      </radialGradient>
      <radialGradient id="gg-floor-shadow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#000" stopOpacity="0.55" />
        <stop offset="1" stopColor="#000" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

interface Props {
  /** 回転させる部分（八角形の胴・口金・ハンドル） */
  readonly drumRef: Ref<SVGGElement>;
  /** 回している間に揺らす部分（台を含む全体） */
  readonly bodyRef: Ref<SVGGElement>;
}

/**
 * ガラガラ（回転抽選器）と、坂・受け皿の奥側。中は見えない（本物と同じく外見だけ）。
 * 受け皿の手前の縁は、玉より手前に描くため TrayFront に分けている。
 */
export function Garagara({ drumRef, bodyRef }: Props) {
  const { drum, chute, tray, floorY } = G;
  const outer = octagonPoints(drum.cx, drum.cy, drum.r);
  const face = octagonPoints(drum.cx, drum.cy, drum.r * 0.86);
  const panel = octagonPoints(drum.cx, drum.cy, drum.r * 0.6);
  // 縁の8枚の板（外側の八角形と、表の面の八角形の間）。向きによって明るさを変えて立体に見せる
  const rimBoards = outer.map((p, i) => {
    const next = outer[(i + 1) % 8] ?? p;
    const innerP = face[i] ?? p;
    const innerNext = face[(i + 1) % 8] ?? p;
    return [p, next, innerNext, innerP] as const;
  });
  const handleEnd = { x: drum.cx, y: drum.cy - drum.r * 0.66 };
  // 口金の向きを、回転していないときの向きにする
  const spoutRotate = `rotate(${String(G.spoutAngle)} ${String(drum.cx)} ${String(drum.cy)})`;

  return (
    <g ref={bodyRef}>
      {/* 床の影 */}
      <ellipse
        cx={drum.cx}
        cy={floorY + 30}
        rx={300}
        ry={26}
        fill="url(#gg-floor-shadow)"
      />
      <ellipse
        cx={tray.cx}
        cy={floorY + 30}
        rx={150}
        ry={18}
        fill="url(#gg-floor-shadow)"
      />

      {/* 台（A 字の脚と土台） */}
      {[-1, 1].map((side) => {
        const top = drum.cx + side * 30;
        const leg: [number, number][] = [
          [top - 18, drum.cy],
          [top + 18, drum.cy],
          [drum.cx + side * 150 + 22, floorY],
          [drum.cx + side * 150 - 22, floorY],
        ];
        return (
          <g key={side}>
            <polygon points={toPoints(leg)} fill="url(#gg-wood-dark)" />
            <polygon points={toPoints(leg)} fill="url(#gg-leg-grain)" />
          </g>
        );
      })}
      <rect
        x={drum.cx - 230}
        y={floorY}
        width={460}
        height={34}
        rx={6}
        fill="url(#gg-wood)"
      />
      <rect
        x={drum.cx - 230}
        y={floorY}
        width={460}
        height={34}
        rx={6}
        fill="url(#gg-board-grain)"
      />
      <rect
        x={drum.cx - 230}
        y={floorY + 24}
        width={460}
        height={10}
        rx={4}
        className={styles.boardEdge}
      />

      {/* 坂を支える柱（上の端と下の端）と、受け皿の台 */}
      <rect
        x={chute.x1 + 14}
        y={chute.y1}
        width={16}
        height={floorY - chute.y1 + 10}
        fill="url(#gg-wood-dark)"
      />
      <rect
        x={chute.x1 - 6}
        y={floorY - 4}
        width={56}
        height={14}
        rx={4}
        fill="url(#gg-wood)"
      />
      <rect
        x={chute.x2 - 10}
        y={chute.y2}
        width={20}
        height={floorY - chute.y2 + 10}
        fill="url(#gg-wood-dark)"
      />
      <rect
        x={tray.cx - 70}
        y={tray.rimY + 8}
        width={140}
        height={floorY - tray.rimY + 18}
        rx={6}
        fill="url(#gg-wood)"
      />
      <rect
        x={tray.cx - 70}
        y={tray.rimY + 8}
        width={140}
        height={floorY - tray.rimY + 18}
        rx={6}
        fill="url(#gg-board-grain)"
      />

      {/* 坂（銀色の樋）。奥の壁 → 底 → 手前の縁 の順に重ねる */}
      <ChuteShape />

      {/* 受け皿の奥側（皿の内側） */}
      <ellipse
        cx={tray.cx}
        cy={tray.rimY}
        rx={tray.rx + 8}
        ry={tray.ry + 6}
        fill="url(#gg-silver-h)"
      />
      <ellipse
        cx={tray.cx}
        cy={tray.rimY + 2}
        rx={tray.rx}
        ry={tray.ry}
        fill="url(#gg-bowl)"
      />

      {/* 胴（回る部分） */}
      <g ref={drumRef} className={styles.drum}>
        {/* 見えない円。図形の範囲を軸を中心とした正方形にして、回転の中心を軸に合わせる
            （口金が片側だけに出ているため、これがないと中心がずれて胴がぶれる） */}
        <circle
          cx={drum.cx}
          cy={drum.cy}
          r={G.apothem + G.spoutLength + 8}
          fill="none"
        />
        {/* 縁の板 */}
        {rimBoards.map((quad, i) => (
          <polygon
            key={i}
            points={toPoints(quad)}
            className={styles.rimBoard}
            fill={rimColor(i)}
          />
        ))}
        <polygon points={toPoints(outer)} className={styles.rimLine} />
        {/* 表の面（木目つき） */}
        <polygon points={toPoints(face)} fill="url(#gg-wood)" />
        <polygon points={toPoints(face)} fill="url(#gg-drum-grain)" />
        <polygon points={toPoints(face)} className={styles.faceEdge} />
        {/* 内側の一段くぼんだ板 */}
        <polygon points={toPoints(panel)} className={styles.panel} />
        <polygon
          points={toPoints(panel)}
          fill="url(#gg-drum-grain)"
          opacity={0.6}
        />
        {/* 角の金具 */}
        {outer.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={11}
            fill="url(#gg-gold)"
            className={styles.fitting}
          />
        ))}
        {/* 出口の銀色の口金（縁の辺の中点から外へ） */}
        <g transform={spoutRotate}>
          <rect
            x={drum.cx + G.apothem - 6}
            y={drum.cy - 22}
            width={G.spoutLength + 6}
            height={44}
            rx={6}
            fill="url(#gg-silver)"
            className={styles.metalEdge}
          />
          <rect
            x={drum.cx + G.apothem + G.spoutLength - 8}
            y={drum.cy - 26}
            width={10}
            height={52}
            rx={4}
            fill="url(#gg-silver)"
            className={styles.metalEdge}
          />
          <ellipse
            cx={drum.cx + G.apothem + G.spoutLength - 3}
            cy={drum.cy}
            rx={4}
            ry={15}
            className={styles.hole}
          />
        </g>
        {/* ハンドル */}
        <line
          x1={drum.cx}
          y1={drum.cy}
          x2={handleEnd.x}
          y2={handleEnd.y}
          className={styles.handleArm}
        />
        <circle
          cx={handleEnd.x}
          cy={handleEnd.y}
          r={22}
          className={styles.handleKnob}
        />
        <circle
          cx={handleEnd.x - 6}
          cy={handleEnd.y - 7}
          r={7}
          className={styles.knobShine}
        />
        <circle
          cx={drum.cx}
          cy={drum.cy}
          r={30}
          fill="url(#gg-gold)"
          className={styles.fitting}
        />
      </g>
      {/* 光の反射（回らない） */}
      <circle
        cx={drum.cx}
        cy={drum.cy}
        r={drum.r * 0.9}
        fill="url(#gg-sheen)"
        pointerEvents="none"
      />
    </g>
  );
}

/** 坂（銀色の樋）。上から見下ろした U 字の溝を、横から見た形で描く */
function ChuteShape() {
  const { chute } = G;
  const back: [number, number][] = [
    [chute.x1, chute.y1 - 16],
    [chute.x2, chute.y2 - 16],
    [chute.x2, chute.y2],
    [chute.x1, chute.y1],
  ];
  const bottom: [number, number][] = [
    [chute.x1, chute.y1 - 2],
    [chute.x2, chute.y2 - 2],
    [chute.x2, chute.y2 + 12],
    [chute.x1, chute.y1 + 12],
  ];
  return (
    <g>
      <polygon points={toPoints(back)} className={styles.chuteBack} />
      <polygon
        points={toPoints(bottom)}
        fill="url(#gg-silver)"
        className={styles.metalEdge}
      />
      <line
        x1={chute.x1}
        y1={chute.y1 - 1}
        x2={chute.x2}
        y2={chute.y2 - 1}
        className={styles.chuteShine}
      />
    </g>
  );
}

/** 受け皿の手前の縁（玉より手前に描く） */
export function TrayFront() {
  const { tray } = G;
  const left = tray.cx - tray.rx - 8;
  const right = tray.cx + tray.rx + 8;
  const y = tray.rimY;
  // 皿の手前半分の縁。外側の弧と内側の弧の間を塗る
  const d = [
    `M ${String(left)} ${String(y)}`,
    `A ${String(tray.rx + 8)} ${String(tray.ry + 6)} 0 0 0 ${String(right)} ${String(y)}`,
    `L ${String(right - 8)} ${String(y + 2)}`,
    `A ${String(tray.rx)} ${String(tray.ry)} 0 0 1 ${String(left + 8)} ${String(y + 2)}`,
    "Z",
  ].join(" ");
  // 皿の側面（縁の下の、外にふくらんだ部分）
  const side = [
    `M ${String(left)} ${String(y)}`,
    `A ${String(tray.rx + 8)} ${String(tray.ry + 6)} 0 0 0 ${String(right)} ${String(y)}`,
    `Q ${String(right - 10)} ${String(y + 34)} ${String(tray.cx)} ${String(y + 36)}`,
    `Q ${String(left + 10)} ${String(y + 34)} ${String(left)} ${String(y)}`,
    "Z",
  ].join(" ");
  return (
    <g>
      <path d={side} fill="url(#gg-silver)" className={styles.metalEdge} />
      <path d={d} fill="url(#gg-silver-h)" className={styles.metalEdge} />
    </g>
  );
}
