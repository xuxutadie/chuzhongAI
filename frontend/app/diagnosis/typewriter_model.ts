export function createTypingTimeline(text: string) {
  // 按可见字素切分，避免表情、组合音标在逐字显示时被截断。
  const characters = Array.from(new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text), item => item.segment);
  let elapsed = 0;
  const times = characters.map((_, index) => {
    const previous = characters[index - 1] ?? "";
    elapsed += /[。！？!?\n]/u.test(previous) ? 220 : /[，、；：,;:]/u.test(previous) ? 150 : 40;
    return elapsed;
  });
  const scale = elapsed > 6000 ? 6000 / elapsed : 1;
  return { text, characters, times: times.map(time => time * scale), duration: Math.min(elapsed, 6000) };
}

export function typingFrame(timeline: ReturnType<typeof createTypingTimeline>, elapsed: number, immediate = false) {
  if (immediate || elapsed >= timeline.duration) return { text: timeline.text, typing: false };
  const count = timeline.times.filter(time => time <= elapsed).length;
  return { text: timeline.characters.slice(0, count).join(""), typing: true };
}
