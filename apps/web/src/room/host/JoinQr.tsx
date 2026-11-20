import type { RoomId } from "@bingo/protocol";
import { QRCodeSVG } from "qrcode.react";

/** 参加用の URL（LINE で開いたときに外部のブラウザで開かせる指定を付ける） */
function joinUrl(roomId: RoomId): string {
  return `${location.origin}/r/${roomId}?openExternalBrowser=1`;
}

/**
 * 参加用の QR コード。募集画面では参加の受付に、ゲーム画面では画面を閉じたプレイヤーが戻るのに使う
 * （decisions.md 手順5の (a) の (6)）
 */
export function JoinQr({
  roomId,
  className,
}: {
  readonly roomId: RoomId;
  readonly className: string;
}) {
  return (
    <QRCodeSVG
      value={joinUrl(roomId)}
      className={className}
      marginSize={2}
      title="参加用の QR コード"
    />
  );
}
