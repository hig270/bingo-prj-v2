import { GameRule } from "@bingo/game";
import {
  PlayerId,
  PlayerName,
  RoomName,
  type PlayerSummary,
  type RoomInfo,
} from "@bingo/protocol";
import { describe, expect, it } from "vitest";
import { initialRoomState, reduceRoom, type RoomState } from "./room";

const room: RoomInfo = {
  name: RoomName.parse("忘年会"),
  rule: GameRule.parse({
    layout: "5x5",
    win: { type: "bingo", prizeLines: 1 },
  }),
  prizes: null,
  status: "lobby",
};

function player(id: string, name: string): PlayerSummary {
  return { id: PlayerId.parse(id), name: PlayerName.parse(name) };
}

const taro = player("taro-0001", "たろう");
const hana = player("hana-0002", "はなこ");

function hostWith(players: PlayerSummary[]): RoomState {
  return reduceRoom(initialRoomState, {
    type: "hostSnapshot",
    room,
    players,
    maxPlayers: 1000,
  });
}

describe("reduceRoom", () => {
  it("ホストの全体の状態を受け取る", () => {
    expect(hostWith([taro])).toEqual({
      view: "host",
      room,
      players: [taro],
      maxPlayers: 1000,
    });
  });

  it("参加者が増えたら一覧の最後に足す。同じ人は2回足さない", () => {
    const once = reduceRoom(hostWith([taro]), {
      type: "playerJoined",
      player: hana,
    });
    const twice = reduceRoom(once, { type: "playerJoined", player: hana });
    expect(twice).toMatchObject({ players: [taro, hana] });
  });

  it("外された参加者を一覧から消す", () => {
    const next = reduceRoom(hostWith([taro, hana]), {
      type: "playerRemoved",
      playerId: taro.id,
    });
    expect(next).toMatchObject({ players: [hana] });
  });

  it("ホストの全体の状態が届く前の知らせは無視する", () => {
    const next = reduceRoom(initialRoomState, {
      type: "playerJoined",
      player: taro,
    });
    expect(next).toBe(initialRoomState);
  });

  it("プレイヤーの状態を受け取る", () => {
    const next = reduceRoom(initialRoomState, {
      type: "playerSnapshot",
      room,
      me: taro,
    });
    expect(next).toEqual({ view: "player", room, me: taro });
  });
});
