import { generateCard } from "@bingo/game";
import {
  CLOSE,
  ClientMessage,
  type ByeReason,
  PlayerId,
  RATE_LIMIT_COOLDOWN_SECONDS,
  nameKey,
  type Me,
  type MeResponse,
  type PlayerName,
  type PlayerSummary,
  type RoomInfo,
  type RoomSettings,
  type ServerMessage,
} from "@bingo/protocol";
import { DurableObject } from "cloudflare:workers";
import { RateLimiter } from "./rate-limit";
import { HEADER, type JoinResult, type TokenHashes } from "./room-api";
import {
  Attachment,
  BLOCKED_KEY_PREFIX,
  BlockedUntil,
  PLAYER_KEY_PREFIX,
  PlayerRecord,
  ROOM_KEY,
  RoomRecord,
  blockedKey,
  playerKey,
} from "./records";
import { TOKEN_TTL_SECONDS, randomString, secureRandom } from "./token";

/** 1ルームの参加人数の上限（設計目標と同じ。ルームの設定として保存する） */
export const MAX_PLAYERS = 1000;

const TTL_MS = TOKEN_TTL_SECONDS * 1000;

/**
 * ゲームを始めなかったルームを消すまでの時間（作ってから 24 時間）。
 * 遊んだルームは、ゲームを始めたときに 7 日後に予約し直す（decisions.md「ルームのデータを消す時期」）
 */
export const UNPLAYED_ROOM_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * ルームの Durable Object（1ルーム＝1インスタンス）。
 * Worker からは RPC（このクラスのメソッドを直接呼ぶ）で呼び出す。WebSocket の接続開始だけは fetch で受ける。
 *
 * 状態は保存領域に書き、メモリにも写しを持つ（休止すると消えるので、起きたときに読み直す）
 */
export class RoomDO extends DurableObject<Env> {
  private room: RoomRecord | null = null;
  private readonly players = new Map<PlayerId, PlayerRecord>();
  /** トークンのハッシュ値 → 参加者 ID */
  private readonly byToken = new Map<string, PlayerId>();
  /** 接続ごとの送信回数の制限（休止すると消えるが、起きたら作り直せばよい） */
  private readonly limiters = new WeakMap<WebSocket, RateLimiter>();
  /**
   * 送りすぎで切断した人（接続の目印）と、つなぎ直しを受け付けない期限。
   * 休止しても残るよう保存領域にも書く。期限切れの記録は消さない（1人1件までで、ルームは数時間で使い終わるため）
   */
  private readonly blockedUntil = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 通信を保つための確認（ping）には、ルームを起こさずに自動で返す
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
    void ctx.blockConcurrencyWhile(() => this.load());
  }

  private async load(): Promise<void> {
    const room = await this.ctx.storage.get(ROOM_KEY);
    this.room = room === undefined ? null : RoomRecord.parse(room);
    const stored = await this.ctx.storage.list({ prefix: PLAYER_KEY_PREFIX });
    for (const value of stored.values()) {
      this.remember(PlayerRecord.parse(value));
    }
    const blocked = await this.ctx.storage.list({ prefix: BLOCKED_KEY_PREFIX });
    for (const [key, value] of blocked) {
      this.blockedUntil.set(
        key.slice(BLOCKED_KEY_PREFIX.length),
        BlockedUntil.parse(value),
      );
    }
  }

  private remember(player: PlayerRecord): void {
    this.players.set(player.id, player);
    this.byToken.set(player.session.tokenHash, player.id);
  }

  // ---- Worker から呼ぶ RPC ----

  /** ルームを作る。同じ ID のルームが既にあれば false（別の ID で作り直してもらう） */
  async create(
    settings: RoomSettings,
    hostTokenHash: string,
    now: number,
  ): Promise<boolean> {
    if (this.room !== null) return false;
    const room: RoomRecord = {
      name: settings.name,
      rule: settings.rule,
      prizes: settings.prizes,
      status: "lobby",
      maxPlayers: MAX_PLAYERS,
      createdAt: now,
      host: { tokenHash: hostTokenHash, expiresAt: now + TTL_MS },
    };
    await this.ctx.storage.put(ROOM_KEY, room);
    await this.ctx.storage.setAlarm(now + UNPLAYED_ROOM_TTL_MS);
    this.room = room;
    return true;
  }

  /** ルームの公開情報と、画面を開いた人が誰か。ルームが無ければ null */
  info(tokens: TokenHashes, now: number): MeResponse | null {
    if (this.room === null) return null;
    return { room: this.publicInfo(this.room), me: this.whoIs(tokens, now) };
  }

  /** 参加する。newTokenHash は Worker が作った新しいトークンのハッシュ値 */
  async join(
    name: PlayerName,
    tokens: TokenHashes,
    newTokenHash: string,
    now: number,
  ): Promise<JoinResult | null> {
    const room = this.room;
    if (room === null) return null;
    const me = this.whoIs(tokens, now);
    if (me.role === "kicked") return { ok: false, error: "kicked" };
    if (me.role !== "none") return { ok: false, error: "alreadyJoined" };
    if (room.status !== "lobby") return { ok: false, error: "started" };
    const active = [...this.players.values()].filter((p) => !p.kicked);
    if (active.length >= room.maxPlayers) {
      return { ok: false, error: "roomFull" };
    }
    const key = nameKey(name);
    if (active.some((p) => p.nameKey === key)) {
      return { ok: false, error: "nameTaken" };
    }

    const player: PlayerRecord = {
      id: PlayerId.parse(randomString(9)),
      name,
      nameKey: key,
      session: { tokenHash: newTokenHash, expiresAt: now + TTL_MS },
      card: generateCard(room.rule.layout, secureRandom),
      kicked: false,
      joinedAt: now,
    };
    await this.ctx.storage.put(playerKey(player.id), player);
    this.remember(player);
    this.sendToHost({ type: "playerJoined", player: summary(player) });
    return { ok: true, id: player.id, name: player.name };
  }

  // ---- データを消す ----

  /**
   * 予約した時刻に、ルームの保存領域を丸ごと消す（予約も一緒に消える）。
   * つながっている人がいれば切る（画面は再読み込みすると「ルームが見つかりません」になる）
   */
  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.room = null;
    this.players.clear();
    this.byToken.clear();
    this.blockedUntil.clear();
    for (const ws of this.ctx.getWebSockets()) this.bye(ws, "unauthorized");
  }

  // ---- WebSocket ----

  /** WebSocket の接続開始（Worker が Origin を確かめ、トークンのハッシュ値をヘッダーに載せて渡す） */
  override fetch(request: Request): Response {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket で接続してください", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    const tokens: TokenHashes = {
      host: request.headers.get(HEADER.host),
      player: request.headers.get(HEADER.player),
    };
    const now = Date.now();
    const me = this.room === null ? null : this.whoIs(tokens, now);

    // 受け入れてから理由つきで切る（受け入れずに断ると、画面の側で理由が分からない）
    const refuse = (reason: ByeReason) => {
      this.ctx.acceptWebSocket(server);
      this.bye(server, reason);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (me === null || me.role === "none") return refuse("unauthorized");
    if (me.role === "kicked") return refuse("kicked");

    const attachment: Attachment =
      me.role === "host" ? { role: "host" } : { role: "player", id: me.id };
    const tag = tagOf(attachment);
    if ((this.blockedUntil.get(tag) ?? 0) > now) {
      return refuse("rateLimited");
    }

    // 同じ人の古い接続は切る（新しい接続を優先する）
    for (const old of this.ctx.getWebSockets(tag)) {
      this.bye(old, "replaced");
    }
    this.ctx.acceptWebSocket(server, [tag]);
    server.serializeAttachment(attachment);
    this.send(server, this.snapshotFor(attachment));
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const attachment = Attachment.safeParse(ws.deserializeAttachment());
    if (!attachment.success) {
      this.bye(ws, "unauthorized");
      return;
    }
    // 外された人の接続が、切った後も送ってきた場合は受け付けない
    if (
      attachment.data.role === "player" &&
      this.players.get(attachment.data.id)?.kicked !== false
    ) {
      this.bye(ws, "kicked");
      return;
    }
    const now = Date.now();
    let limiter = this.limiters.get(ws);
    if (limiter === undefined) {
      limiter = new RateLimiter(now);
      this.limiters.set(ws, limiter);
    }
    const decision = limiter.take(now);
    if (decision === "drop") return;
    if (decision === "disconnect") {
      const tag = tagOf(attachment.data);
      const until = now + RATE_LIMIT_COOLDOWN_SECONDS * 1000;
      await this.ctx.storage.put(blockedKey(tag), until);
      this.blockedUntil.set(tag, until);
      this.bye(ws, "rateLimited");
      return;
    }

    if (typeof message !== "string") return;
    const parsed = ClientMessage.safeParse(parseJson(message));
    if (!parsed.success) return;
    // 今はメッセージが「外す」の1種類だけ（種類が増えたら type で switch する）
    const msg = parsed.data;
    if (attachment.data.role === "host") await this.kick(msg.playerId);
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    // 相手が切ったときは、こちらも閉じて片付ける（1005 などの予約されたコードは送れないので通常の終了にする）
    ws.close(code >= 4000 && code < 5000 ? code : 1000, "closed");
  }

  // ---- 内部の処理 ----

  private async kick(id: PlayerId): Promise<void> {
    const player = this.players.get(id);
    if (player === undefined || player.kicked) return;
    const kicked: PlayerRecord = { ...player, kicked: true };
    await this.ctx.storage.put(playerKey(id), kicked);
    this.remember(kicked);
    for (const ws of this.ctx.getWebSockets(tagOf({ role: "player", id }))) {
      this.bye(ws, "kicked");
    }
    this.sendToHost({ type: "playerRemoved", playerId: id });
  }

  /** トークンのハッシュ値から、誰かを判断する（期限切れは「参加していない」扱い） */
  private whoIs(tokens: TokenHashes, now: number): Me {
    const room = this.room;
    if (
      room !== null &&
      tokens.host !== null &&
      tokens.host === room.host.tokenHash &&
      room.host.expiresAt > now
    ) {
      return { role: "host" };
    }
    if (tokens.player !== null) {
      const id = this.byToken.get(tokens.player);
      const player = id === undefined ? undefined : this.players.get(id);
      if (player !== undefined && player.session.expiresAt > now) {
        return player.kicked
          ? { role: "kicked" }
          : { role: "player", id: player.id, name: player.name };
      }
    }
    return { role: "none" };
  }

  private publicInfo(room: RoomRecord): RoomInfo {
    return {
      name: room.name,
      rule: room.rule,
      prizes: room.prizes,
      status: room.status,
    };
  }

  private snapshotFor(attachment: Attachment): ServerMessage {
    const room = this.room;
    if (room === null) throw new Error("ルームがありません");
    switch (attachment.role) {
      case "host":
        return {
          type: "hostSnapshot",
          room: this.publicInfo(room),
          players: [...this.players.values()]
            .filter((p) => !p.kicked)
            .sort((a, b) => a.joinedAt - b.joinedAt)
            .map(summary),
          maxPlayers: room.maxPlayers,
        };
      case "player": {
        const player = this.players.get(attachment.id);
        if (player === undefined) throw new Error("参加者がいません");
        return {
          type: "playerSnapshot",
          room: this.publicInfo(room),
          me: { id: player.id, name: player.name },
        };
      }
    }
  }

  /**
   * 理由を知らせてから接続を切る。休止できる方式の接続では、サーバーから切った知らせ（close コード）が
   * 画面に届かない場面があるので、理由は bye メッセージで先に送る（画面は受け取ったら自分から切る）
   */
  private bye(ws: WebSocket, reason: ByeReason): void {
    this.send(ws, { type: "bye", reason });
    try {
      ws.close(CLOSE[reason], reason);
    } catch {
      // すでに閉じている接続は何もしない
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // 閉じかけの接続に送ろうとしたときは何もしない
    }
  }

  private sendToHost(message: ServerMessage): void {
    for (const ws of this.ctx.getWebSockets(tagOf({ role: "host" }))) {
      this.send(ws, message);
    }
  }
}

/** 接続に付ける目印（同じ人の接続を探すのに使う） */
function tagOf(attachment: Attachment): string {
  return attachment.role === "host" ? "host" : `player:${attachment.id}`;
}

function summary(player: PlayerRecord): PlayerSummary {
  return { id: player.id, name: player.name };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
