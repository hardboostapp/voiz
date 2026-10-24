const {test}=require('node:test'),assert=require('node:assert/strict');
test('automatic update checks throttle window events and preserve a ready update',async()=>{
  const {createAutoUpdate}=await import('../app/auto-update.mjs');let clock=0,calls=0,status='idle',renders=0,release;
  const check=createAutoUpdate({now:()=>clock,snapshot:async()=>({status}),check:async()=>{calls++;await new Promise(r=>release=r);return {status:'current'};},render:()=>renders++});
  const first=check();await Promise.resolve();await Promise.all([check(),check()]);assert.equal(calls,1);release();await first;assert.equal(renders,1);
  await check();assert.equal(calls,1);clock=300001;status='ready';await check();assert.equal(calls,1);
  status='current';const second=check();await Promise.resolve();release();await second;assert.equal(calls,2);
});
