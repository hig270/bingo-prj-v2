import {
  PLAYER_NAME_MAX,
  PlayerName,
  countGraphemes,
  tidyText,
  type JoinError,
  type RoomId,
  type RoomInfo,
} from "@bingo/protocol";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchMe, joinRoom } from "../../../api/http";
import { useRoomSocket } from "../../../api/socket";
import { ConnectionNotice } from "../../../room/ConnectionNotice";
import { LoadProblem } from "../../../room/LoadProblem";
import { PlayerGame } from "../../../room/player/PlayerGame";
import { ResultsView } from "../../../room/ResultsView";
import { useExtendSession } from "../../../room/useExtendSession";
import { ruleSummary } from "../../../rules/summary";
import { useRoomStore } from "../../../state/room-store";
import ui from "../../../ui/ui.module.scss";

export const Route = createFileRoute("/r/$roomId/")({
  loader: ({ params }) => fetchMe(params.roomId),
  component: PlayerPage,
});

/** プレイヤーの画面（参加画面 → 待機画面） */
function PlayerPage() {
  const { roomId } = Route.useParams();
  const result = Route.useLoaderData();
  if (result.kind !== "ok") return <LoadProblem kind={result.kind} />;
  const { room, me } = result.value;

  switch (me.role) {
    case "player":
      return <PlayerRoom roomId={roomId} />;
    case "kicked":
      return (
        <main className={ui.page}>
          <h1 className={ui.title}>{room.name}</h1>
          <p>ホストによりルームから外されました。</p>
        </main>
      );
    case "host":
      return (
        <main className={ui.page}>
          <h1 className={ui.title}>{room.name}</h1>
          <p>この端末は、このルームのホストです。</p>
          <div>
            <Link
              to="/r/$roomId/host"
              params={{ roomId }}
              className={ui.button}
            >
              ホストの画面を開く
            </Link>
          </div>
        </main>
      );
    case "none":
      return room.status === "lobby" ? (
        <JoinForm roomId={roomId} room={room} />
      ) : (
        <main className={ui.page}>
          <h1 className={ui.title}>{room.name}</h1>
          <p>ゲームはすでに始まっています。</p>
        </main>
      );
  }
}

/** 前回参加したときの名前を、この端末に覚えておく場所 */
const LAST_NAME_KEY = "bingo:lastName";

function loadLastName(): string {
  try {
    return localStorage.getItem(LAST_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveLastName(name: string): void {
  try {
    localStorage.setItem(LAST_NAME_KEY, name);
  } catch {
    // 保存できない環境（プライベートブラウズなど）では覚えない
  }
}

const JOIN_ERROR_TEXT: Record<JoinError, string> = {
  invalidName: "名前を確かめてください",
  nameTaken: "その名前は使われています。別の名前にしてください",
  roomFull: "参加人数の上限に達しています",
  started: "ゲームはすでに始まっています",
  kicked: "ホストによりルームから外されました",
  alreadyJoined: "この端末はすでに参加しています",
};

/** 参加画面 */
function JoinForm({
  roomId,
  room,
}: {
  readonly roomId: RoomId;
  readonly room: RoomInfo;
}) {
  const router = useRouter();
  const [name, setName] = useState(loadLastName);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const length = countGraphemes(tidyText(name));

  async function submit() {
    const parsed = PlayerName.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "名前を確かめてください");
      return;
    }
    setSending(true);
    setError(null);
    const result = await joinRoom(roomId, parsed.data);
    setSending(false);
    if (result.kind !== "ok") {
      setError(
        result.kind === "network"
          ? "通信できませんでした。もう一度押してください"
          : "画面が古くなっています。再読み込みしてください",
      );
      return;
    }
    if (!result.value.ok) {
      setError(JOIN_ERROR_TEXT[result.value.error]);
      if (result.value.error === "alreadyJoined") await router.invalidate();
      return;
    }
    saveLastName(result.value.name);
    // 参加の記録（Cookie）を受け取ったので、読み込み直して待機画面にする
    await router.invalidate();
  }

  return (
    <main className={ui.page}>
      <h1 className={ui.title}>{room.name}</h1>
      <p className={ui.muted}>ルール: {ruleSummary(room.rule)}</p>
      <form
        className={ui.card}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className={ui.field}>
          <span className={ui.label}>名前</span>
          <input
            className={ui.input}
            value={name}
            autoComplete="nickname"
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
          <span className={ui.muted}>
            名前はスクリーンに表示されます（{length} / {PLAYER_NAME_MAX} 文字）
          </span>
        </label>
        {error !== null && <p className={ui.error}>{error}</p>}
        <div>
          <button type="submit" className={ui.button} disabled={sending}>
            参加
          </button>
        </div>
      </form>
    </main>
  );
}

/** 参加した後の画面（待機画面 → ゲーム画面 → 結果画面。サーバーから届いた状態で切り替える） */
function PlayerRoom({ roomId }: { readonly roomId: RoomId }) {
  const receive = useRoomStore((s) => s.receive);
  const dispatch = useRoomStore((s) => s.dispatch);
  const reset = useRoomStore((s) => s.reset);
  const state = useRoomStore((s) => s.state);
  useEffect(() => {
    reset();
  }, [roomId, reset]);
  const { status, send } = useRoomSocket(roomId, receive);
  useExtendSession(
    roomId,
    state.view === "player" && state.game.status === "playing",
  );

  return (
    <main className={ui.page}>
      <ConnectionNotice status={status} />
      {status.kind !== "ended" &&
        state.view === "player" &&
        (() => {
          const game = state.game;
          switch (game.status) {
            case "lobby":
              return (
                <>
                  <h1 className={ui.title}>{state.room.name}</h1>
                  <div className={ui.card}>
                    <p className={ui.subtitle}>参加しました！</p>
                    <p>
                      あなたの名前: <strong>{state.me.name}</strong>
                    </p>
                    <p className={ui.muted}>
                      ルール: {ruleSummary(state.room.rule)}
                    </p>
                  </div>
                  <p>
                    ホストがゲームを始めるまで、この画面のままお待ちください。
                  </p>
                </>
              );
            case "playing":
              return (
                <PlayerGame
                  view={state}
                  game={game}
                  connected={status.kind === "open"}
                  send={send}
                  dispatch={dispatch}
                />
              );
            case "finished":
              return (
                <>
                  <h1 className={ui.title}>{state.room.name}</h1>
                  <ResultsView results={game.results} me={state.me.id} />
                </>
              );
          }
        })()}
    </main>
  );
}
