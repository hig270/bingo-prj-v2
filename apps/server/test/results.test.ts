import { DrawRound, PlayerId, PlayerName } from "@bingo/protocol";
import { describe, expect, it } from "vitest";
import { rankResults } from "../src/results";

function player(name: string, joinedAt: number, prizeRound: number | null) {
  return {
    id: PlayerId.parse(`id-${name.padEnd(8, "x")}`),
    name: PlayerName.parse(name),
    joinedAt,
    prizeRound: prizeRound === null ? null : DrawRound.parse(prizeRound),
  };
}

describe("rankResults", () => {
  it("景品を取った人を抽選回の順に並べ、同じ回は同順位、その下に取れなかった人を参加した順に並べる", () => {
    const results = rankResults([
      player("e", 5, null),
      player("d", 4, 12),
      player("c", 3, 10),
      player("b", 2, null),
      player("a", 1, 10),
    ]);
    expect(
      results.map((r) => [
        r.name,
        r.prize?.round ?? null,
        r.prize?.rank ?? null,
      ]),
    ).toEqual([
      ["a", 10, 1],
      ["c", 10, 1],
      ["d", 12, 3],
      ["b", null, null],
      ["e", null, null],
    ]);
  });

  it("誰もいなければ空", () => {
    expect(rankResults([])).toEqual([]);
  });
});
