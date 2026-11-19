import { RoomId } from "@bingo/protocol";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import ui from "../../../ui/ui.module.scss";

// ルームの画面（/r/<ルームID> 以下）に共通の処理。
// URL のルーム ID を確かめ、小文字で打たれていたら大文字の URL に置き換える
// （Cookie の Path は大文字・小文字を区別するので、そろえないと参加の記録が送られない）
export const Route = createFileRoute("/r/$roomId")({
  params: {
    parse: ({ roomId }) => ({ roomId: RoomId.parse(roomId) }),
    stringify: ({ roomId }) => ({ roomId }),
  },
  beforeLoad: ({ params, location }) => {
    const prefix = `/r/${params.roomId}`;
    if (!location.pathname.startsWith(prefix)) {
      const rest = location.pathname.slice(prefix.length);
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router の決まった書き方
      throw redirect({
        href: `${prefix}${rest}${location.searchStr}`,
        replace: true,
      });
    }
  },
  component: Outlet,
  errorComponent: () => (
    <main className={ui.page}>
      <h1 className={ui.title}>ルームが見つかりません</h1>
      <p>URL を確かめてください。</p>
    </main>
  ),
});
