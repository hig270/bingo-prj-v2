/**
 * 木目の線を作る（SVG の path の d 属性の配列）。
 * 毎回同じ模様になるよう、決まった種から作る擬似乱数を使う（描くたびに模様が変わらないように）。
 */
export function grainPaths(
  width: number,
  height: number,
  count: number,
  seed: number,
): string[] {
  let s = seed;
  const random = () => {
    // 線形合同法（見た目のための乱数なので、これで十分）
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => {
    const y = ((i + random() * 0.8) / count) * height;
    const wave = 4 + random() * 10;
    const segments = 4;
    const step = width / segments;
    let d = `M 0 ${y.toFixed(1)}`;
    for (let k = 0; k < segments; k++) {
      const x1 = step * k + step / 3;
      const x2 = step * k + (step * 2) / 3;
      const x3 = step * (k + 1);
      const dy1 = (random() - 0.5) * 2 * wave;
      const dy2 = (random() - 0.5) * 2 * wave;
      d += ` C ${x1.toFixed(1)} ${(y + dy1).toFixed(1)}, ${x2.toFixed(1)} ${(y + dy2).toFixed(1)}, ${x3.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  });
}
