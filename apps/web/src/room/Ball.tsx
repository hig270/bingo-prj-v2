import type { BingoNumber } from "@bingo/game";
import { letterOf } from "../draw/letter";
import styles from "./Ball.module.scss";

/** 抽選番号の玉 */
export function Ball({
  number,
  large = false,
}: {
  readonly number: BingoNumber;
  readonly large?: boolean;
}) {
  return (
    <span
      className={`${styles.ball} ${large ? styles.large : ""}`}
      data-letter={letterOf(number)}
    >
      {number}
    </span>
  );
}

/** 抽選履歴（抽選した順に玉を並べる） */
export function DrawHistory({
  draws,
}: {
  readonly draws: readonly BingoNumber[];
}) {
  return (
    <ol className={styles.history} aria-label="抽選履歴">
      {draws.map((n) => (
        <li key={n}>
          <Ball number={n} />
        </li>
      ))}
    </ol>
  );
}
