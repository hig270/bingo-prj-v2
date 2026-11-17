import { createFileRoute, Link } from "@tanstack/react-router";
import ui from "../ui/ui.module.scss";

export const Route = createFileRoute("/")({
  component: Top,
});

/** トップ画面 */
function Top() {
  return (
    <main className={ui.page}>
      <h1 className={ui.title}>Bingo!</h1>
      <p>大人数のビンゴ大会を、スマホで遊べるようにします。</p>
      <div>
        <Link to="/new" className={ui.button}>
          ビンゴ会場を作成
        </Link>
      </div>
      <p className={ui.muted}>
        参加する方は、会場のスクリーンに映っている QR
        コードを読み取ってください。
      </p>
    </main>
  );
}
