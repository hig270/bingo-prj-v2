/**
 * ガラガラの胴の回り方（絵と音で共通に使う）。
 * 玉が出るまで: 最初の SPIN_ACCEL の割合の時間で加速し、その後は一定の速さ（手で回す感じ）。
 * 玉が出た後: その速さから惰性でだんだん遅くなって止まる。
 */

/** 加速にかける時間の割合 */
export const SPIN_ACCEL = 0.35;
/** 玉が出る瞬間の速さは、平均の速さのこの倍 */
export const SPIN_END_SPEED = 1 / (1 - SPIN_ACCEL / 2);
/** 玉が出た後に惰性で回る角度 */
export const COAST_DEGREES = 110;

/** 玉が出るまでの進み方（時間の割合 0〜1 → 角度の割合 0〜1） */
export function spinEase(p: number): number {
  return p < SPIN_ACCEL
    ? (SPIN_END_SPEED * p * p) / (2 * SPIN_ACCEL)
    : SPIN_END_SPEED * (p - SPIN_ACCEL / 2);
}

/** 玉が出た後の進み方（だんだん遅く） */
export function coastEase(p: number): number {
  return 1 - (1 - p) * (1 - p);
}

/** 1回の回転の予定 */
export interface SpinPlan {
  /** 回し始めてから玉が出るまでの秒数と角度 */
  readonly ejectSeconds: number;
  readonly ejectDegrees: number;
  /** 玉が出てから止まるまでの秒数と角度 */
  readonly coastSeconds: number;
  readonly coastDegrees: number;
}

/** 回し始めてから t 秒後までに回った角度 */
export function angleAt(plan: SpinPlan, t: number): number {
  if (t <= 0) return 0;
  if (t < plan.ejectSeconds) {
    return plan.ejectDegrees * spinEase(t / plan.ejectSeconds);
  }
  const c = Math.min(1, (t - plan.ejectSeconds) / plan.coastSeconds);
  return plan.ejectDegrees + plan.coastDegrees * coastEase(c);
}

/** 回し始めてから t 秒後の速さ（玉が出る瞬間を 1 とした割合） */
export function speedAt(plan: SpinPlan, t: number): number {
  const accelSeconds = plan.ejectSeconds * SPIN_ACCEL;
  if (t <= 0) return 0;
  if (t < accelSeconds) return t / accelSeconds;
  if (t < plan.ejectSeconds) return 1;
  return Math.max(0, 1 - (t - plan.ejectSeconds) / plan.coastSeconds);
}
