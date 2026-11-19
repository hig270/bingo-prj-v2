import {
  type BingoNumber,
  type CellIndex,
  type CellMask,
  type ExpectedKey,
  LAYOUTS,
  eventOfOpen,
  expectedKey,
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
  type HostRanking,
  PlayerId,
  type PlayerPhase,
  type PlayerStanding,
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
import {
  type Standings,
  hostRanking,
  playerStandings,
  rankResults,
  standingsOf,
} from "./results";
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
 * ランキングを送る間隔（ミリ秒）。変化があっても、前回からこの時間がたつまでは送らずにまとめる
 * （decisions.md 手順4「ランキングは、変化があったときに0.5秒ごとにまとめて送る」）
 */
export const RANKING_INTERVAL_MS = 500;

/** 全体の状態を送るときに、全員に共通の値を1回だけ作って使い回すための入れ物 */
interface SharedState {
  readonly standings: () => Standings;
  readonly standingOf: (id: PlayerId) => PlayerStanding;
  readonly results: () => Results;
}

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
  /** 開けたマスの形ごとの、期待抽選回数を比べる整数（ルールはルームごとに決まっているので、形だけで決まる） */
  private readonly keys = new Map<CellMask, ExpectedKey | null>();
  /** ランキングを最後に送った時刻と、送り残しを後で送るためのタイマー（休止すると消えるが、送り直せば足りる） */
  private rankingSentAt = 0;
  private rankingTimer: ReturnType<typeof setTimeout> | null = null;
  /** 最後に送ったランキングと、プレイヤーごとの順位（変わっていなければ送らないため） */
  private sentRanking: string | null = null;
  private readonly sentStandings = new Map<PlayerId, string>();

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
    this.restoreSentRanking();
  }

  /**
   * 休止から戻ったときに、最後に送ったランキングと順位を、今の記録から作り直す。
   * 休止するのは送り残しがないとき（後追いのタイマーが残っている間は休止しない。2026-11-20 に公式の資料で確認）だけなので、
   * 今の記録から計算した値は、最後に送った値と同じになる。覚え直しておけば、戻ったあとに全員へ同じ順位を送り直さずに済む。
   * 動いている最中にコードを更新したときは接続が切れ、つなぎ直したときに全体の状態を送り直す（同じ日に公式の資料で確認）。
   * 休止を経ずにメモリから消えたときに接続が残るかは資料に書かれていない。残った場合は、タイマーの予約中（最大 0.5 秒）の
   * 変化が、その人の順位が次に変わるか、つなぎ直すまで届かない
   */
  private restoreSentRanking(): void {
    if (this.room?.phase.status !== "playing") return;
    try {
      const standings = this.standings();
      const ranking = rankingMessage(this.hostRanking(standings));
      const byPlayer = new Map<PlayerId, string>();
      for (const [id, standing] of playerStandings(standings)) {
        byPlayer.set(id, standingMessage(standing));
      }
      this.sentRanking = ranking;
      for (const [id, text] of byPlayer) this.sentStandings.set(id, text);
    } catch {
      // 送信を減らすための処理なので、失敗しても全員に送り直せば足りる（ここで止めると、ルームが読み込めなくなる）
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
      lastOpenDraws: 0,
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
    // 期待抽選回数の値はルールごとに違うので、同じ ID で作り直されたルームに持ち越さない
    this.keys.clear();
    this.sentRanking = null;
    this.sentStandings.clear();
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
    this.sendSnapshot(server, attachment, this.sharedState());
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
        game: { startedAt: now, draws: [], pending: null, judgedDraws: 0 },
      },
    });
    await this.ctx.storage.setAlarm(now + PLAYED_ROOM_TTL_MS);
    this.sendSnapshots();
  }

  /** 抽選する。番号はホストにだけ送り、プレイヤーには抽選中であることだけを知らせる */
  private async draw(): Promise<void> {
    // 放置の判定の区切りは、押された時点で公開済みだった番号まで（この後で公開する番号は、まだ開ける機会がない）
    const judgedDraws = this.publishedCount();
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
    await this.saveGame(room, { ...game, pending: next, judgedDraws });
    // 放置しているかどうかが変わるので、ランキングを送り直す
    this.scheduleRanking();
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
    // 残りの番号の数が変わり、ランキングの期待抽選回数が変わる
    this.scheduleRanking();
  }

  /** ゲームを終える（公開待ちの番号があれば先に公開する）。全員に結果を送る */
  private async finish(now: number): Promise<void> {
    // 放置の判定の区切りは、終了が押された時点で公開済みだった番号まで（抽選ボタンと同じ）
    const judgedDraws = this.publishedCount();
    await this.publishPending();
    const room = this.room;
    if (room?.phase.status !== "playing") return;
    await this.saveRoom({
      ...room,
      phase: {
        status: "finished",
        game: { ...room.phase.game, judgedDraws },
        endedAt: now,
      },
    });
    this.sendSnapshots();
  }

  /** 公開済みの番号の数（ゲーム中でなければ 0） */
  private publishedCount(): number {
    const phase = this.room?.phase;
    return phase?.status === "playing" ? phase.game.draws.length : 0;
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
      lastOpenDraws: game.draws.length,
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
      return;
    }
    this.scheduleRanking();
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
      return;
    }
    this.scheduleRanking();
  }

  // ---- ランキング ----

  /** 開けたマスの形から、期待抽選回数を比べる整数を求める（同じ形は覚えておいて使い回す） */
  private keyOf(prizeLines: number, opened: CellMask): ExpectedKey | null {
    const room = this.room;
    if (room === null) throw new Error("ルームがありません");
    const cached = this.keys.get(opened);
    if (cached !== undefined) return cached;
    const key = expectedKey(room.rule.layout, prizeLines, opened);
    this.keys.set(opened, key);
    return key;
  }

  /** 今の順位（ゲーム中と終了後だけ） */
  private standings(): Standings {
    const room = this.room;
    if (room === null || room.phase.status === "lobby") {
      throw new Error("ゲームが始まっていません");
    }
    const win = room.rule.win;
    // 逆ビンゴは始められないので、ここには来ない（手順5で作る）
    if (win.type !== "bingo")
      throw new Error("逆ビンゴの順位はまだ作っていません");
    const game = room.phase.game;
    return standingsOf(
      this.activePlayers(),
      game.draws,
      game.judgedDraws,
      (opened) => this.keyOf(win.prizeLines, opened),
    );
  }

  /**
   * ランキングを送る。前回から RANKING_INTERVAL_MS たっていればすぐ送り、たっていなければ、その時刻に送るタイマーをかける
   * （送り残しの後追い。Alarm はルームを消す予約に使っているので、普通のタイマーで行う。decisions.md 手順4）
   */
  private scheduleRanking(): void {
    if (this.rankingTimer !== null) return;
    const wait = this.rankingSentAt + RANKING_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      this.sendRanking();
      return;
    }
    this.rankingTimer = setTimeout(() => {
      this.rankingTimer = null;
      this.sendRanking();
    }, wait);
  }

  /** ホストにランキングを、プレイヤーに本人の順位を送る（前回と同じなら送らない） */
  private sendRanking(): void {
    const room = this.room;
    if (room?.phase.status !== "playing") return;
    this.rankingSentAt = Date.now();
    const standings = this.standings();
    const ranking = rankingMessage(this.hostRanking(standings));
    if (ranking !== this.sentRanking) {
      for (const ws of this.ctx.getWebSockets(tagOf({ role: "host" }))) {
        this.sendText(ws, ranking);
      }
      this.sentRanking = ranking;
    }
    const byPlayer = playerStandings(standings);
    for (const ws of this.ctx.getWebSockets(PLAYERS_TAG)) {
      const attachment = Attachment.safeParse(ws.deserializeAttachment());
      if (!attachment.success || attachment.data.role !== "player") continue;
      const id = attachment.data.id;
      const standing = byPlayer.get(id);
      if (standing === undefined) continue;
      const text = standingMessage(standing);
      if (this.sentStandings.get(id) === text) continue;
      this.sendText(ws, text);
      this.sentStandings.set(id, text);
    }
  }

  /** ホスト画面のランキング（期待抽選回数は、公開済みの番号を除いた残りの数で計算する） */
  private hostRanking(standings: Standings): HostRanking {
    const room = this.room;
    if (room === null || room.phase.status === "lobby") {
      throw new Error("ゲームが始まっていません");
    }
    const remaining =
      LAYOUTS[room.rule.layout].maxNumber - room.phase.game.draws.length;
    return hostRanking(standings, room.rule.layout, remaining);
  }

  /** 全員に共通の値（順位と結果）を、最初に要ったときに1回だけ作る入れ物 */
  private sharedState(): SharedState {
    let standings: Standings | null = null;
    let byPlayer: Map<PlayerId, PlayerStanding> | null = null;
    let results: Results | null = null;
    const shared: SharedState = {
      standings: () => (standings ??= this.standings()),
      standingOf: (id) => {
        byPlayer ??= playerStandings(shared.standings());
        const standing = byPlayer.get(id);
        if (standing === undefined) throw new Error("参加者がいません");
        return standing;
      },
      results: () => (results ??= rankResults(shared.standings())),
    };
    return shared;
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
   * その接続に全体の状態を送る。shared は全員に共通の値（全員に送り直すときに1回だけ作って使い回すため、呼ぶ側が渡す）。
   * ゲーム中は、送った順位を覚えておく（同じ順位を、ランキングを送るときに送り直さないため）
   */
  private sendSnapshot(
    ws: WebSocket,
    attachment: Attachment,
    shared: SharedState,
  ): void {
    const message = this.snapshotFor(attachment, shared);
    this.send(ws, message);
    if (message.type === "hostSnapshot" && message.phase.status === "playing") {
      this.sentRanking = rankingMessage(message.phase.ranking);
    }
    if (
      message.type === "playerSnapshot" &&
      message.phase.status === "playing"
    ) {
      this.sentStandings.set(
        message.me.id,
        standingMessage(message.phase.standing),
      );
    }
  }

  /** その接続に送る全体の状態 */
  private snapshotFor(
    attachment: Attachment,
    shared: SharedState,
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
          phase: this.hostPhase(room, shared),
        };
      case "player": {
        const player = this.players.get(attachment.id);
        if (player === undefined) throw new Error("参加者がいません");
        return {
          type: "playerSnapshot",
          room: profileOf(room),
          me: { id: player.id, name: player.name, card: player.card },
          phase: this.playerPhase(room, player, shared),
        };
      }
    }
  }

  private hostPhase(room: RoomRecord, shared: SharedState): HostPhase {
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
          ranking: this.hostRanking(shared.standings()),
        };
      case "finished":
        return {
          status: "finished",
          draws: phase.game.draws,
          results: shared.results(),
        };
    }
  }

  private playerPhase(
    room: RoomRecord,
    player: PlayerRecord,
    shared: SharedState,
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
          standing: shared.standingOf(player.id),
        };
      case "finished":
        return {
          status: "finished",
          draws: phase.game.draws,
          opened: player.opened,
          results: shared.results(),
        };
    }
  }

  /** つながっている全員に、全体の状態を送り直す（ゲームの開始と終了のとき） */
  private sendSnapshots(): void {
    // 順位と結果は全員に同じものを使うので、最初に要ったときに1回だけ作る
    const shared = this.sharedState();
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = Attachment.safeParse(ws.deserializeAttachment());
      if (!attachment.success) continue;
      // 外された人の接続が閉じ終わる前に残っていても、送らない（順位の計算に入っていない人なので）
      if (
        attachment.data.role === "player" &&
        this.players.get(attachment.data.id)?.kicked !== false
      ) {
        continue;
      }
      this.sendSnapshot(ws, attachment.data, shared);
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
    this.sendText(ws, JSON.stringify(message));
  }

  /** 文字列にしたメッセージを送る（同じ文字列を何人にも送るときや、送ったものと比べるときに使う） */
  private sendText(ws: WebSocket, text: string): void {
    try {
      ws.send(text);
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

/** ホストに送るランキングのメッセージ（送ったものと比べられるよう、文字列にする） */
function rankingMessage(ranking: HostRanking): string {
  const message: ServerMessage = { type: "ranking", ranking };
  return JSON.stringify(message);
}

/** プレイヤーに送る順位のメッセージ（送ったものと比べられるよう、文字列にする） */
function standingMessage(standing: PlayerStanding): string {
  const message: ServerMessage = { type: "standing", standing };
  return JSON.stringify(message);
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
