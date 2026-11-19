import { createFileRoute, Link } from "@tanstack/react-router";
import { BASIC_RULES, type BasicRule } from "../../rules/summary";
import ui from "../../ui/ui.module.scss";
import styles from "./new.module.scss";

export const Route = createFileRoute("/new/")({
  component: ModeSelect,
});

const ORDER: readonly BasicRule[] = ["normal", "speed", "reverse"];

/** モード選択（基本ルールを1つ選ぶ） */
function ModeSelect() {
  return (
    <main className={ui.page}>
      <h1 className={ui.title}>モードを選ぶ</h1>
      <div className={styles.modes}>
        {ORDER.map((mode) => (
          <Link
            key={mode}
            to="/new/settings"
            search={{ mode }}
            className={`${ui.card} ${styles.mode}`}
          >
            <span className={ui.subtitle}>{BASIC_RULES[mode].label}</span>
            <span className={ui.muted}>{BASIC_RULES[mode].description}</span>
          </Link>
        ))}
      </div>
      <p className={ui.muted}>
        カードの大きさと勝ち方は、次の画面の「詳細設定」で組み合わせを変えられます。
      </p>
    </main>
  );
}
