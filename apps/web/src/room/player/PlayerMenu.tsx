import type { BingoNumber } from "@bingo/game";
import type { RoomProfile } from "@bingo/protocol";
import { useEffect, useRef, useState } from "react";
import { ruleSummary } from "../../rules/summary";
import ui from "../../ui/ui.module.scss";
import { DrawHistory } from "../Ball";
import { RETURN_HINT } from "../return-hint";

/**
 * プレイヤーのメニュー（ルーム名、ルールの確認、抽選履歴の確認、閉じても戻れることの案内）。
 * 「抽選履歴を確認」を押すと、同じダイアログの中で履歴に切り替わる
 */
export function PlayerMenu({
  room,
  draws,
}: {
  readonly room: RoomProfile;
  readonly draws: readonly BingoNumber[];
}) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<"menu" | "history">("menu");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    setOpen(false);
    setPage("menu");
  };

  return (
    <>
      <button
        type="button"
        className={`${ui.button} ${ui.secondary}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        メニュー
      </button>
      <dialog
        ref={ref}
        className={ui.dialog}
        onClose={close}
        onClick={(e) => {
          // 背景を押したら閉じる（中身は .dialogBody に入れてある）
          if (e.target === e.currentTarget) close();
        }}
      >
        <div className={`${ui.dialogBody} ${ui.page}`}>
          {page === "menu" ? (
            <>
              <h2 className={ui.subtitle}>{room.name}</h2>
              <p>ルール: {ruleSummary(room.rule)}</p>
              <p className={ui.muted}>{RETURN_HINT}</p>
              <div>
                <button
                  type="button"
                  className={ui.button}
                  onClick={() => {
                    setPage("history");
                  }}
                >
                  抽選履歴を確認
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className={ui.subtitle}>抽選履歴（{draws.length} 個）</h2>
              {draws.length === 0 ? (
                <p className={ui.muted}>まだ抽選されていません</p>
              ) : (
                <DrawHistory draws={draws} />
              )}
            </>
          )}
          <div>
            <button
              type="button"
              className={`${ui.button} ${ui.secondary}`}
              onClick={close}
            >
              閉じる
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
