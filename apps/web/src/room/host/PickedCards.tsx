import type { HostRanking, PickedCards } from "@bingo/protocol";
import ui from "../../ui/ui.module.scss";
import { BingoCard } from "../player/BingoCard";
import styles from "./host.module.scss";

/**
 * ホスト画面の上位・下位のカード（screens.md「5. ゲーム画面」。ランキング表の下に置く）。
 * 誰を出すかはサーバーが決める（decisions.md 手順4「ホスト画面の上位・下位のカード」）。
 * 出す人がいない組は見出しごと出さない（開始直後のように全員が同順位なら、下位は出ない）。
 * 「ほか ○ 人が ○位で同順位」には、カードを出さなかった人の順位を添える（2026-11-20 に決定）。
 * 上位は並びの最後のカード、下位は並びの最初のカード（順位の低い組から選ぶため）と同じ順位になる
 */
export function PickedCardsView({
  ranking,
}: {
  readonly ranking: HostRanking;
}) {
  if (ranking.top.cards.length === 0 && ranking.bottom.cards.length === 0) {
    return null;
  }
  return (
    <section className={ui.card}>
      <Group
        title="上位"
        picked={ranking.top}
        tiedRank={ranking.top.cards.at(-1)?.rank}
      />
      <Group
        title="下位"
        picked={ranking.bottom}
        tiedRank={ranking.bottom.cards[0]?.rank}
      />
    </section>
  );
}

function Group({
  title,
  picked,
  tiedRank,
}: {
  readonly title: string;
  readonly picked: PickedCards;
  /** カードを出さなかった同順位の人の順位 */
  readonly tiedRank: number | undefined;
}) {
  if (picked.cards.length === 0) return null;
  return (
    <>
      <h2 className={ui.subtitle}>{title}</h2>
      <div className={styles.pickedCards}>
        {picked.cards.map((c) => (
          <figure key={c.id} className={styles.pickedCard}>
            <BingoCard
              card={c.card}
              opened={c.opened}
              compact
              label={`${c.name} のビンゴカード`}
            />
            <figcaption className={styles.pickedCaption}>
              <span className={styles.pickedName}>{c.name}</span>
              <span>{c.rank}位</span>
            </figcaption>
          </figure>
        ))}
      </div>
      {picked.moreTied > 0 && tiedRank !== undefined && (
        <p className={ui.muted}>
          ほか {picked.moreTied} 人が {tiedRank}位で同順位
        </p>
      )}
    </>
  );
}
