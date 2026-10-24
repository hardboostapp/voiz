export function createAutoUpdate({snapshot,check,render,now=Date.now,interval=5*60*1000}) {
  let last=-Infinity,busy=false;
  return async function() {
    if(busy||now()-last<interval)return;
    busy=true;
    try {
      const state=await snapshot();
      if(['checking','downloading','ready','installing'].includes(state.status))return;
      last=now();render(await check());
    }catch{}finally{busy=false;}
  };
}
