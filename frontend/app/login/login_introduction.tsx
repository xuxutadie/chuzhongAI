import styles from './login-blueprint.module.css';

const features = ['AI 答疑', '互动教学', '日常练习', '章节复习', '错题整理', '学习报告'];

export function LoginIntroduction() {
  return <section className={styles.hero} aria-labelledby="login-title">
    <div className={styles.brand}>
      <span className={styles.brandMark} aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M5 7.5h6a5 5 0 0 1 5 5v13a7 7 0 0 0-5-2H5V7.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M27 7.5h-6a5 5 0 0 0-5 5v13a7 7 0 0 1 5-2h6V7.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M10 13h2m-2 5h2m8-5h2m-2 5h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <div><strong>初中学习教练</strong><span>我的学习空间</span></div>
      <span className={styles.brandTag}>学习实验室</span>
    </div>
    <div className={styles.introduction}>
      <p className={styles.eyebrow}>保持好奇 · 一起探索</p>
      <h1 id="login-title">今天，<br /><span>又懂一点点。</span></h1>
      <p className={styles.description}>把不懂的变成懂的，把会做的变成拿手的。<br />从今天的一道题，开始自己的学习探索。</p>
    </div>
    {/* 数学蓝图仅作视觉装饰，不是学生真实成绩或可点击功能。 */}
    <div className={styles.blueprintArt} aria-hidden="true">
      <div className={styles.artHeading}><span>好奇心，有自己的路线</span><span>＋</span></div>
      <svg viewBox="0 0 520 146" fill="none" focusable="false">
        <path d="M24 117H492M46 132V23" stroke="currentColor" strokeOpacity=".45" strokeDasharray="4 5" />
        <path d="M48 108C101 108 96 43 154 54S221 108 274 71S327 25 370 49S424 61 470 22" stroke="#ffdb43" strokeWidth="5" strokeLinecap="round" />
        <circle cx="154" cy="54" r="9" fill="#ff815e" stroke="#152b56" strokeWidth="2" />
        <circle cx="274" cy="71" r="9" fill="#6be7ba" stroke="#152b56" strokeWidth="2" />
        <circle cx="370" cy="49" r="9" fill="#ffffff" stroke="#152b56" strokeWidth="2" />
        <path d="m469 23-13 4m13-4-4 14" stroke="#ffdb43" strokeWidth="4" strokeLinecap="round" />
        <path d="m78 38 9-15 9 15H78Z" stroke="currentColor" strokeWidth="2" />
        <circle cx="425" cy="106" r="15" stroke="currentColor" strokeWidth="2" />
        <path d="M411 100h28m-25 15 21-19" stroke="currentColor" strokeOpacity=".6" />
      </svg>
      <span className={styles.artSticker}>每一步，都算数！</span>
    </div>
    <section className={styles.capabilities} aria-labelledby="capabilities-title">
      <h2 id="capabilities-title">不止测评，还有这些学习方式</h2>
      <ul aria-label="部分学习功能">{features.map((label, index) => <li key={label}><span aria-hidden="true">{['✦','◇','＋','▤','✓','▥'][index]}</span>{label}</li>)}</ul>
    </section>
    <p className={styles.accountHint}>使用老师发放的账号，或自主注册、连接自己的 AI 服务。学习进度、草稿和错题都会随账号保存。</p>
    <p className={styles.firstVisit}><span>首次使用</span>认识你 → 衔接测评 → 诊断报告</p>
  </section>;
}
