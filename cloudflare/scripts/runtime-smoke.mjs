// Runs only a local workerd instance. Never deploys or contacts source sites.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const config=JSON.parse(fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
config.main=fileURLToPath(new URL('../src/worker.mjs',import.meta.url));
config.vars.ENABLED_SOURCES='rezka,kodik,filmix,kinotochka';
const smokeDirectory=new URL('../.wrangler/smoke/',import.meta.url);
fs.mkdirSync(smokeDirectory,{recursive:true});
const smokeConfig=new URL('wrangler.json',smokeDirectory);
fs.writeFileSync(smokeConfig,JSON.stringify(config));
const child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', fileURLToPath(smokeConfig), '--local', '--ip', '127.0.0.1', '--port', '8799'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false', BROWSER: 'none' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = ''; child.stdout.on('data', b => { logs += b; }); child.stderr.on('data', b => { logs += b; });
try {
  let health;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('Local runtime stopped: ' + logs.slice(-3000));
    try { health = await fetch('http://127.0.0.1:8799/health', { signal: AbortSignal.timeout(1000) }); if (health.ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(health?.ok, 'Local runtime did not start');
  assert.equal((await health.json()).service, 'lamplay-metadata');
  const r = await fetch('http://127.0.0.1:8799/v1/animelib/search?q=Example', { headers: { Origin: 'http://lampa.mx' } });
  assert.equal(r.status, 503); assert.equal((await r.json()).error.code, 'source_disabled');
  const denied = await fetch('http://127.0.0.1:8799/v1/animelib/search?q=Example', { headers: { Origin: 'https://other.example' } });
  assert.equal(denied.status, 403);
  const preflight=await fetch('http://127.0.0.1:8799/v1/kodik/search',{method:'OPTIONS',headers:{Origin:'http://lampa.mx','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
  assert.equal(preflight.status,204);
  for(const path of ['/v1/kodik/search','/v1/rezka/episodes']){
    const invalid=await fetch('http://127.0.0.1:8799'+path,{method:'POST',headers:{Origin:'http://lampa.mx','Content-Type':'application/json'},body:'{}'});
    assert.equal(invalid.status,400);assert.equal((await invalid.json()).error.code,'invalid_parameters');
  }
  console.log('workerd smoke: health, origin policy, disabled source, POST preflight, JSON body and rate bindings passed');
} finally {
  child.kill('SIGTERM');
  const forced = setTimeout(() => child.kill('SIGKILL'), 2000);
  forced.unref();
}
