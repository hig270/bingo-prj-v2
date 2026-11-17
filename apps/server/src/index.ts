import { createApp, type AppBindings } from "./app";

export { RoomDO } from "./room";

// API（app.ts）を Worker として公開する。Cloudflare は wrangler.jsonc の設定どおりの env を渡す
export default createApp();

/**
 * wrangler が生成した Env（wrangler.jsonc の設定どおりの形）が、API の求める形（AppBindings）を
 * 満たすことを型で確かめる。満たさなければ、ここが型エラーになる
 */
type Satisfies<T extends AppBindings> = T;
export type CheckedEnv = Satisfies<Env>;
