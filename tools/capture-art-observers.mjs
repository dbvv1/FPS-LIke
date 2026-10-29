// Serial headless-only runner. No browser fallback, external base, input or state injection.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { browserExitReceipt } from './smoke-offline-support.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const hash=b=>createHash('sha256').update(b).digest('hex');
const sourceCommit=git('rev-parse','HEAD'),sourceTree=git('rev-parse','HEAD^{tree}');
const parent=join(root,'outputs/art-observers');mkdirSync(parent,{recursive:true});
const output=mkdtempSync(join(parent,sourceCommit.slice(0,12)+'-'));
const manifest={passed:false,sourceCommit,sourceTree,output,build:[],errors:[],qualityAcceptance:'not-performed'};
try {
 assert.equal(process.argv.length,2,'No alternate routes, headed option or external base accepted');
 assert.equal(git('status','--porcelain'),'','Source must be committed and clean');
 const command=process.platform==='win32'?(process.env.ComSpec||'cmd.exe'):'npm';
 const args=process.platform==='win32'?['/d','/s','/c','npm.cmd run build']:['run','build'];
 const build=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true});
 writeFileSync(join(output,'build.log'),(build.stdout??'')+(build.stderr??''));assert.equal(build.status,0,'Build failed');
 function walk(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())walk(path);else manifest.build.push({path:relative(root,path).replaceAll('\\','/'),sha256:hash(readFileSync(path))});}}
 walk(join(root,'web-dist'));
 writeFileSync(join(output,'source-build.json'),JSON.stringify({sourceCommit,sourceTree,build:manifest.build},null,2));
 const run=spawnSync(process.execPath,['tools/capture-art-observers-worker.mjs'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024,env:{...process.env,DEBUG:'pw:browser',FPS_OBSERVER_OUTPUT:output}});
 const log=(run.stdout??'')+(run.stderr??'');writeFileSync(join(output,'browser.log'),log);
 manifest.workerStatus=run.status;manifest.workerSignal=run.signal;
 manifest.worker=JSON.parse(readFileSync(join(output,'capture.json'),'utf8'));
 assert.equal(run.status,0,'Capture worker failed; no retry or browser switch');
 manifest.browserExit=browserExitReceipt(log);assert.equal(manifest.worker.passed,true);
 assert.equal(git('rev-parse','HEAD'),sourceCommit);assert.equal(git('status','--porcelain'),'');
 for(const file of manifest.build)assert.equal(hash(readFileSync(join(root,file.path))),file.sha256);
 manifest.passed=true;
}catch(error){manifest.errors.push(String(error.stack??error));process.exitCode=1;}
finally{writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log(output);}
