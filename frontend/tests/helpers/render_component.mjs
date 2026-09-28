import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

// 使用项目已有 TypeScript 和 React，测试页面输出，不引入额外测试依赖。
export function loadComponent(url, boundaries = {}) {
  const filename = fileURLToPath(url);
  const nativeRequire = createRequire(url);
  const exports = {};
  const require = (specifier) => {
    if (Object.hasOwn(boundaries, specifier)) return boundaries[specifier];
    if (!specifier.startsWith('.')) return nativeRequire(specifier);
    if (specifier.endsWith('.json')) return nativeRequire(specifier);
    const base = path.resolve(path.dirname(filename), specifier);
    const resolved = [base, `${base}.tsx`, `${base}.ts`, `${base}.js`].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!resolved) throw new Error(`无法解析测试组件依赖：${specifier}`);
    return loadComponent(new URL(`file:///${resolved.replaceAll('\\', '/')}`), boundaries);
  };
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
    // .mjs 在 TypeScript 中会保留 ESM；测试加载器统一转为 CommonJS。
    fileName: filename.replace(/\.mjs$/, '.js'),
  });
  vm.runInThisContext(`(function(require, exports) { ${outputText}\n})`, { filename })(require, exports);
  return exports;
}
