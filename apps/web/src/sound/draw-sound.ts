import { angleAt, speedAt, type SpinPlan } from "../draw/spin";
import type { DrawCue } from "../draw/timing";

/**
 * 抽選演出の効果音。音のファイルは使わず、Web Audio API でその場で合成する
 * （利用条件の心配がなく、回す長さなどに合わせて音を変えられる）。
 *
 * ブラウザは、利用者の操作（ボタンを押すなど）の中でないと音を出させない。
 * そのため、最初に音を出す前に、ボタンを押したときの処理の中で unlock() を呼ぶ。
 */
export class DrawSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;

  private readonly random: () => number;

  /** random は音のばらつきに使う乱数（テストで固定できるように外から渡せる） */
  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /** ボタンを押したときの処理の中で呼ぶ */
  unlock(): void {
    if (this.ctx === null) {
      const ctx = new AudioContext();
      // 音が重なって大きくなりすぎても割れないように、最後に音量をならす
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.ratio.value = 6;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.9;
      master.connect(compressor).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      this.noise = makeNoise(ctx, this.random);
    }
    void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master !== null && this.ctx !== null) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : 0.9,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  /** 演出のきっかけに合わせて音を鳴らす */
  play(cue: DrawCue): void {
    const ctx = this.ctx;
    const master = this.master;
    const noise = this.noise;
    if (ctx === null || master === null || noise === null) return;
    const v: Voice = { ctx, out: master, noise, random: this.random };
    const now = ctx.currentTime + 0.01;
    switch (cue.type) {
      case "spinStart":
        rattle(v, now, cue.plan);
        return;
      case "eject":
        woodKnock(v, now, 0.7);
        return;
      case "land":
        if (cue.surface === "chute") metalPing(v, now, cue.strength);
        else feltThud(v, now, cue.strength);
        return;
      case "roll":
        metalRoll(v, now, cue.seconds);
        return;
      case "reveal":
        fanfare(v, now);
        return;
    }
  }
}

// ---- ここから下は音の作り方 ----

interface Voice {
  readonly ctx: AudioContext;
  readonly out: AudioNode;
  readonly noise: AudioBuffer;
  readonly random: () => number;
}

/** 2 秒分の白色雑音（いろいろな音の材料にする） */
function makeNoise(ctx: AudioContext, random: () => number): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1;
  return buffer;
}

/** 音量の形: すぐ立ち上がり、decay 秒で消える */
function envelope(
  v: Voice,
  t: number,
  peak: number,
  decay: number,
  attack = 0.002,
): GainNode {
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

/** 雑音を、決まった高さの帯だけ通して短く鳴らす（ぶつかる音の材料） */
function noiseHit(
  v: Voice,
  t: number,
  o: {
    type: BiquadFilterType;
    freq: number;
    q: number;
    peak: number;
    decay: number;
  },
): void {
  const src = v.ctx.createBufferSource();
  src.buffer = v.noise;
  const filter = v.ctx.createBiquadFilter();
  filter.type = o.type;
  filter.frequency.value = o.freq;
  filter.Q.value = o.q;
  const g = envelope(v, t, o.peak, o.decay);
  src.connect(filter).connect(g).connect(v.out);
  // 雑音のどこから使うかを毎回ずらして、同じ音の繰り返しに聞こえないようにする
  const length = o.decay + 0.05;
  src.start(t, v.random() * Math.max(0, v.noise.duration - length), length);
}

/** 決まった高さの音を短く鳴らす */
function tone(
  v: Voice,
  t: number,
  o: {
    type: OscillatorType;
    freq: number;
    toFreq?: number;
    peak: number;
    decay: number;
    attack?: number;
  },
): void {
  const osc = v.ctx.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.toFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(o.toFreq, t + o.decay);
  }
  const g = envelope(v, t, o.peak, o.decay, o.attack);
  osc.connect(g).connect(v.out);
  osc.start(t);
  osc.stop(t + (o.attack ?? 0.002) + o.decay + 0.05);
}

/**
 * ガラガラの音。胴の中で玉がぶつかり合う「カチャカチャ」を、回る速さに合わせて細かく鳴らす。
 * さらに、八角形の角を越えるたびに玉がまとめて隣の面へ落ちる「ゴロッ」を重ねる（回転と音がそろう）。
 */
function rattle(v: Voice, start: number, plan: SpinPlan): void {
  const total = plan.ejectSeconds + plan.coastSeconds;

  // 玉同士・玉と木がぶつかる細かい音
  let t = 0;
  while (t < total) {
    const speed = speedAt(plan, t);
    if (speed > 0.05) {
      noiseHit(v, start + t, {
        type: "bandpass",
        freq: 1600 + v.random() * 2800,
        q: 6 + v.random() * 6,
        peak: (0.12 + 0.28 * speed) * (0.4 + v.random() * 0.6),
        decay: 0.015 + v.random() * 0.03,
      });
    }
    const rate = 8 + 42 * speed; // 1 秒あたりの回数
    t += (0.4 + v.random() * 1.2) / rate;
  }

  // 八角形の角（45 度ごと）を越える瞬間を探して「ゴロッ」を鳴らす
  const step = 0.005;
  let lastEdge = 0;
  for (let s = step; s < total; s += step) {
    const edge = Math.floor(angleAt(plan, s) / 45);
    if (edge > lastEdge) {
      lastEdge = edge;
      const speed = speedAt(plan, s);
      noiseHit(v, start + s, {
        type: "lowpass",
        freq: 500,
        q: 1,
        peak: 0.35 * (0.4 + speed),
        decay: 0.09,
      });
      tone(v, start + s, {
        type: "sine",
        freq: 150,
        toFreq: 90,
        peak: 0.25 * (0.4 + speed),
        decay: 0.1,
      });
    }
  }

  // 胴の中で玉が転がり続ける低い「ゴー」という響き
  const src = v.ctx.createBufferSource();
  src.buffer = v.noise;
  src.loop = true;
  const filter = v.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 320;
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0, start);
  const curve = Array.from(
    { length: 64 },
    (_, i) => 0.18 * speedAt(plan, (total * i) / 63),
  );
  g.gain.setValueCurveAtTime(curve, start, total);
  src.connect(filter).connect(g).connect(v.out);
  src.start(start);
  src.stop(start + total + 0.05);
}

/** 玉が木の出口から飛び出す「コトッ」 */
function woodKnock(v: Voice, t: number, strength: number): void {
  tone(v, t, {
    type: "triangle",
    freq: 820,
    toFreq: 380,
    peak: 0.5 * strength,
    decay: 0.07,
  });
  noiseHit(v, t, {
    type: "bandpass",
    freq: 2400,
    q: 3,
    peak: 0.4 * strength,
    decay: 0.02,
  });
}

/** 金属の坂に落ちる「チン」。金属らしく、整数倍でない高さの音を重ねる */
function metalPing(v: Voice, t: number, strength: number): void {
  const base = 1500 + v.random() * 120;
  const partials = [
    [1, 0.5, 0.45],
    [2.76, 0.3, 0.3],
    [5.4, 0.18, 0.18],
    [8.93, 0.1, 0.1],
  ] as const;
  for (const [ratio, peak, decay] of partials) {
    tone(v, t, {
      type: "sine",
      freq: base * ratio,
      peak: peak * strength,
      decay,
    });
  }
  noiseHit(v, t, {
    type: "highpass",
    freq: 5000,
    q: 0.7,
    peak: 0.2 * strength,
    decay: 0.015,
  });
}

/** 金属の坂を転がる「シャー」という音 */
function metalRoll(v: Voice, t: number, seconds: number): void {
  const src = v.ctx.createBufferSource();
  src.buffer = v.noise;
  src.loop = true;
  const filter = v.ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2200, t);
  // 転がるにつれて速くなるので、音を少しずつ高く
  filter.frequency.linearRampToValueAtTime(3600, t + seconds);
  filter.Q.value = 1.2;
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.07, t + 0.05);
  g.gain.linearRampToValueAtTime(0.11, t + seconds * 0.9);
  g.gain.linearRampToValueAtTime(0, t + seconds);
  src.connect(filter).connect(g).connect(v.out);
  src.start(t);
  src.stop(t + seconds + 0.05);
}

/** 毛せんの受け皿に落ちる「ポスッ」。柔らかいので高い音を削った鈍い音 */
function feltThud(v: Voice, t: number, strength: number): void {
  noiseHit(v, t, {
    type: "lowpass",
    freq: 650,
    q: 0.8,
    peak: 0.7 * strength,
    decay: 0.08,
  });
  tone(v, t, {
    type: "sine",
    freq: 130,
    toFreq: 70,
    peak: 0.6 * strength,
    decay: 0.09,
  });
}

/** 発表の「ジャーン」。低い一撃・金管風の和音・きらめき・シンバル風の響きを同時に */
function fanfare(v: Voice, t: number): void {
  // 低い一撃
  tone(v, t, { type: "sine", freq: 90, toFreq: 38, peak: 0.9, decay: 0.45 });
  noiseHit(v, t, {
    type: "lowpass",
    freq: 900,
    q: 0.7,
    peak: 0.5,
    decay: 0.12,
  });

  // 金管風の和音（ド・ミ・ソ・ド）。少しずらした2つの音を重ねて厚みを出す
  const chord = [523.25, 659.25, 783.99, 1046.5];
  const filter = v.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(700, t);
  filter.frequency.linearRampToValueAtTime(4200, t + 0.08);
  filter.frequency.exponentialRampToValueAtTime(1600, t + 1.6);
  const g = v.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.03);
  g.gain.setValueAtTime(0.16, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  filter.connect(g).connect(v.out);
  for (const freq of chord) {
    for (const detune of [-7, 7]) {
      const osc = v.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 2.3);
    }
  }

  // きらめき（高い音を素早く駆け上がる）
  const sparkle = [1567.98, 2093.0, 2637.02, 3135.96, 4186.01];
  sparkle.forEach((freq, i) => {
    tone(v, t + 0.05 + i * 0.055, {
      type: "sine",
      freq,
      peak: 0.12,
      decay: 0.35,
    });
  });

  // シンバル風の響き
  noiseHit(v, t, {
    type: "highpass",
    freq: 6500,
    q: 0.5,
    peak: 0.22,
    decay: 1.4,
  });
}
