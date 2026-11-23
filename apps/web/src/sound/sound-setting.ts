import { useEffect, useEffectEvent, useState } from "react";

/**
 * 音のオン／オフの設定（decisions.md「音はホスト画面・プレイヤー画面の両方で鳴らす」）。
 * 最初はオンで、端末に保存する。ホストの音は会場に流すもの、プレイヤーの音は自分だけが聞くもので、
 * 切りたい理由が違うので、別々に保存する（decisions.md 手順5の (b)）
 */
export type SoundRole = "host" | "player";

const KEYS = {
  host: "bingo:sound:host",
  player: "bingo:sound:player",
} as const satisfies Record<SoundRole, string>;

/** 保存してある設定。保存がない・読めない環境（プライベートブラウズなど）ではオン */
export function loadSoundOn(role: SoundRole): boolean {
  try {
    return localStorage.getItem(KEYS[role]) !== "off";
  } catch {
    return true;
  }
}

export function saveSoundOn(role: SoundRole, on: boolean): void {
  try {
    localStorage.setItem(KEYS[role], on ? "on" : "off");
  } catch {
    // 保存できない環境では覚えない（開き直すとオンに戻る）
  }
}

/**
 * 画面で使う音の設定。apply は設定を音の部品に当てる処理で、最初の表示と、切り替えるたびに呼ぶ
 */
export function useSoundSetting(
  role: SoundRole,
  apply: (on: boolean) => void,
): readonly [on: boolean, setOn: (on: boolean) => void] {
  const [on, setOnState] = useState(() => loadSoundOn(role));
  const applyEvent = useEffectEvent(apply);
  useEffect(() => {
    applyEvent(on);
  }, [on]);
  function setOn(next: boolean) {
    saveSoundOn(role, next);
    setOnState(next);
  }
  return [on, setOn];
}
