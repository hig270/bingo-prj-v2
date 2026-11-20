import type { RoomId } from "@bingo/protocol";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchMe } from "../../../api/http";
import { useRoomSocket } from "../../../api/socket";
import { ConnectionNotice } from "../../../room/ConnectionNotice";
import { DrawHistory } from "../../../room/Ball";
import { HostGame } from "../../../room/host/HostGame";
import { HostLobby } from "../../../room/host/HostLobby";
import { LoadProblem } from "../../../room/LoadProblem";
import { ResultsView } from "../../../room/ResultsView";
import { useExtendSession } from "../../../room/useExtendSession";
import { useWakeLock } from "../../../room/useWakeLock";
import { DrawSound } from "../../../sound/draw-sound";
import { useRoomStore } from "../../../state/room-store";
import ui from "../../../ui/ui.module.scss";

export const Route = createFileRoute("/r/$roomId/host")({
  loader: ({ params }) => fetchMe(params.roomId),
  component: HostPage,
});

/** ホストの画面 */
function HostPage() {
  const { roomId } = Route.useParams();
  const result = Route.useLoaderData();
  if (result.kind !== "ok") return <LoadProblem kind={result.kind} />;
  if (result.value.me.role !== "host") {
    return (
      <main className={ui.page}>
        <h1 className={ui.title}>ホストとして開けません</h1>
        <p>ホストの画面は、ルームを作った端末・ブラウザでだけ開けます。</p>
      </main>
    );
  }
  return <HostRoom roomId={roomId} />;
}

/** ホストの画面の中身（募集画面 → ゲーム画面 → 結果画面。サーバーから届いた状態で切り替える） */
function HostRoom({ roomId }: { readonly roomId: RoomId }) {
  const receive = useRoomStore((s) => s.receive);
  const dispatch = useRoomStore((s) => s.dispatch);
  const reset = useRoomStore((s) => s.reset);
  const state = useRoomStore((s) => s.state);
  useEffect(() => {
    reset();
  }, [roomId, reset]);
  const { status, send } = useRoomSocket(roomId, receive);
  // 抽選演出の音（「ゲーム開始」と抽選ボタンを押したときに有効にする。decisions.md「演出と音」）
  const [sound] = useState(() => new DrawSound());
  useExtendSession(
    roomId,
    state.view === "host" && state.game.status === "playing",
  );
  // 募集からゲームの終わりまで、画面を消さない（募集中に消えると、会場の人が QR コードを読めなくなる。
  // decisions.md 手順5の (a) の (1)）。接続が終わった（別の画面で開かれた、など）ら外す
  useWakeLock(
    status.kind !== "ended" &&
      state.view === "host" &&
      state.game.status !== "finished",
  );
  const connected = status.kind === "open";

  return (
    <main className={`${ui.page} ${ui.wide}`}>
      <ConnectionNotice status={status} />
      {status.kind !== "ended" &&
        state.view === "host" &&
        (() => {
          const game = state.game;
          switch (game.status) {
            case "lobby":
              return (
                <HostLobby
                  roomId={roomId}
                  view={state}
                  connected={connected}
                  send={send}
                  onStart={() => void sound.unlock()}
                />
              );
            case "playing":
              return (
                <HostGame
                  roomId={roomId}
                  view={state}
                  game={game}
                  connected={connected}
                  send={send}
                  dispatch={dispatch}
                  sound={sound}
                />
              );
            case "finished":
              return (
                <>
                  <h1 className={ui.title}>{state.room.name}</h1>
                  <ResultsView results={game.results} />
                  <section className={ui.card}>
                    <h2 className={ui.subtitle}>
                      抽選履歴（{game.draws.length} 個）
                    </h2>
                    <DrawHistory draws={game.draws} />
                  </section>
                </>
              );
          }
        })()}
    </main>
  );
}
