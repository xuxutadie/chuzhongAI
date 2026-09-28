import test from 'node:test';
import assert from 'node:assert/strict';
test('隔离验收构建不覆盖正在运行的默认输出目录',async()=>{
 const previous=process.env.NEXT_DIST_DIR;
 try{process.env.NEXT_DIST_DIR='.next-route-qa';const {default:config}=await import('../next.config.ts?route-qa-test');assert.equal(config.distDir,'.next-route-qa');}
 finally{if(previous===undefined)delete process.env.NEXT_DIST_DIR;else process.env.NEXT_DIST_DIR=previous;}
});
