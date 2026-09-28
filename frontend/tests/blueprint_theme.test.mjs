import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 用实际主题色计算对比度；改变配色可以通过，降低可读性才失败。
function tokens() {
  const css = fs.readFileSync(new URL('../app/blueprint-theme.css', import.meta.url), 'utf8');
  return Object.fromEntries([...css.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map(match => [match[1],match[2]]));
}
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value,16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
  return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
}
function contrast(first, second) {
  const values = [luminance(first),luminance(second)].sort((a,b)=>b-a);
  return (values[0]+.05)/(values[1]+.05);
}
test('彩色主按钮的白色文字保持足够对比度', () => {
  const colors = tokens();
  for (const name of ['blue','green','orange','purple','cyan','danger']) {
    const color = colors[`--bp-${name}`];
    assert.ok(color, `${name}必须有语义色`);
    assert.ok(contrast(color,'#ffffff') >= 4.5, `${name}上的白字不可读`);
  }
});
test('彩色卡片、正文与次要文字都保持可读，不用亮色小字', () => {
  const colors = tokens();
  for (const name of ['paper','yellow','blue-soft','green-soft','orange-soft','purple-soft','cyan-soft']) {
    for (const text of ['ink','muted']) assert.ok(contrast(colors[`--bp-${text}`], colors[`--bp-${name}`]) >= 4.5, `${text}/${name}对比度不足`);
  }
});
