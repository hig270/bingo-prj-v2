import {
  BingoNumber,
  Card,
  CellIndex,
  GameRule,
  initialMask,
  maskOf,
} from "@bingo/game";
import {
  PlayerId,
  PlayerName,
  PrizeCount,
  RoomName,
  type PlayerSummary,
  type RoomProfile,
  type ServerMessage,
} from "@bingo/protocol";
import { describe, expect, it } from "vitest";
import {
  initialRoomState,
  reduceRoom,
  tapCell,
  type PlayerView,
  type RoomAction,
  type RoomState,
} from "./room";

const room: RoomProfile = {
  name: RoomName.parse("忘年会"),
  rule: GameRule.parse({
    layout: "5x5",
    win: { type: "bingo", prizeLines: 1 },
  }),
  prizes: null,
};

function player(id: string, name: string): PlayerSummary {
  return { id: PlayerId.parse(id), name: PlayerName.parse(name) };
}

const taro = player("taro-0001", "たろう");
const hana = player("hana-0002", "はなこ");
const n = (value: number) => BingoNumber.parse(value);

/** 当てはめを順に行う */
function apply(state: RoomState, ...actions: RoomAction[]): RoomState {
  return actions.reduce(reduceRoom, state);
}

function hostWith(
  players: PlayerSummary[],
  phase: Extract<ServerMessage, { type: "hostSnapshot" }>["phase"] = {
    status: "lobby",
  },
  profile: RoomProfile = room,
): RoomState {
  return reduceRoom(initialRoomState, {
    type: "hostSnapshot",
    room: profile,
    players,
    maxPlayers: 1000,
    phase,
  });
}

/** 順位を争っている人がいないときのランキング */
const noCards = { cards: [], moreTied: 0 };
const noRanking = {
  rows: [],
  moreTied: 0,
  contenders: 0,
  top: noCards,
  bottom: noCards,
};

/** 9マスのカード（1 行目は 1・16・31、2 行目は 2・17・32、3 行目は 3・18・33） */
const card = Card.parse({
  layout: "3x3",
  cells: [1, 16, 31, 2, 17, 32, 3, 18, 33],
});
const speed: RoomProfile = {
  ...room,
  rule: GameRule.parse({
    layout: "3x3",
    win: { type: "bingo", prizeLines: 1 },
  }),
};

function playerPlaying(draws: number[], drawing = false): PlayerView {
  const state = reduceRoom(initialRoomState, {
    type: "playerSnapshot",
    room: speed,
    me: { ...taro, card },
    phase: {
      status: "playing",
      draws: draws.map(n),
      drawing,
      opened: initialMask("3x3"),
      prizeRound: null,
      standing: { status: "contending", rank: 1, of: 2 },
    },
  });
  if (state.view !== "player") throw new Error("プレイヤーの状態にならない");
  return state;
}

const cell = (i: number) => CellIndex.parse(i);

/** 開けたマスを差し替える */
function withOpened(view: PlayerView, cells: number[]): PlayerView {
  if (view.game.status !== "playing") throw new Error("ゲーム中ではない");
  return { ...view, game: { ...view.game, opened: maskOf(cells) } };
}

describe("reduceRoom（募集中）", () => {
  it("ホストの全体の状態を受け取る", () => {
    expect(hostWith([taro])).toEqual({
      view: "host",
      room,
      players: [taro],
      maxPlayers: 1000,
      game: { status: "lobby" },
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
    const me = { ...taro, card };
    const next = reduceRoom(initialRoomState, {
      type: "playerSnapshot",
      room,
      me,
      phase: { status: "lobby" },
    });
    expect(next).toEqual({
      view: "player",
      room,
      me,
      game: { status: "lobby" },
    });
  });
});

describe("reduceRoom（ホストのゲーム中）", () => {
  const playing = hostWith([taro, hana], {
    status: "playing",
    draws: [n(5)],
    prizeWinners: 0,
    ranking: noRanking,
  });

  it("抽選した番号は、発表した瞬間に履歴に足し、片付けが終わったら演出の番号を消す", () => {
    const started = reduceRoom(playing, { type: "drawStarted", number: n(9) });
    expect(started).toMatchObject({
      game: { draws: [n(5)], current: { number: n(9), revealed: false } },
    });
    const revealed = apply(started, { type: "local/revealed", number: n(9) });
    expect(revealed).toMatchObject({
      game: { draws: [n(5), n(9)], current: { revealed: true } },
    });
    // 発表の知らせが2回来ても、履歴は1回だけ
    expect(reduceRoom(revealed, { type: "local/revealed", number: n(9) })).toBe(
      revealed,
    );
    expect(
      apply(revealed, { type: "local/drawDone", number: n(9) }),
    ).toMatchObject({ game: { current: null } });
  });

  it("抽選ボタンを押してから番号が届くまでは、押した印を付けておく", () => {
    const requested = reduceRoom(playing, { type: "local/drawRequested" });
    expect(requested).toMatchObject({ game: { requesting: true } });
    expect(
      reduceRoom(requested, { type: "drawStarted", number: n(9) }),
    ).toMatchObject({ game: { requesting: false } });
  });

  it("全体の状態を受け取り直したら、押した印も演出中の番号も消える（つなぎ直したとき）", () => {
    const busy = apply(
      playing,
      { type: "local/drawRequested" },
      { type: "drawStarted", number: n(9) },
      { type: "local/drawRequested" },
    );
    const again = apply(busy, {
      type: "hostSnapshot",
      room,
      players: [taro, hana],
      maxPlayers: 1000,
      phase: {
        status: "playing",
        draws: [n(5), n(9)],
        prizeWinners: 0,
        ranking: noRanking,
      },
    });
    expect(again).toMatchObject({
      game: { requesting: false, current: null, draws: [n(5), n(9)] },
    });
  });

  it("発表する前に次の番号が届いたら、前の番号を履歴に足してから次の演出にする", () => {
    // サーバーは前の番号（9）を公開してから、次（12）を抽選している
    const next = apply(
      playing,
      { type: "drawStarted", number: n(9) },
      { type: "drawStarted", number: n(12) },
    );
    expect(next).toMatchObject({
      game: {
        draws: [n(5), n(9)],
        current: { number: n(12), revealed: false },
      },
    });
    // 前の番号の演出の知らせが遅れて来ても、今の演出には当てはめない
    const stale = apply(
      next,
      { type: "local/revealed", number: n(9) },
      { type: "local/drawDone", number: n(9) },
    );
    expect(stale).toBe(next);
  });

  it("知らせは届いた順に溜め、流し終えたものから消す", () => {
    const next = apply(
      playing,
      {
        type: "progress",
        playerId: taro.id,
        name: taro.name,
        event: { type: "reach" },
      },
      {
        type: "progress",
        playerId: hana.id,
        name: hana.name,
        event: { type: "bingo", newLines: 1, lines: 1, prize: true },
      },
    );
    expect(next).toMatchObject({
      game: {
        prizeWinners: 1,
        notices: [
          { id: 0, name: taro.name },
          { id: 1, name: hana.name },
        ],
      },
    });
    expect(apply(next, { type: "local/noticeShown", id: 0 })).toMatchObject({
      game: { notices: [{ id: 1 }] },
    });
  });

  it("景品の数に達した瞬間に、終了の確認を1回だけ出す", () => {
    const withPrizes = hostWith(
      [taro, hana],
      { status: "playing", draws: [n(5)], prizeWinners: 0, ranking: noRanking },
      { ...room, prizes: PrizeCount.parse(1) },
    );
    const prize: RoomAction = {
      type: "progress",
      playerId: taro.id,
      name: taro.name,
      event: { type: "bingo", newLines: 1, lines: 1, prize: true },
    };
    const asked = apply(withPrizes, prize);
    expect(asked).toMatchObject({ game: { askEnd: true } });
    const closed = apply(asked, { type: "local/askEndClosed" });
    // 景品の数を超えても、もう聞かない
    expect(apply(closed, { ...prize, playerId: hana.id })).toMatchObject({
      game: { askEnd: false, prizeWinners: 2 },
    });
  });

  it("ランキングが届いたら差し替える", () => {
    const ranking = {
      rows: [
        {
          id: taro.id,
          name: taro.name,
          rank: 1,
          expected: 12.3,
          lines: 0,
          reach: 1,
          opened: 3,
          nextPrize: 0.05,
        },
      ],
      moreTied: 0,
      contenders: 2,
      top: noCards,
      bottom: noCards,
    };
    expect(apply(playing, { type: "ranking", ranking })).toMatchObject({
      game: { ranking },
    });
  });

  it("景品の数が決まっていなければ、終了の確認は出さない", () => {
    const next = apply(playing, {
      type: "progress",
      playerId: taro.id,
      name: taro.name,
      event: { type: "bingo", newLines: 1, lines: 1, prize: true },
    });
    expect(next).toMatchObject({ game: { askEnd: false } });
  });
});

describe("reduceRoom（プレイヤーのゲーム中）", () => {
  it("本人の順位が届いたら差し替える", () => {
    const next = reduceRoom(playerPlaying([1]), {
      type: "standing",
      standing: { status: "idle" },
    });
    expect(next).toMatchObject({ game: { standing: { status: "idle" } } });
  });

  it("抽選中になり、番号が公開されたら履歴に足して抽選中を終える", () => {
    const drawing = reduceRoom(playerPlaying([1]), { type: "drawing" });
    expect(drawing).toMatchObject({ game: { drawing: true } });
    const published = reduceRoom(drawing, {
      type: "numberPublished",
      number: n(16),
    });
    expect(published).toMatchObject({
      game: { draws: [n(1), n(16)], drawing: false },
    });
    // 同じ番号が2回届いても、履歴には1回だけ
    expect(
      reduceRoom(published, { type: "numberPublished", number: n(16) }),
    ).toMatchObject({ game: { draws: [n(1), n(16)] } });
  });

  it("景品獲得ラインに達したら、公開された番号の数を抽選回として記録する", () => {
    const view = playerPlaying([1, 16, 31]);
    const next = apply(
      view,
      { type: "local/open", cell: cell(0) },
      { type: "local/open", cell: cell(1) },
      { type: "local/open", cell: cell(2) },
    );
    expect(next).toMatchObject({ game: { prizeRound: 3 } });
  });

  it("押したマスを開け、サーバーから記録が届いたらそれに合わせる", () => {
    const opened = reduceRoom(playerPlaying([1]), {
      type: "local/open",
      cell: cell(0),
    });
    expect(opened).toMatchObject({ game: { opened: maskOf([0]) } });
    expect(
      reduceRoom(opened, { type: "cells", opened: initialMask("3x3") }),
    ).toMatchObject({ game: { opened: initialMask("3x3") } });
  });
});

describe("tapCell", () => {
  it("抽選された番号のマスを開け、リーチ・ビンゴを返す", () => {
    const view = playerPlaying([1, 16, 31]);
    expect(tapCell(view, cell(0))).toMatchObject({
      kind: "opened",
      event: null,
    });
    expect(tapCell(withOpened(view, [0]), cell(1))).toMatchObject({
      kind: "opened",
      event: { type: "reach" },
    });
    expect(tapCell(withOpened(view, [0, 1]), cell(2))).toEqual({
      kind: "opened",
      opened: maskOf([0, 1, 2]),
      event: { type: "bingo", newLines: 1, lines: 1, prize: true },
    });
  });

  it("まだ抽選されていない番号は notDrawn", () => {
    expect(tapCell(playerPlaying([1]), cell(1))).toEqual({ kind: "notDrawn" });
  });

  it("抽選中・開いているマス・カードの外は何もしない", () => {
    expect(tapCell(playerPlaying([1], true), cell(0))).toEqual({
      kind: "ignored",
    });
    const view = playerPlaying([1]);
    expect(tapCell(withOpened(view, [0]), cell(0))).toEqual({
      kind: "ignored",
    });
    expect(tapCell(view, cell(9))).toEqual({ kind: "ignored" });
  });
});
