// アプリの中のブラウザ（Instagram や TikTok などで開いたページ）の見分け方（decisions.md 手順5の (a) の (4)）。
// アプリの中のブラウザは Safari / Chrome と別に Cookie を持つので、後で Safari / Chrome から開き直すと
// 同じプレイヤーとして戻れない。見分けたら、参加画面で Safari / Chrome で開くよう案内する。
// 見分け方は inapp-spy（https://github.com/shalanah/inapp-spy）を参考にした

/**
 * アプリの中のブラウザに共通する印。アプリの一覧を保守しなくても、一覧にないアプリまで拾える
 * - 名乗りに WebView を含む
 * - iPhone・iPad なのに、Safari を示す印（Safari/）がない（アプリが組み込んだブラウザ。
 *   iPhone の Chrome や Firefox は Safari/ を含むので当たらない）
 * - Android のアプリが組み込んだブラウザの印（wv）がある
 */
const COMMON_MARKS = [
  /WebView/i,
  /(iPhone|iPod|iPad)(?!.*Safari\/)/i,
  /Android.*wv\)/i,
];

/**
 * 主なアプリの名乗り。共通の印が付かない場合に備えて足す
 * （Facebook・Messenger、Instagram、Threads、TikTok、X、LINE、WeChat、Snapchat、LinkedIn、Google アプリ、WhatsApp、Reddit）
 */
const APP_MARKS = [
  /\bFB[\w_]+\/|\bFacebook|FB_IAB|FBAN/i,
  /\bInstagram/i,
  /\bBarcelona/i,
  /musical_ly|Bytedance/i,
  /\bTwitter/i,
  /\bLine\//i,
  /\bMicroMessenger\//i,
  /Snapchat/i,
  /LinkedInApp/i,
  /\bGSA\//i,
  /\b(WAiOS|WA4A)\//i,
  /\bReddit\//i,
];

/**
 * ブラウザの名乗り（User-Agent）から、アプリの中のブラウザかを見分ける。
 * iPhone でアプリが Safari の画面を呼び出す形（SFSafariViewController）は、名乗りが Safari と同じなので見分けられない
 */
export function isInAppBrowser(userAgent: string): boolean {
  return [...COMMON_MARKS, ...APP_MARKS].some((mark) => mark.test(userAgent));
}
