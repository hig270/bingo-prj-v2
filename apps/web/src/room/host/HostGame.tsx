import { LAYOUTS, type BingoNumber } from "@bingo/game";
import type { ClientMessage, RoomId } from "@bingo/protocol";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { DrawStage, type DrawStageHandle } from "../../draw/DrawStage";
import { DEFAULT_TIMING } from "../../draw/timing";
import type { DrawSound } from "../../sound/draw-sound";
import type {
  HostGame as HostGameState,
  HostView,
  LocalAction,
} from "../../state/room";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import ui from "../../ui/ui.module.scss";
import { DrawHistory } from "../Ball";
import styles from "./host.module.scss";
import { JoinQr } from "./JoinQr";
import { NoticeBanner } from "./NoticeBanner";
import { PickedCardsView } from "./PickedCards";
import { RankingTable } from "./RankingTable";

type Playing = Extract<HostGameState, { status: "playing" }>;

/** ホストのゲーム画面（操作と投影を兼ねる） */
export function HostGame({
  roomId,
  view,
  game,
  connected,
  send,
  dispatch,
  sound,
}: {
  readonly roomId: RoomId;
  readonly view: HostView;
  readonly game: Playing;
  readonly connected: boolean;
  readonly send: (message: ClientMessage) => void;
  readonly dispatch: (action: LocalAction) => void;
  readonly sound: DrawSound;
}) {
  const stageRef = useRef<DrawStageHandle>(null);
  /** 演出を流し始めた番号（同じ番号の演出を2回流さないため） */
  const playedRef = useRef<number | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  /**
   * 演出を流している間か。つなぎ直して状態を受け取り直すと current は空になるが、
   * 流し始めた演出は続くので、別に持つ（その間は抽選と終了を押せなくする）
   */
  const [animating, setAnimating] = useState(false);
  const current = game.current;

  /** 画面が外れたか（外れた後も演出が進むことがあるので、その後の音は鳴らさない） */
  const unmountedRef = useRef(false);
  // 画面が外れたら（ゲームが終わって結果画面になったときなど）、鳴り続ける音を止める
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      sound.stop();
    };
  }, [sound]);

  // サーバーが番号を決めたら演出を流し、片付けまで終わったらサーバーに知らせる
  // （サーバーはそれを受けてスマホに番号を公開する。decisions.md「演出と音」）
  const play = useEffectEvent((n: BingoNumber) => {
    const stage = stageRef.current;
    if (stage === null) return;
    setAnimating(true);
    void stage
      .play(n, {
        timing: DEFAULT_TIMING,
        onReveal: () => {
          dispatch({ type: "local/revealed", number: n });
        },
        onCue: (cue) => {
          if (!unmountedRef.current) sound.play(cue);
        },
      })
      // 演出が途中で失敗しても、片付けて番号を公開する（押せないままになったり、番号が公開されなかったりしないように）
      .catch(() => undefined)
      .then(() => {
        setAnimating(false);
        dispatch({ type: "local/drawDone", number: n });
        send({ type: "drawShown", number: n });
      });
  });
  useEffect(() => {
    if (current === null || current.revealed) return;
    if (playedRef.current === current.number) return;
    playedRef.current = current.number;
    const n = current.number;
    // 描画が終わってから始める（演出の部品は、玉の番号と色を flushSync で先に画面へ反映するが、
    // 描画の途中の useEffect の中からでは反映できないため）
    queueMicrotask(() => {
      play(n);
    });
  }, [current]);

  const maxNumber = LAYOUTS[view.room.rule.layout].maxNumber;
  // 演出の途中の番号は、発表するまで履歴に入っていないので足して数える
  const drawnCount = game.draws.length + (current?.revealed === false ? 1 : 0);
  const allDrawn = drawnCount >= maxNumber;
  const prizes = view.room.prizes;

  /** 抽選も終了も押せない間（番号を待っている間と、演出の間） */
  const busy = game.requesting || current !== null || animating;
  /**
   * 抽選ボタンの鍵。押した瞬間にかけ、演出が終わって押せる状態に戻ったら外す
   * （ボタンが押せない見た目になる前に、続けて押されても1回だけ送るため）。
   * 押すたびに新しい鍵にして、音の準備を待つ間に外れた（つなぎ直した）ら送らない
   */
  const drawLockRef = useRef<symbol | null>(null);
  useEffect(() => {
    if (!busy) drawLockRef.current = null;
  }, [busy]);

  async function draw() {
    if (drawLockRef.current !== null) return;
    const lock = Symbol("draw");
    drawLockRef.current = lock;
    // 番号が届くまでもう一度押せないよう、先に押した印を付ける
    dispatch({ type: "local/drawRequested" });
    // ブラウザは操作の中でないと音を出させないので、ボタンを押した処理の中で準備する
    // （最初の1回は音のファイルの読み込みを待つ）
    await sound.unlock();
    // 待つ間につなぎ直して状態を受け取り直したら、押したことは取り消されている
    if (drawLockRef.current !== lock) return;
    send({ type: "draw" });
  }

  return (
    <>
      <NoticeBanner
        notices={game.notices}
        rule={view.room.rule}
        onShown={(id) => {
          dispatch({ type: "local/noticeShown", id });
        }}
      />
      <div className={styles.game}>
        <section className={styles.stage}>
          <DrawStage ref={stageRef} />
          {allDrawn && current === null ? (
            <p className={styles.allDrawn}>全ての番号を抽選し終えました</p>
          ) : (
            <button
              type="button"
              className={`${ui.button} ${styles.drawButton}`}
              disabled={!connected || busy || allDrawn}
              onClick={() => void draw()}
            >
              抽選
            </button>
          )}
        </section>
        <section className={ui.card}>
          <div className={styles.infoHeader}>
            <h1 className={ui.title}>{view.room.name}</h1>
            {/* 画面を閉じたプレイヤーが読み直して戻るため、ゲーム中も小さく出し続ける
                （抽選の演出の外に置く。decisions.md 手順5の (a) の (6)） */}
            <figure className={styles.gameQr}>
              <JoinQr roomId={roomId} className={styles.gameQrCode} />
              <figcaption className={ui.muted}>
                画面を閉じた人はここから戻れます
              </figcaption>
            </figure>
          </div>
          <p className={styles.stats}>
            <span>参加 {view.players.length} 人</span>
            {prizes !== null && (
              <span>
                景品の残り {Math.max(0, prizes - game.prizeWinners)} 個
              </span>
            )}
          </p>
          <h2 className={ui.subtitle}>
            抽選履歴（{game.draws.length} / {maxNumber}）
          </h2>
          <DrawHistory draws={game.draws} />
          <div>
            <button
              type="button"
              className={`${ui.button} ${ui.secondary}`}
              disabled={!connected || busy}
              onClick={() => {
                setConfirmEnd(true);
              }}
            >
              ゲーム終了
            </button>
          </div>
        </section>
        <div className={styles.rankingArea}>
          <RankingTable ranking={game.ranking} />
          <PickedCardsView ranking={game.ranking} />
        </div>
      </div>
      <ConfirmDialog
        open={confirmEnd}
        message="ゲームを終了しますか？ 終了すると結果を表示し、もう抽選できません。"
        confirmLabel="終了する"
        onConfirm={() => {
          send({ type: "end" });
          setConfirmEnd(false);
        }}
        onCancel={() => {
          setConfirmEnd(false);
        }}
      />
      <ConfirmDialog
        // 演出の途中には出さない（終了すると、演出中の番号が会場に見せないまま公開されるため）
        open={game.askEnd && !confirmEnd && !busy}
        message="最後の景品が決まりました。ゲームを終了しますか？"
        confirmLabel="終了する"
        onConfirm={() => {
          send({ type: "end" });
          dispatch({ type: "local/askEndClosed" });
        }}
        onCancel={() => {
          dispatch({ type: "local/askEndClosed" });
        }}
      />
    </>
  );
}
