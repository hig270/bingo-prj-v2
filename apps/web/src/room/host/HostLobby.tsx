import type { ClientMessage, PlayerSummary, RoomId } from "@bingo/protocol";
import { useState } from "react";
import { WIN_READY, ruleSummary } from "../../rules/summary";
import type { HostView } from "../../state/room";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import ui from "../../ui/ui.module.scss";
import styles from "./host.module.scss";
import { JoinQr } from "./JoinQr";

/** 募集画面 */
export function HostLobby({
  roomId,
  view,
  connected,
  send,
  onStart,
}: {
  readonly roomId: RoomId;
  readonly view: HostView;
  readonly connected: boolean;
  readonly send: (message: ClientMessage) => void;
  /** 「ゲーム開始」を確かめたとき（ボタンを押した操作の中で、音を有効にするため） */
  readonly onStart: () => void;
}) {
  const [kickTarget, setKickTarget] = useState<PlayerSummary | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  // まだ遊べない勝ち方のルームは始められない（モード選択で選べなくしてあるが、念のため）
  const supported = WIN_READY[view.room.rule.win.type];
  const canStart = connected && supported && view.players.length > 0;

  return (
    <>
      <header className={styles.header}>
        <h1 className={ui.title}>{view.room.name}</h1>
        <p className={ui.muted}>ルール: {ruleSummary(view.room.rule)}</p>
      </header>
      <div className={styles.layout}>
        <section className={`${ui.card} ${styles.join}`}>
          <h2 className={ui.subtitle}>参加はこちら</h2>
          <JoinQr roomId={roomId} className={styles.qr} />
          <p className={styles.url}>
            {location.host}/r/
            <span className={styles.roomId}>{roomId}</span>
          </p>
        </section>
        <section className={ui.card}>
          <h2 className={ui.subtitle}>参加者 {view.players.length} 人</h2>
          {view.players.length === 0 ? (
            <p className={ui.muted}>まだ誰も参加していません</p>
          ) : (
            <ul className={styles.players}>
              {view.players.map((player) => (
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
          <div>
            <button
              type="button"
              className={ui.button}
              disabled={!canStart}
              onClick={() => {
                setConfirmStart(true);
              }}
            >
              ゲーム開始
            </button>
          </div>
          {!supported && (
            <p className={ui.muted}>このルールはまだ準備中で、始められません</p>
          )}
        </section>
      </div>
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
      <ConfirmDialog
        open={confirmStart}
        message="ゲームを始めますか？ 始めた後は、新しい参加を受け付けません。"
        confirmLabel="始める"
        onConfirm={() => {
          onStart();
          send({ type: "start" });
          setConfirmStart(false);
        }}
        onCancel={() => {
          setConfirmStart(false);
        }}
      />
    </>
  );
}
