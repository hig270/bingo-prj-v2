import { CLOSE, PlayerId, type ServerMessage } from "@bingo/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHECK_TIMEOUT_MS,
  CONNECT_TIMEOUT_MS,
  ONLINE_SPREAD_MS,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  connectRoom,
  type SocketLike,
  type SocketStatus,
} from "./socket";

/** テスト用の偽の WebSocket。サーバー側の動きは、テストから open・receive・serverClose で起こす */
class FakeSocket implements SocketLike {
  readyState: number = WebSocket.CONNECTING;
  readonly sent: string[] = [];
  closedByClient = false;
  private readonly listeners = new Map<string, ((event: never) => void)[]>();

  addEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closedByClient = true;
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as never);
    }
  }
  open(): void {
    this.readyState = WebSocket.OPEN;
    this.emit("open", {});
  }
  receive(data: string): void {
    this.emit("message", { data });
  }
  serverClose(code: number): void {
    this.readyState = WebSocket.CLOSED;
    this.emit("close", { code });
  }
}

/**
 * random は、つなぎ直す時刻をずらす乱数。省くと 1 を返し、待ち時間がいつも上限いっぱいになる
 * （待ち時間の延ばし方を、ずらしと分けて確かめるため）
 */
function setup(random: () => number = () => 1) {
  const sockets: FakeSocket[] = [];
  const statuses: SocketStatus[] = [];
  const messages: ServerMessage[] = [];
  const connection = connectRoom(
    "ws://example.com/r/K7MQ4P/ws",
    {
      onStatus: (s) => statuses.push(s),
      onMessage: (m) => messages.push(m),
    },
    () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    random,
  );
  const last = () => {
    const socket = sockets.at(-1);
    if (socket === undefined) throw new Error("接続がない");
    return socket;
  };
  return { sockets, statuses, messages, connection, last };
}

const bye = (reason: string) => JSON.stringify({ type: "bye", reason });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("connectRoom", () => {
  it("届いたメッセージを形を確かめてから渡す", () => {
    const t = setup();
    t.last().open();
    t.last().receive(
      JSON.stringify({ type: "playerRemoved", playerId: "abcdefgh" }),
    );
    expect(t.statuses).toEqual([{ kind: "open" }]);
    expect(t.messages).toEqual([
      { type: "playerRemoved", playerId: "abcdefgh" },
    ]);
  });

  it("形の合わないメッセージが届いたら、画面が古いとして終わる", () => {
    const t = setup();
    t.last().open();
    t.last().receive(JSON.stringify({ type: "unknown" }));
    expect(t.statuses.at(-1)).toEqual({ kind: "ended", reason: "outdated" });
    expect(t.last().closedByClient).toBe(true);
  });

  it("bye（外された）を受け取ったら、close を待たずに終わり、つなぎ直さない", () => {
    const t = setup();
    t.last().open();
    t.last().receive(bye("kicked"));
    expect(t.statuses.at(-1)).toEqual({ kind: "ended", reason: "kicked" });
    expect(t.last().closedByClient).toBe(true);
    // 後で close が届いても何もしない
    t.last().serverClose(CLOSE.kicked);
    vi.advanceTimersByTime(60_000);
    expect(t.sockets).toHaveLength(1);
  });

  it("理由なく切れたら、待ってからつなぎ直す", () => {
    const t = setup();
    t.last().open();
    t.last().serverClose(1006);
    expect(t.statuses.at(-1)).toEqual({ kind: "reconnecting" });
    vi.advanceTimersByTime(499);
    expect(t.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.sockets).toHaveLength(2);
  });

  it("bye が届かなくても、close コードから理由を読む", () => {
    const t = setup();
    t.last().open();
    t.last().serverClose(CLOSE.replaced);
    expect(t.statuses.at(-1)).toEqual({ kind: "ended", reason: "replaced" });
  });

  it("送りすぎで切られたら、60 秒待ってからつなぎ直す", () => {
    const t = setup();
    t.last().open();
    t.last().receive(bye("rateLimited"));
    expect(t.statuses.at(-1)?.kind).toBe("cooldown");
    vi.advanceTimersByTime(59_999);
    expect(t.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.sockets).toHaveLength(2);
  });

  it("つないだ直後に ping を1回送り、その後は決まった間隔で送る", () => {
    // 直後の1回は、workerd の不具合（一度も送っていない接続をサーバーが切ると、TCP の切断が遅れる）の回避
    const t = setup();
    t.last().open();
    expect(t.last().sent).toEqual(["ping"]);
    t.last().receive("pong");
    vi.advanceTimersByTime(PING_INTERVAL_MS);
    expect(t.last().sent).toEqual(["ping", "ping"]);
  });

  it("ping に pong が返ってくれば、つながったままにする", () => {
    const t = setup();
    t.last().open();
    t.last().receive("pong");
    vi.advanceTimersByTime(PING_INTERVAL_MS);
    t.last().receive("pong");
    vi.advanceTimersByTime(PONG_TIMEOUT_MS * 2);
    expect(t.sockets).toHaveLength(1);
    expect(t.statuses.at(-1)).toEqual({ kind: "open" });
  });

  it("pong が返ってこなければ、close を待たずにつなぎ直す（電波が切れた場合）", () => {
    const t = setup();
    const first = t.last();
    first.open();
    // 直後の ping に答えがないまま待つ
    vi.advanceTimersByTime(PONG_TIMEOUT_MS - 1);
    expect(t.statuses.at(-1)).toEqual({ kind: "open" });
    vi.advanceTimersByTime(1);
    expect(t.statuses.at(-1)).toEqual({ kind: "reconnecting" });
    expect(first.closedByClient).toBe(true);
    vi.advanceTimersByTime(500);
    expect(t.sockets).toHaveLength(2);
    // 見限った接続から後で close が届いても、つなぎ直しを重ねない
    first.serverClose(1006);
    vi.advanceTimersByTime(10_000);
    expect(t.sockets).toHaveLength(2);
  });

  it("つなぐ途中のまま止まったら、時間切れでつなぎ直す（電波が無いとき）", () => {
    const t = setup();
    const first = t.last();
    vi.advanceTimersByTime(CONNECT_TIMEOUT_MS - 1);
    expect(t.statuses).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(t.statuses.at(-1)).toEqual({ kind: "reconnecting" });
    expect(first.closedByClient).toBe(true);
    vi.advanceTimersByTime(500);
    expect(t.sockets).toHaveLength(2);
    // 見限った接続が後でつながっても、何もしない
    first.open();
    expect(t.statuses.at(-1)).toEqual({ kind: "reconnecting" });
  });

  it("つながらないまま切れ続けると、待ち時間を延ばす（0.5 秒、1 秒、2 秒…）", () => {
    const t = setup();
    t.last().serverClose(1006);
    vi.advanceTimersByTime(500);
    expect(t.sockets).toHaveLength(2);
    t.last().serverClose(1006);
    vi.advanceTimersByTime(999);
    expect(t.sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(t.sockets).toHaveLength(3);
    t.last().serverClose(1006);
    vi.advanceTimersByTime(1999);
    expect(t.sockets).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(t.sockets).toHaveLength(4);
    // つながったら、待ち時間は最初に戻る
    t.last().open();
    t.last().serverClose(1006);
    vi.advanceTimersByTime(500);
    expect(t.sockets).toHaveLength(5);
  });

  it("つなぎ直しを待っている間に stop したら、つなぎ直さない", () => {
    const t = setup();
    t.last().open();
    t.last().serverClose(1006);
    t.connection.stop();
    // タイマーを消し忘れていないこと
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(t.sockets).toHaveLength(1);
  });

  it("送りすぎで待っている間に stop したら、つなぎ直さない", () => {
    const t = setup();
    t.last().open();
    t.last().receive(bye("rateLimited"));
    t.connection.stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(t.sockets).toHaveLength(1);
  });

  it("つながっているときだけ送り、stop の後はつなぎ直さない", () => {
    const t = setup();
    t.connection.send({ type: "kick", playerId: PlayerId.parse("abcdefgh") });
    expect(t.last().sent).toEqual([]);
    t.last().open();
    t.connection.send({ type: "kick", playerId: PlayerId.parse("abcdefgh") });
    expect(t.last().sent).toEqual([
      "ping",
      JSON.stringify({ type: "kick", playerId: "abcdefgh" }),
      // 届いたかを確かめる ping
      "ping",
    ]);
    t.connection.stop();
    expect(t.last().closedByClient).toBe(true);
    // つながっている間の ping・pong の待ちも消える
    expect(vi.getTimerCount()).toBe(0);
    t.last().serverClose(1006);
    vi.advanceTimersByTime(60_000);
    expect(t.sockets).toHaveLength(1);
  });

  it("つなぎ直すまでの待ち時間は、上限までの乱数でずらす", () => {
    const t = setup(() => 0.5);
    t.last().open();
    t.last().serverClose(1006);
    vi.advanceTimersByTime(249);
    expect(t.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.sockets).toHaveLength(2);
  });

  it("送った直後に確かめ、pong が返らなければ、待ち時間を短くしてつなぎ直す", () => {
    const t = setup();
    const first = t.last();
    first.open();
    first.receive("pong");
    t.connection.send({ type: "kick", playerId: PlayerId.parse("abcdefgh") });
    vi.advanceTimersByTime(CHECK_TIMEOUT_MS - 1);
    expect(t.statuses.at(-1)).toEqual({ kind: "open" });
    vi.advanceTimersByTime(1);
    expect(t.statuses.at(-1)).toEqual({ kind: "reconnecting" });
    expect(first.closedByClient).toBe(true);
  });

  it("送った後の pong が返れば、つながったままにする", () => {
    const t = setup();
    t.last().open();
    t.last().receive("pong");
    t.connection.send({ type: "kick", playerId: PlayerId.parse("abcdefgh") });
    t.last().receive("pong");
    vi.advanceTimersByTime(PONG_TIMEOUT_MS);
    expect(t.sockets).toHaveLength(1);
    expect(t.statuses.at(-1)).toEqual({ kind: "open" });
  });

  it("前に送った ping の pong だけが返っても、送った後の ping の pong を待つ", () => {
    // pong は送った順に返る。1つ目の pong は、送ったメッセージが届いたことを示さない
    const t = setup();
    t.last().open();
    t.connection.send({ type: "kick", playerId: PlayerId.parse("abcdefgh") });
    t.last().receive("pong");
    vi.advanceTimersByTime(CHECK_TIMEOUT_MS);
    expect(t.statuses.at(-1)).toEqual({ kind: "reconnecting" });
  });

  it("ping が重なっても、それぞれの ping に決まった時間ずつ待つ（往復に時間がかかる回線）", () => {
    const t = setup();
    t.last().open();
    t.last().receive("pong");
    const kick = {
      type: "kick",
      playerId: PlayerId.parse("abcdefgh"),
    } as const;
    // 0 秒に1つ目、1.5 秒に2つ目を送り、どちらも pong が返るのに 2 秒かかる
    t.connection.send(kick);
    vi.advanceTimersByTime(1_500);
    t.connection.send(kick);
    vi.advanceTimersByTime(500);
    t.last().receive("pong");
    // 1つ目の締め切り（3 秒）を過ぎても、2つ目の締め切り（4.5 秒）までは待つ
    vi.advanceTimersByTime(1_499);
    expect(t.statuses.at(-1)).toEqual({ kind: "open" });
    t.last().receive("pong");
    vi.advanceTimersByTime(PONG_TIMEOUT_MS);
    expect(t.sockets).toHaveLength(1);
    expect(t.statuses.at(-1)).toEqual({ kind: "open" });
  });

  it("ping が重なったとき、あとの ping の pong が返らなければ、その締め切りでつなぎ直す", () => {
    const t = setup();
    t.last().open();
    t.last().receive("pong");
    const kick = {
      type: "kick",
      playerId: PlayerId.parse("abcdefgh"),
    } as const;
    t.connection.send(kick);
    vi.advanceTimersByTime(1_500);
    t.connection.send(kick);
    vi.advanceTimersByTime(500);
    t.last().receive("pong");
    vi.advanceTimersByTime(2_499);
    expect(t.statuses.at(-1)).toEqual({ kind: "open" });
    vi.advanceTimersByTime(1);
    expect(t.statuses.at(-1)).toEqual({ kind: "reconnecting" });
  });

  it("画面に戻ったら確かめ、pong が返らなければつなぎ直す", () => {
    const t = setup();
    t.last().open();
    t.last().receive("pong");
    t.connection.resume();
    expect(t.last().sent).toEqual(["ping", "ping"]);
    vi.advanceTimersByTime(CHECK_TIMEOUT_MS);
    expect(t.statuses.at(-1)).toEqual({ kind: "reconnecting" });
  });

  it("つなぎ直しを待っている間に画面に戻ったら、待たずにすぐつなぐ", () => {
    const t = setup();
    t.last().open();
    t.last().serverClose(1006);
    t.connection.resume();
    vi.advanceTimersByTime(0);
    expect(t.sockets).toHaveLength(2);
  });

  it("つなぎ直しを待っている間に電波が戻ったら、ずらしてつなぐ", () => {
    // 乱数 0.5 で、つなぎ直しの待ちは 250 ミリ秒、電波が戻ったときのずらしは 500 ミリ秒
    const t = setup(() => 0.5);
    t.last().open();
    t.last().serverClose(1006);
    t.connection.online();
    vi.advanceTimersByTime(ONLINE_SPREAD_MS / 2 - 1);
    expect(t.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.sockets).toHaveLength(2);
  });

  it("電波が切れている間につなぎ始めた接続は、電波が戻ったら見限って、ずらしてつなぎ直す", () => {
    const t = setup(() => 0);
    t.connection.offline();
    vi.advanceTimersByTime(0);
    // 電波が無い間につなぎ始めた接続
    const second = t.last();
    expect(t.sockets).toHaveLength(2);
    t.connection.online();
    expect(second.closedByClient).toBe(true);
    expect(t.statuses.at(-1)).toEqual({ kind: "reconnecting" });
    vi.advanceTimersByTime(0);
    expect(t.sockets).toHaveLength(3);
  });

  it("画面に戻って始めたつなぐ途中の接続は、電波が戻った知らせが続いても見限らない", () => {
    // スマホでは、画面に戻った知らせと電波が戻った知らせが、ほぼ同時に届くことがある
    const t = setup();
    t.last().open();
    t.last().serverClose(1006);
    t.connection.resume();
    vi.advanceTimersByTime(0);
    const second = t.last();
    t.connection.online();
    expect(second.closedByClient).toBe(false);
    vi.advanceTimersByTime(ONLINE_SPREAD_MS);
    expect(t.sockets).toHaveLength(2);
  });

  it("電波が戻ったとき、つながっていれば確かめるだけにする", () => {
    const t = setup();
    t.last().open();
    t.last().receive("pong");
    t.connection.online();
    expect(t.last().sent).toEqual(["ping", "ping"]);
    t.last().receive("pong");
    vi.advanceTimersByTime(PONG_TIMEOUT_MS);
    expect(t.sockets).toHaveLength(1);
  });

  it("電波が切れたら、pong を待たずにつなぎ直しに移る", () => {
    const t = setup();
    const first = t.last();
    first.open();
    t.connection.offline();
    expect(t.statuses.at(-1)).toEqual({ kind: "reconnecting" });
    expect(first.closedByClient).toBe(true);
  });

  it("送りすぎで待っている間は、画面や電波が戻っても早めない", () => {
    const t = setup();
    t.last().open();
    t.last().receive(bye("rateLimited"));
    t.connection.resume();
    t.connection.online();
    t.connection.offline();
    vi.advanceTimersByTime(59_999);
    expect(t.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(t.sockets).toHaveLength(2);
  });

  it("stop の後は、画面や電波が戻っても何もしない", () => {
    const t = setup();
    t.last().open();
    t.connection.stop();
    t.connection.resume();
    t.connection.online();
    t.connection.offline();
    expect(vi.getTimerCount()).toBe(0);
    expect(t.sockets).toHaveLength(1);
  });
});
