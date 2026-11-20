import {
  type BingoNumber,
  type Card,
  type CardLayout,
  type CellMask,
  type ExpectedKey,
  LAYOUTS,
  chanceWithin,
  countOpen,
  expectedDraws,
  progressOf,
} from "@bingo/game";
import {
  type DrawRound,
  type HostRanking,
  MAX_SHOWN_CARDS,
  type PickedCards,
  type PlayerId,
  type PlayerStanding,
  RANKING_ROWS,
  type Rank,
  type Results,
} from "@bingo/protocol";
import type { PlayerRecord } from "./records";

// 順位の付け方（ゲーム中のランキングと、終了後の結果）。ルームの処理から切り離して、そのまま試せるようにする。
// decisions.md「順位の扱い」と、手順4の決定（期待抽選回数・放置・最下位のカード）に従う

/**
 * 放置とみなす、自分の番号の数。最後にマスを開けてから、自分のカードにある番号がこの数だけ公開されたのに、
 * 次の抽選（またはゲーム終了）が押されるまでに1つも開けなければ放置とみなす（decisions.md 手順4「放置の条件」）
 */
export const IDLE_HITS = 2;

type Player = Pick<
  PlayerRecord,
  | "id"
  | "name"
  | "card"
  | "opened"
  | "prizeRound"
  | "lastOpenDraws"
  | "joinedAt"
>;

/**
 * 放置しているか。draws は公開済みの番号（公開した順）、judgedDraws は判定の区切り
 * （ホストが最後に抽選ボタンかゲーム終了を押した時点で公開済みだった番号の数）
 */
export function isIdle(
  card: Card,
  draws: readonly BingoNumber[],
  lastOpenDraws: number,
  judgedDraws: number,
): boolean {
  const onCard = new Set<number | null>(card.cells);
  let hits = 0;
  for (const n of draws.slice(lastOpenDraws, judgedDraws)) {
    if (onCard.has(n)) hits += 1;
  }
  return hits >= IDLE_HITS;
}

interface Winner {
  readonly player: Player;
  readonly round: DrawRound;
  readonly rank: Rank;
}

interface Contender {
  readonly player: Player;
  readonly key: ExpectedKey;
  /** 順位を争っている人の中での順位（自分より期待抽選回数が小さい人の数 + 1） */
  readonly rank: Rank;
}

/** 景品を取った人・順位を争っている人・放置している人に分けて、それぞれ並べたもの */
export interface Standings {
  /** 達した抽選回の早い順（同じ回は同順位で、参加した順） */
  readonly winners: readonly Winner[];
  /** 期待抽選回数の小さい順（同じ値は同順位で、参加した順） */
  readonly contenders: readonly Contender[];
  /** 参加した順 */
  readonly idle: readonly Player[];
}

/**
 * 順位を付ける（外された人は渡さない）。
 * keyOf は開けたマスから期待抽選回数を比べる整数を返す関数（同じ形のマスが多いので、呼ぶ側で覚えておけるよう外から渡す）
 */
export function standingsOf(
  players: readonly Player[],
  draws: readonly BingoNumber[],
  judgedDraws: number,
  keyOf: (opened: CellMask) => ExpectedKey | null,
): Standings {
  const byJoin = [...players].sort((a, b) => a.joinedAt - b.joinedAt);
  const won: { player: Player; round: DrawRound }[] = [];
  const contending: { player: Player; key: ExpectedKey }[] = [];
  const idle: Player[] = [];
  for (const player of byJoin) {
    if (player.prizeRound !== null) {
      won.push({ player, round: player.prizeRound });
      continue;
    }
    if (isIdle(player.card, draws, player.lastOpenDraws, judgedDraws)) {
      idle.push(player);
      continue;
    }
    const key = keyOf(player.opened);
    // 景品獲得ラインに達するマスを開けると必ず prizeRound が付くので、景品を取っていない人は null にならない。
    // なったら記録が食い違っているので、原因から離れた所で落ちないよう、ここで止める
    if (key === null) {
      throw new Error("景品を取っていないのに、景品獲得ラインに達している");
    }
    contending.push({ player, key });
  }
  // sort は安定なので、同じ値の中は参加した順のまま残る
  won.sort((a, b) => a.round - b.round);
  contending.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return {
    winners: withRanks(won, (a, b) => a.round === b.round),
    contenders: withRanks(contending, (a, b) => a.key === b.key),
    idle,
  };
}

/** 並んだ順に順位を付ける（直前の人と同じ値なら同順位、違えば「自分より前の人数 + 1」） */
function withRanks<T>(
  sorted: readonly T[],
  same: (a: T, b: T) => boolean,
): (T & { rank: Rank })[] {
  const ranked: (T & { rank: Rank })[] = [];
  sorted.forEach((item, i) => {
    const prev = ranked[i - 1];
    ranked.push({
      ...item,
      rank: prev !== undefined && same(prev, item) ? prev.rank : i + 1,
    });
  });
  return ranked;
}

/**
 * ホスト画面のランキング（上位 RANKING_ROWS 人と、上位・下位のカード）。
 * prizeLines は景品獲得ラインの本数、remaining は残りの番号の数
 */
export function hostRanking(
  standings: Standings,
  layout: CardLayout,
  prizeLines: number,
  remaining: number,
): HostRanking {
  const free = LAYOUTS[layout].free === null ? 0 : 1;
  const rows = standings.contenders.slice(0, RANKING_ROWS).map((c) => {
    const progress = progressOf(layout, c.player.opened);
    return {
      id: c.player.id,
      name: c.player.name,
      rank: c.rank,
      expected: expectedDraws(c.key, remaining),
      lines: progress.lines,
      reach: progress.reach,
      // FREE は全員が最初から開いているので数えない（decisions.md 手順4）
      opened: countOpen(c.player.opened) - free,
      // 順位を争っている人はまだ景品獲得ラインに達していないので null にならない（standingsOf と同じ理由で止める）
      nextPrize: chanceOrThrow(layout, prizeLines, c.player.opened, remaining),
    };
  });
  const lastRank = rows.at(-1)?.rank;
  return {
    rows,
    moreTied: standings.contenders
      .slice(RANKING_ROWS)
      .filter((c) => c.rank === lastRank).length,
    contenders: standings.contenders.length,
    ...pickCards(standings.contenders),
  };
}

function chanceOrThrow(
  layout: CardLayout,
  prizeLines: number,
  opened: CellMask,
  remaining: number,
): number {
  const chance = chanceWithin(layout, prizeLines, opened, remaining, 1);
  if (chance === null) {
    throw new Error("景品を取っていないのに、景品獲得ラインに達している");
  }
  return chance;
}

/**
 * 上位・下位のカードの枚数（順位を争っている人数で決める。decisions.md 手順4「ホスト画面の上位・下位のカード」）。
 * 6人以上なら 3・3、5人 2・3、4人 2・2、3人 1・2、2人 1・1、1人 1・0、0人 0・0
 */
export function pickedCounts(contenders: number): {
  readonly top: number;
  readonly bottom: number;
} {
  if (contenders === 0) return { top: 0, bottom: 0 };
  const top = Math.max(
    1,
    Math.min(MAX_SHOWN_CARDS, Math.floor(contenders / 2)),
  );
  return { top, bottom: Math.min(MAX_SHOWN_CARDS, contenders - top) };
}

/**
 * 上位・下位のカードに出す人を選ぶ（contenders はランキング表と同じ並び）。
 * 上位は並びの先頭から選ぶ。下位は、上位のカードの誰よりも順位が下の人だけから、順位の低い人たちの組から選ぶ。
 * どちらも、同順位の組の途中で枚数が尽きたら、その組の中は参加した順に選び、残りの人数を moreTied にする
 */
function pickCards(contenders: Standings["contenders"]): {
  readonly top: PickedCards;
  readonly bottom: PickedCards;
} {
  const counts = pickedCounts(contenders.length);
  const top = contenders.slice(0, counts.top);
  const topLast = top.at(-1)?.rank;
  const topMore = contenders
    .slice(counts.top)
    .filter((c) => c.rank === topLast).length;

  // 下位: 順位の低い組から順に、組の中は参加した順のまま取る
  const below = contenders.filter(
    (c) => topLast !== undefined && c.rank > topLast,
  );
  const groups: (typeof below)[] = [];
  for (const c of below) {
    const group = groups.at(-1);
    if (group?.[0]?.rank === c.rank) group.push(c);
    else groups.push([c]);
  }
  const bottom: typeof below = [];
  let bottomMore = 0;
  for (const group of groups.reverse()) {
    const room = counts.bottom - bottom.length;
    if (room <= 0) break;
    const taken = group.slice(0, room);
    // 画面ではランキング表と同じ並び（順位の高い順）に並べるので、前に足していく
    bottom.unshift(...taken);
    bottomMore = group.length - taken.length;
  }

  return {
    top: { cards: top.map(shownCard), moreTied: topMore },
    bottom: { cards: bottom.map(shownCard), moreTied: bottomMore },
  };
}

function shownCard(c: Contender) {
  return {
    id: c.player.id,
    name: c.player.name,
    card: c.player.card,
    opened: c.player.opened,
    rank: c.rank,
  };
}

/** プレイヤーごとの順位（D） */
export function playerStandings(
  standings: Standings,
): Map<PlayerId, PlayerStanding> {
  const result = new Map<PlayerId, PlayerStanding>();
  for (const w of standings.winners) {
    result.set(w.player.id, { status: "won", rank: w.rank });
  }
  const of = standings.contenders.length;
  for (const c of standings.contenders) {
    result.set(c.player.id, { status: "contending", rank: c.rank, of });
  }
  for (const p of standings.idle) result.set(p.id, { status: "idle" });
  return result;
}

/**
 * 結果。景品を取った人 → 取れなかった人（順位は景品を取った人の続きから）→ 放置していた人（順位なし）の順。
 * 最下位のカードは、景品を取れなかった人のうち最も期待抽選回数が大きい人たち（同順位なら参加した順に3枚まで）
 */
export function rankResults(standings: Standings): Results {
  const offset = standings.winners.length;
  const contenders = standings.contenders;
  const lastRank = contenders.at(-1)?.rank;
  const lowest = contenders.filter((c) => c.rank === lastRank);
  return {
    entries: [
      ...standings.winners.map((w) => ({
        id: w.player.id,
        name: w.player.name,
        standing: { type: "prize" as const, round: w.round, rank: w.rank },
      })),
      ...contenders.map((c) => ({
        id: c.player.id,
        name: c.player.name,
        standing: { type: "ranked" as const, rank: offset + c.rank },
      })),
      ...standings.idle.map((p) => ({
        id: p.id,
        name: p.name,
        standing: { type: "idle" as const },
      })),
    ],
    lowest:
      lowest.length === 0
        ? null
        : {
            cards: lowest.slice(0, MAX_SHOWN_CARDS).map((c) => ({
              id: c.player.id,
              name: c.player.name,
              card: c.player.card,
              opened: c.player.opened,
            })),
            more: Math.max(0, lowest.length - MAX_SHOWN_CARDS),
          },
  };
}
