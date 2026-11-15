/**
 * 抽選演出の舞台の座標（1600×900 の枠。SVG の viewBox と、玉の位置の計算で共通に使う）。
 * 角度は SVG の向き（右が 0 度、時計回りが正。y は下向き）。
 */

interface Point {
  readonly x: number;
  readonly y: number;
}

const drum = { cx: 560, cy: 370, r: 230 } as const;
/** 八角形の辺の中点までの距離（出口の口金はここに付く） */
const apothem = drum.r * Math.cos(Math.PI / 8);
const ballR = 30;

/** 出口（口金）の、胴が回っていないときの向き。辺の中点の向き（45 度ごと）に合わせる */
const spoutAngle = 45;
/** 口金の長さ */
const spoutLength = 34;
/** 玉が飛び出す瞬間の口金の向き（受け皿側を向いたとき） */
const ejectAngle = 40;

const chute = { x1: 800, y1: 652, x2: 1062, y2: 718 } as const;
const tray = { cx: 1160, rimY: 748, rx: 96, ry: 24 } as const;
const floorY = 800;

function polar(angleDeg: number, distance: number): Point {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: drum.cx + distance * Math.cos(a),
    y: drum.cy + distance * Math.sin(a),
  };
}

/** 坂の上の位置 t（0〜1）にある玉の中心。坂の線から玉の半径ぶん上を通らせる */
function onChute(t: number): Point {
  const x = chute.x1 + (chute.x2 - chute.x1) * t;
  const y = chute.y1 + (chute.y2 - chute.y1) * t;
  return { x, y: y - ballR - 6 };
}

/** 玉が飛び出す瞬間の、口金の先にある玉の中心 */
const ejectFrom = polar(ejectAngle, apothem + spoutLength + ballR * 0.6);

export const GEOMETRY = {
  width: 1600,
  height: 900,
  floorY,
  drum,
  apothem,
  ballR,
  spoutAngle,
  spoutLength,
  ejectAngle,
  chute,
  tray,
  ejectFrom,
  /** 飛び出した玉が描く弧の頂点（胴は反時計回りに回るので、右上へ放り出される） */
  ejectPeak: { x: ejectFrom.x + 46, y: ejectFrom.y - 34 },
  chuteStart: onChute(0.12),
  chuteEnd: onChute(1),
  /** 受け皿の中で止まった位置（下の方は皿の手前の縁に隠れる） */
  rest: { x: tray.cx, y: tray.rimY - 10 },
  /** 発表のときに玉が寄る位置と、そのときの大きさ（倍率） */
  reveal: { x: 1090, y: 390, scale: 6 },
} as const;
