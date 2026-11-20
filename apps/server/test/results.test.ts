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
  pickedCounts,
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
    const ranking = hostRanking(
      standingsOf(players, [], 0, keyOf),
      "3x3",
      1,
      45,
    );
    expect(ranking.rows).toHaveLength(10);
    expect(ranking.moreTied).toBe(2);
    expect(ranking.contenders).toBe(12);
  });

  it("行には期待抽選回数・ビンゴ数・リーチ数・開けたマスの数・次の抽選で景品獲得ラインに達する確率を入れる", () => {
    const ranking = hostRanking(
      standingsOf(
        [player("a", 1, { opened: maskOf([0, 1]) })],
        nums(1, 16),
        0,
        keyOf,
      ),
      "3x3",
      1,
      43,
    );
    expect(ranking.rows[0]).toMatchObject({
      name: "a",
      rank: 1,
      lines: 0,
      reach: 1,
      opened: 2,
      // リーチは 1 行目の右のマスだけなので、43 個のうち 1 個
      nextPrize: 1 / 43,
    });
    expect(ranking.rows[0]?.expected).toBeGreaterThan(0);
  });

  it("次の抽選で景品獲得ラインに達する確率は、景品獲得ラインの本数で計算する", () => {
    // 1 行目がそろい、2 行目がリーチ。景品獲得ラインが 2 本なら、2 行目の右のマスで達する
    const opened = maskOf([0, 1, 2, 3, 4]);
    const ranking = hostRanking(
      standingsOf(
        [player("a", 1, { opened })],
        nums(1, 16, 31, 2, 17),
        0,
        (o) => expectedKey("3x3", 2, o),
      ),
      "3x3",
      2,
      40,
    );
    // 2 行目の右（マス 5）、左の列の下（6）、中央の列の下（7）、右下（8。斜め）の 4 マスのどれかで 2 本目がそろう
    expect(ranking.rows[0]?.nextPrize).toBe(4 / 40);
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

describe("上位・下位のカード", () => {
  // 9マスで景品獲得ライン 1 本のときの、期待抽選回数の小さい（順位が上の）順
  const BEST = maskOf([0, 1, 3, 4]);
  const SECOND = maskOf([0, 1, 3]);
  const THIRD = maskOf([0, 4]);
  const FOURTH = maskOf([0, 1]);
  const FIFTH = maskOf([4]);

  /** 全員が放置していない状態で、上位・下位のカードの名前と順位を取り出す */
  function picks(players: ReturnType<typeof player>[]) {
    const ranking = hostRanking(
      standingsOf(players, nums(1, 2), 2, keyOf),
      "3x3",
      1,
      43,
    );
    const names = (cards: typeof ranking.top.cards) =>
      cards.map((c) => `${c.name}:${String(c.rank)}`);
    return {
      top: names(ranking.top.cards),
      topMore: ranking.top.moreTied,
      bottom: names(ranking.bottom.cards),
      bottomMore: ranking.bottom.moreTied,
    };
  }
  const active = (name: string, joinedAt: number, opened = EMPTY_MASK) =>
    player(name, joinedAt, { opened, lastOpenDraws: 2 });

  it("枚数は、順位を争っている人数で決まる", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(pickedCounts)).toEqual([
      { top: 0, bottom: 0 },
      { top: 1, bottom: 0 },
      { top: 1, bottom: 1 },
      { top: 1, bottom: 2 },
      { top: 2, bottom: 2 },
      { top: 2, bottom: 3 },
      { top: 3, bottom: 3 },
      { top: 3, bottom: 3 },
    ]);
  });

  it("全員が同順位なら、上位だけを参加した順に出し、下位は出さない", () => {
    const players = ["a", "b", "c", "d", "e", "f", "g"].map((n, i) =>
      active(n, i),
    );
    expect(picks(players)).toEqual({
      top: ["a:1", "b:1", "c:1"],
      topMore: 4,
      bottom: [],
      bottomMore: 0,
    });
  });

  it("下位には、上位のカードの誰よりも順位が下の人だけを出す", () => {
    const players = [
      active("a", 1, SECOND),
      active("b", 2, SECOND),
      active("c", 3, FIFTH),
      active("d", 4, FIFTH),
      active("e", 5, FIFTH),
      active("f", 6, FIFTH),
      active("g", 7),
      active("h", 8),
    ];
    // 上位の境目（3 位）と同順位の d・e・f は、下位にも出ない
    expect(picks(players)).toEqual({
      top: ["a:1", "b:1", "c:3"],
      topMore: 3,
      bottom: ["g:7", "h:7"],
      bottomMore: 0,
    });
  });

  it("下位は順位の低い組から選び、境目の組の中は参加した順に選ぶ。放置している人は出さない", () => {
    const players = [
      active("a", 1, BEST),
      active("b", 2, SECOND),
      active("c", 3, THIRD),
      active("d", 4, FOURTH),
      active("e", 5, FIFTH),
      active("f", 6, FIFTH),
      active("g", 7),
      active("h", 8),
      // 開けないまま、自分の番号が 2 個出た（一番下の形だが、放置しているので出さない）
      player("z", 9),
    ];
    expect(picks(players)).toEqual({
      top: ["a:1", "b:2", "c:3"],
      topMore: 0,
      bottom: ["e:5", "g:7", "h:7"],
      bottomMore: 1,
    });
  });

  it("一番下の組だけで下位の枚数を超えるときは、参加した順に3人を選ぶ", () => {
    const players = [
      active("a", 1, BEST),
      active("b", 2, SECOND),
      active("c", 3, THIRD),
      active("d", 4),
      active("e", 5),
      active("f", 6),
      active("g", 7),
    ];
    expect(picks(players)).toEqual({
      top: ["a:1", "b:2", "c:3"],
      topMore: 0,
      bottom: ["d:4", "e:4", "f:4"],
      bottomMore: 1,
    });
  });

  it("少人数では枚数を減らし、上位と下位に同じ人は出ない", () => {
    expect(picks([active("a", 1, BEST)])).toEqual({
      top: ["a:1"],
      topMore: 0,
      bottom: [],
      bottomMore: 0,
    });
    expect(picks([active("a", 1, BEST), active("b", 2)])).toEqual({
      top: ["a:1"],
      topMore: 0,
      bottom: ["b:2"],
      bottomMore: 0,
    });
    expect(
      picks([active("a", 1, BEST), active("b", 2, SECOND), active("c", 3)]),
    ).toEqual({
      top: ["a:1"],
      topMore: 0,
      bottom: ["b:2", "c:3"],
      bottomMore: 0,
    });
  });
});
