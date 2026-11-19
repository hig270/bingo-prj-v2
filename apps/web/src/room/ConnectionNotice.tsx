import type { SocketStatus } from "../api/socket";
import ui from "../ui/ui.module.scss";

/** 接続の状態の知らせ（つながっているときは何も出さない） */
export function ConnectionNotice({
  status,
}: {
  readonly status: SocketStatus;
}) {
  switch (status.kind) {
    case "open":
      return null;
    case "connecting":
      return <p className={ui.notice}>接続しています…</p>;
    case "reconnecting":
      return <p className={ui.notice}>接続し直しています…</p>;
    case "cooldown":
      return (
        <p className={ui.notice}>
          通信が多すぎるため切断しました。1分後に再接続します。
        </p>
      );
    case "ended":
      switch (status.reason) {
        case "replaced":
          return (
            <p className={ui.notice}>
              別の画面で開かれました。この画面は閉じてください。
            </p>
          );
        case "kicked":
          return (
            <p className={ui.notice}>ホストによりルームから外されました。</p>
          );
        case "unauthorized":
          return (
            <p className={ui.notice}>
              参加の記録が見つかりません（期限切れなど）。再読み込みしてください。
            </p>
          );
        case "outdated":
          return (
            <p className={ui.notice}>
              画面が古くなっています。再読み込みしてください。
            </p>
          );
      }
  }
}
