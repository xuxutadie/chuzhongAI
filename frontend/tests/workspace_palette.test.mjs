import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const css = fs.readFileSync(new URL('../app/workspace-refinement.css', import.meta.url), 'utf8');
function token(name) {
  const value = css.match(new RegExp(`--study-${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  assert.ok(value, `缺少可验证的功能色：${name}`);
  return value;
}
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
for (const color of ['blue', 'green', 'orange', 'purple', 'cyan']) {
  test(`${color} 功能色的白字按钮与浅底文字都保持可读`, () => {
    assert.ok(contrast(token(color), '#ffffff') >= 4.5);
    assert.ok(contrast(token(color), token(`${color}-soft`)) >= 4.5);
  });
}
