const clamp01 = v => Math.max(0, Math.min(1, v));
export function addCurvePoint(points, x, y) {
  if (points.length >= 32 || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const curve = points.map(p => [...p]);
  x = clamp01(x); y = clamp01(y);
  // Keep a strictly increasing input domain, as required by the native engine.
  if (curve.some(p => Math.abs(p[0] - x) < 0.005)) return null;
  const index = curve.findIndex(p => p[0] > x);
  const at = index < 0 ? curve.length : index;
  curve.splice(at, 0, [x, y]);
  return { curve, index: at };
}
export function moveCurvePoint(points, index, x, y) {
  if (!points[index] || !Number.isFinite(x) || !Number.isFinite(y)) return points;
  const curve = points.map(p => [...p]);
  const gap = index > 0 && index < curve.length - 1 ? (curve[index + 1][0] - curve[index - 1][0]) / 4 : 0.001;
  const epsilon = Math.min(0.001, gap);
  const low = index ? curve[index - 1][0] + epsilon : 0;
  const high = index < curve.length - 1 ? curve[index + 1][0] - epsilon : 1;
  curve[index] = [index === 0 ? 0 : index === curve.length - 1 ? 1 : Math.max(low, Math.min(high, x)), clamp01(y)];
  return curve;
}
