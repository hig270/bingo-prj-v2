/** 抽選演出の各段階の長さ（秒）。試作画面のつまみで変えて、ちょうどよい値を探す */
export interface DrawTiming {
  /** ガラガラを回す長さ（溜め） */
  readonly spinSeconds: number;
  /** その間に回す回数 */
  readonly spinTurns: number;
  /** 飛び出した玉が受け皿まで転がる長さ */
  readonly rollSeconds: number;
  /** 受け皿に止まってから発表までのじらし */
  readonly teaseSeconds: number;
  /** 玉が中央に寄って大きくなる長さ */
  readonly zoomSeconds: number;
  /** 発表した番号を見せておく長さ */
  readonly holdSeconds: number;
}

export const DEFAULT_TIMING: DrawTiming = {
  spinSeconds: 2.6,
  spinTurns: 3,
  rollSeconds: 0.9,
  teaseSeconds: 0.6,
  zoomSeconds: 0.7,
  holdSeconds: 2.5,
};
