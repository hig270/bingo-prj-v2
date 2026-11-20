import {
  CLOSE,
  RATE_LIMIT_COOLDOWN_SECONDS,
  ByeReason,
  ServerMessage,
  type ClientMessage,
  type RoomId,
} from "@bingo/protocol";
import { useEffect, useEffectEvent, useRef, useState } from "react";

/**
 * 接続の状態。
 * - connecting: 最初の接続中
 * - open: つながっている
 * - reconnecting: 切れたので、つなぎ直している（この間はマスを押せないようにする）
 * - cooldown: 送りすぎで切断された。until（UNIX 時刻のミリ秒）になったらつなぎ直す
 * - ended: もうつなぎ直さない（reason に理由）
 */
export type SocketStatus =
  | { readonly kind: "connecting" }
  | { readonly kind: "open" }
  | { readonly kind: "reconnecting" }
  | { readonly kind: "cooldown"; readonly until: number }
  | { readonly kind: "ended"; readonly reason: EndReason };

/**
 * つなぎ直さない理由。
 * - replaced: 別の画面で開かれた
 * - kicked: ホストに外された
 * - unauthorized: 参加の記録（Cookie）が無い・期限切れ
 * - outdated: 届いたメッセージの形が合わない（画面が古い）
 */
export type EndReason = "replaced" | "kicked" | "unauthorized" | "outdated";

/** 通信を保つための確認（ping）の間隔。サーバーはルームを起こさずに pong を返す */
export const PING_INTERVAL_MS = 30_000;
/**
 * ping を送ってから、この時間 pong が返ってこなければ、接続が死んでいるとみなしてつなぎ直す。
 * スマホで電波が切れると、ブラウザが接続を「つながったまま」と扱い続けることがあるため
 */
export const PONG_TIMEOUT_MS = 10_000;
/**
 * つなぎ始めてから、この時間たってもつながらなければ、見限ってつなぎ直す。
 * 電波が無いと、つなぐ途中（CONNECTING）のまま長く残ることがあるため
 */
export const CONNECT_TIMEOUT_MS = 10_000;
/**
 * 画面に戻ったとき・電波が戻ったとき・メッセージを送った直後に確かめる ping で、pong を待つ時間。
 * ふつうの回線なら pong は1秒もかからずに返る（decisions.md 手順5の (a) の (2)・(5)）
 */
export const CHECK_TIMEOUT_MS = 3_000;
/**
 * 電波が戻ったときに、つなぎ直す時刻をずらす幅。会場の Wi-Fi が戻ると全員の端末に同時に知らせが届くので、
 * 一斉にサーバーへ押し寄せないようにする（decisions.md 手順5の (a) の (3)）
 */
export const ONLINE_SPREAD_MS = 1_000;
/**
 * つなぎ直すまでの待ち時間の上限（失敗が続くほど延ばす。最大 10 秒）。
 * 実際の待ち時間は、0 からこの値までの乱数にする（full jitter。decisions.md 手順5の (a) の (3)）
 */
export const retryDelay = (attempt: number) =>
  Math.min(10_000, 500 * 2 ** Math.min(attempt, 5));

/** WebSocket のうち、ここで使う部分（テストで偽物に差し替えられるように。本物の WebSocket もこの形に合う） */
export interface SocketLike {
  readonly readyState: number;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (event: { readonly data: unknown }) => void,
  ): void;
  addEventListener(
    type: "close",
    listener: (event: { readonly code: number }) => void,
  ): void;
  send(data: string): void;
  close(): void;
}

export interface RoomConnection {
  /**
   * つながっているときだけ送る（つながっていなければ捨てる）。
   * 送った直後に ping を送り、CHECK_TIMEOUT_MS のうちに pong が返らなければ、届かなかったとみなしてつなぎ直す
   * （pong はメッセージと同じ接続を順番どおりに通るので、返ればメッセージも届いている）
   */
  send(message: ClientMessage): void;
  /** 画面に戻った。つながっていれば確かめ、つなぎ直しを待っている間なら、待たずにすぐつなぐ */
  resume(): void;
  /** 電波が戻った。resume と同じだが、つなぎ直すときは ONLINE_SPREAD_MS の範囲でずらす */
  online(): void;
  /** 電波が切れた。pong を待たずに切れたとみなし、つなぎ直しに移る */
  offline(): void;
  /** 接続をやめる（もうつなぎ直さない） */
  stop(): void;
}

/** close コードから理由を読む（bye メッセージが届かなかったときの予備） */
function byeOf(code: number): ByeReason | null {
  const name = Object.entries(CLOSE).find(([, value]) => value === code);
  const parsed = ByeReason.safeParse(name?.[0]);
  return parsed.success ? parsed.data : null;
}

function parseServerMessage(data: unknown) {
  let json: unknown;
  try {
    json = JSON.parse(String(data));
  } catch {
    json = undefined;
  }
  return ServerMessage.safeParse(json);
}

/**
 * ルームに WebSocket でつなぐ（React に依存しない部分）。届いたメッセージは形を確かめてから onMessage に渡す。
 * stop() を呼ぶまで、切れたらつなぎ直す（サーバーが「つなぎ直さないで」という理由で切った場合を除く）。
 *
 * 切れたときは、close のイベントを待たずに次へ進む。手元の実行環境では、サーバーが切っても
 * close のイベントがなかなか届かないことがあるため（docs/architecture.md）。
 * 見限った接続から後で届いた知らせは無視する
 */
export function connectRoom(
  url: string,
  handlers: {
    readonly onStatus: (status: SocketStatus) => void;
    readonly onMessage: (message: ServerMessage) => void;
  },
  createSocket: (url: string) => SocketLike = (u) => new WebSocket(u),
  /** 0 以上 1 未満の乱数（つなぎ直す時刻をずらすのに使う。テストで固定できるように外から渡す） */
  random: () => number = Math.random,
): RoomConnection {
  let stopped = false;
  let attempt = 0;
  /** 今の接続（見限った・片付けた接続は null） */
  let current: SocketLike | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * retryTimer で何を待っているか。retry: 切れたのでつなぎ直す、cooldown: 送りすぎで切られた
   * （cooldown の間は、画面や電波が戻っても早めない）
   */
  let waiting: "retry" | "cooldown" | null = null;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  /** 送ったのに pong がまだ返っていない ping の締め切り（送った順。pong も送った順に返る） */
  const deadlines: number[] = [];
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  /** 電波が切れた知らせを受けてから、戻った知らせを受けるまでの間か */
  let offlineNow = false;
  /** 今の接続を、電波が切れている間につなぎ始めたか（電波が戻ったら、その接続は見限る） */
  let startedOffline = false;

  /** 接続を見限る（以後の知らせは無視し、こちらから閉じる） */
  const drop = (ws: SocketLike) => {
    if (current === ws) current = null;
    clearTimeout(connectTimer);
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    pongTimer = undefined;
    deadlines.length = 0;
    try {
      ws.close();
    } catch {
      // すでに閉じている接続は何もしない
    }
  };

  const end = (reason: EndReason) => {
    stopped = true;
    handlers.onStatus({ kind: "ended", reason });
  };

  const reconnect = () => {
    handlers.onStatus({ kind: "reconnecting" });
    waiting = "retry";
    retryTimer = setTimeout(open, Math.floor(random() * retryDelay(attempt)));
    attempt += 1;
  };

  /** つながっている接続（つなぐ途中・見限った後は null） */
  const openSocket = (): SocketLike | null =>
    current?.readyState === WebSocket.OPEN ? current : null;

  /** 返っていない ping のうち、一番早い締め切りに pong を待つタイマーをかけ直す（なければ外す） */
  const watchPongs = (ws: SocketLike) => {
    clearTimeout(pongTimer);
    pongTimer = undefined;
    if (deadlines.length === 0) return;
    const earliest = Math.min(...deadlines);
    pongTimer = setTimeout(
      () => {
        if (current !== ws) return;
        drop(ws);
        reconnect();
      },
      Math.max(0, earliest - Date.now()),
    );
  };

  /**
   * ping を送り、timeoutMs のうちに pong が返らなければ接続を見限ってつなぎ直す。
   * ping が重なったときも、それぞれの ping に timeoutMs ずつ待つ
   * （pong は送った順に返るので、返ってきたら一番古い締め切りを外す）
   */
  const ping = (ws: SocketLike, timeoutMs: number) => {
    ws.send("ping");
    deadlines.push(Date.now() + timeoutMs);
    watchPongs(ws);
  };

  /** サーバーが切った理由に応じて、終わるか・待ってからつなぎ直すかを決める */
  const afterBye = (reason: ByeReason) => {
    switch (reason) {
      case "replaced":
      case "kicked":
      case "unauthorized":
        end(reason);
        return;
      case "rateLimited": {
        const wait = RATE_LIMIT_COOLDOWN_SECONDS * 1000;
        handlers.onStatus({ kind: "cooldown", until: Date.now() + wait });
        waiting = "cooldown";
        retryTimer = setTimeout(open, wait);
        return;
      }
    }
  };

  function open() {
    waiting = null;
    if (stopped) return;
    const ws = createSocket(url);
    current = ws;
    startedOffline = offlineNow;
    connectTimer = setTimeout(() => {
      if (current !== ws) return;
      drop(ws);
      reconnect();
    }, CONNECT_TIMEOUT_MS);

    ws.addEventListener("open", () => {
      if (current !== ws) return;
      clearTimeout(connectTimer);
      attempt = 0;
      handlers.onStatus({ kind: "open" });
      // つないだ直後にも1回送る。workerd の不具合で、クライアントが一度も送っていない接続を
      // サーバーが切ると、TCP の切断が遅れる（本番でも約 10 秒、ルームが忙しいと閉じない）ため。
      // 先に1回送っておけば、すぐ閉じる（docs/architecture.md、workerd#7566）
      ping(ws, PONG_TIMEOUT_MS);
      pingTimer = setInterval(() => {
        ping(ws, PONG_TIMEOUT_MS);
      }, PING_INTERVAL_MS);
    });

    ws.addEventListener("message", (event) => {
      if (current !== ws) return;
      if (event.data === "pong") {
        deadlines.shift();
        watchPongs(ws);
        return;
      }
      const parsed = parseServerMessage(event.data);
      if (!parsed.success) {
        drop(ws);
        end("outdated");
        return;
      }
      if (parsed.data.type === "bye") {
        // サーバーが切る前の知らせ。こちらから切り、理由に応じて扱う
        drop(ws);
        afterBye(parsed.data.reason);
        return;
      }
      handlers.onMessage(parsed.data);
    });

    ws.addEventListener("close", (event) => {
      if (current !== ws) return;
      drop(ws);
      if (stopped) return;
      const reason = byeOf(event.code);
      if (reason !== null) {
        afterBye(reason);
        return;
      }
      reconnect();
    });
  }

  /** 画面や電波が戻ったとき。つながっていれば確かめ、つなぎ直しを待っている間なら wait ミリ秒後につなぐ */
  const wake = (wait: number) => {
    if (stopped) return;
    const ws = openSocket();
    if (ws !== null) {
      ping(ws, CHECK_TIMEOUT_MS);
      return;
    }
    if (waiting !== "retry") return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(open, wait);
  };

  open();
  return {
    send(message) {
      const ws = openSocket();
      if (ws === null) return;
      ws.send(JSON.stringify(message));
      ping(ws, CHECK_TIMEOUT_MS);
    },
    resume() {
      wake(0);
    },
    online() {
      offlineNow = false;
      // 電波が無い間に始めたつなぐ途中の接続は、つながらないまま残りやすい。見限ってつなぎ直す
      // （画面に戻ったときに始めた接続は見限らない。画面に戻った知らせと同時に届くことがあるため）
      if (
        !stopped &&
        current !== null &&
        openSocket() === null &&
        startedOffline
      ) {
        drop(current);
        reconnect();
      }
      wake(Math.floor(random() * ONLINE_SPREAD_MS));
    },
    offline() {
      offlineNow = true;
      if (stopped || current === null) return;
      drop(current);
      reconnect();
    },
    stop() {
      stopped = true;
      clearTimeout(retryTimer);
      if (current !== null) drop(current);
    },
  };
}

/**
 * ルームに WebSocket でつなぐ React のフック（中身は connectRoom）。
 * 画面を閉じるまで、切れたらつなぎ直す
 */
export function useRoomSocket(
  roomId: RoomId,
  /** 届いたメッセージ。send は、受け取ったのと同じ接続で送り返すときに使う */
  onMessage: (
    message: ServerMessage,
    send: (message: ClientMessage) => void,
  ) => void,
): { status: SocketStatus; send: (message: ClientMessage) => void } {
  const [status, setStatus] = useState<SocketStatus>({ kind: "connecting" });
  const connectionRef = useRef<RoomConnection | null>(null);
  const handleMessage = useEffectEvent(onMessage);

  useEffect(() => {
    const scheme = location.protocol === "https:" ? "wss:" : "ws:";
    const connection = connectRoom(
      `${scheme}//${location.host}/r/${roomId}/ws`,
      {
        onStatus: setStatus,
        onMessage: (message) => {
          handleMessage(message, (reply) => {
            connection.send(reply);
          });
        },
      },
    );
    connectionRef.current = connection;
    // 画面に戻ったとき・電波が戻ったときはすぐ確かめ、電波が切れたらすぐ切れた扱いにする
    // （decisions.md 手順5の (a) の (2)）
    const onVisibility = () => {
      if (document.visibilityState === "visible") connection.resume();
    };
    const onOnline = () => {
      connection.online();
    };
    const onOffline = () => {
      connection.offline();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      connection.stop();
      connectionRef.current = null;
    };
  }, [roomId]);

  const send = (message: ClientMessage) => {
    connectionRef.current?.send(message);
  };

  return { status, send };
}
