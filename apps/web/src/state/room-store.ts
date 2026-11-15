import type { ServerMessage } from "@bingo/protocol";
import { create } from "zustand";
import { initialRoomState, reduceRoom, type RoomState } from "./room";

// Zustand は状態の入れ物と、部品ごとの部分的な購読（セレクター）にだけ使う。更新ロジックは room.ts
interface RoomStore extends RoomState {
  readonly receive: (message: ServerMessage) => void;
}

export const useRoomStore = create<RoomStore>()((set) => ({
  ...initialRoomState,
  receive: (message) => {
    set((store) => reduceRoom(store, message));
  },
}));
