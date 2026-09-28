/** SVG 采用向下的 y 轴，角度顺时针增加，与题图数据一致。 */
export function sectorPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const point = (angle: number) => [cx + r * Math.cos(angle * Math.PI / 180), cy + r * Math.sin(angle * Math.PI / 180)];
  const [sx, sy] = point(startAngle);
  const [ex, ey] = point(endAngle);
  return `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${endAngle - startAngle > 180 ? 1 : 0} 1 ${ex} ${ey} Z`;
}
