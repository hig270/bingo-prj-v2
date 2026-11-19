import {
  type BingoNumber,
  type CellIndex,
  eventOfOpen,
  generateCard,
  initialMask,
  isCellOf,
  isOpen,
  numberAt,
  openCell,
  pickNextNumber,
} from "@bingo/game";
import {
  CLOSE,
  ClientMessage,
  type ByeReason,
  DrawRound,
  type ExtendResponse,
  type HostPhase,
  PlayerId,
  type PlayerPhase,
  RATE_LIMIT_COOLDOWN_SECONDS,
  nameKey,
  type Me,
  type MeResponse,
  type PlayerName,
  type PlayerSummary,
  type RoomProfile,
  type Results,
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
  type GameRecord,
  PLAYER_KEY_PREFIX,
  PlayerRecord,
  ROOM_KEY,
  RoomRecord,
  blockedKey,
  playerKey,
} from "./records";
import { rankResults } from "./results";
import {
  TOKEN_TTL_SECONDS,
  randomString,
  secureRandom,
  secureRandomIndex,
} from "./token";

/** プレイヤーの接続すべてに付ける目印（全員に送るときに、プレイヤーの接続だけを取り出す） */
const PLAYERS_TAG = "players";

/** 1ルームの参加人数の上限（設計目標と同じ。ルームの設定として保存する） */
export const MAX_PLAYERS = 1000;

const TTL_MS = TOKEN_TTL_SECONDS * 1000;

/**
 * ゲームを始めなかったルームを消すまでの時間（作ってから 24 時間）。
 * 遊んだルームは、ゲームを始めたときに 7 日後に予約し直す（decisions.md「ルームのデータを消す時期」）
 */
export const UNPLAYED_ROOM_TTL_MS = 24 * 60 * 60 * 1000;
/** 遊んだルームを消すまでの時間（ゲームを始めてから 7 日） */
export const PLAYED_ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

  private async saveRoom(room: RoomRecord): Promise<void> {
    await this.ctx.storage.put(ROOM_KEY, room);
    this.room = room;
  }

  private async savePlayer(player: PlayerRecord): Promise<void> {
    await this.ctx.storage.put(playerKey(player.id), player);
    this.remember(player);
  }

  // ---- Worker から呼ぶ RPC ----

  /** ルームを作る。同じ ID のルームが既にあれば false（別の ID で作り直してもらう） */
  async create(
    settings: RoomSettings,
    hostTokenHash: string,
    now: number,
  ): Promise<boolean> {
    if (this.room !== null) return false;
    await this.saveRoom({
      name: settings.name,
      rule: settings.rule,
      prizes: settings.prizes,
      phase: { status: "lobby" },
      maxPlayers: MAX_PLAYERS,
      createdAt: now,
      host: { tokenHash: hostTokenHash, expiresAt: now + TTL_MS },
    });
    await this.ctx.storage.setAlarm(now + UNPLAYED_ROOM_TTL_MS);
    return true;
  }

  /** ルームの公開情報と、画面を開いた人が誰か。ルームが無ければ null */
  info(tokens: TokenHashes, now: number): MeResponse | null {
    if (this.room === null) return null;
    return {
      room: { ...profileOf(this.room), status: this.room.phase.status },
      me: this.whoIs(tokens, now),
    };
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
    if (room.phase.status !== "lobby") return { ok: false, error: "started" };
    const active = this.activePlayers();
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
      opened: initialMask(room.rule.layout),
      prizeRound: null,
      kicked: false,
      joinedAt: now,
    };
    await this.savePlayer(player);
    this.sendToHost({ type: "playerJoined", player: summary(player) });
    return { ok: true, id: player.id, name: player.name };
  }

  /**
   * ゲームの開始の後で、参加の記録（トークン）の期限を、今から 3 時間に延ばす
   * （decisions.md「プレイヤーの再接続」。開始より前に発行・延長した記録だけを延ばす）。
   * 延ばした記録の種類を返す。ルームが無ければ null
   */
  async extend(
    tokens: TokenHashes,
    now: number,
  ): Promise<ExtendResponse | null> {
    const room = this.room;
    if (room === null) return null;
    const result = { host: false, player: false };
    if (room.phase.status !== "playing") return result;
    const startedAt = room.phase.game.startedAt;
    // 期限から 3 時間を引くと、発行（または前回の延長）の時刻になる
    const issuedBeforeStart = (expiresAt: number) =>
      expiresAt - TTL_MS < startedAt;

    if (
      tokens.host !== null &&
      tokens.host === room.host.tokenHash &&
      room.host.expiresAt > now &&
      issuedBeforeStart(room.host.expiresAt)
    ) {
      await this.saveRoom({
        ...room,
        host: { ...room.host, expiresAt: now + TTL_MS },
      });
      result.host = true;
    }
    const id =
      tokens.player === null ? undefined : this.byToken.get(tokens.player);
    const player = id === undefined ? undefined : this.players.get(id);
    if (
      player !== undefined &&
      !player.kicked &&
      player.session.expiresAt > now &&
      issuedBeforeStart(player.session.expiresAt)
    ) {
      await this.savePlayer({
        ...player,
        session: { ...player.session, expiresAt: now + TTL_MS },
      });
      result.player = true;
    }
    return result;
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
  override async fetch(request: Request): Promise<Response> {
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

    // ホストがつなぎ直したときは、演出の途中だった番号をすぐ公開する
    // （ホストがいない間はゲームが止まっているので、ここで配れば足りる。decisions.md「演出と音」）
    if (attachment.role === "host") await this.publishPending();

    // 同じ人の古い接続は切る（新しい接続を優先する）
    for (const old of this.ctx.getWebSockets(tag)) {
      this.bye(old, "replaced");
    }
    this.ctx.acceptWebSocket(
      server,
      attachment.role === "player" ? [tag, PLAYERS_TAG] : [tag],
    );
    server.serializeAttachment(attachment);
    this.send(
      server,
      this.snapshotFor(attachment, () => this.results()),
    );
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
    const msg = parsed.data;
    const from = attachment.data;
    // ホストだけができる操作と、プレイヤーだけができる操作を分ける（相手の役割の操作は無視する）
    switch (msg.type) {
      case "kick":
        if (from.role === "host") await this.kick(msg.playerId);
        return;
      case "start":
        if (from.role === "host") await this.start(now);
        return;
      case "draw":
        if (from.role === "host") await this.draw();
        return;
      case "drawShown":
        if (from.role === "host") await this.publishPending(msg.number);
        return;
      case "end":
        if (from.role === "host") await this.finish(now);
        return;
      case "open":
        if (from.role === "player") await this.open(ws, from.id, msg.cell, now);
        return;
    }
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    // 相手が切ったときは、こちらも閉じて片付ける（1005 などの予約されたコードは送れないので通常の終了にする）
    ws.close(code >= 4000 && code < 5000 ? code : 1000, "closed");
  }

  // ---- ゲームの進行 ----

  /** ゲームを始める（参加者が1人以上いるとき。逆ビンゴは手順5で作るので、まだ始められない） */
  private async start(now: number): Promise<void> {
    const room = this.room;
    if (room?.phase.status !== "lobby") return;
    if (room.rule.win.type !== "bingo") return;
    if (this.activePlayers().length === 0) return;
    await this.saveRoom({
      ...room,
      phase: {
        status: "playing",
        game: { startedAt: now, draws: [], pending: null },
      },
    });
    await this.ctx.storage.setAlarm(now + PLAYED_ROOM_TTL_MS);
    this.sendSnapshots();
  }

  /** 抽選する。番号はホストにだけ送り、プレイヤーには抽選中であることだけを知らせる */
  private async draw(): Promise<void> {
    // 前の番号が公開されないまま押されたら、先に公開する（decisions.md「演出と音」）
    await this.publishPending();
    const room = this.room;
    if (room?.phase.status !== "playing") return;
    const game = room.phase.game;
    const next = pickNextNumber(
      room.rule.layout,
      game.draws,
      secureRandomIndex,
    );
    if (next === null) return;
    await this.saveGame(room, { ...game, pending: next });
    this.sendToHost({ type: "drawStarted", number: next });
    this.sendToPlayers({ type: "drawing" });
  }

  /**
   * 公開待ちの番号をプレイヤーに公開する。shown を渡したときは、その番号が公開待ちのときだけ公開する
   * （ホスト画面の古い演出の知らせで、別の番号を公開しないように）
   */
  private async publishPending(shown?: BingoNumber): Promise<void> {
    const room = this.room;
    if (room?.phase.status !== "playing") return;
    const game = room.phase.game;
    const n = game.pending;
    if (n === null || (shown !== undefined && shown !== n)) return;
    await this.saveGame(room, {
      ...game,
      draws: [...game.draws, n],
      pending: null,
    });
    this.sendToPlayers({ type: "numberPublished", number: n });
  }

  /** ゲームを終える（公開待ちの番号があれば先に公開する）。全員に結果を送る */
  private async finish(now: number): Promise<void> {
    await this.publishPending();
    const room = this.room;
    if (room?.phase.status !== "playing") return;
    await this.saveRoom({
      ...room,
      phase: { status: "finished", game: room.phase.game, endedAt: now },
    });
    this.sendSnapshots();
  }

  /** プレイヤーがマスを開けた */
  private async open(
    ws: WebSocket,
    id: PlayerId,
    cell: CellIndex,
    now: number,
  ): Promise<void> {
    const room = this.room;
    const player = this.players.get(id);
    if (room?.phase.status !== "playing" || player === undefined) return;
    const game = room.phase.game;
    if (!isCellOf(room.rule.layout, cell) || isOpen(player.opened, cell)) {
      return;
    }
    const n = numberAt(player.card, cell);
    if (n === null || n === "free") return;
    // まだ公開していない番号は受け付けず、画面の状態をサーバーに合わせてもらう
    if (!game.draws.includes(n)) {
      this.send(ws, { type: "cells", opened: player.opened });
      return;
    }

    const opened = openCell(player.opened, cell);
    const event = eventOfOpen(room.rule, player.opened, opened);
    const alreadyWon = player.prizeRound !== null;
    const wonNow = event?.type === "bingo" && event.prize && !alreadyWon;
    // 抽選回は、ホストが抽選ボタンを押した瞬間で区切る（公開待ちの番号も 1 回と数える）
    const round = DrawRound.parse(
      game.draws.length + (game.pending === null ? 0 : 1),
    );
    await this.savePlayer({
      ...player,
      opened,
      prizeRound: wonNow ? round : player.prizeRound,
    });
    // 景品を取った後の知らせは、ホスト画面には流さない（取った人のリーチやビンゴは、もう会場に関係しないため）
    if (event !== null && !alreadyWon) {
      this.sendToHost({
        type: "progress",
        playerId: player.id,
        name: player.name,
        event,
      });
    }
    // 全員の順位が確定したら、ゲームを終える（decisions.md「ゲーム終了」）
    if (wonNow && this.activePlayers().every((p) => p.prizeRound !== null)) {
      await this.finish(now);
    }
  }

  private async saveGame(room: RoomRecord, game: GameRecord): Promise<void> {
    await this.saveRoom({ ...room, phase: { status: "playing", game } });
  }

  // ---- 内部の処理 ----

  private async kick(id: PlayerId): Promise<void> {
    const player = this.players.get(id);
    if (player === undefined || player.kicked) return;
    await this.savePlayer({ ...player, kicked: true });
    for (const ws of this.ctx.getWebSockets(tagOf({ role: "player", id }))) {
      this.bye(ws, "kicked");
    }
    this.sendToHost({ type: "playerRemoved", playerId: id });
    // ゲーム中に外して、残りの全員が景品を獲得済みになったら終える（マスを開けたときと同じ判定）
    const active = this.activePlayers();
    if (
      this.room?.phase.status === "playing" &&
      active.length > 0 &&
      active.every((p) => p.prizeRound !== null)
    ) {
      await this.finish(Date.now());
    }
  }

  /** 結果（外されていない参加者の並び） */
  private results(): Results {
    return rankResults(this.activePlayers());
  }

  /** 外されていない参加者（参加した順） */
  private activePlayers(): PlayerRecord[] {
    return [...this.players.values()]
      .filter((p) => !p.kicked)
      .sort((a, b) => a.joinedAt - b.joinedAt);
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

  /**
   * その接続に送る全体の状態。results は結果を作る関数（全員に送り直すときに1回だけ作って使い回すため、
   * 呼ぶ側が渡す。結果を含むのはゲームの終了後だけ）
   */
  private snapshotFor(
    attachment: Attachment,
    results: () => Results,
  ): ServerMessage {
    const room = this.room;
    if (room === null) throw new Error("ルームがありません");
    switch (attachment.role) {
      case "host":
        return {
          type: "hostSnapshot",
          room: profileOf(room),
          players: this.activePlayers().map(summary),
          maxPlayers: room.maxPlayers,
          phase: this.hostPhase(room, results),
        };
      case "player": {
        const player = this.players.get(attachment.id);
        if (player === undefined) throw new Error("参加者がいません");
        return {
          type: "playerSnapshot",
          room: profileOf(room),
          me: { id: player.id, name: player.name, card: player.card },
          phase: this.playerPhase(room, player, results),
        };
      }
    }
  }

  private hostPhase(room: RoomRecord, results: () => Results): HostPhase {
    const phase = room.phase;
    switch (phase.status) {
      case "lobby":
        return { status: "lobby" };
      case "playing":
        return {
          status: "playing",
          draws: phase.game.draws,
          prizeWinners: this.activePlayers().filter(
            (p) => p.prizeRound !== null,
          ).length,
        };
      case "finished":
        return {
          status: "finished",
          draws: phase.game.draws,
          results: results(),
        };
    }
  }

  private playerPhase(
    room: RoomRecord,
    player: PlayerRecord,
    results: () => Results,
  ): PlayerPhase {
    const phase = room.phase;
    switch (phase.status) {
      case "lobby":
        return { status: "lobby" };
      case "playing":
        return {
          status: "playing",
          draws: phase.game.draws,
          drawing: phase.game.pending !== null,
          opened: player.opened,
          prizeRound: player.prizeRound,
        };
      case "finished":
        return {
          status: "finished",
          draws: phase.game.draws,
          opened: player.opened,
          results: results(),
        };
    }
  }

  /** つながっている全員に、全体の状態を送り直す（ゲームの開始と終了のとき） */
  private sendSnapshots(): void {
    // 結果は全員に同じものを送るので、最初に要ったときに1回だけ作る
    let cached: Results | null = null;
    const results = () => (cached ??= this.results());
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = Attachment.safeParse(ws.deserializeAttachment());
      if (attachment.success) {
        this.send(ws, this.snapshotFor(attachment.data, results));
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

  /** つながっているプレイヤー全員に送る（同じ文字列を使い回す） */
  private sendToPlayers(message: ServerMessage): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets(PLAYERS_TAG)) {
      try {
        ws.send(text);
      } catch {
        // 閉じかけの接続に送ろうとしたときは何もしない
      }
    }
  }
}

/** 接続に付ける目印（同じ人の接続を探すのに使う） */
function tagOf(attachment: Attachment): string {
  return attachment.role === "host" ? "host" : `player:${attachment.id}`;
}

function profileOf(room: RoomRecord): RoomProfile {
  return { name: room.name, rule: room.rule, prizes: room.prizes };
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
