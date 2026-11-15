import { createFileRoute } from "@tanstack/react-router";
import { useRoomStore } from "../../../state/room-store";

export const Route = createFileRoute("/r/$roomId/")({
  component: Player,
});

function Player() {
  const { roomId } = Route.useParams();
  const drawnCount = useRoomStore((s) => s.drawn.length);
  return (
    <main>
      <h1>プレイヤー画面（仮）</h1>
      <p>ルーム: {roomId}</p>
      <p>抽選済み: {drawnCount} 個</p>
    </main>
  );
}
