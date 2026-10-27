import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const out=resolve('outputs/menu-focus/transition');await mkdir(out,{recursive:true});
let server,browser;const report={kind:'Real Hud component, synthetic result and controlled lock failure; not a played round or OS permission refusal.',errors:[]};
try {
 server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0,open:false}});await server.listen();
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 browser=await chromium.launch({headless:true,chromiumSandbox:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],executablePath:process.env.FPS_SMOKE_CHROMIUM||'/usr/bin/chromium',args:['--disable-webgl']});
 const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.route('**/focus-fixture',r=>r.fulfill({contentType:'text/html',body:'<canvas id="stage" tabindex="0"></canvas><div id="hud"></div><dialog id="menu" closedby="none"></dialog><div id="fatal" hidden></div>'}));
 await page.goto(origin+'/focus-fixture');
 await page.evaluate(async()=>{
  const {Hud}=await import('/src/ui/hud.ts');const {MouseSensitivity}=await import('/src/input/sensitivity.ts');
  const state={result:{team:'amber',reason:'elimination'},round:1,tick:100};const actor={team:'amber'};
  const rejectedLock=()=>Promise.reject(new DOMException('Controlled test refusal','NotAllowedError'));
  const hud=new Hud(()=>{},()=>{state.result=null;hud.menu(true,state,actor);void rejectedLock().catch(e=>hud.message(e.message));},()=>{},()=>{},new MouseSensitivity(()=>localStorage));
  hud.menu(true,state,actor);window.componentProbe={hud,state,actor};
 });
 assert.equal(await page.evaluate(()=>document.activeElement.id),'next');
 await page.locator('#next').click();await page.waitForFunction(()=>document.querySelector('#lock-error').textContent==='Controlled test refusal');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'start');
 assert.equal(await page.locator('#menu').evaluate(e=>e.open),true);
 await page.locator('#aim-settings summary').click();await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'aim-sensitivity');
 await page.evaluate(()=>{const p=window.componentProbe;p.hud.menu(true,p.state,p.actor);});
 assert.equal(await page.evaluate(()=>document.activeElement.id),'aim-sensitivity');
 await page.locator('#start').focus();await page.evaluate(()=>window.componentProbe.hud.setBusy(true));
 await page.evaluate(()=>window.componentProbe.hud.setBusy(false));
 assert.equal(await page.evaluate(()=>document.activeElement.id),'start');
 assert.deepEqual(report.errors,[]);report.complete=true;
} catch(e){report.failure=String(e.stack??e);process.exitCode=1;}
finally{await browser?.close();await server?.close();report.endedAt=new Date().toISOString();await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
