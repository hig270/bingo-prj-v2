import type { Ref } from "react";
import styles from "./Garagara.module.scss";
import { GEOMETRY as G } from "./geometry";

/** 中心 (cx, cy)・半径 r の正八角形の頂点（SVG の points 属性の形） */
function octagon(cx: number, cy: number, r: number): string {
  return Array.from({ length: 8 }, (_, i) => {
    const angle = (Math.PI / 4) * i + Math.PI / 8;
    return `${String(cx + r * Math.cos(angle))},${String(cy + r * Math.sin(angle))}`;
  }).join(" ");
}

interface Props {
  /** 回転させる部分（八角形の胴とハンドル） */
  readonly drumRef: Ref<SVGGElement>;
  /** 回している間に揺らす部分（台を含む全体） */
  readonly bodyRef: Ref<SVGGElement>;
}

/**
 * ガラガラ（回転抽選器）の絵。中は見えない（本物と同じく外見だけ）。
 * 座標は 1600×900 の枠の中で、geometry.ts と共通。
 */
export function Garagara({ drumRef, bodyRef }: Props) {
  const { drum, chute, tray } = G;
  return (
    <g ref={bodyRef}>
      {/* 台 */}
      <polygon
        className={styles.stand}
        points={`${String(drum.cx)},${String(drum.cy)} ${String(drum.cx - 130)},${String(G.floorY)} ${String(drum.cx - 90)},${String(G.floorY)}`}
      />
      <polygon
        className={styles.stand}
        points={`${String(drum.cx)},${String(drum.cy)} ${String(drum.cx + 130)},${String(G.floorY)} ${String(drum.cx + 90)},${String(G.floorY)}`}
      />
      <rect
        className={styles.base}
        x={drum.cx - 200}
        y={G.floorY}
        width={400}
        height={28}
        rx={8}
      />

      {/* 玉が転がる坂と受け皿 */}
      <line
        className={styles.chute}
        x1={chute.x1}
        y1={chute.y1}
        x2={chute.x2}
        y2={chute.y2}
      />
      <path
        className={styles.tray}
        d={`M ${String(tray.x - 70)} ${String(tray.y - 30)} Q ${String(tray.x)} ${String(tray.y + 40)} ${String(tray.x + 70)} ${String(tray.y - 30)}`}
      />

      {/* 胴（回る部分） */}
      <g ref={drumRef} className={styles.drum}>
        <polygon
          className={styles.drumOuter}
          points={octagon(drum.cx, drum.cy, drum.r)}
        />
        <polygon
          className={styles.drumInner}
          points={octagon(drum.cx, drum.cy, drum.r * 0.78)}
        />
        {/* 回っていることが分かるように、放射状の板目を入れる */}
        {Array.from({ length: 4 }, (_, i) => (
          <line
            key={i}
            className={styles.drumLine}
            x1={drum.cx}
            y1={drum.cy - drum.r * 0.78}
            x2={drum.cx}
            y2={drum.cy + drum.r * 0.78}
            transform={`rotate(${String(i * 45 + 22.5)} ${String(drum.cx)} ${String(drum.cy)})`}
          />
        ))}
        {/* ハンドル */}
        <line
          className={styles.handleArm}
          x1={drum.cx}
          y1={drum.cy}
          x2={drum.cx}
          y2={drum.cy - drum.r * 0.62}
        />
        <circle
          className={styles.handleKnob}
          cx={drum.cx}
          cy={drum.cy - drum.r * 0.62}
          r={20}
        />
        <circle className={styles.hub} cx={drum.cx} cy={drum.cy} r={26} />
      </g>
    </g>
  );
}
