import { createFileRoute, Link } from "@tanstack/react-router";
import styles from "./index.module.scss";

export const Route = createFileRoute("/")({
  component: Top,
});

function Top() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Bingo!</h1>
      {/* 骨組みの確認用。ルーム ID はまだ仮 */}
      <Link to="/r/$roomId" params={{ roomId: "demo" }}>
        プレイヤー画面（仮）
      </Link>
      <Link to="/r/$roomId/host" params={{ roomId: "demo" }}>
        ホスト画面（仮）
      </Link>
    </main>
  );
}
