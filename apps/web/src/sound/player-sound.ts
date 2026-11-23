import type { TapResult } from "../state/room";
import { playTone } from "./player-tones";

/** プレイヤーの画面で鳴らす効果音（decisions.md 手順5の (b) の (4)） */
export type PlayerSoundName = "open" | "reach" | "bingo" | "prize" | "notDrawn";

/** 出来事の音を、マスを開ける音からどれだけ遅らせて重ねるか（秒） */
const EVENT_DELAY = 0.08;

/**
 * マスを押した結果から、鳴らす音を順に返す。
 * 開けたときはいつも開ける音を鳴らし、出来事があれば続けて出来事の音を重ねる。
 * ビンゴの音は一度にそろった本数によらず1つで、景品獲得のビンゴは景品の音にする（decisions.md 手順5の (b)）
 */
export function soundsOfTap(result: TapResult): readonly PlayerSoundName[] {
  switch (result.kind) {
    case "ignored":
      return [];
    case "notDrawn":
      return ["notDrawn"];
    case "opened": {
      const event = result.event;
      if (event === null) return ["open"];
      switch (event.type) {
        case "reach":
          return ["open", "reach"];
        case "bingo":
          return ["open", event.prize ? "prize" : "bingo"];
      }
    }
  }
}

/**
 * プレイヤーの効果音。
 *
 * ブラウザは、利用者の操作（ボタンを押すなど）の中でないと音を出させない。
 * そのため、参加ボタン・マス・キャラクター・スピーカーボタンを押したときの処理の中で unlock() を呼ぶ
 * （参加ボタンを押した人はそこで、再読み込みで戻った人は最初に何かを押したときに有効になる）。
 */
export class PlayerSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

  /**
   * 押したときの処理の中で呼ぶ。2回目からは、止められていた音を再開するだけ。
   * 音を出す仕組みが使えない環境（Web Audio を切ったブラウザなど）では、音が鳴らないだけにする
   * （呼び出し元は参加やマスを開ける処理の前に呼ぶので、ここで例外を出すとゲームの操作まで止まるため）
   */
  unlock(): void {
    if (this.ctx === null) {
      if (typeof AudioContext === "undefined") return;
      try {
        const ctx = new AudioContext();
        const master = ctx.createGain();
        master.gain.value = this.muted ? 0 : 1;
        master.connect(ctx.destination);
        this.ctx = ctx;
        this.master = master;
      } catch {
        return;
      }
    }
    this.ctx.resume().catch(() => undefined);
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

  /** 音を順に鳴らす（2つ目からは EVENT_DELAY ずつ遅らせて重ねる） */
  play(names: readonly PlayerSoundName[]): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null || this.muted) return;
    const now = ctx.currentTime + 0.005;
    names.forEach((name, i) => {
      playTone(ctx, master, name, now + i * EVENT_DELAY);
    });
  }
}

/**
 * プレイヤーの効果音の部品は、画面の外に1つだけ置く。
 * 参加画面と、参加した後の画面は別の部品なので、参加ボタンで有効にした状態をゲーム画面まで持ち越すため
 */
export const playerSound = new PlayerSound();
