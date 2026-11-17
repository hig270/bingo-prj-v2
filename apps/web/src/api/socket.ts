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
/** つなぎ直すまでの待ち時間（失敗が続くほど延ばす。最大 10 秒） */
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
  /** つながっているときだけ送る（つながっていなければ捨てる） */
  send(message: ClientMessage): void;
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
): RoomConnection {
  let stopped = false;
  let attempt = 0;
  /** 今の接続（見限った・片付けた接続は null） */
  let current: SocketLike | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let pongTimer: ReturnType<typeof setTimeout> | undefined;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;

  /** 接続を見限る（以後の知らせは無視し、こちらから閉じる） */
  const drop = (ws: SocketLike) => {
    if (current === ws) current = null;
    clearTimeout(connectTimer);
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    pongTimer = undefined;
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
    retryTimer = setTimeout(open, retryDelay(attempt));
    attempt += 1;
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
        retryTimer = setTimeout(open, wait);
        return;
      }
    }
  };

  function open() {
    if (stopped) return;
    const ws = createSocket(url);
    current = ws;
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
      const ping = () => {
        ws.send("ping");
        // 前の ping の答えを待っている間は、待ち時間を延ばさない
        pongTimer ??= setTimeout(() => {
          if (current !== ws) return;
          drop(ws);
          reconnect();
        }, PONG_TIMEOUT_MS);
      };
      // つないだ直後にも1回送る。workerd の不具合で、クライアントが一度も送っていない接続を
      // サーバーが切ると、TCP の切断が遅れる（本番でも約 10 秒、ルームが忙しいと閉じない）ため。
      // 先に1回送っておけば、すぐ閉じる（docs/architecture.md、workerd#7566）
      ping();
      pingTimer = setInterval(ping, PING_INTERVAL_MS);
    });

    ws.addEventListener("message", (event) => {
      if (current !== ws) return;
      if (event.data === "pong") {
        clearTimeout(pongTimer);
        pongTimer = undefined;
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

  open();
  return {
    send(message) {
      if (current?.readyState === WebSocket.OPEN) {
        current.send(JSON.stringify(message));
      }
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
  onMessage: (message: ServerMessage) => void,
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
          handleMessage(message);
        },
      },
    );
    connectionRef.current = connection;
    return () => {
      connection.stop();
      connectionRef.current = null;
    };
  }, [roomId]);

  const send = (message: ClientMessage) => {
    connectionRef.current?.send(message);
  };

  return { status, send };
}
