import {
  CellIndex,
  LAYOUTS,
  isOpen,
  type Card,
  type CellMask,
} from "@bingo/game";
import styles from "./player.module.scss";

/** プレイヤーのカード（押したマスだけが開く。当選マスの強調や自動で開くことはしない） */
export function BingoCard({
  card,
  opened,
  disabled,
  onTap,
}: {
  readonly card: Card;
  readonly opened: CellMask;
  /** 押せないとき（通信が切れている間など） */
  readonly disabled: boolean;
  readonly onTap: (cell: CellIndex) => void;
}) {
  const size = LAYOUTS[card.layout].size;
  return (
    <div
      className={styles.grid}
      style={{ gridTemplateColumns: `repeat(${String(size)}, 1fr)` }}
      role="grid"
      aria-label="ビンゴカード"
    >
      {card.cells.map((n, i) => {
        const cell = CellIndex.parse(i);
        const open = isOpen(opened, cell);
        return (
          <button
            key={i}
            type="button"
            className={[
              styles.cell,
              open ? styles.open : "",
              n === null ? styles.free : "",
            ].join(" ")}
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
