const {spawnSync}=require('child_process');
const tests=['lamplay.test','lamplay-providers','lamplay-browser','lamplay-ui-regressions','lamplay-060-regressions','lamplay-070-regressions','lamplay-019-logic','lamplay-020-logic','lamplay-021-kodik','lamplay-022-regressions','lamplay-023-transport','lamplay-023-regressions','lamplay-023-browser','lamplay-024-regressions'];
const failed=[];
for(const name of tests){console.log('\nSUITE',name);const r=spawnSync(process.execPath,[__dirname+'/'+name+'.cjs'],{stdio:'inherit',timeout:120000});if(r.status!==0){failed.push(name);console.error('FAILED',name,r.error?.message||r.signal||r.status);}}
console.log('SUITES',tests.length,'FAILED',failed);process.exitCode=failed.length?1:0;
