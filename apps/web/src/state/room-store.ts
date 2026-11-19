import type { ServerMessage } from "@bingo/protocol";
import { create } from "zustand";
import { initialRoomState, reduceRoom, type RoomState } from "./room";

// Zustand は状態の入れ物と、部品ごとの部分的な購読（セレクター）にだけ使う。更新ロジックは room.ts
interface RoomStore {
  readonly state: RoomState;
  /** サーバーから届いたメッセージを当てはめる */
  readonly receive: (message: ServerMessage) => void;
  /** 別のルームを開くときなどに、最初の状態に戻す */
  readonly reset: () => void;
}

export const useRoomStore = create<RoomStore>()((set) => ({
  state: initialRoomState,
  receive: (message) => {
    set((store) => ({ state: reduceRoom(store.state, message) }));
  },
  reset: () => {
    set({ state: initialRoomState });
  },
}));
