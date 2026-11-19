import { BingoNumber, LAYOUTS, drawPool, maskOf, type Card } from "@bingo/game";
import { ExtendResponse, type ServerMessage } from "@bingo/protocol";
import { evictAllDurableObjects, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { ROOM_KEY, RoomRecord } from "../src/records";
import { PLAYED_ROOM_TTL_MS, RANKING_INTERVAL_MS } from "../src/room";
import {
  call,
  connect,
  cookieOf,
  createRoom,
  join,
  settings,
  settle,
} from "./helpers";

type Connection = Awaited<ReturnType<typeof connect>>;

/** 最初の要素（無ければテストの書き間違いなので失敗させる） */
function first<T>(list: readonly T[]): T {
  const value = list[0];
  if (value === undefined) throw new Error("要素がない");
  return value;
}

/** 条件が満たされるまで待つ（メッセージの到着を待つため） */
async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`待っても起きなかった: ${label}`);
}

/** 届いたメッセージのうち、type が一致する最後のもの */
function last<T extends ServerMessage["type"]>(
  conn: Connection,
  type: T,
): Extract<ServerMessage, { type: T }> | undefined {
  return conn.messages.findLast(
    (m): m is Extract<ServerMessage, { type: T }> => m.type === type,
  );
}

function countOf(conn: Connection, type: ServerMessage["type"]): number {
  return conn.messages.filter((m) => m.type === type).length;
}

function send(conn: Connection, message: unknown): void {
  conn.ws.send(JSON.stringify(message));
}

/** ルームを作って参加し、全員がつないだ状態にする（ゲームはまだ始めない） */
async function lobby(
  names: readonly string[],
  rule: unknown = { layout: "3x3", win: { type: "bingo", prizeLines: 1 } },
  prizes: number | null = null,
) {
  const { roomId, hostCookie } = await createRoom({
    ...settings,
    rule,
    prizes,
  });
  const players: { name: string; cookie: string; conn: Connection }[] = [];
  for (const name of names) {
    const joined = await join(roomId, name);
    players.push({
      name,
      cookie: joined.cookie,
      conn: await connect(roomId, joined.cookie),
    });
  }
  const host = await connect(roomId, hostCookie);
  await until(() => host.messages.length > 0, "ホストの状態");
  return { roomId, hostCookie, host, players };
}

/** ゲームを始めた状態にする */
async function playing(names: readonly string[], rule?: unknown) {
  const room = await lobby(names, rule);
  send(room.host, { type: "start" });
  await until(
    () =>
      last(room.host, "hostSnapshot")?.phase.status === "playing" &&
      room.players.every(
        (p) => last(p.conn, "playerSnapshot")?.phase.status === "playing",
      ),
    "開始の状態",
  );
  return room;
}

/** ホストが抽選し、演出を見せ終わったことにする（スマホに公開する）。抽選した番号を返す */
async function drawAndShow(
  host: Connection,
  players: readonly Connection[],
): Promise<BingoNumber> {
  const before = countOf(host, "drawStarted");
  const published = players.map((p) => countOf(p, "numberPublished"));
  send(host, { type: "draw" });
  await until(() => countOf(host, "drawStarted") > before, "抽選");
  const n = last(host, "drawStarted")?.number;
  if (n === undefined) throw new Error("番号が届かない");
  send(host, { type: "drawShown", number: n });
  await until(
    () =>
      players.every(
        (p, i) => countOf(p, "numberPublished") > (published[i] ?? 0),
      ),
    "公開",
  );
  return n;
}

/**
 * 抽選済み（公開済み）の番号を保存領域に直接書き、ルームを起こし直す（つないでいた接続は使えなくなる）。
 * 抽選を立て続けに押すと、接続ごとの送信回数の制限（毎秒 2 回）にかかるため、テストではこうする
 */
async function setDraws(
  roomId: string,
  draws: readonly BingoNumber[],
): Promise<void> {
  await runInDurableObject(env.ROOM.getByName(roomId), async (_, state) => {
    const room = RoomRecord.parse(await state.storage.get(ROOM_KEY));
    if (room.phase.status !== "playing") throw new Error("ゲーム中ではない");
    const game = { ...room.phase.game, draws: [...draws], pending: null };
    await state.storage.put(ROOM_KEY, {
      ...room,
      phase: { status: "playing", game },
    });
  });
  await evictAllDurableObjects();
}

/** 抽選済みの番号を書いてから、全員がつなぎ直した状態にする */
async function playingWithDraws(
  names: readonly string[],
  draws: (cards: readonly Card[]) => readonly BingoNumber[],
) {
  const room = await playing(names);
  const cards = room.players.map((p) => cardOf(p.conn));
  await setDraws(room.roomId, draws(cards));
  const host = await connect(room.roomId, room.hostCookie);
  const players = await Promise.all(
    room.players.map(async (p) => ({
      ...p,
      conn: await connect(room.roomId, p.cookie),
    })),
  );
  await until(
    () =>
      host.messages.length > 0 &&
      players.every((p) => p.conn.messages.length > 0),
    "つなぎ直した状態",
  );
  return { ...room, host, players, cards };
}

function cardOf(conn: Connection): Card {
  const card = last(conn, "playerSnapshot")?.me.card;
  if (card === undefined) throw new Error("カードが届かない");
  return card;
}

describe("ゲームの開始", () => {
  it("ホストが始めると、全員に開始後の状態が届き、データを消す予約が 7 日後になる", async () => {
    const before = Date.now();
    const { roomId, host, players } = await playing(["たろう"]);
    expect(last(host, "hostSnapshot")?.phase).toMatchObject({
      status: "playing",
      draws: [],
      prizeWinners: 0,
      ranking: {
        rows: [{ name: "たろう", rank: 1, lines: 0, reach: 0, opened: 0 }],
        moreTied: 0,
        contenders: 1,
      },
    });
    expect(last(first(players).conn, "playerSnapshot")?.phase).toEqual({
      status: "playing",
      draws: [],
      drawing: false,
      opened: 0,
      prizeRound: null,
      standing: { status: "contending", rank: 1, of: 1 },
    });
    const alarm = await runInDurableObject(
      env.ROOM.getByName(roomId),
      (_, state) => state.storage.getAlarm(),
    );
    expect(alarm).toBeGreaterThanOrEqual(before + PLAYED_ROOM_TTL_MS);
    // 始まった後は参加できない
    expect((await join(roomId, "じろう")).body).toEqual({
      ok: false,
      error: "started",
    });
  });

  it("参加者がいなければ始めない", async () => {
    const { host } = await lobby([]);
    send(host, { type: "start" });
    await settle();
    expect(countOf(host, "hostSnapshot")).toBe(1);
  });

  it("逆ビンゴはまだ始められない（手順5で作る）", async () => {
    const { host } = await lobby(
      ["たろう"],
      { layout: "5x5", win: { type: "reverse" } },
      1,
    );
    send(host, { type: "start" });
    await settle();
    expect(countOf(host, "hostSnapshot")).toBe(1);
  });

  it("プレイヤーからの start は無視する", async () => {
    const { host, players } = await lobby(["たろう"]);
    send(first(players).conn, { type: "start" });
    await settle();
    expect(countOf(host, "hostSnapshot")).toBe(1);
  });
});

describe("抽選と公開", () => {
  it("番号はホストにだけ送り、演出を見せ終わってからプレイヤーに公開する", async () => {
    const { host, players } = await playing(["たろう"]);
    const player = first(players).conn;
    send(host, { type: "draw" });
    await until(() => countOf(host, "drawStarted") === 1, "抽選");
    await until(() => countOf(player, "drawing") === 1, "抽選中");
    const n = last(host, "drawStarted")?.number;
    // 抽選中は、プレイヤーに番号が届かない
    expect(player.messages.some((m) => "number" in m)).toBe(false);

    // 別の番号で「見せ終わった」と言われても公開しない
    send(host, { type: "drawShown", number: n === 1 ? 2 : 1 });
    await settle();
    expect(countOf(player, "numberPublished")).toBe(0);

    send(host, { type: "drawShown", number: n });
    await until(() => countOf(player, "numberPublished") === 1, "公開");
    expect(last(player, "numberPublished")?.number).toBe(n);
  });

  it("公開しないまま次の抽選を押すと、前の番号を先に公開する", async () => {
    const { host, players } = await playing(["たろう"]);
    const player = first(players).conn;
    send(host, { type: "draw" });
    await until(() => countOf(host, "drawStarted") === 1, "1 回目");
    const firstNumber = last(host, "drawStarted")?.number;
    send(host, { type: "draw" });
    await until(() => countOf(host, "drawStarted") === 2, "2 回目");
    expect(last(player, "numberPublished")?.number).toBe(firstNumber);
    expect(last(host, "drawStarted")?.number).not.toBe(firstNumber);
  });

  it("ホストがつなぎ直すと、演出の途中だった番号を公開する", async () => {
    const { roomId, hostCookie, host, players } = await playing(["たろう"]);
    const player = first(players).conn;
    send(host, { type: "draw" });
    await until(() => countOf(host, "drawStarted") === 1, "抽選");
    const n = last(host, "drawStarted")?.number;
    const again = await connect(roomId, hostCookie);
    await until(() => countOf(player, "numberPublished") === 1, "公開");
    expect(last(player, "numberPublished")?.number).toBe(n);
    await until(() => again.messages.length > 0, "つなぎ直した状態");
    expect(last(again, "hostSnapshot")?.phase).toMatchObject({ draws: [n] });
  });

  it("全部の番号を抽選し終えたら、それ以上は抽選しない", async () => {
    // 9マスの番号は 1〜45。最後の1つ（45）だけ残しておく
    const { host, players } = await playingWithDraws(["たろう"], () =>
      drawPool("3x3").slice(0, LAYOUTS["3x3"].maxNumber - 1),
    );
    expect(await drawAndShow(host, [first(players).conn])).toBe(45);
    send(host, { type: "draw" });
    await settle();
    expect(countOf(host, "drawStarted")).toBe(1);
  });
});

describe("マスを開ける", () => {
  it("公開していない番号は受け付けず、サーバーの記録を送り返す", async () => {
    const { players } = await playing(["たろう"]);
    const player = first(players).conn;
    send(player, { type: "open", cell: 0 });
    await until(() => countOf(player, "cells") === 1, "記録の送り返し");
    expect(last(player, "cells")?.opened).toBe(0);
  });

  it("リーチとビンゴをホストに知らせ、景品獲得した抽選回を記録し、全員がそろうと終わる", async () => {
    // 全部の番号を抽選し終えたことにする（45 回目の抽選回）
    const { host, players } = await playingWithDraws(["たろう"], () =>
      drawPool("3x3"),
    );
    const player = first(players).conn;
    const round = 45;

    send(player, { type: "open", cell: 0 });
    send(player, { type: "open", cell: 1 });
    await until(() => countOf(host, "progress") === 1, "リーチ");
    expect(last(host, "progress")).toMatchObject({
      name: "たろう",
      event: { type: "reach" },
    });
    send(player, { type: "open", cell: 2 });
    await until(() => countOf(host, "progress") === 2, "ビンゴ");
    expect(last(host, "progress")?.event).toEqual({
      type: "bingo",
      newLines: 1,
      lines: 1,
      prize: true,
    });

    // 参加者は1人なので、全員の順位が確定して終わる
    await until(
      () => last(host, "hostSnapshot")?.phase.status === "finished",
      "終了",
    );
    const finished = last(player, "playerSnapshot")?.phase;
    expect(finished).toMatchObject({
      status: "finished",
      opened: maskOf([0, 1, 2]),
      results: {
        entries: [
          { name: "たろう", standing: { type: "prize", round, rank: 1 } },
        ],
        lowest: null,
      },
    });
  });

  it("抽選中（公開前）に押したビンゴは、その新しい抽選回になる", async () => {
    // たろうのカードの 1 行目（マス 0〜2）以外の番号を1つだけ残し、残りは抽選済みにする（44 回目まで）
    const { host, players } = await playingWithDraws(
      ["たろう", "はなこ"],
      ([card]) => {
        const row = new Set(card?.cells.slice(0, 3));
        const rest = drawPool("3x3").find((n) => !row.has(n));
        return drawPool("3x3").filter((n) => n !== rest);
      },
    );
    const taro = first(players).conn;
    const drawnCount = 44;
    send(taro, { type: "open", cell: 0 });
    send(taro, { type: "open", cell: 1 });
    await until(() => countOf(host, "progress") === 1, "リーチ");
    // 次の抽選を始めてから（公開する前に）最後のマスを押す
    send(host, { type: "draw" });
    await until(() => countOf(taro, "drawing") === 1, "抽選中");
    send(taro, { type: "open", cell: 2 });
    await until(() => last(host, "progress")?.event.type === "bingo", "ビンゴ");
    send(host, { type: "end" });
    await until(
      () => last(host, "hostSnapshot")?.phase.status === "finished",
      "終了",
    );
    expect(last(host, "hostSnapshot")?.phase).toMatchObject({
      results: {
        entries: [
          {
            name: "たろう",
            standing: { type: "prize", round: drawnCount + 1, rank: 1 },
          },
          // 一度も開けないまま、自分の番号が全部出ているので放置
          { name: "はなこ", standing: { type: "idle" } },
        ],
        lowest: null,
      },
    });
  });
});

describe("ランキング", () => {
  it("マスを開けると、ホストにランキングを、本人に順位を送る", async () => {
    const { host, players } = await playingWithDraws(
      ["たろう", "はなこ"],
      ([card]) =>
        card?.cells.slice(0, 1).flatMap((n) => (n === null ? [] : [n])) ?? [],
    );
    const [taro, hana] = players;
    if (taro === undefined || hana === undefined) throw new Error("参加者");
    send(taro.conn, { type: "open", cell: 0 });
    await until(
      () => last(host, "ranking")?.ranking.rows[0]?.name === "たろう",
      "ランキング",
    );
    expect(last(host, "ranking")?.ranking).toMatchObject({
      rows: [
        { name: "たろう", rank: 1, opened: 1 },
        { name: "はなこ", rank: 2, opened: 0 },
      ],
      contenders: 2,
    });
    await until(
      () => last(hana.conn, "standing")?.standing.status === "contending",
      "はなこの順位",
    );
    expect(last(hana.conn, "standing")?.standing).toEqual({
      status: "contending",
      rank: 2,
      of: 2,
    });
    // たろうの順位は1位のまま変わらないので、送り直さない
    expect(countOf(taro.conn, "standing")).toBe(0);
  });

  it("続けて開けても、送るのは 0.5 秒に 1 回までで、最後の変化も後から届く", async () => {
    const { host, players } = await playingWithDraws(["たろう"], () =>
      drawPool("3x3"),
    );
    const taro = first(players).conn;
    send(taro, { type: "open", cell: 0 });
    send(taro, { type: "open", cell: 4 });
    await until(() => countOf(host, "ranking") >= 1, "1回目");
    await settle();
    // 2 つ目の変化は、すぐには届かない
    expect(countOf(host, "ranking")).toBe(1);
    await until(
      () => last(host, "ranking")?.ranking.rows[0]?.opened === 2,
      "後追い",
    );
    expect(countOf(host, "ranking")).toBe(2);
  });

  it("自分の番号が2個出たまま、次の抽選が押されても開けていなければ放置になり、開けると戻る", async () => {
    // はなこのカードにだけある番号を 2 個公開済みにする（たろうのカードにもあると、たろうも放置になるため）
    const onlyHana = (taro: Card | undefined, hana: Card | undefined) =>
      (hana?.cells ?? [])
        .flatMap((n) => (n === null ? [] : [n]))
        .filter((n) => !(taro?.cells ?? []).includes(n))
        .slice(0, 2);
    const { host, players, cards } = await playingWithDraws(
      ["たろう", "はなこ"],
      ([taro, hana]) => onlyHana(taro, hana),
    );
    const hana = players[1];
    const opened = onlyHana(cards[0], cards[1])[0];
    if (hana === undefined || opened === undefined) throw new Error("参加者");
    send(host, { type: "draw" });
    await until(
      () => last(hana.conn, "standing")?.standing.status === "idle",
      "放置",
    );
    await until(
      () => last(host, "ranking")?.ranking.contenders === 1,
      "ランキングから外れる",
    );
    // 抽選中でも、公開済みの番号のマスは開けられる
    send(hana.conn, {
      type: "open",
      cell: cards[1]?.cells.indexOf(opened),
    });
    await until(
      () => last(hana.conn, "standing")?.standing.status === "contending",
      "戻る",
    );
  });
});

describe("放置の判定の区切り", () => {
  it("公開待ちの番号が残ったまま抽選が押されたとき、そこで公開した番号は放置の判定に数えない", async () => {
    // 残りの番号を、はなこのカードの 3 個（マス 6〜8）だけにする
    const { host, players, cards } = await playingWithDraws(
      ["たろう", "はなこ"],
      ([, card]) => {
        const rest = new Set(card?.cells.slice(6));
        return drawPool("3x3").filter((n) => !rest.has(n));
      },
    );
    const hana = players[1]?.conn;
    if (hana === undefined || cards[1] === undefined) throw new Error("参加者");
    // はなこは公開済みのマスを開けて、数え直しにする
    send(hana, { type: "open", cell: 0 });
    // 1 個目: 公開する（はなこは開けない）
    await drawAndShow(host, [hana]);
    // 2 個目: 抽選したが、演出を見せ終わらないうちに次の抽選が押された
    send(host, { type: "draw" });
    await until(() => countOf(host, "drawStarted") === 2, "2 回目の抽選");
    send(host, { type: "draw" });
    await until(() => countOf(host, "drawStarted") === 3, "3 回目の抽選");
    // 2 個目は 3 回目の抽選を押した後に公開したので、はなこにはまだ開ける機会がなかった。
    // 数えるのは 1 個目だけなので、放置にならない
    await new Promise((r) => setTimeout(r, RANKING_INTERVAL_MS + 100));
    expect(last(hana, "standing")?.standing.status).toBe("contending");
  });
});

describe("ゲームの終了", () => {
  it("ゲーム中に外して、残りの全員が景品を獲得済みになったら終える", async () => {
    const { host, players } = await playingWithDraws(["たろう", "はなこ"], () =>
      drawPool("3x3"),
    );
    const [taro, hana] = players;
    if (taro === undefined || hana === undefined) throw new Error("参加者");
    for (const cell of [0, 1, 2]) send(taro.conn, { type: "open", cell });
    await until(() => last(host, "progress")?.event.type === "bingo", "ビンゴ");
    // はなこがまだなので、終わらない
    await settle();
    expect(last(host, "hostSnapshot")?.phase.status).toBe("playing");
    const hanaId = last(hana.conn, "playerSnapshot")?.me.id;
    send(host, { type: "kick", playerId: hanaId });
    await until(
      () => last(host, "hostSnapshot")?.phase.status === "finished",
      "終了",
    );
    expect(last(host, "hostSnapshot")?.phase).toMatchObject({
      results: {
        entries: [
          { name: "たろう", standing: { type: "prize", round: 45, rank: 1 } },
        ],
      },
    });
  });

  it("ホストが終えると、公開待ちの番号を公開してから、全員に結果を送る", async () => {
    const { host, players } = await playing(["たろう", "はなこ"]);
    send(host, { type: "draw" });
    await until(() => countOf(host, "drawStarted") === 1, "抽選");
    const n = last(host, "drawStarted")?.number;
    send(host, { type: "end" });
    for (const { conn } of players) {
      await until(
        () => last(conn, "playerSnapshot")?.phase.status === "finished",
        "終了",
      );
      expect(last(conn, "numberPublished")?.number).toBe(n);
      // 終了が押された時点では公開前の番号だったので、まだ開ける機会がなく、放置とはみなさない
      expect(last(conn, "playerSnapshot")?.phase).toMatchObject({
        draws: [n],
        results: {
          entries: [
            { name: "たろう", standing: { type: "ranked", rank: 1 } },
            { name: "はなこ", standing: { type: "ranked", rank: 1 } },
          ],
          lowest: { more: 0 },
        },
      });
    }
  });
});

describe("外された人の接続", () => {
  it("外した直後に始めても、残りの全員に開始の状態が届く", async () => {
    const { host, players } = await lobby(["たろう", "はなこ"]);
    const hanaId = last(first(players.slice(1)).conn, "playerSnapshot")?.me.id;
    // 外された人の接続が閉じ終わるのを待たずに始める
    send(host, { type: "kick", playerId: hanaId });
    send(host, { type: "start" });
    await until(
      () =>
        last(host, "hostSnapshot")?.phase.status === "playing" &&
        last(first(players).conn, "playerSnapshot")?.phase.status === "playing",
      "開始の状態",
    );
  });
});

describe("参加の記録の延長", () => {
  async function extend(roomId: string, cookie: string) {
    const res = await call(`/r/${roomId}/api/extend`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    return {
      body: ExtendResponse.parse(await res.json()),
      setCookie: res.headers.get("Set-Cookie"),
    };
  }

  it("始まる前は延ばさない", async () => {
    const { roomId, players } = await lobby(["たろう"]);
    expect((await extend(roomId, first(players).cookie)).body).toEqual({
      host: false,
      player: false,
    });
  });

  it("始まった後に1回だけ延ばし、同じ値の Cookie を付け直す", async () => {
    const { roomId, hostCookie, players } = await playing(["たろう"]);
    const player = await extend(roomId, first(players).cookie);
    expect(player.body).toEqual({ host: false, player: true });
    expect(player.setCookie).toContain(first(players).cookie);
    expect(player.setCookie).toContain("Max-Age=10800");
    const host = await extend(roomId, hostCookie);
    expect(host.body).toEqual({ host: true, player: false });
    expect(
      cookieOf(
        new Response(null, { headers: { "Set-Cookie": host.setCookie ?? "" } }),
      ),
    ).toBe(hostCookie);
    // 延ばした後は、開始より後に発行したことになるので、もう延ばさない
    expect((await extend(roomId, first(players).cookie)).body.player).toBe(
      false,
    );
  });
});
