import { describe, expect, it } from "vitest";
import { isInAppBrowser } from "./in-app-browser";

// ブラウザの名乗り（User-Agent）の例。版の数字は例で、見分けには使わない

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const PC_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
// iPad の Safari は、パソコンの Safari と同じ名乗りをする
const IPAD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

const IOS_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85 (iPhone15,2; iOS 18_5; ja_JP; ja; scale=3.00; 1179x2556)";
const IOS_LINE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.10.0";
// 一覧にないアプリが組み込んだブラウザ（iPhone）
const IOS_UNKNOWN_APP =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
// 一覧にないアプリが組み込んだブラウザ（Android。wv の印がある）
const ANDROID_UNKNOWN_APP =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36";
// Android の Facebook（wv の印に加えて、アプリの名乗りがある）
const ANDROID_FACEBOOK =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/520.0.0.47.70;]";

describe("isInAppBrowser", () => {
  it("Safari・Chrome（スマホ・パソコン・iPad）は当たらない", () => {
    for (const ua of [
      IOS_SAFARI,
      IOS_CHROME,
      ANDROID_CHROME,
      PC_CHROME,
      IPAD_SAFARI,
    ]) {
      expect(isInAppBrowser(ua)).toBe(false);
    }
  });

  it("主なアプリの中のブラウザは当たる（LINE も除かない）", () => {
    for (const ua of [IOS_INSTAGRAM, IOS_LINE, ANDROID_FACEBOOK]) {
      expect(isInAppBrowser(ua)).toBe(true);
    }
  });

  it("一覧にないアプリでも、共通の印で当たる", () => {
    expect(isInAppBrowser(IOS_UNKNOWN_APP)).toBe(true);
    expect(isInAppBrowser(ANDROID_UNKNOWN_APP)).toBe(true);
  });
});
