import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSoundOn, saveSoundOn } from "./sound-setting";

/** テスト用の localStorage（中身は Map に持つ） */
function fakeStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("音のオン／オフの設定", () => {
  it("保存がなければオン", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(loadSoundOn("host")).toBe(true);
    expect(loadSoundOn("player")).toBe(true);
  });

  it("保存した設定を読み戻せる", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveSoundOn("player", false);
    expect(loadSoundOn("player")).toBe(false);
    saveSoundOn("player", true);
    expect(loadSoundOn("player")).toBe(true);
  });

  it("ホストとプレイヤーの設定は別々", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveSoundOn("host", false);
    expect(loadSoundOn("host")).toBe(false);
    expect(loadSoundOn("player")).toBe(true);
  });

  it("保存が使えない環境では、オンのまま動く", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("使えない");
      },
      setItem: () => {
        throw new Error("使えない");
      },
    });
    expect(() => {
      saveSoundOn("host", false);
    }).not.toThrow();
    expect(loadSoundOn("host")).toBe(true);
  });
});
