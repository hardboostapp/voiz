const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {Resources}=require('../app/resources.cjs');
const {prepareRuntime}=require('../app/engine-runtime.cjs');
const {engineExecutable}=require('../app/installation.cjs');
(async()=>{
  const resources=new Resources(root,value=>console.log(value.message));
  await resources.sync();
  prepareRuntime(engineExecutable(root),root,value=>console.log(value.message));
  console.log('Motor e vozes prontos. Nenhum microfone foi aberto.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
