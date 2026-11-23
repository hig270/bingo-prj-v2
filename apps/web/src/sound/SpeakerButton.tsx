import ui from "../ui/ui.module.scss";
import styles from "./SpeakerButton.module.scss";

/**
 * スピーカーマークの音のオン／オフボタン（ホストとプレイヤーの両方の画面に置く）。
 * オンは音の波の線つき、オフは波の代わりに「×」を描く（decisions.md 手順5の (b)）
 */
export function SpeakerButton({
  on,
  onToggle,
}: {
  readonly on: boolean;
  /** 押したとき。次の状態（今と逆）を渡す */
  readonly onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`${ui.button} ${ui.secondary} ${styles.button}`}
      aria-label={on ? "音をオフにする" : "音をオンにする"}
      onClick={() => {
        onToggle(!on);
      }}
    >
      <svg
        className={styles.icon}
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* スピーカーの本体 */}
        <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
        {on ? (
          <>
            <path d="M16 9.5a3.5 3.5 0 0 1 0 5" />
            <path d="M18.5 7a7 7 0 0 1 0 10" />
          </>
        ) : (
          <path d="M16 9.5l5 5M21 9.5l-5 5" />
        )}
      </svg>
    </button>
  );
}
