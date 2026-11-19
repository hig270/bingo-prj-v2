import {
  BingoNumber,
  Card,
  type CellMask,
  EMPTY_MASK,
  expectedKey,
  maskOf,
} from "@bingo/game";
import { DrawRound, PlayerId, PlayerName } from "@bingo/protocol";
import { describe, expect, it } from "vitest";
import {
  hostRanking,
  isIdle,
  playerStandings,
  rankResults,
  standingsOf,
} from "../src/results";

// 9マスのカード（行ごとに 1・16・31 / 2・17・32 / 3・18・33）
const CARD = Card.parse({
  layout: "3x3",
  cells: [1, 16, 31, 2, 17, 32, 3, 18, 33],
});
const nums = (...ns: number[]) => ns.map((n) => BingoNumber.parse(n));

function player(
  name: string,
  joinedAt: number,
  options: {
    readonly opened?: CellMask;
    readonly prizeRound?: number;
    readonly lastOpenDraws?: number;
  } = {},
) {
  return {
    id: PlayerId.parse(`id-${name.padEnd(8, "x")}`),
    name: PlayerName.parse(name),
    card: CARD,
    opened: options.opened ?? EMPTY_MASK,
    prizeRound:
      options.prizeRound === undefined
        ? null
        : DrawRound.parse(options.prizeRound),
    lastOpenDraws: options.lastOpenDraws ?? 0,
    joinedAt,
  };
}

const keyOf = (opened: CellMask) => expectedKey("3x3", 1, opened);

describe("isIdle", () => {
  it("最後に開けてから、自分の番号が2個出たのに開けていなければ放置", () => {
    // 1 と 2 はカードにあり、40 は無い
    const draws = nums(40, 1, 2);
    expect(isIdle(CARD, draws, 0, 3)).toBe(true);
    // 2 個目が出てから、次の抽選がまだ押されていない（区切りが 2 個目より前）
    expect(isIdle(CARD, draws, 0, 2)).toBe(false);
  });

  it("どれかを開けたら数え直す（それより前に出た番号は数えない）", () => {
    const draws = nums(1, 2, 40, 3);
    // 2 個目まで出たあとで開けた（最後に開けた時点で 2 個公開済み）。その後に出た自分の番号は 3 の 1 個だけ
    expect(isIdle(CARD, draws, 2, 4)).toBe(false);
  });

  it("自分の番号が出ない間は、何も開けていなくても放置ではない", () => {
    expect(isIdle(CARD, nums(40, 41, 42, 43), 0, 4)).toBe(false);
  });
});

describe("standingsOf と rankResults", () => {
  it("景品を取った人 → 取れなかった人（期待抽選回数の順）→ 放置している人 の順に並べる", () => {
    const draws = nums(1, 2, 3, 16, 17);
    const players = [
      // 放置: 最後に開けてから、自分の番号が 5 個出ている
      player("e", 5),
      // 景品: 10 回目と 12 回目
      player("d", 4, { prizeRound: 12, lastOpenDraws: 5 }),
      player("c", 3, { prizeRound: 10, lastOpenDraws: 5 }),
      // 開けたマスの多い b が、a より上
      player("b", 2, { opened: maskOf([0, 1]), lastOpenDraws: 5 }),
      player("a", 1, { opened: maskOf([0]), lastOpenDraws: 5 }),
    ];
    const standings = standingsOf(players, draws, 5, keyOf);
    const results = rankResults(standings);
    expect(results.entries.map((r) => [r.name, r.standing])).toEqual([
      ["c", { type: "prize", round: 10, rank: 1 }],
      ["d", { type: "prize", round: 12, rank: 2 }],
      ["b", { type: "ranked", rank: 3 }],
      ["a", { type: "ranked", rank: 4 }],
      ["e", { type: "idle" }],
    ]);
    // 最下位のカードは、放置している人ではなく a
    expect(results.lowest?.cards.map((c) => c.name)).toEqual(["a"]);
    expect(results.lowest?.more).toBe(0);
  });

  it("景品を取った同じ抽選回の人は同順位で、次の人の順位は人数分あく", () => {
    const standings = standingsOf(
      [
        player("a", 1, { prizeRound: 10 }),
        player("b", 2, { prizeRound: 10 }),
        player("c", 3, { prizeRound: 11 }),
      ],
      [],
      0,
      keyOf,
    );
    expect(standings.winners.map((w) => w.rank)).toEqual([1, 1, 3]);
  });

  it("期待抽選回数が同じ人は同順位。最下位が同順位なら、参加した順に3枚までと「ほか ○ 人」", () => {
    // 5 人とも何も開けていない（同じ形）
    const players = ["a", "b", "c", "d", "e"].map((name, i) => player(name, i));
    const results = rankResults(standingsOf(players, [], 0, keyOf));
    expect(results.entries.map((r) => r.standing)).toEqual(
      Array(5).fill({ type: "ranked", rank: 1 }),
    );
    expect(results.lowest?.cards.map((c) => c.name)).toEqual(["a", "b", "c"]);
    expect(results.lowest?.more).toBe(2);
  });

  it("景品を取れなかった人がいなければ、最下位のカードは出さない", () => {
    const results = rankResults(
      standingsOf([player("a", 1, { prizeRound: 3 })], [], 0, keyOf),
    );
    expect(results.lowest).toBeNull();
  });

  it("誰もいなければ空", () => {
    expect(rankResults(standingsOf([], [], 0, keyOf))).toEqual({
      entries: [],
      lowest: null,
    });
  });
});

describe("hostRanking と playerStandings", () => {
  it("上位10人を載せ、最後の行と同順位で載らなかった人数を数える", () => {
    // 12 人とも同じ形なので全員 1 位
    const players = [...Array(12).keys()].map((i) =>
      player(`p${String(i).padStart(2, "0")}`, i),
    );
    const ranking = hostRanking(standingsOf(players, [], 0, keyOf), "3x3", 45);
    expect(ranking.rows).toHaveLength(10);
    expect(ranking.moreTied).toBe(2);
    expect(ranking.contenders).toBe(12);
  });

  it("行には期待抽選回数・ビンゴ数・リーチ数・開けたマスの数を入れる", () => {
    const ranking = hostRanking(
      standingsOf(
        [player("a", 1, { opened: maskOf([0, 1]) })],
        nums(1, 16),
        0,
        keyOf,
      ),
      "3x3",
      43,
    );
    expect(ranking.rows[0]).toMatchObject({
      name: "a",
      rank: 1,
      lines: 0,
      reach: 1,
      opened: 2,
    });
    expect(ranking.rows[0]?.expected).toBeGreaterThan(0);
  });

  it("順位の分母は順位を争っている人数で、景品を取った人と放置している人は数えない", () => {
    const players = [
      player("a", 1, { opened: maskOf([0]), lastOpenDraws: 2 }),
      player("b", 2, { lastOpenDraws: 2 }),
      player("c", 3, { prizeRound: 2, lastOpenDraws: 2 }),
      // 開けないまま、自分の番号が 2 個出た
      player("d", 4),
    ];
    const map = playerStandings(standingsOf(players, nums(1, 2), 2, keyOf));
    expect([...map.values()]).toEqual([
      { status: "won", rank: 1 },
      { status: "contending", rank: 1, of: 2 },
      { status: "contending", rank: 2, of: 2 },
      { status: "idle" },
    ]);
  });
});
