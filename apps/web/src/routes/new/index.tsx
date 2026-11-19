import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BASIC_RULES,
  isBasicRuleReady,
  type BasicRule,
} from "../../rules/summary";
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
        {ORDER.map((mode) =>
          isBasicRuleReady(mode) ? (
            <Link
              key={mode}
              to="/new/settings"
              search={{ mode }}
              className={`${ui.card} ${styles.mode}`}
            >
              <span className={ui.subtitle}>{BASIC_RULES[mode].label}</span>
              <span className={ui.muted}>{BASIC_RULES[mode].description}</span>
            </Link>
          ) : (
            // まだ遊べない基本ルールは、選べない形で「準備中」と出す
            <div
              key={mode}
              className={`${ui.card} ${styles.mode} ${styles.unready}`}
              aria-disabled="true"
            >
              <span className={ui.subtitle}>
                {BASIC_RULES[mode].label}（準備中）
              </span>
              <span className={ui.muted}>{BASIC_RULES[mode].description}</span>
            </div>
          ),
        )}
      </div>
      <p className={ui.muted}>
        カードの大きさと勝ち方は、次の画面の「詳細設定」で組み合わせを変えられます。
      </p>
    </main>
  );
}
