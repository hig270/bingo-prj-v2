import { z } from "zod";
import { CellIndex, CellMask, EMPTY_MASK, openCell } from "./cells";
import { CardLayout, LAYOUTS, NUMBERS_PER_COLUMN } from "./layout";
import { countCompletedLines } from "./lines";
import { BingoNumber } from "./number";

/**
 * ビンゴカード。cells はマスの位置（行 × 一辺 ＋ 列）の順に並んだ番号で、FREE のマスは null。
 * 形が正しいこと（マスの数・FREE の位置・列ごとの番号の範囲・番号の重複なし）を確かめてから作る
 */
export const Card = z
  .object({
    layout: CardLayout,
    cells: z.array(BingoNumber.nullable()),
  })
  .superRefine((card, ctx) => {
    for (const problem of problemsOf(card.layout, card.cells)) {
      ctx.addIssue({ code: "custom", message: problem });
    }
  })
  .brand<"Card">();
export type Card = z.infer<typeof Card>;

/** カードの形の誤りを日本語で並べる（無ければ空） */
function problemsOf(
  layout: CardLayout,
  cells: readonly (BingoNumber | null)[],
): string[] {
  const spec = LAYOUTS[layout];
  if (cells.length !== spec.cellCount) {
    return [`マスの数が ${String(spec.cellCount)} ではない`];
  }
  const problems: string[] = [];
  const seen = new Set<number>();
  cells.forEach((n, i) => {
    if (i === spec.free) {
      if (n !== null) problems.push(`FREE のマス ${String(i)} に番号がある`);
      return;
    }
    if (n === null) {
      problems.push(`マス ${String(i)} に番号がない`);
      return;
    }
    const column = i % spec.size;
    if (Math.floor((n - 1) / NUMBERS_PER_COLUMN) !== column) {
      problems.push(`マス ${String(i)} の番号 ${String(n)} が列の範囲の外`);
    }
    if (seen.has(n)) problems.push(`番号 ${String(n)} が重複している`);
    seen.add(n);
  });
  return problems;
}

/**
 * カードを作る。列ごとに、その列の範囲（15個）から重複なく番号を選ぶ。
 * random は 0 以上 1 未満を返す乱数（テストやシードからの再現のため外から渡す）
 */
export function generateCard(layout: CardLayout, random: () => number): Card {
  const spec = LAYOUTS[layout];
  const cells: (BingoNumber | null)[] = Array.from(
    { length: spec.cellCount },
    () => null,
  );
  for (let column = 0; column < spec.size; column++) {
    const first = column * NUMBERS_PER_COLUMN + 1;
    const picked = pickDistinct(NUMBERS_PER_COLUMN, spec.size, random);
    picked.forEach((offset, row) => {
      const cell = row * spec.size + column;
      if (cell !== spec.free) cells[cell] = BingoNumber.parse(first + offset);
    });
  }
  return Card.parse({ layout, cells });
}

/** 0 〜 n-1 から count 個を重複なく選ぶ（選んだ順に並べる。フィッシャー–イェーツの途中まで） */
function pickDistinct(
  n: number,
  count: number,
  random: () => number,
): number[] {
  const pool = [...Array(n).keys()];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (n - i));
    const a = pool[i];
    const b = pool[j];
    if (a === undefined || b === undefined) throw new Error("範囲の外");
    pool[i] = b;
    pool[j] = a;
  }
  return pool.slice(0, count);
}

/** 番号があるマスの位置。カードに無ければ null */
export function cellOf(card: Card, n: BingoNumber): CellIndex | null {
  const i = card.cells.indexOf(n);
  return i === -1 ? null : CellIndex.parse(i);
}

/** マスの番号。FREE のマスなら null */
export function numberAt(card: Card, cell: CellIndex): BingoNumber | null {
  return card.cells[cell] ?? null;
}

/** ゲーム開始時に開いているマス（FREE のマスだけ） */
export function initialMask(layout: CardLayout): CellMask {
  const free = LAYOUTS[layout].free;
  return free === null ? EMPTY_MASK : openCell(EMPTY_MASK, free);
}

/**
 * 抽選済みの番号があるマス（と FREE）の集合。押したかどうかは関係ない。
 * 逆ビンゴの脱落の判定と、逆ビンゴの確率・ランキングの計算に使う
 */
export function drawnMask(
  card: Card,
  drawn: ReadonlySet<BingoNumber>,
): CellMask {
  let mask = initialMask(card.layout);
  card.cells.forEach((n, i) => {
    if (n !== null && drawn.has(n)) mask = openCell(mask, CellIndex.parse(i));
  });
  return mask;
}

/** 開けたマスの集合で、完成しているラインの本数 */
export function completedLines(layout: CardLayout, opened: CellMask): number {
  return countCompletedLines(opened, LAYOUTS[layout].lines);
}
