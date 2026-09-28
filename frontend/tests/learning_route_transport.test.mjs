import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

test('五步流程发送 JSON 内容类型，服务端才能解析提交', async()=>{
  const source=await readFile(new URL('../app/learning-route/api.ts',import.meta.url),'utf8');
  // 只替换网络边界，实际执行产品中的 learningPost，再交给标准 Request 解析。
  const isolated=source.replace("import { requestJson } from '../student-api';", "const requestJson=(path,init)=>new Request('http://localhost'+path,init);");
  const compiled=ts.transpileModule(isolated,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
  const {learningPost}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
  const request=learningPost('/route/start',{request_id:'test'});
  assert.equal(request.headers.get('content-type'),'application/json');
  assert.deepEqual(await request.json(),{request_id:'test'});
});
