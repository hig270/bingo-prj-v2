import {
  LAYOUTS,
  chanceOfHit,
  chanceWithin,
  expectedDraws,
  expectedKey,
  progressOf,
} from "@bingo/game";
import type { PlayerGame, PlayerView } from "../../state/room";
import { formatChance, formatExpected, formatStanding } from "../format";
import styles from "./player.module.scss";

type Playing = Extract<PlayerGame, { status: "playing" }>;

/** C・H の「○回以内」の回数 */
const SOON_DRAWS = 5;

/**
 * 自分の情報（screens.md「9. ゲーム画面」の A〜I）。
 * D（順位）以外は、開けたマスからスマホで計算する（サーバーと同じ関数。decisions.md 手順4）。
 * D はサーバーが決めて送る。
 * 上の段に A・D・E、その下に I・B・C・F・G・H を並べる。G・H・I は景品獲得ラインが2本以上のときだけ出す
 * （1本なら G は B、H は C、I は A と同じ値になる）
 */
export function PlayerStats({
  view,
  game,
}: {
  readonly view: PlayerView;
  readonly game: Playing;
}) {
  const { layout, win } = view.room.rule;
  // 逆ビンゴは始められないので、ここには来ない（手順5で作る）
  if (win.type !== "bingo") return null;
  const { opened } = game;
  // 残りの番号の数は、公開された番号だけを除いて数える（サーバーと同じ）
  const remaining = LAYOUTS[layout].maxNumber - game.draws.length;
  const won = game.prizeRound !== null;
  const lines = progressOf(layout, opened).lines;
  // 次のビンゴ（新しいライン1本）は、今そろっている本数 + 1 本
  const nextLine = lines + 1;
  const showPrizeDetails = win.prizeLines >= 2;

  /** 期待抽選回数。そろっていれば（null）「—」 */
  const expected = (targetLines: number): string => {
    const key = expectedKey(layout, targetLines, opened);
    return key === null
      ? "—"
      : `${formatExpected(expectedDraws(key, remaining))} 回`;
  };
  /** 確率。そろっていれば（null）「—」 */
  const chance = (targetLines: number, draws: number): string => {
    const value = chanceWithin(layout, targetLines, opened, remaining, draws);
    return value === null ? "—" : formatChance(value);
  };

  // 景品を取ったあとは、景品獲得ラインまでの値（A・G・H）を「—」にする（screens.md）
  const items: { readonly label: string; readonly value: string }[] = [
    { label: "景品まであと平均", value: won ? "—" : expected(win.prizeLines) },
    { label: "順位", value: formatStanding(game.standing) },
    { label: "ビンゴ", value: `${String(lines)} / ${String(win.prizeLines)}` },
    ...(showPrizeDetails
      ? [{ label: "ビンゴまであと平均", value: expected(nextLine) }]
      : []),
    { label: "次でビンゴ", value: chance(nextLine, 1) },
    {
      label: `${String(SOON_DRAWS)}回以内にビンゴ`,
      value: chance(nextLine, SOON_DRAWS),
    },
    {
      label: "次の番号が当たる",
      value: formatChance(chanceOfHit(layout, opened, remaining)),
    },
    ...(showPrizeDetails
      ? [
          {
            label: "次で景品",
            value: won ? "—" : chance(win.prizeLines, 1),
          },
          {
            label: `${String(SOON_DRAWS)}回以内に景品`,
            value: won ? "—" : chance(win.prizeLines, SOON_DRAWS),
          },
        ]
      : []),
  ];

  return (
    <dl className={styles.stats}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
