/**
 * 抽選演出の舞台の座標（1600×900 の枠。SVG の viewBox と、玉の位置の計算で共通に使う）。
 * 玉は受け皿の坂の上を転がるので、坂の線から玉の半径ぶん上を通らせる。
 */
const drum = { cx: 560, cy: 380, r: 230 } as const;
const chute = { x1: 690, y1: 640, x2: 1060, y2: 740 } as const;
const tray = { x: 1130, y: 742 } as const;
const ballR = 30;

/** 坂の上の位置 t（0〜1）にある玉の中心 */
function onChute(t: number): { x: number; y: number } {
  const x = chute.x1 + (chute.x2 - chute.x1) * t;
  const y = chute.y1 + (chute.y2 - chute.y1) * t;
  return { x, y: y - ballR - 4 };
}

export const GEOMETRY = {
  width: 1600,
  height: 900,
  floorY: 800,
  drum,
  chute,
  tray,
  ballR,
  /** 玉が胴から出てくる位置（胴の右下の縁） */
  outlet: { x: drum.cx + 110, y: drum.cy + 190 },
  chuteStart: onChute(0.05),
  chuteEnd: onChute(1),
  /** 受け皿に止まった位置 */
  rest: { x: tray.x, y: tray.y - ballR - 2 },
  /** 発表のときに玉が寄る位置と、そのときの大きさ（倍率） */
  reveal: { x: 1080, y: 400, scale: 6 },
} as const;
