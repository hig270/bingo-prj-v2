import { LAYOUTS, type CellIndex } from "@bingo/game";
import type { ClientMessage } from "@bingo/protocol";
import { useEffect, useState } from "react";
import {
  tapCell,
  type LocalAction,
  type PlayerGame as PlayerGameState,
  type PlayerView,
} from "../../state/room";
import ui from "../../ui/ui.module.scss";
import { Ball } from "../Ball";
import { playerNoticeText } from "../notice-text";
import { BingoCard } from "./BingoCard";
import styles from "./player.module.scss";
import { PlayerMenu } from "./PlayerMenu";
import { PlayerStats } from "./PlayerStats";

type Playing = Extract<PlayerGameState, { status: "playing" }>;

/** マスを押したときの知らせを出しておく長さ（ミリ秒） */
const NOTICE_MS = 3000;

/** プレイヤーのゲーム画面 */
export function PlayerGame({
  view,
  game,
  connected,
  send,
  dispatch,
}: {
  readonly view: PlayerView;
  readonly game: Playing;
  readonly connected: boolean;
  readonly send: (message: ClientMessage) => void;
  readonly dispatch: (action: LocalAction) => void;
}) {
  // 知らせは、同じ文言が続いても出し直せるよう通し番号を付ける
  const [notice, setNotice] = useState<{
    readonly id: number;
    readonly text: string;
  } | null>(null);
  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, NOTICE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice]);
  const show = (text: string) => {
    setNotice((prev) => ({ id: (prev?.id ?? 0) + 1, text }));
  };

  function tap(cell: CellIndex) {
    const result = tapCell(view, cell);
    switch (result.kind) {
      case "ignored":
        return;
      case "notDrawn":
        // まだ出ていない番号は、サーバーには送らない
        show("まだ出ていません");
        return;
      case "opened":
        dispatch({ type: "local/open", cell });
        send({ type: "open", cell });
        if (result.event !== null) {
          show(playerNoticeText(result.event, view.room.rule));
        }
        return;
    }
  }

  const latest = game.draws.at(-1);
  const allDrawn =
    game.draws.length >= LAYOUTS[view.room.rule.layout].maxNumber;

  return (
    <>
      <div className={styles.top}>
        <span className={ui.muted}>{view.room.name}</span>
        <PlayerMenu room={view.room} draws={game.draws} />
      </div>
      <section className={styles.latest} aria-live="polite">
        {latest === undefined ? (
          <p className={ui.muted}>まだ抽選されていません</p>
        ) : (
          <>
            <span className={ui.muted}>最新の番号</span>
            <Ball number={latest} large />
          </>
        )}
        {allDrawn && <p className={ui.label}>全ての番号を抽選し終えました</p>}
      </section>
      <PlayerStats view={view} game={game} />
      <p className={styles.cardName}>{view.me.name}</p>
      <BingoCard
        card={view.me.card}
        opened={game.opened}
        disabled={!connected}
        onTap={tap}
      />
      <p key={notice?.id} className={styles.notice} aria-live="assertive">
        {notice?.text}
      </p>
      {game.drawing && (
        <div className={styles.overlay} role="status">
          <p className={styles.overlayTitle}>抽選中です</p>
          <p>スクリーンを見てください</p>
        </div>
      )}
    </>
  );
}
