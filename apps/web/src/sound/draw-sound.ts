import { speedAt, type SpinPlan } from "../draw/spin";
import type { DrawCue } from "../draw/timing";
import { SOUND_NAMES, SOUND_SOURCES, type SoundName } from "./sources";

/**
 * ガラガラの音を重くする設定。素材は軽い玉が「カラカラ」鳴る音なので、
 * 再生を遅くして低くし、高い音を削って低い音を足す。
 * さらに、高さとずらした位置を変えた2つ目の音を重ねて、玉が多く詰まった重い感じにする
 */
const RATTLE_TONE = {
  /** 回る速さが 0 のときと最高のときの再生速度 */
  rateSlow: 0.6,
  rateFast: 0.71,
  /** 2つ目の音の再生速度（1つ目に対する比）・ずらす秒数・大きさ */
  layerRatio: 0.82,
  layerOffset: 1.3,
  layerGain: 0.8,
  /** この周波数より高い音を削る（Hz） */
  lowpass: 2100,
  /** この周波数より低い音を持ち上げる（Hz, dB） */
  lowShelf: 300,
  lowShelfGain: 9,
} as const;

/** 「抽選機を回す」の音で、繰り返しに使う区間（立ち上がりと消え際を除いた中ほど） */
const RATTLE_LOOP = { start: 0.5, end: 3.0 } as const;
/** 「抽選機から玉が出る」の音の、最初の「コトッ」の長さ */
const BALL_HIT_SECONDS = 0.12;

/**
 * 玉の音を重くする設定。素材の玉は軽く聞こえるので、再生を遅くして低くし、
 * 高い音を削って低い音を足す（飛び出す・坂に当たる・受け皿に落ちる、のすべてにかける）
 */
const BALL_TONE = {
  /** 再生速度にかける倍率 */
  rate: 0.8,
  /** この周波数より高い音を削る（Hz） */
  lowpass: 2400,
  /** この周波数より低い音を持ち上げる（Hz, dB） */
  lowShelf: 250,
  lowShelfGain: 8,
} as const;
/** ドラムロールの頭の一打を飛ばして、連打の部分から鳴らす */
const DRUM_ROLL_OFFSET = 0.4;
const DRUM_ROLL_LOOP = { start: 1.0, end: 4.2 } as const;

/**
 * 抽選演出の効果音（効果音ラボの素材を、演出のきっかけに合わせて鳴らす）。
 *
 * ブラウザは、利用者の操作（ボタンを押すなど）の中でないと音を出させない。
 * そのため、最初に音を出す前に、ボタンを押したときの処理の中で unlock() を呼ぶ。
 * 音のファイルは unlock() のときに読み込み始める（演出の前に読み込みを終えておく）。
 */
export class DrawSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** 玉の音の通り道（音色を整えてから全体の音量につなぐ） */
  private ballOut: AudioNode | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private loading: Promise<readonly SoundName[]> | null = null;
  private muted = false;
  /** 鳴っているドラムロール（発表の瞬間に止める） */
  private drumRoll: { source: AudioBufferSourceNode; gain: GainNode } | null =
    null;
  /** 受け皿に落ちた回数（最初の1回だけ「玉が出る」の音を丸ごと鳴らす） */
  private trayLands = 0;
  private readonly random: () => number;

  /** random は音のばらつきに使う乱数（テストで固定できるように外から渡せる） */
  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /**
   * ボタンを押したときの処理の中で呼ぶ。
   * 読み込めなかった音の名前の一覧を返す（ファイルが置かれていないなど）
   */
  unlock(): Promise<readonly SoundName[]> {
    if (this.ctx === null) {
      const ctx = new AudioContext();
      // 音が重なって大きくなりすぎても割れないように、最後に音量をならす
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.ratio.value = 4;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 1;
      master.connect(compressor).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = BALL_TONE.lowShelf;
      lowShelf.gain.value = BALL_TONE.lowShelfGain;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = BALL_TONE.lowpass;
      lowShelf.connect(lowpass).connect(master);
      this.ballOut = lowShelf;
      this.loading = this.load(ctx);
    }
    void this.ctx.resume();
    return this.loading ?? Promise.resolve([]);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master !== null && this.ctx !== null) {
      this.master.gain.setTargetAtTime(
        muted ? 0 : 1,
        this.ctx.currentTime,
        0.02,
      );
    }
  }

  /**
   * 鳴り続ける音（ドラムロール）を止める。演出の途中で画面が切り替わったときに呼ぶ
   * （演出が止まると、ドラムロールを止める「発表」のきっかけが来なくなるため）
   */
  stop(): void {
    if (this.ctx !== null) this.stopDrumRoll(this.ctx.currentTime);
  }

  /** 演出のきっかけに合わせて音を鳴らす */
  play(cue: DrawCue): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const now = ctx.currentTime + 0.005;
    switch (cue.type) {
      case "spinStart":
        this.trayLands = 0;
        this.rattle(now, cue.plan);
        return;
      case "eject":
        this.ballHit(now, 0.7, 1);
        return;
      case "land":
        if (cue.surface === "chute") {
          // 金属の坂に当たる音は、少し高くして硬い感じにする
          this.ballHit(now, 0.5 * cue.strength + 0.2, 1.3);
          return;
        }
        this.trayLands += 1;
        if (this.trayLands === 1) {
          // 受け皿に落ちて跳ねる音は「玉が出る」の音を丸ごと使う（後ろに小さな跳ね返りが入っている）
          this.sample("ball", now, {
            gain: 1.1,
            rate: BALL_TONE.rate * (0.97 + this.random() * 0.06),
            ...(this.ballOut === null ? {} : { output: this.ballOut }),
          });
        }
        return;
      case "roll":
        // 坂を転がる音は合う素材がないので鳴らさない
        return;
      case "revealSoon":
        // 受け皿に止まってから発表までの「じらし」の間、ドラムロールを鳴らす
        this.startDrumRoll(now);
        return;
      case "reveal":
        this.stopDrumRoll(now);
        this.reveal(now);
        return;
    }
  }

  // ---- ここから下は内部の処理 ----

  private async load(ctx: AudioContext): Promise<readonly SoundName[]> {
    const results = await Promise.all(
      SOUND_NAMES.map(async (name) => {
        try {
          const res = await fetch(`/sounds/${SOUND_SOURCES[name].file}`);
          if (!res.ok) return name;
          this.buffers.set(
            name,
            await ctx.decodeAudioData(await res.arrayBuffer()),
          );
          return null;
        } catch {
          return name;
        }
      }),
    );
    return results.filter((name) => name !== null);
  }

  /** 音のファイル name を時刻 t に鳴らす（ファイルが無ければ何もしない） */
  private sample(
    name: SoundName,
    t: number,
    o: {
      gain: number;
      rate?: number;
      offset?: number;
      duration?: number;
      /** 音量の調整の後につなぐ先（省略すると全体の音量につなぐ） */
      output?: AudioNode;
    },
  ): { source: AudioBufferSourceNode; gain: GainNode } | null {
    const ctx = this.ctx;
    const master = this.master;
    const buffer = this.buffers.get(name);
    if (ctx === null || master === null || buffer === undefined) return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = o.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = o.gain;
    source.connect(gain).connect(o.output ?? master);
    source.start(Math.max(t, ctx.currentTime), o.offset ?? 0, o.duration);
    return { source, gain };
  }

  /** 「玉が出る」の音の最初の「コトッ」だけを鳴らす。毎回少し高さを変える */
  private ballHit(t: number, gain: number, rate: number): void {
    const played = this.sample("ball", t, {
      gain,
      rate: BALL_TONE.rate * rate * (0.96 + this.random() * 0.08),
      duration: BALL_HIT_SECONDS,
      ...(this.ballOut === null ? {} : { output: this.ballOut }),
    });
    // 切った終わりで「プツッ」と鳴らないよう、最後を素早く消す
    // （再生を遅くしているので、そのぶん実際の時間は長くなる）
    played?.gain.gain.setTargetAtTime(
      0,
      t + (BALL_HIT_SECONDS * 0.6) / BALL_TONE.rate,
      0.015,
    );
  }

  /**
   * ガラガラの音。回す時間が長いときは中ほどを繰り返す。
   * 回る速さに合わせて音量と高さを少し変え、胴が止まるのに合わせて消す。
   * 重い音にするため、低くした音を2つ重ね、音色を整えてから鳴らす（RATTLE_TONE）
   */
  private rattle(t: number, plan: SpinPlan): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    const total = plan.ejectSeconds + plan.coastSeconds;

    // 高い音を削り、低い音を持ち上げる
    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = RATTLE_TONE.lowShelf;
    lowShelf.gain.value = RATTLE_TONE.lowShelfGain;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = RATTLE_TONE.lowpass;
    // 回る速さに合わせて音量を変える（2つの音にまとめてかける）
    const envelope = ctx.createGain();
    envelope.gain.value = 0;
    lowShelf.connect(lowpass).connect(envelope).connect(master);

    const points = 64;
    const speeds = Array.from({ length: points }, (_, i) =>
      speedAt(plan, (total * i) / (points - 1)),
    );
    envelope.gain.setValueCurveAtTime(
      speeds.map((s, i) => (i === points - 1 ? 0 : 0.3 + 0.7 * s)),
      t,
      total,
    );
    const rates = speeds.map(
      (s) =>
        RATTLE_TONE.rateSlow +
        (RATTLE_TONE.rateFast - RATTLE_TONE.rateSlow) * s,
    );

    const layers = [
      { ratio: 1, offset: 0, gain: 1 },
      {
        ratio: RATTLE_TONE.layerRatio,
        offset: RATTLE_TONE.layerOffset,
        gain: RATTLE_TONE.layerGain,
      },
    ];
    for (const layer of layers) {
      const played = this.sample("rattle", t, {
        gain: layer.gain,
        offset: RATTLE_LOOP.start + layer.offset,
        output: lowShelf,
      });
      if (played === null) return;
      const { source } = played;
      source.loop = true;
      source.loopStart = RATTLE_LOOP.start;
      source.loopEnd = RATTLE_LOOP.end;
      source.playbackRate.setValueCurveAtTime(
        rates.map((r) => r * layer.ratio),
        t,
        total,
      );
      source.stop(t + total + 0.05);
    }
  }

  private startDrumRoll(t: number): void {
    if (this.drumRoll !== null) return;
    const played = this.sample("drumRoll", t, {
      gain: 0.55,
      offset: DRUM_ROLL_OFFSET,
    });
    if (played === null) return;
    played.source.loop = true;
    played.source.loopStart = DRUM_ROLL_LOOP.start;
    played.source.loopEnd = DRUM_ROLL_LOOP.end;
    this.drumRoll = played;
  }

  private stopDrumRoll(t: number): void {
    const roll = this.drumRoll;
    if (roll === null) return;
    roll.gain.gain.setTargetAtTime(0, t, 0.03);
    roll.source.stop(t + 0.3);
    this.drumRoll = null;
  }

  /** 発表の音（ドラムロールの締めのシンバル） */
  private reveal(t: number): void {
    this.sample("rollFinish", t, { gain: 1 });
  }
}
