import type { PlayerId, ResultEntry, Results } from "@bingo/protocol";
import ui from "../ui/ui.module.scss";
import { BingoCard } from "./player/BingoCard";
import styles from "./ResultsView.module.scss";

/**
 * 結果（ホストとプレイヤーで同じ内容。screens.md「6. 結果画面」）。
 * 景品を取った人（抽選回の順、同じ回は同順位）→ 取れなかった人（期待抽選回数の順、順位は続きから）→
 * 終了時に放置していた人（順位なし）の順に並べ、最下位の人のカードを添える。me を渡すと、その人の行を目立たせる
 */
export function ResultsView({
  results,
  me,
}: {
  readonly results: Results;
  readonly me?: PlayerId;
}) {
  const winners = results.entries.filter((r) => r.standing.type === "prize");
  const others = results.entries.filter((r) => r.standing.type === "ranked");
  const idle = results.entries.filter((r) => r.standing.type === "idle");
  const rowClass = (id: PlayerId) =>
    id === me ? `${styles.row} ${styles.me}` : styles.row;
  const row = (r: ResultEntry) => (
    <li key={r.id} className={rowClass(r.id)}>
      <span className={styles.rank}>
        {r.standing.type === "idle" ? "" : `${String(r.standing.rank)}位`}
      </span>
      <span>{r.name}</span>
      <span className={styles.round}>
        {r.standing.type === "prize"
          ? `${String(r.standing.round)}回目の抽選で景品獲得`
          : ""}
      </span>
    </li>
  );

  return (
    <>
      <section className={ui.card}>
        <h2 className={ui.subtitle}>結果</h2>
        {winners.length === 0 ? (
          <p className={ui.muted}>景品を獲得した人はいません</p>
        ) : (
          <ol className={styles.list}>{winners.map(row)}</ol>
        )}
        {others.length > 0 && (
          <>
            <h3 className={`${ui.label} ${styles.heading}`}>景品なし</h3>
            <ol className={styles.list}>{others.map(row)}</ol>
          </>
        )}
        {idle.length > 0 && (
          <>
            <h3 className={`${ui.label} ${styles.heading}`}>
              途中から操作がなかった人
            </h3>
            <ul className={styles.list}>{idle.map(row)}</ul>
          </>
        )}
      </section>
      {results.lowest !== null && (
        <section className={ui.card}>
          <h2 className={ui.subtitle}>最下位の人のカード</h2>
          <div className={styles.cards}>
            {results.lowest.cards.map((c) => (
              <figure key={c.id} className={styles.figure}>
                <BingoCard
                  card={c.card}
                  opened={c.opened}
                  compact
                  label={`${c.name} のビンゴカード`}
                />
                <figcaption className={styles.cardName}>{c.name}</figcaption>
              </figure>
            ))}
          </div>
          {results.lowest.more > 0 && (
            <p className={ui.muted}>ほか {results.lowest.more} 人が同順位</p>
          )}
        </section>
      )}
    </>
  );
}
