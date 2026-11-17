import type { CardLayout, GameRule } from "@bingo/game";
import {
  type CreateRoomError,
  ROOM_NAME_MAX,
  RoomSettings,
} from "@bingo/protocol";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { createRoom } from "../../api/http";
import { BASIC_RULES, LAYOUT_LABEL, ruleSummary } from "../../rules/summary";
import ui from "../../ui/ui.module.scss";
import styles from "./new.module.scss";

const Mode = z.enum(["normal", "speed", "reverse"]);

export const Route = createFileRoute("/new/settings")({
  // URL の ?mode= を確かめる（知らない値なら通常にする）
  validateSearch: (search) => ({
    mode: Mode.catch("normal").parse(search["mode"]),
  }),
  component: Settings,
});

/** ルームを作れなかったときの知らせ */
const CREATE_ERROR_TEXT: Record<CreateRoomError, string> = {
  invalidSettings: "画面が古くなっています。再読み込みしてください。",
  busy: "ルームを作れませんでした。もう一度押してください。",
};

type WinType = GameRule["win"]["type"];
const PRIZE_LINES = [1, 2, 3] as const;
type PrizeLines = (typeof PRIZE_LINES)[number];

/** ゲーム設定 */
function Settings() {
  const { mode } = Route.useSearch();
  const basic: GameRule = BASIC_RULES[mode].rule;
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [prizeLines, setPrizeLines] = useState<PrizeLines>(1);
  const [prizes, setPrizes] = useState("");
  const [layout, setLayout] = useState<CardLayout>(basic.layout);
  const [winType, setWinType] = useState<WinType>(basic.win.type);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const rule: GameRule = {
    layout,
    win:
      winType === "bingo" ? { type: "bingo", prizeLines } : { type: "reverse" },
  };
  const parsed = RoomSettings.safeParse({
    name,
    rule,
    prizes: prizes.trim() === "" ? null : Number(prizes),
  });
  // 項目ごとの誤り（入力の途中では出さず、「募集開始」を押してから出す）
  const errorOf = (field: "name" | "prizes") =>
    submitted && !parsed.success
      ? parsed.error.issues.find((i) => i.path[0] === field)?.message
      : undefined;

  async function submit() {
    setSubmitted(true);
    if (!parsed.success) return;
    setSending(true);
    setServerError(null);
    const result = await createRoom(parsed.data);
    setSending(false);
    switch (result.kind) {
      case "ok":
        if (!result.value.ok) {
          setServerError(CREATE_ERROR_TEXT[result.value.error]);
          return;
        }
        await navigate({
          to: "/r/$roomId/host",
          params: { roomId: result.value.roomId },
        });
        return;
      case "notFound":
      case "outdated":
        setServerError("画面が古くなっています。再読み込みしてください。");
        return;
      case "network":
        setServerError("通信できませんでした。もう一度押してください。");
        return;
    }
  }

  const nameError = errorOf("name");
  const prizesError = errorOf("prizes");

  return (
    <main className={ui.page}>
      <h1 className={ui.title}>ゲーム設定（{BASIC_RULES[mode].label}）</h1>
      <form
        className={ui.card}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className={ui.field}>
          <span className={ui.label}>ルーム名</span>
          <input
            className={ui.input}
            value={name}
            placeholder="例）会社ビンゴ大会"
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
          <span className={ui.muted}>
            参加する人の画面に出ます（{ROOM_NAME_MAX} 文字まで）
          </span>
          {nameError !== undefined && <p className={ui.error}>{nameError}</p>}
        </label>

        {winType === "bingo" && (
          <label className={ui.field}>
            <span className={ui.label}>景品獲得ライン</span>
            <select
              className={`${ui.input} ${styles.short}`}
              value={prizeLines}
              onChange={(e) => {
                const value = PRIZE_LINES.find(
                  (n) => String(n) === e.target.value,
                );
                if (value !== undefined) setPrizeLines(value);
              }}
            >
              {PRIZE_LINES.map((n) => (
                <option key={n} value={n}>
                  ビンゴ {n} 本
                </option>
              ))}
            </select>
            <span className={ui.muted}>
              この本数そろった人が景品をもらえます
            </span>
          </label>
        )}

        <label className={ui.field}>
          <span className={ui.label}>
            景品の数{winType === "bingo" ? "（任意）" : ""}
          </span>
          <input
            className={`${ui.input} ${styles.short}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={prizes}
            onChange={(e) => {
              setPrizes(e.target.value);
            }}
          />
          <span className={ui.muted}>
            {winType === "bingo"
              ? "入れると、最後の景品が決まったときに終了の確認を出します"
              : "残りの人数がこの数以下になったら終わります（参加人数より少なくしてください）"}
          </span>
          {prizesError !== undefined && (
            <p className={ui.error}>{prizesError}</p>
          )}
        </label>

        <details className={styles.details}>
          <summary>詳細設定</summary>
          <fieldset className={styles.choices}>
            <legend className={ui.label}>カードの大きさ</legend>
            {(["5x5", "3x3"] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="layout"
                  checked={layout === value}
                  onChange={() => {
                    setLayout(value);
                  }}
                />{" "}
                {LAYOUT_LABEL[value]}
              </label>
            ))}
          </fieldset>
          <fieldset className={styles.choices}>
            <legend className={ui.label}>勝ち方</legend>
            {(
              [
                ["bingo", "通常"],
                ["reverse", "逆ビンゴ"],
              ] as const
            ).map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="win"
                  checked={winType === value}
                  onChange={() => {
                    setWinType(value);
                  }}
                />{" "}
                {label}
              </label>
            ))}
          </fieldset>
        </details>

        <p className={styles.summary}>ルール: {ruleSummary(rule)}</p>

        {serverError !== null && <p className={ui.error}>{serverError}</p>}
        <div>
          <button type="submit" className={ui.button} disabled={sending}>
            募集開始
          </button>
        </div>
      </form>
    </main>
  );
}
