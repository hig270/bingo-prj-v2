import type { PlayerId, Results } from "@bingo/protocol";
import ui from "../ui/ui.module.scss";
import styles from "./ResultsView.module.scss";

/**
 * 結果（ホストとプレイヤーで同じ内容）。景品を取った人を抽選回の順に（同じ回は同順位）、
 * その下に取れなかった人を参加した順に、順位の数字なしで並べる。me を渡すと、その人の行を目立たせる
 */
export function ResultsView({
  results,
  me,
}: {
  readonly results: Results;
  readonly me?: PlayerId;
}) {
  const winners = results.filter((r) => r.prize !== null);
  const others = results.filter((r) => r.prize === null);
  const rowClass = (id: PlayerId) =>
    id === me ? `${styles.row} ${styles.me}` : styles.row;

  return (
    <section className={ui.card}>
      <h2 className={ui.subtitle}>結果</h2>
      {winners.length === 0 ? (
        <p className={ui.muted}>景品を獲得した人はいません</p>
      ) : (
        <ol className={styles.list}>
          {winners.map((r) => (
            <li key={r.id} className={rowClass(r.id)}>
              <span className={styles.rank}>{r.prize?.rank}位</span>
              <span>{r.name}</span>
              <span className={styles.round}>
                {r.prize?.round}回目の抽選で景品獲得
              </span>
            </li>
          ))}
        </ol>
      )}
      {others.length > 0 && (
        <>
          <h3 className={`${ui.label} ${styles.heading}`}>景品なし</h3>
          <ul className={styles.list}>
            {others.map((r) => (
              <li key={r.id} className={rowClass(r.id)}>
                <span />
                <span>{r.name}</span>
                <span />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
