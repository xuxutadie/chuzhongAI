import type { Diagram } from "./model";
import { sectorPath } from "./diagram_geometry";
import styles from "./diagnosis.module.css";

export function QuestionDiagram({ diagram }: { diagram?: Diagram }) {
  if (!diagram) return null;
  return <figure className={styles.questionFigure}>
    <svg viewBox={`0 0 ${diagram.width} ${diagram.height}`} role="img" aria-label={diagram.alt}>
      {diagram.elements.map((item, index) => {
        if (item.kind === "text") return <text key={index} x={item.x} y={item.y} textAnchor="middle" fontSize="15" fill="#17334c">{item.text}</text>;
        if (item.kind === "line") return <line key={index} x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke="#17334c" strokeWidth="2" strokeDasharray={item.dashed ? "6 5" : undefined} />;
        if (item.kind === "circle") return <circle key={index} cx={item.cx} cy={item.cy} r={item.r} fill="none" stroke="#17334c" strokeWidth="2" />;
        if (item.kind === "sector") return <path key={index} d={sectorPath(item.cx, item.cy, item.r, item.startAngle, item.endAngle)} fill={item.fill} stroke="#17334c" strokeWidth="2" />;
        return <polygon key={index} points={item.points.map(p => p.join(",")).join(" ")} fill={item.fill || "none"} stroke="#17334c" strokeWidth="2" />;
      })}
    </svg><figcaption>{diagram.caption || "示意图不一定按比例绘制，请以标注为准。"}</figcaption>
  </figure>;
}
