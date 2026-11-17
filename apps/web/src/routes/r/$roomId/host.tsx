import type { PlayerSummary, RoomId } from "@bingo/protocol";
import { createFileRoute } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { fetchMe } from "../../../api/http";
import { useRoomSocket } from "../../../api/socket";
import { ConnectionNotice } from "../../../room/ConnectionNotice";
import { LoadProblem } from "../../../room/LoadProblem";
import { ruleSummary } from "../../../rules/summary";
import { useRoomStore } from "../../../state/room-store";
import { ConfirmDialog } from "../../../ui/ConfirmDialog";
import ui from "../../../ui/ui.module.scss";
import styles from "./host.module.scss";

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
  return <Lobby roomId={roomId} />;
}

/** 参加用の URL（LINE で開いたときに外部のブラウザで開かせる指定を付ける） */
function joinUrl(roomId: RoomId): string {
  return `${location.origin}/r/${roomId}?openExternalBrowser=1`;
}

/** 募集画面 */
function Lobby({ roomId }: { readonly roomId: RoomId }) {
  const receive = useRoomStore((s) => s.receive);
  const reset = useRoomStore((s) => s.reset);
  const state = useRoomStore((s) => s.state);
  useEffect(() => {
    reset();
  }, [roomId, reset]);
  const { status, send } = useRoomSocket(roomId, receive);
  const [kickTarget, setKickTarget] = useState<PlayerSummary | null>(null);

  return (
    <main className={`${ui.page} ${ui.wide}`}>
      <ConnectionNotice status={status} />
      {status.kind !== "ended" && state.view === "host" && (
        <>
          <header className={styles.header}>
            <h1 className={ui.title}>{state.room.name}</h1>
            <p className={ui.muted}>ルール: {ruleSummary(state.room.rule)}</p>
          </header>
          <div className={styles.layout}>
            <section className={`${ui.card} ${styles.join}`}>
              <h2 className={ui.subtitle}>参加はこちら</h2>
              <QRCodeSVG
                value={joinUrl(roomId)}
                className={styles.qr}
                marginSize={2}
                title="参加用の QR コード"
              />
              <p className={styles.url}>
                {location.host}/r/
                <span className={styles.roomId}>{roomId}</span>
              </p>
            </section>
            <section className={ui.card}>
              <h2 className={ui.subtitle}>参加者 {state.players.length} 人</h2>
              {state.players.length === 0 ? (
                <p className={ui.muted}>まだ誰も参加していません</p>
              ) : (
                <ul className={styles.players}>
                  {state.players.map((player) => (
                    <li key={player.id}>
                      <button
                        type="button"
                        className={styles.player}
                        title="押すと、この人を外せます"
                        onClick={() => {
                          setKickTarget(player);
                        }}
                      >
                        {player.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className={ui.muted}>
                名前を押すと、その人をルームから外せます（不適切な名前など）
              </p>
            </section>
          </div>
        </>
      )}
      <ConfirmDialog
        open={kickTarget !== null}
        message={`${kickTarget?.name ?? ""} さんを外しますか？ 外した人は、同じ端末から参加し直せません。`}
        confirmLabel="外す"
        onConfirm={() => {
          if (kickTarget !== null) {
            send({ type: "kick", playerId: kickTarget.id });
          }
          setKickTarget(null);
        }}
        onCancel={() => {
          setKickTarget(null);
        }}
      />
    </main>
  );
}
