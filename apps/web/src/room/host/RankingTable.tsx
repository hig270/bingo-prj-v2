import type { HostRanking } from "@bingo/protocol";
import ui from "../../ui/ui.module.scss";
import { formatChanceDetailed, formatExpected } from "../format";
import styles from "./host.module.scss";

/**
 * ホスト画面のランキング表（順位を争っている人の上位10人。screens.md「5. ゲーム画面」）。
 * 景品を取った人と放置している人は載せない
 */
export function RankingTable({ ranking }: { readonly ranking: HostRanking }) {
  return (
    <section className={ui.card}>
      <h2 className={ui.subtitle}>
        ランキング（{ranking.contenders} 人が順位を争っています）
      </h2>
      {ranking.rows.length === 0 ? (
        <p className={ui.muted}>順位を争っている人はいません</p>
      ) : (
        <table className={styles.ranking}>
          <thead>
            <tr>
              <th className={styles.num}>順位</th>
              <th>名前</th>
              <th className={styles.num}>景品まであと平均</th>
              <th className={styles.num}>ビンゴ</th>
              <th className={styles.num}>リーチ</th>
              <th className={styles.num}>開けた数</th>
              <th className={styles.num}>次で景品</th>
            </tr>
          </thead>
          <tbody>
            {ranking.rows.map((row) => (
              <tr key={row.id}>
                <td className={styles.num}>{row.rank}位</td>
                <td className={styles.rankingName}>{row.name}</td>
                <td className={styles.num}>
                  {formatExpected(row.expected)} 回
                </td>
                <td className={styles.num}>{row.lines}</td>
                <td className={styles.num}>{row.reach}</td>
                <td className={styles.num}>{row.opened}</td>
                <td className={styles.num}>
                  {formatChanceDetailed(row.nextPrize)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ranking.moreTied > 0 && (
        <p className={ui.muted}>ほか {ranking.moreTied} 人が同順位</p>
      )}
    </section>
  );
}
