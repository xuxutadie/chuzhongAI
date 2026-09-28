import { routeCards } from '../learning-route/model.js';
import type { LearningRoute } from '../learning-route/types';
import styles from './learning_route_map.module.css';

type Props = {
  route: LearningRoute | null;
  busy: boolean;
  error: boolean;
  onOpen: (step: number) => void;
};

export function LearningRouteMap({ route, busy, error, onOpen }: Props) {
  const cards = routeCards(route);
  const completed = cards.filter(card => ['completed', 'not_required'].includes(card.status)).length;
  return <section className={styles.map} aria-label="学习路线图">
    <div className={styles.mapHeader}>
      <div><span className={styles.eyebrow}>探索 · 理解 · 掌握</span><p>每一步，都算数。</p></div>
      <span className={styles.counter}>{route ? `${completed} / 5 已完成` : error ? '进度暂不可用' : '正在恢复进度…'}</span>
    </div>
    <ol className={styles.stations} aria-label="今天的五步学习" aria-busy={!route && !error}>
      {cards.map((card, index) => {
        const current = route?.current_step === card.step;
        const done = ['completed', 'not_required'].includes(card.status);
        const state = !route ? 'pending' : done ? 'done' : current ? 'current' : 'locked';
        return <li key={card.step} className={styles.station} data-state={state} aria-current={current ? 'step' : undefined}>
          {/* 每段曲线跟随所在行的高度伸缩，文字换行也不会使站点脱离路线。 */}
          {index < cards.length - 1 && <svg className={styles.connector} viewBox="0 0 120 140" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path d={index % 2 === 0 ? 'M38 0 C38 70 82 70 82 140' : 'M82 0 C82 70 38 70 38 140'} />
          </svg>}
          <div className={styles.node} aria-hidden="true">{done ? '✓' : card.step}</div>
          <div className={styles.stationCard}>
            <div className={styles.stationMeta}><span>第 {card.step} 站</span><span className={styles.stateLabel}>
              {current ? '你在这里' : done ? card.reason : !route ? '等待进度' : <><svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><rect x="1" y="6" width="10" height="7" rx="2" fill="none" stroke="currentColor" /><path d="M3 6V4a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" /></svg> 未解锁</>}
            </span></div>
            <h2>{card.title}</h2>
            <div className={styles.stationBottom}>
              <p>{!route ? error ? '暂时无法读取' : '正在恢复进度…' : current ? '从这里继续今天的探索' : done ? '随时回来温习' : card.reason}</p>
              <button className={styles.action} disabled={card.disabled || busy} aria-label={`${card.action}：${card.title}`} onClick={() => onOpen(card.step)}>
                {card.action}<span aria-hidden="true">{card.disabled ? '' : ' ↗'}</span>
              </button>
            </div>
          </div>
        </li>;
      })}
    </ol>
    <div className={styles.finish}><span aria-hidden="true">⚑</span> {route?.current_step === null ? '今日探索完成，给坚持的自己一个赞！' : '沿着自己的节奏，走到今天的终点。'}</div>
  </section>;
}
