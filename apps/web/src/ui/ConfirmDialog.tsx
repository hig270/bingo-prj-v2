import { useEffect, useRef } from "react";
import ui from "./ui.module.scss";

interface Props {
  /** 開いているか */
  readonly open: boolean;
  readonly message: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** 確認のダイアログ（ブラウザ標準の dialog 要素。Esc や背景の外側でも閉じられる） */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={ui.dialog}
      onClose={onCancel}
      onClick={(e) => {
        // 背景を押したら閉じる（中身は .dialogBody に入れてあるので、dialog 自身が押されるのは背景だけ）
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className={ui.dialogBody}>
        <p>{message}</p>
        <div className={ui.row}>
          <button
            type="button"
            className={`${ui.button} ${ui.danger}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          {/* 開いたときは「やめる」を選んだ状態にする（Enter を押しても取り返しのつかない操作をしないように） */}
          <button
            type="button"
            className={`${ui.button} ${ui.secondary}`}
            onClick={onCancel}
            autoFocus
          >
            やめる
          </button>
        </div>
      </div>
    </dialog>
  );
}
