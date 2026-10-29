import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { PNG } from 'pngjs';
import { OFFLINE_QUERY, portClosed } from './smoke-offline-support.mjs';
import { OBSERVERS, assertObserver, comparable, finishCleanup } from './art-observer-support.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),output=process.env.FPS_OBSERVER_OUTPUT;
if(!output)throw new Error('Run capture-art-observers.mjs, not worker directly');
const identity=JSON.parse(readFileSync(join(output,'source-build.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={passed:false,...identity,shots:[],normalStartup:[],errors:[],cleanup:{},scope:'observer material/occlusion; no player reachability or feel acceptance; existing normal interactive smoke reused separately'};
let browser,server,port;
async function bounded(action){let timer;try{return await Promise.race([action(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('cleanup timeout')),15000);})]);}finally{clearTimeout(timer);}}
try {
 server=await preview({configFile:false,root,build:{outDir:'web-dist'},preview:{host:'127.0.0.1',port:0,open:false}});
 const address=server.httpServer.address();assert.ok(address&&typeof address!=='string');port=address.port;
 const base=`http://127.0.0.1:${port}`;
 const launch={headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'],...(process.env.FPS_CAPTURE_CHROMIUM?{executablePath:process.env.FPS_CAPTURE_CHROMIUM}:{channel:'chromium'})};
 report.launch=launch;browser=await chromium.launch(launch);report.browserVersion=browser.version();
 const context=await browser.newContext({viewport:{width:1365,height:900},deviceScaleFactor:1,locale:'en-US',timezoneId:'UTC'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
 const newPage=async()=>{const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('requestfailed',r=>report.errors.push(`${r.url()} ${r.failure()?.errorText}`));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});return page;};
 const baseline=new Map(),pixelBaseline=new Map();
 for(const name of OBSERVERS)for(const art of [false,true])for(let repeat=1;repeat<=2;repeat++){
  const page=await newPage();const query=OFFLINE_QUERY+`&artCapture=${name}`+(art?'&art=standards-v1':'');
  await page.goto(base+'/'+query,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__offlineArtCapture?.ready||window.__offlineArtCapture?.error,null,{timeout:120000});
  await page.locator('#boot').waitFor({state:'hidden'});
  const meta=await page.evaluate(()=>window.__offlineArtCapture);
  const label=`${name}-${art?'art':'base'}-r${repeat}`,dir=join(output,label);mkdirSync(dir);
  // Preserve non-GPU and error metadata before failing; no alternate launch follows.
  writeFileSync(join(dir,'metadata.json'),JSON.stringify(meta,null,2)+'\n');
  assert.equal(meta.error,undefined);assertObserver(meta,name,art);
  assert.equal(await page.evaluate(()=>typeof window.fpsClient),'undefined');
  const bundle=new URL(meta.build);assert.equal(bundle.origin,base);
  assert.ok(identity.build.some(f=>f.path==='web-dist'+bundle.pathname),'Capture bundle must be in exact build inventory');
  await page.waitForTimeout(150);assert.deepEqual(await page.evaluate(()=>window.__offlineArtCapture),meta);
  const comparison=comparable(meta);if(baseline.has(name))assert.deepEqual(comparison,baseline.get(name),'Same camera/state/commands/raw renderer across art/repeats');else baseline.set(name,comparison);
  if(report.shots.length)assert.deepEqual(meta.renderer,report.shots[0].metadata.renderer,'Single raw renderer for all views');
  const png=await page.screenshot({animations:'disabled'}),pixels=PNG.sync.read(png);
  assert.equal(pixels.width,1365);assert.equal(pixels.height,900);
  const colors=new Set();for(let i=0;i<pixels.data.length;i+=16)colors.add(`${pixels.data[i]>>3},${pixels.data[i+1]>>3},${pixels.data[i+2]>>3}`);assert.ok(colors.size>32,'Blank/loading frame');
  const entry={label,query,sourceCommit:identity.sourceCommit,sourceTree:identity.sourceTree,metadata:meta,pngSha256:hash(png),rgbaSha256:hash(pixels.data)};
  writeFileSync(join(dir,'frame.png'),png,{flag:'wx'});writeFileSync(join(dir,'manifest.json'),JSON.stringify(entry,null,2)+'\n',{flag:'wx'});report.shots.push(entry);
  const key=`${name}-${art}`;if(pixelBaseline.has(key))assert.equal(entry.rgbaSha256,pixelBaseline.get(key),'Repeat must be pixel-identical');else pixelBaseline.set(key,entry.rgbaSha256);
  assert.deepEqual(report.errors,[]);await page.close();
 }
 // Changed entry/View lifecycle regression only. No pointer or keyboard simulation.
 // Prior real input/round/restart proof stays in its original report, not relabeled as new coverage.
 for(const art of [false,true]){
  const page=await newPage();await page.goto(base+'/'+OFFLINE_QUERY+(art?'&art=standards-v1':''));
  await page.waitForFunction(()=>window.fpsClient?.state().ready);await page.locator('#boot').waitFor({state:'hidden'});
  if(art)await page.waitForFunction(()=>window.fpsClient.state().art?.active===true);
  const normal=await page.evaluate(()=>({state:window.fpsClient.state(),snapshot:window.fpsClient.snapshot(),capture:typeof window.__offlineArtCapture}));
  assert.equal(normal.capture,'undefined');assert.equal(normal.snapshot.tick,0);assert.equal(normal.snapshot.actors.length,10);
  assert.equal(normal.state.environment.active,true);assert.equal(normal.state.squads.botIds.length,9);
  if(art)assert.equal(normal.state.art.active,true);
  report.normalStartup.push({art,...normal});assert.deepEqual(report.errors,[]);await page.close();
 }
 assert.equal(report.shots.length,8);report.passed=true;
}catch(error){report.errors.push(String(error.stack??error));}
finally{
 const errors=await finishCleanup([
  ['browser',async()=>{if(browser){await bounded(()=>browser.close());report.cleanup.browserDisconnected=!browser.isConnected();assert.equal(report.cleanup.browserDisconnected,true);}}],
  ['preview',async()=>{if(server){await bounded(()=>new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve())));report.cleanup.previewPortClosed=await portClosed(port);assert.equal(report.cleanup.previewPortClosed,true);}}],
 ]);
 report.errors.push(...errors);if(report.errors.length)report.passed=false;
 writeFileSync(join(output,'capture.json'),JSON.stringify(report,null,2)+'\n');
 if(!report.passed)process.exitCode=1;
 // Timeout/close failures may leave a child alive; never claim exit. Wrapper records real browser log.
 if(errors.length)process.exit(1);
}
