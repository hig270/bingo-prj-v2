import type { PlayerSoundName } from "./player-sound";

/**
 * プレイヤーの効果音の仮の音（合成した短い電子音）。
 * 素材を選ぶまでの間だけ使い、選んだらこのファイルごと消す（decisions.md 手順5の (b)）。
 * きっかけごとに高さと長さを変えて、5つを聞き分けられるようにしている
 */

interface Note {
  /** 高さ（Hz） */
  readonly freq: number;
  /** 鳴らし始めるまでの秒数 */
  readonly at: number;
  /** 鳴っている秒数 */
  readonly length: number;
  readonly wave: OscillatorType;
  readonly gain: number;
}

// 音階の高さ（Hz）
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const A5 = 880;
const C6 = 1046.5;

const TONES = {
  // 高めの短い「ポッ」
  open: [{ freq: 1200, at: 0, length: 0.05, wave: "triangle", gain: 0.5 }],
  // 2音で上がる「ピロッ」
  reach: [
    { freq: E5, at: 0, length: 0.1, wave: "square", gain: 0.15 },
    { freq: A5, at: 0.1, length: 0.15, wave: "square", gain: 0.15 },
  ],
  // 3音を上がる「ピロリン」
  bingo: [
    { freq: C5, at: 0, length: 0.25, wave: "triangle", gain: 0.4 },
    { freq: E5, at: 0.08, length: 0.25, wave: "triangle", gain: 0.4 },
    { freq: G5, at: 0.16, length: 0.35, wave: "triangle", gain: 0.4 },
  ],
  // 4音を上がって伸ばす
  prize: [
    { freq: C5, at: 0, length: 0.2, wave: "triangle", gain: 0.4 },
    { freq: E5, at: 0.1, length: 0.2, wave: "triangle", gain: 0.4 },
    { freq: G5, at: 0.2, length: 0.2, wave: "triangle", gain: 0.4 },
    { freq: C6, at: 0.3, length: 0.7, wave: "triangle", gain: 0.4 },
  ],
  // 低い「ブッ」
  notDrawn: [{ freq: 150, at: 0, length: 0.18, wave: "square", gain: 0.2 }],
} as const satisfies Record<PlayerSoundName, readonly Note[]>;

/** 仮の音 name を時刻 t に鳴らし、output につなぐ */
export function playTone(
  ctx: AudioContext,
  output: AudioNode,
  name: PlayerSoundName,
  t: number,
): void {
  for (const note of TONES[name]) {
    const start = t + note.at;
    const end = start + note.length;
    const osc = ctx.createOscillator();
    osc.type = note.wave;
    osc.frequency.value = note.freq;
    // 鳴り始めと終わりで「プツッ」と鳴らないよう、音量を素早く上げてから消していく
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(note.gain, start + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gain).connect(output);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}
