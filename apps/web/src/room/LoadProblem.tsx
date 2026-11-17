import type { Result } from "../api/http";
import ui from "../ui/ui.module.scss";

/** ルームの情報を読み込めなかったときの画面 */
export function LoadProblem({
  kind,
}: {
  readonly kind: Exclude<Result<unknown>["kind"], "ok">;
}) {
  switch (kind) {
    case "notFound":
      return (
        <main className={ui.page}>
          <h1 className={ui.title}>ルームが見つかりません</h1>
          <p>URL を確かめてください。</p>
        </main>
      );
    case "outdated":
      return (
        <main className={ui.page}>
          <h1 className={ui.title}>画面が古くなっています</h1>
          <p>再読み込みしてください。</p>
        </main>
      );
    case "network":
      return (
        <main className={ui.page}>
          <h1 className={ui.title}>通信できませんでした</h1>
          <p>電波の良いところで、再読み込みしてください。</p>
        </main>
      );
  }
}
