import type { BingoNumber } from "@bingo/game";
import type { ServerMessage } from "@bingo/protocol";

// ルームの状態と、その更新ロジック（リデューサー）。React にも Zustand にも依存しない純粋な関数で書く
// （骨組みの仮の中身。実際の状態はプロトコルを決めるときに作る）

export interface RoomState {
  readonly drawn: readonly BingoNumber[];
}

export const initialRoomState: RoomState = { drawn: [] };

export function reduceRoom(
  state: RoomState,
  message: ServerMessage,
): RoomState {
  switch (message.type) {
    case "drawn":
      return { ...state, drawn: [...state.drawn, message.number] };
    case "tapRejected":
      return state;
  }
}
