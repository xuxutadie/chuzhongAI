import styles from "./interview.module.css";

export function RobotAvatar({ state }: { state: "thinking" | "listening" | "speaking" | "resting" }) {
  return <div className={styles.robot} data-state={state} role="img" aria-label={`彩色 AI 机器人：${state === "thinking" ? "思考中" : state === "speaking" ? "正在提问" : "陪你学习"}`}>
    <svg viewBox="0 0 180 180" aria-hidden="true">
      <ellipse cx="90" cy="166" rx="40" ry="6" fill="#d6e2f0" />
      <g className={styles.robotBody}>
        <path d="M90 35V23" stroke="#1450c8" strokeWidth="6" strokeLinecap="round" />
        <circle cx="90" cy="19" r="9" fill="#ffb800" className={styles.antenna} />
        <g className={styles.waveArm}><path d="M134 121Q158 119 156 91" fill="none" stroke="#ff8a00" strokeWidth="12" strokeLinecap="round" /><circle cx="155" cy="86" r="10" fill="#ffca16" /></g>
        <path d="M47 121Q27 127 32 145" fill="none" stroke="#ff8a00" strokeWidth="12" strokeLinecap="round" />
        <rect x="62" y="114" width="56" height="43" rx="18" fill="#1260f5" />
        <rect x="72" y="124" width="36" height="19" rx="8" fill="#04dfa5" />
        <circle cx="90" cy="133" r="5" fill="#fff" />
        <rect x="26" y="62" width="18" height="33" rx="9" fill="#ff8a00" />
        <rect x="136" y="62" width="18" height="33" rx="9" fill="#ff8a00" />
        <rect x="38" y="34" width="104" height="88" rx="28" fill="#1767ff" stroke="#1046bd" strokeWidth="3" />
        <path d="M55 48Q65 41 78 43" fill="none" stroke="#71b4ff" strokeWidth="5" strokeLinecap="round" />
        <rect x="48" y="51" width="84" height="57" rx="20" fill="#082c68" />
        <g className={styles.eyes} fill="#22f5ed"><rect x="65" y="65" width="12" height="18" rx="6" /><rect x="104" y="65" width="12" height="18" rx="6" /></g>
        <g fill="#ff5983"><ellipse cx="60" cy="88" rx="5" ry="3" /><ellipse cx="121" cy="88" rx="5" ry="3" /></g>
        <rect className={styles.mouth} x="81" y="91" width="18" height="6" rx="3" fill="#22f5ed" />
      </g>
      <g className={styles.speechWaves} fill="none" stroke="#f08000" strokeWidth="4" strokeLinecap="round"><path d="M155 40q10 8 0 16" /><path d="M165 31q18 17 0 34" /></g>
    </svg>
  </div>;
}
