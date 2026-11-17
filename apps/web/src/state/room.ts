import type {
  PlayerId,
  PlayerName,
  PlayerSummary,
  RoomInfo,
  ServerMessage,
} from "@bingo/protocol";

// ルームの状態と、その更新ロジック（リデューサー）。React にも Zustand にも依存しない純粋な関数で書く。
// サーバーから届いたメッセージ（ServerMessage）を1つずつ当てはめて、今の状態を作る

/** つないだ直後の全体の状態が、まだ届いていない */
interface Waiting {
  readonly view: "waiting";
}

/** ホストの画面の状態 */
export interface HostView {
  readonly view: "host";
  readonly room: RoomInfo;
  /** 参加した順 */
  readonly players: readonly PlayerSummary[];
  readonly maxPlayers: number;
}

/** プレイヤーの画面の状態 */
export interface PlayerView {
  readonly view: "player";
  readonly room: RoomInfo;
  readonly me: { readonly id: PlayerId; readonly name: PlayerName };
}

export type RoomState = Waiting | HostView | PlayerView;

export const initialRoomState: RoomState = { view: "waiting" };

export function reduceRoom(
  state: RoomState,
  message: ServerMessage,
): RoomState {
  switch (message.type) {
    case "hostSnapshot":
      return {
        view: "host",
        room: message.room,
        players: message.players,
        maxPlayers: message.maxPlayers,
      };
    case "playerSnapshot":
      return { view: "player", room: message.room, me: message.me };
    case "playerJoined":
      if (state.view !== "host") return state;
      // 同じ人の知らせが2回届いても、一覧には1回だけ載せる
      if (state.players.some((p) => p.id === message.player.id)) return state;
      return { ...state, players: [...state.players, message.player] };
    case "playerRemoved":
      if (state.view !== "host") return state;
      return {
        ...state,
        players: state.players.filter((p) => p.id !== message.playerId),
      };
    case "bye":
      // 接続を切る知らせは、接続の部品（api/socket.ts）が扱う
      return state;
  }
}
