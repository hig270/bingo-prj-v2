import { LAYOUTS, type BingoNumber, type CellIndex } from "@bingo/game";
import type { ClientMessage } from "@bingo/protocol";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  tapCell,
  type LocalAction,
  type PlayerGame as PlayerGameState,
  type PlayerView,
} from "../../state/room";
import ui from "../../ui/ui.module.scss";
import { Ball } from "../Ball";
import { playerNoticeText } from "../notice-text";
import { useWakeLock } from "../useWakeLock";
import type { Mood } from "../character/Character";
import { BingoCard } from "./BingoCard";
import styles from "./player.module.scss";
import { PlayerCharacter } from "./PlayerCharacter";
import { PlayerMenu } from "./PlayerMenu";
import { PlayerStats } from "./PlayerStats";
import {
  acceptSpeech,
  hasForgotten,
  numberText,
  pickChat,
  visibleSpeech,
  type TimedSpeech,
} from "./speech";

type Playing = Extract<PlayerGameState, { status: "playing" }>;

/** 吹き出し（開け忘れ以外）を出しておく長さ（ミリ秒） */
const SPEECH_MS = 3000;

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
  // ゲーム中は画面を消さない（decisions.md 手順5の (a) の (1)）
  useWakeLock(true);
  // キャラクターの吹き出し（decisions.md 手順5の (b)）。開け忘れは手元の状態から毎回求め、
  // それ以外の吹き出しは数秒で消す。どれを出すかは speech.ts の優先順位で決める
  const forgot = hasForgotten(
    view.me.card,
    game.draws,
    game.opened,
    game.drawing,
  );
  const [timed, setTimed] = useState<TimedSpeech | null>(null);
  const nextId = useRef(1);
  const lastChat = useRef<number | null>(null);
  useEffect(() => {
    if (timed === null) return;
    const timer = setTimeout(() => {
      setTimed(null);
    }, SPEECH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [timed]);
  const say = (kind: TimedSpeech["kind"], text: string, mood: Mood) => {
    const incoming = { id: nextId.current++, kind, text, mood };
    setTimed((current) => acceptSpeech(current, incoming, forgot));
  };

  // 番号が公開されたら「12番！」と言う（開いた直後や再読み込みのときの番号では言わない）
  const latest = game.draws.at(-1);
  const sayNumber = useEffectEvent((n: BingoNumber | undefined) => {
    if (n !== undefined) say("number", numberText(n), "talk");
  });
  const shownLatest = useRef(latest);
  useEffect(() => {
    if (shownLatest.current === latest) return;
    shownLatest.current = latest;
    sayNumber(latest);
  }, [latest]);

  function chat() {
    // 開け忘れの知らせが出ている間は、タップしても何も起こらない
    if (forgot) return;
    const { index, text } = pickChat(lastChat.current, Math.random);
    lastChat.current = index;
    say("chat", text, "talk");
  }

  function tap(cell: CellIndex) {
    const result = tapCell(view, cell);
    switch (result.kind) {
      case "ignored":
        return;
      case "notDrawn":
        // まだ出ていない番号は、サーバーには送らない
        say("event", "まだ出ていません", "talk");
        return;
      case "opened":
        dispatch({ type: "local/open", cell });
        send({ type: "open", cell });
        if (result.event !== null) {
          say("event", playerNoticeText(result.event, view.room.rule), "happy");
        }
        return;
    }
  }

  const allDrawn =
    game.draws.length >= LAYOUTS[view.room.rule.layout].maxNumber;

  return (
    <>
      <PlayerCharacter
        speech={visibleSpeech(timed, forgot)}
        roomName={view.room.name}
        menu={<PlayerMenu room={view.room} draws={game.draws} />}
        onTap={chat}
      />
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
      {game.drawing && (
        <div className={styles.overlay} role="status">
          <p className={styles.overlayTitle}>抽選中です</p>
          <p>スクリーンを見てください</p>
        </div>
      )}
    </>
  );
}
