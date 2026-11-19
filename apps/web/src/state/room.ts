import {
  type BingoNumber,
  type CellIndex,
  type CellMask,
  type OpenEvent,
  eventOfOpen,
  isCellOf,
  isOpen,
  numberAt,
  openCell,
} from "@bingo/game";
import {
  DrawRound,
  type PlayerId,
  type PlayerName,
  type PlayerSelf,
  type PlayerSummary,
  type Results,
  type RoomProfile,
  type ServerMessage,
} from "@bingo/protocol";

// ルームの状態と、その更新ロジック（リデューサー）。React にも Zustand にも依存しない純粋な関数で書く。
// サーバーから届いたメッセージ（ServerMessage）と、画面の中の出来事（LocalAction）を1つずつ当てはめて、
// 今の状態を作る

/** つないだ直後の全体の状態が、まだ届いていない */
interface Waiting {
  readonly view: "waiting";
}

/** ホスト画面の帯に流す知らせ（届いた順に1件ずつ流す） */
export interface Notice {
  /** 届いた順の通し番号（同じ知らせを2回流さないための目印） */
  readonly id: number;
  readonly playerId: PlayerId;
  readonly name: PlayerName;
  readonly event: OpenEvent;
}

/** ホストのゲームの進み具合 */
export type HostGame =
  | { readonly status: "lobby" }
  | {
      readonly status: "playing";
      /** 抽選履歴（番号を発表した順。演出の途中の番号は、発表の瞬間に足す） */
      readonly draws: readonly BingoNumber[];
      /**
       * 抽選ボタンを押してから、サーバーから番号が届くまでの間か
       * （この間にもう一度押されると、前の番号が演出なしで公開されてしまうので、押せなくする）
       */
      readonly requesting: boolean;
      /** 演出を流している番号。revealed は番号を発表したか */
      readonly current: {
        readonly number: BingoNumber;
        readonly revealed: boolean;
      } | null;
      /** 景品を獲得した人数 */
      readonly prizeWinners: number;
      /** 帯にまだ流していない知らせ（先頭から流す） */
      readonly notices: readonly Notice[];
      readonly nextNoticeId: number;
      /** 最後の景品が決まったので「ゲームを終了しますか？」を出すか */
      readonly askEnd: boolean;
    }
  | {
      readonly status: "finished";
      readonly draws: readonly BingoNumber[];
      readonly results: Results;
    };

/** ホストの画面の状態 */
export interface HostView {
  readonly view: "host";
  readonly room: RoomProfile;
  /** 参加した順 */
  readonly players: readonly PlayerSummary[];
  readonly maxPlayers: number;
  readonly game: HostGame;
}

/** プレイヤーのゲームの進み具合 */
export type PlayerGame =
  | { readonly status: "lobby" }
  | {
      readonly status: "playing";
      /** 公開された抽選番号（抽選した順） */
      readonly draws: readonly BingoNumber[];
      /** 抽選中（番号の公開を待っている間）か。この間はマスを押せない */
      readonly drawing: boolean;
      readonly opened: CellMask;
      readonly prizeRound: DrawRound | null;
    }
  | {
      readonly status: "finished";
      readonly draws: readonly BingoNumber[];
      readonly opened: CellMask;
      readonly results: Results;
    };

/** プレイヤーの画面の状態 */
export interface PlayerView {
  readonly view: "player";
  readonly room: RoomProfile;
  readonly me: PlayerSelf;
  readonly game: PlayerGame;
}

export type RoomState = Waiting | HostView | PlayerView;

export const initialRoomState: RoomState = { view: "waiting" };

/** 画面の中の出来事（サーバーには関係しない、または画面から先に反映するもの） */
export type LocalAction =
  /** ホスト: 抽選ボタンを押した（番号が届くまで、もう一度押せなくする） */
  | { readonly type: "local/drawRequested" }
  /**
   * ホスト: 番号 number の演出で、番号を発表した（抽選履歴に足す）。
   * 演出中の番号と違えば何もしない（つなぎ直しなどで、古い演出の知らせが遅れて来たとき）
   */
  | { readonly type: "local/revealed"; readonly number: BingoNumber }
  /** ホスト: 番号 number の演出が片付けまで終わった（演出中の番号と違えば何もしない） */
  | { readonly type: "local/drawDone"; readonly number: BingoNumber }
  /** ホスト: 帯の知らせを1件流し終えた */
  | { readonly type: "local/noticeShown"; readonly id: number }
  /** ホスト: 「ゲームを終了しますか？」を閉じた */
  | { readonly type: "local/askEndClosed" }
  /** プレイヤー: マスを押した（開けられるときだけ開ける。tapCell と同じ判定） */
  | { readonly type: "local/open"; readonly cell: CellIndex };

export type RoomAction = ServerMessage | LocalAction;

export function reduceRoom(state: RoomState, action: RoomAction): RoomState {
  switch (action.type) {
    case "hostSnapshot":
      return {
        view: "host",
        room: action.room,
        players: action.players,
        maxPlayers: action.maxPlayers,
        game: hostGameOf(action.phase),
      };
    case "playerSnapshot":
      return {
        view: "player",
        room: action.room,
        me: action.me,
        game: action.phase,
      };
    case "playerJoined":
      if (state.view !== "host") return state;
      // 同じ人の知らせが2回届いても、一覧には1回だけ載せる
      if (state.players.some((p) => p.id === action.player.id)) return state;
      return { ...state, players: [...state.players, action.player] };
    case "playerRemoved":
      if (state.view !== "host") return state;
      return {
        ...state,
        players: state.players.filter((p) => p.id !== action.playerId),
      };
    case "local/drawRequested":
      return updateHostPlaying(state, (game) => ({
        ...game,
        requesting: true,
      }));
    case "drawStarted":
      return updateHostPlaying(state, (game) => {
        // まだ発表していない番号があれば、サーバーはそれを公開してから次を抽選している。
        // 履歴から抜けないよう、ここで足す
        const unrevealed =
          game.current !== null && !game.current.revealed
            ? [game.current.number]
            : [];
        return {
          ...game,
          draws: [...game.draws, ...unrevealed],
          current: { number: action.number, revealed: false },
          requesting: false,
        };
      });
    case "local/revealed":
      return updateHostPlaying(state, (game) =>
        game.current?.number !== action.number || game.current.revealed
          ? game
          : {
              ...game,
              draws: [...game.draws, game.current.number],
              current: { ...game.current, revealed: true },
            },
      );
    case "local/drawDone":
      return updateHostPlaying(state, (game) =>
        game.current?.number !== action.number
          ? game
          : { ...game, current: null },
      );
    case "progress":
      if (state.view !== "host") return state;
      return updateHostPlaying(state, (game) => {
        const notice: Notice = {
          id: game.nextNoticeId,
          playerId: action.playerId,
          name: action.name,
          event: action.event,
        };
        const won = action.event.type === "bingo" && action.event.prize;
        const prizeWinners = game.prizeWinners + (won ? 1 : 0);
        const prizes = state.room.prizes;
        // 景品の数に達した（超えた）瞬間に1回だけ聞く
        const reachedPrizes =
          prizes !== null &&
          game.prizeWinners < prizes &&
          prizeWinners >= prizes;
        return {
          ...game,
          notices: [...game.notices, notice],
          nextNoticeId: game.nextNoticeId + 1,
          prizeWinners,
          askEnd: game.askEnd || reachedPrizes,
        };
      });
    case "local/noticeShown":
      return updateHostPlaying(state, (game) => ({
        ...game,
        notices: game.notices.filter((n) => n.id !== action.id),
      }));
    case "local/askEndClosed":
      return updateHostPlaying(state, (game) => ({ ...game, askEnd: false }));
    case "drawing":
      return updatePlayerPlaying(state, (game) => ({ ...game, drawing: true }));
    case "numberPublished":
      return updatePlayerPlaying(state, (game) => ({
        ...game,
        // 同じ番号の知らせが2回届いても、履歴には1回だけ載せる
        draws: game.draws.includes(action.number)
          ? game.draws
          : [...game.draws, action.number],
        drawing: false,
      }));
    case "cells":
      return updatePlayerPlaying(state, (game) => ({
        ...game,
        opened: action.opened,
      }));
    case "local/open": {
      if (state.view !== "player") return state;
      const result = tapCell(state, action.cell);
      if (result.kind !== "opened") return state;
      const won = result.event?.type === "bingo" && result.event.prize;
      return updatePlayerPlaying(state, (game) => ({
        ...game,
        opened: result.opened,
        // 抽選回は公開された番号の数で数える。抽選中は押せないので、ふつうはサーバーと同じになる。
        // ただし「抽選中」の知らせが届く前に押すと、サーバーは公開待ちの番号を含めて 1 多く数える
        // （サーバーの記録が正しい。今は画面に出していない値なので、使うときは注意）
        prizeRound:
          won && game.prizeRound === null
            ? DrawRound.parse(game.draws.length)
            : game.prizeRound,
      }));
    }
    case "bye":
      // 接続を切る知らせは、接続の部品（api/socket.ts）が扱う
      return state;
  }
}

/**
 * プレイヤーがマスを押したときの判定（リデューサーと画面で同じものを使う）。
 * - ignored: 何もしない（ゲーム中でない・抽選中・FREE・開いているマス）
 * - notDrawn: まだ抽選されていない番号（「まだ出ていません」と出し、サーバーには送らない）
 * - opened: 開ける。event はそれで起きた出来事（リーチ・ビンゴ）
 */
export type TapResult =
  | { readonly kind: "ignored" }
  | { readonly kind: "notDrawn" }
  | {
      readonly kind: "opened";
      readonly opened: CellMask;
      readonly event: OpenEvent | null;
    };

export function tapCell(view: PlayerView, cell: CellIndex): TapResult {
  const game = view.game;
  const card = view.me.card;
  if (game.status !== "playing" || game.drawing) return { kind: "ignored" };
  if (!isCellOf(card.layout, cell) || isOpen(game.opened, cell)) {
    return { kind: "ignored" };
  }
  const n = numberAt(card, cell);
  if (n === null || n === "free") return { kind: "ignored" };
  if (!game.draws.includes(n)) return { kind: "notDrawn" };
  const opened = openCell(game.opened, cell);
  return {
    kind: "opened",
    opened,
    event: eventOfOpen(view.room.rule, game.opened, opened),
  };
}

function hostGameOf(
  phase: Extract<ServerMessage, { type: "hostSnapshot" }>["phase"],
): HostGame {
  switch (phase.status) {
    case "lobby":
    case "finished":
      return phase;
    case "playing":
      return {
        status: "playing",
        draws: phase.draws,
        requesting: false,
        current: null,
        prizeWinners: phase.prizeWinners,
        notices: [],
        nextNoticeId: 0,
        askEnd: false,
      };
  }
}

type HostPlaying = Extract<HostGame, { status: "playing" }>;
type PlayerPlaying = Extract<PlayerGame, { status: "playing" }>;

/** ホストのゲーム中の状態だけを書き換える（それ以外の状態なら、そのまま返す） */
function updateHostPlaying(
  state: RoomState,
  update: (game: HostPlaying) => HostPlaying,
): RoomState {
  if (state.view !== "host" || state.game.status !== "playing") return state;
  const game = update(state.game);
  // 変わらなければ同じ状態を返す（画面を描き直させないため）
  return game === state.game ? state : { ...state, game };
}

/** プレイヤーのゲーム中の状態だけを書き換える（それ以外の状態なら、そのまま返す） */
function updatePlayerPlaying(
  state: RoomState,
  update: (game: PlayerPlaying) => PlayerPlaying,
): RoomState {
  if (state.view !== "player" || state.game.status !== "playing") {
    return state;
  }
  const game = update(state.game);
  return game === state.game ? state : { ...state, game };
}
