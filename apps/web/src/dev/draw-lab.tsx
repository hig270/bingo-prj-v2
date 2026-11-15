import { BingoNumber } from "@bingo/game";
import { StrictMode, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DrawStage, type DrawStageHandle } from "../draw/DrawStage";
import { letterOf } from "../draw/letter";
import { DEFAULT_TIMING, type DrawTiming } from "../draw/timing";
import {
  DEFAULT_SOUND_OPTIONS,
  DrawSound,
  type DrumRollMode,
  type RevealSound,
  type SoundOptions,
} from "../sound/draw-sound";
import { SOUND_SOURCES, type SoundName } from "../sound/sources";
import "../styles/global.scss";
import styles from "./draw-lab.module.scss";

const ALL_NUMBERS = Array.from({ length: 75 }, (_, i) =>
  BingoNumber.parse(i + 1),
);

const REVEAL_CHOICES: readonly (readonly [RevealSound, string])[] = [
  ["jajean", "ジャジャーン"],
  ["jean", "ジャン！"],
  ["rollFinish", "ロールの閉めシンバル"],
  ["trumpet", "ラッパのファンファーレ"],
];

const DRUM_ROLL_CHOICES: readonly (readonly [DrumRollMode, string])[] = [
  ["off", "なし"],
  ["tease", "じらしの間"],
  ["spin", "回し始めから"],
];

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
  const [sound] = useState(() => new DrawSound());
  const [soundOn, setSoundOn] = useState(true);
  const [soundOptions, setSoundOptions] = useState<SoundOptions>(
    DEFAULT_SOUND_OPTIONS,
  );
  const [missing, setMissing] = useState<readonly SoundName[]>([]);

  function updateSoundOptions(next: SoundOptions) {
    setSoundOptions(next);
    sound.setOptions(next);
  }

  const remaining = ALL_NUMBERS.filter((n) => !history.includes(n));

  async function draw() {
    const stage = stageRef.current;
    // 試作なので画面の中で番号を引く（本番ではサーバーが決める）
    const n = remaining[Math.floor(Math.random() * remaining.length)];
    if (stage === null || n === undefined) return;
    setPlaying(true);
    // ブラウザは操作の中でないと音を出させないので、ボタンを押した処理の中で準備する。
    // 最初の1回は音のファイルの読み込みを待つ
    setMissing(await sound.unlock());
    try {
      await stage.play(n, {
        timing,
        onReveal: (revealed) => {
          setHistory((h) => [...h, revealed]);
        },
        onCue: (cue) => {
          sound.play(cue);
          setLastCue(
            cue.type === "land"
              ? `land（${cue.surface}・強さ ${cue.strength.toFixed(2)}）`
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
        <label>
          <input
            type="checkbox"
            checked={soundOn}
            onChange={(e) => {
              setSoundOn(e.target.checked);
              sound.setMuted(!e.target.checked);
            }}
          />
          音を出す
        </label>
        <span className={styles.cue}>音のきっかけ: {lastCue}</span>
      </div>

      <div className={styles.soundOptions}>
        <label>
          発表の音:{" "}
          <select
            value={soundOptions.reveal}
            onChange={(e) => {
              const found = REVEAL_CHOICES.find(([v]) => v === e.target.value);
              if (found !== undefined)
                updateSoundOptions({ ...soundOptions, reveal: found[0] });
            }}
          >
            {REVEAL_CHOICES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          ドラムロール:{" "}
          <select
            value={soundOptions.drumRoll}
            onChange={(e) => {
              const found = DRUM_ROLL_CHOICES.find(
                ([v]) => v === e.target.value,
              );
              if (found !== undefined)
                updateSoundOptions({ ...soundOptions, drumRoll: found[0] });
            }}
          >
            {DRUM_ROLL_CHOICES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={soundOptions.cheer}
            onChange={(e) => {
              updateSoundOptions({ ...soundOptions, cheer: e.target.checked });
            }}
          />
          発表に歓声と拍手を重ねる
        </label>
      </div>

      {missing.length > 0 && (
        <p className={styles.warning}>
          音のファイルが見つかりません（その音は鳴りません）。取得方法は
          src/sound/sources.ts を参照:{" "}
          {missing.map((name) => SOUND_SOURCES[name].file).join("、")}
        </p>
      )}

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
