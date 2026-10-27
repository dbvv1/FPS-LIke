import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {preview} from 'vite';
const root=process.cwd(),out=resolve(root,'outputs/menu-focus/candidate');await mkdir(out,{recursive:true});
const report={method:'Real CPU-fallback client: native dialog focus, settings apply/cancel, keyboard entry, actual pointer-lock pause/reentry; narrow existing UI. No simulation state injected.',errors:[],stages:[]};let browser,server,page;
const focus=()=>page.evaluate(()=>({id:document.activeElement?.id,tag:document.activeElement?.tagName,menu:!!document.activeElement?.closest('#menu'),settings:document.querySelector('#aim-settings').open,locked:window.fpsClient.state().locked,running:window.fpsClient.state().running}));
async function record(label){report.stages.push({label,...await focus()});}
try {
 server=await preview({configFile:false,root,build:{outDir:'web-dist'},preview:{host:'127.0.0.1',port:0,open:false}});const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 const launch={headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],executablePath:process.env.FPS_SMOKE_CHROMIUM||'/usr/bin/chromium',args:['--disable-webgl']};report.requestedLaunch=launch;
 browser=await chromium.launch(launch);report.browser=browser.version();page=await browser.newPage({viewport:{width:1365,height:900}});page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(String(e)));
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
 await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fpsClient?.state().ready);
 assert.equal(await page.evaluate(()=>window.fpsClient.state().backend),'canvas2d-cpu');
 assert.equal((await focus()).id,'start');await record('ready');
 for(const key of ['Tab','Shift+Tab'])for(let i=0;i<12;i++){
   await page.keyboard.press(key);const f=await focus();assert.notEqual(f.id,'stage');assert.notEqual(f.id,'pause-button');await record(key+'-'+i);
 }
 await page.locator('#aim-settings summary').click();await page.keyboard.press('Tab');
 assert.equal((await focus()).id,'aim-sensitivity');await page.keyboard.press('ArrowRight');
 await page.locator('#start').click();assert.equal((await focus()).id,'aim-apply');assert.equal((await focus()).running,false);
 await page.keyboard.press('Escape');assert.equal((await focus()).settings,false);assert.equal((await focus()).tag,'SUMMARY');
 assert.equal(await page.locator('#aim-current').textContent(),'1.00×');await record('escape-cancels-draft');
 await page.keyboard.press('Enter');assert.equal((await focus()).settings,true);await page.keyboard.press('Tab');await page.keyboard.press('ArrowRight');
 await page.locator('#aim-cancel').click();assert.equal(await page.locator('#aim-current').textContent(),'1.00×');
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.equal((await focus()).id,'start');
 assert.equal(await page.locator('#menu').evaluate(e=>e.open),true);
 await page.locator('#audio').uncheck();await page.keyboard.press('Escape');assert.equal((await focus()).id,'start');await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.fpsClient.state().locked&&window.fpsClient.state().running);await record('playing');
 assert.equal(await page.locator('#menu').evaluate(e=>e.open),false);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.fpsClient.state().locked&&!window.fpsClient.state().running);
 assert.equal((await focus()).id,'start');await record('paused');
 await page.keyboard.press('Enter');await page.waitForFunction(()=>window.fpsClient.state().locked&&window.fpsClient.state().running);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.fpsClient.state().locked);assert.equal((await focus()).id,'start');
 await page.locator('#aim-settings summary').click();await page.keyboard.press('Tab');await page.keyboard.press('ArrowRight');await page.keyboard.press('Tab');assert.equal((await focus()).id,'aim-apply');await page.keyboard.press('Enter');
 assert.equal(await page.locator('#aim-current').textContent(),'1.05×');await record('keyboard-apply');
 await page.screenshot({path:resolve(out,'wide-settings.png')});
 await page.setViewportSize({width:390,height:844});
 await page.locator('#aim-sensitivity').focus();await page.screenshot({path:resolve(out,'narrow-settings.png')});
 report.narrow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.querySelector('#menu').scrollWidth}));
 assert.ok(report.narrow.scrollWidth<=report.narrow.width);
 assert.ok(await page.evaluate(()=>document.querySelector('#diagnostics').getBoundingClientRect().top>=document.querySelector('.menu-card').getBoundingClientRect().bottom));
 // Real existing UI at 200% CSS zoom (not a substitute for browser/OS text scaling).
 await page.addStyleTag({content:'#menu{zoom:2}'});await page.locator('#aim-cancel').focus();
 await page.screenshot({path:resolve(out,'narrow-zoom2.png')});
 report.zoom=await page.locator('#aim-cancel').boundingBox();assert.ok(report.zoom&&report.zoom.x>=0&&report.zoom.x+report.zoom.width<=390);
 assert.deepEqual(report.errors,[]);
 // Synthetic lifecycle event tests the error UI only, not a real GPU context loss.
 await page.locator('#stage').dispatchEvent('webglcontextlost',{cancelable:true});
 await page.waitForFunction(()=>!document.querySelector('#fatal').hidden);
 assert.equal(await page.locator('#menu').evaluate(e=>e.open),false);
 await page.screenshot({path:resolve(out,'synthetic-error.png')});report.complete=true;
} catch(e){report.failure=String(e.stack??e);if(page){report.failedFocus=await focus().catch(()=>null);await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});}process.exitCode=1;} finally {await browser?.close();if(server){server.httpServer.closeAllConnections();await new Promise(r=>server.httpServer.close(r));}report.endedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
