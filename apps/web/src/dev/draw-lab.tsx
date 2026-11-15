import { BingoNumber } from "@bingo/game";
import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DrawStage, type DrawStageHandle } from "../draw/DrawStage";
import { letterOf } from "../draw/letter";
import { DEFAULT_TIMING, type DrawTiming } from "../draw/timing";
import "../styles/global.scss";
import styles from "./draw-lab.module.scss";

const ALL_NUMBERS = Array.from({ length: 75 }, (_, i) =>
  BingoNumber.parse(i + 1),
);

/** つまみの定義（どの値を、どの範囲で変えるか） */
const SLIDERS: readonly {
  key: keyof DrawTiming;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  {
    key: "spinSeconds",
    label: "玉が出るまで回す長さ（秒）",
    min: 0.5,
    max: 8,
    step: 0.1,
  },
  { key: "spinTurns", label: "玉が出るまで回す回数", min: 1, max: 10, step: 1 },
  {
    key: "rollSeconds",
    label: "転がる長さ（秒）",
    min: 0.3,
    max: 3,
    step: 0.1,
  },
  { key: "teaseSeconds", label: "じらし（秒）", min: 0, max: 3, step: 0.1 },
  { key: "zoomSeconds", label: "寄る長さ（秒）", min: 0.2, max: 2, step: 0.1 },
  {
    key: "holdSeconds",
    label: "見せる長さ（秒）",
    min: 0.5,
    max: 6,
    step: 0.1,
  },
];

function DrawLab() {
  const stageRef = useRef<DrawStageHandle>(null);
  const [timing, setTiming] = useState<DrawTiming>(DEFAULT_TIMING);
  const [history, setHistory] = useState<readonly BingoNumber[]>([]);
  const [playing, setPlaying] = useState(false);
  const [lastCue, setLastCue] = useState("");

  const remaining = ALL_NUMBERS.filter((n) => !history.includes(n));

  async function draw() {
    const stage = stageRef.current;
    // 試作なので画面の中で番号を引く（本番ではサーバーが決める）
    const n = remaining[Math.floor(Math.random() * remaining.length)];
    if (stage === null || n === undefined) return;
    setPlaying(true);
    try {
      await stage.play(n, {
        timing,
        onReveal: (revealed) => {
          setHistory((h) => [...h, revealed]);
        },
        // 音はまだ無いので、きっかけを画面に出して確かめる
        onCue: (cue) => {
          setLastCue(
            cue.type === "land"
              ? `land（強さ ${cue.strength.toFixed(2)}）`
              : cue.type,
          );
        },
      });
    } finally {
      setPlaying(false);
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>抽選演出の試作</h1>
      <DrawStage ref={stageRef} />

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.drawButton}
          disabled={playing || remaining.length === 0}
          onClick={() => void draw()}
        >
          抽選
        </button>
        <button
          type="button"
          disabled={playing}
          onClick={() => {
            setHistory([]);
          }}
        >
          履歴を消す
        </button>
        <button
          type="button"
          onClick={() => {
            setTiming(DEFAULT_TIMING);
          }}
        >
          長さを初期値に戻す
        </button>
        <span className={styles.cue}>音のきっかけ: {lastCue}</span>
      </div>

      <div className={styles.sliders}>
        {SLIDERS.map((s) => (
          <label key={s.key} className={styles.slider}>
            <span>
              {s.label}: <b>{timing[s.key]}</b>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={timing[s.key]}
              onChange={(e) => {
                const value = Number(e.target.value);
                setTiming((t) => ({ ...t, [s.key]: value }));
              }}
            />
          </label>
        ))}
      </div>

      <section>
        <h2 className={styles.subtitle}>抽選履歴（{history.length} / 75）</h2>
        <ol className={styles.history}>
          {history.map((n) => (
            <li
              key={n}
              className={styles.historyBall}
              data-letter={letterOf(n)}
            >
              {n}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

const rootElement = document.getElementById("root");
if (rootElement === null) throw new Error("#root が見つかりません");

createRoot(rootElement).render(
  <StrictMode>
    <DrawLab />
  </StrictMode>,
);
