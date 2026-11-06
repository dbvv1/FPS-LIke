import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {preview} from 'vite';

// No screenshots, sound playback, injected gameplay or remote requests. The
// only fault injection is the browser's actual WEBGL_lose_context extension.
const report={scope:'Built default client: normal input, real WebGL context loss, terminal guards, fresh reload. Synthetic pageshow tests guards, not BFCache admission.',stages:[],pageErrors:[]};
let server,browser;
try{
 server=await preview({configFile:false,root:process.cwd(),build:{outDir:'web-dist'},preview:{host:'127.0.0.1',port:0,open:false}});
 const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 const noSandbox=process.env.FPS_CLOUD_NO_SANDBOX==='1';
 const launch={headless:true,executablePath:process.env.FPS_SMOKE_CHROMIUM||'/usr/bin/chromium',chromiumSandbox:!noSandbox,ignoreDefaultArgs:['--enable-unsafe-swiftshader'],args:['--use-angle=swiftshader']};
 report.launch={headless:true,chromiumSandbox:launch.chromiumSandbox,ignoreDefaultArgs:launch.ignoreDefaultArgs,args:launch.args};
 browser=await chromium.launch(launch);report.browser=browser.version();
 const page=await browser.newPage({viewport:{width:1365,height:900}});page.setDefaultTimeout(20000);page.on('pageerror',error=>report.pageErrors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));
 await page.addInitScript(()=>{
  const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window),pending=new Set();let calls=0;
  window.requestAnimationFrame=callback=>{let id;id=request(time=>{pending.delete(id);calls++;callback(time);});pending.add(id);return id;};
  window.cancelAnimationFrame=id=>{pending.delete(id);cancel(id);};
  window.terminalFrameReceipt=()=>({calls,pending:pending.size});
 });
 await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.fpsClient?.state().ready);
 const initial=await page.evaluate(()=>({state:window.fpsClient.state(),snapshot:window.fpsClient.snapshot()}));
 assert.equal(initial.state.backend,'three-webgl2');assert.equal(initial.snapshot.actors.length,10);
 await page.locator('#audio').uncheck();await page.locator('#start').click();
 await page.waitForFunction(()=>window.fpsClient.state().running&&window.fpsClient.snapshot().tick>=15);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.fpsClient.state().running);
 const paused=await page.evaluate(()=>({state:window.fpsClient.state(),tick:window.fpsClient.snapshot().tick}));assert.equal(paused.state.ready,true);
 await page.locator('#start').click();await page.waitForFunction(t=>window.fpsClient.snapshot().tick>t+10,paused.tick);
 const before=await page.evaluate(()=>({tick:window.fpsClient.snapshot().tick,frames:window.terminalFrameReceipt()}));
 const loss=await page.evaluate(()=>{const gl=document.querySelector('#stage').getContext('webgl2');const renderer=gl.getParameter(gl.RENDERER),vendor=gl.getParameter(gl.VENDOR);const debug=gl.getExtension('WEBGL_debug_renderer_info');const unmasked=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null;const ext=gl.getExtension('WEBGL_lose_context');if(!ext)throw new Error('WEBGL_lose_context unavailable');ext.loseContext();return{renderer,vendor,unmasked};});
 await page.waitForFunction(()=>!window.fpsClient.state().ready&&!document.querySelector('#fatal').hidden);
 const stopped=await page.evaluate(()=>({state:window.fpsClient.state(),tick:window.fpsClient.snapshot().tick,frames:window.terminalFrameReceipt(),fatal:document.querySelector('#fatal').textContent,menu:document.querySelector('#menu').open}));
 assert.equal(stopped.state.running,false);assert.equal(stopped.state.locked,false);assert.equal(stopped.frames.pending,0);assert.equal(stopped.menu,false);
 await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));document.querySelector('#pause-button').click();});
 await page.setViewportSize({width:1100,height:760});await page.waitForTimeout(250);
 const after=await page.evaluate(()=>({state:window.fpsClient.state(),tick:window.fpsClient.snapshot().tick,frames:window.terminalFrameReceipt()}));
 assert.equal(after.state.ready,false);assert.equal(after.state.running,false);assert.equal(after.tick,stopped.tick);assert.deepEqual(after.frames,stopped.frames);
 report.stages.push({name:'play-pause-resume-real-context-loss',before,loss,stopped:{tick:stopped.tick,ready:stopped.state.ready,running:stopped.state.running,locked:stopped.state.locked,frames:stopped.frames,fatal:stopped.fatal},after:{tick:after.tick,frames:after.frames}});
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.fpsClient?.state().ready);
 assert.equal(await page.locator('#fatal').isVisible(),false);await page.locator('#audio').uncheck();await page.locator('#start').click();await page.waitForFunction(()=>window.fpsClient.state().running&&window.fpsClient.snapshot().tick>=10);
 report.stages.push({name:'fresh-reload-plays',...await page.evaluate(()=>({ready:window.fpsClient.state().ready,running:window.fpsClient.state().running,tick:window.fpsClient.snapshot().tick,backend:window.fpsClient.state().backend}))});
 assert.deepEqual(report.pageErrors,[]);report.complete=true;
}catch(error){report.failure=String(error.stack??error);process.exitCode=1;}
finally{await browser?.close();if(server){server.httpServer.closeAllConnections();await new Promise(resolve=>server.httpServer.close(resolve));}await mkdir('outputs/client-terminal',{recursive:true});await writeFile('outputs/client-terminal/browser-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
