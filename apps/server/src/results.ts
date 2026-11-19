import type { Results } from "@bingo/protocol";
import type { PlayerRecord } from "./records";

/**
 * 結果の並びを作る（外された人は渡さない）。
 * 景品を取った人は、達した抽選回の早い順に並べ、同じ回の人は同順位にする（順位決定ゲームは手順5で作る）。
 * 同順位の中と、景品を取れなかった人は、参加した順に並べる（decisions.md「3（遊べる最小限）の範囲」）
 */
export function rankResults(
  players: readonly Pick<
    PlayerRecord,
    "id" | "name" | "prizeRound" | "joinedAt"
  >[],
): Results {
  const byJoin = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
  const winners = byJoin.flatMap((p) =>
    p.prizeRound === null ? [] : [{ ...p, round: p.prizeRound }],
  );
  // sort は安定なので、同じ回の中は参加した順のまま残る
  winners.sort((a, b) => a.round - b.round);
  // 順位は「自分より早い回に達した人の数 + 1」（同じ回の人は同順位）。
  // 抽選回の順に並んでいるので、回が変わったところの位置を覚えながら1回なめて付ける
  let rank = 0;
  let round: number | null = null;
  const ranked = winners.map((p, i) => {
    if (p.round !== round) {
      round = p.round;
      rank = i + 1;
    }
    return { id: p.id, name: p.name, prize: { round: p.round, rank } };
  });
  return [
    ...ranked,
    ...byJoin
      .filter((p) => p.prizeRound === null)
      .map((p) => ({ id: p.id, name: p.name, prize: null })),
  ];
}
