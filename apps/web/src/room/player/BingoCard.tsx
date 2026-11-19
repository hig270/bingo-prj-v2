import {
  CellIndex,
  LAYOUTS,
  isOpen,
  type Card,
  type CellMask,
} from "@bingo/game";
import styles from "./player.module.scss";

/**
 * カード。押したマスだけが開く（当選マスの強調や自動で開くことはしない）。
 * onTap を渡さなければ、見せるだけのカードになる（結果画面の最下位のカードなど。compact で小さく出す）
 */
export function BingoCard({
  card,
  opened,
  disabled = false,
  onTap,
  compact = false,
  label = "ビンゴカード",
}: {
  readonly card: Card;
  readonly opened: CellMask;
  /** 押せないとき（通信が切れている間など） */
  readonly disabled?: boolean;
  readonly onTap?: (cell: CellIndex) => void;
  readonly compact?: boolean;
  /** 読み上げの名前（同じ画面に何枚も並ぶときに見分けられるよう、持ち主の名前を入れる） */
  readonly label?: string;
}) {
  const size = LAYOUTS[card.layout].size;
  return (
    <div
      className={[styles.grid, compact ? styles.compact : ""].join(" ")}
      style={{ gridTemplateColumns: `repeat(${String(size)}, 1fr)` }}
      role={onTap === undefined ? "img" : "grid"}
      aria-label={label}
    >
      {card.cells.map((n, i) => {
        const cell = CellIndex.parse(i);
        const open = isOpen(opened, cell);
        const className = [
          styles.cell,
          open ? styles.open : "",
          n === null ? styles.free : "",
        ].join(" ");
        if (onTap === undefined) {
          return (
            <span key={i} className={className}>
              {n ?? "FREE"}
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            className={className}
            disabled={disabled}
            aria-pressed={open}
            onClick={() => {
              onTap(cell);
            }}
          >
            {n ?? "FREE"}
          </button>
        );
      })}
    </div>
  );
}
