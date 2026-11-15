import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/r/$roomId/host")({
  component: Host,
});

function Host() {
  const { roomId } = Route.useParams();
  return (
    <main>
      <h1>ホスト画面（仮）</h1>
      <p>ルーム: {roomId}</p>
    </main>
  );
}
