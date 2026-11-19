import { LAYOUTS, expectedDraws, expectedKey, progressOf } from "@bingo/game";
import type { PlayerGame, PlayerView } from "../../state/room";
import { formatExpected, formatStanding } from "../format";
import styles from "./player.module.scss";

type Playing = Extract<PlayerGame, { status: "playing" }>;

/**
 * 自分の情報（screens.md「9. ゲーム画面」の A・D・E）。
 * A（期待抽選回数）は開けたマスからスマホで計算する（サーバーと同じ関数。decisions.md 手順4）。
 * D（順位）はサーバーが決めて送る
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
  const key = expectedKey(layout, win.prizeLines, game.opened);
  // 残りの番号の数は、公開された番号だけを除いて数える（サーバーと同じ）
  const remaining = LAYOUTS[layout].maxNumber - game.draws.length;
  const expected =
    key === null || game.prizeRound !== null
      ? "—"
      : `${formatExpected(expectedDraws(key, remaining))} 回`;
  const lines = progressOf(layout, game.opened).lines;

  return (
    <dl className={styles.stats}>
      <div>
        <dt>景品まであと平均</dt>
        <dd>{expected}</dd>
      </div>
      <div>
        <dt>順位</dt>
        <dd>{formatStanding(game.standing)}</dd>
      </div>
      <div>
        <dt>ビンゴ</dt>
        <dd>
          {lines} / {win.prizeLines}
        </dd>
      </div>
    </dl>
  );
}
