import type { SpinPlan } from "./spin";

/** 抽選演出の各段階の長さ（秒）。試作画面のつまみで変えて、ちょうどよい値を探す */
export interface DrawTiming {
  /** 回し始めてから玉が飛び出すまでの長さ（溜め）。玉が出た後も胴は惰性で少し回る */
  readonly spinSeconds: number;
  /** 玉が飛び出すまでに回す回数（出口の向きを合わせるため、実際は ±半回転ずれる） */
  readonly spinTurns: number;
  /** 飛び出した玉が坂を転がる長さ */
  readonly rollSeconds: number;
  /** 受け皿に止まってから発表までのじらし */
  readonly teaseSeconds: number;
  /** 玉が中央に寄って大きくなる長さ */
  readonly zoomSeconds: number;
  /** 発表した番号を見せておく長さ */
  readonly holdSeconds: number;
}

/** 2026-11-15 にユーザーが試作画面で調整した値 */
export const DEFAULT_TIMING: DrawTiming = {
  spinSeconds: 2,
  spinTurns: 2,
  rollSeconds: 0.8,
  teaseSeconds: 0.6,
  zoomSeconds: 0.6,
  holdSeconds: 4,
};

/** 演出の中で音を鳴らすきっかけ */
export type DrawCue =
  /** ガラガラを回し始めた（回転の予定つき。音を回転の速さに合わせるため） */
  | { readonly type: "spinStart"; readonly plan: SpinPlan }
  /** 玉が出口から飛び出した */
  | { readonly type: "eject" }
  /** 玉が落ちた。surface は落ちた場所（金属の坂か、毛せんの受け皿か）、strength は 0〜1 の強さ */
  | {
      readonly type: "land";
      readonly surface: "chute" | "tray";
      readonly strength: number;
    }
  /** 玉が坂を転がり始めた（seconds 秒で転がり終わる） */
  | { readonly type: "roll"; readonly seconds: number }
  /** あと seconds 秒で発表する（発表の前から鳴らし始める音のため） */
  | { readonly type: "revealSoon"; readonly seconds: number }
  /** 番号を発表した */
  | { readonly type: "reveal" };
