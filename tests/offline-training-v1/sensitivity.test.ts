import test from 'node:test';
import assert from 'node:assert/strict';
import {MouseSensitivity,SENSITIVITY} from '../../src/candidates/offline-training-v1/input/sensitivity.js';
function memory(){const data=new Map<string,string>([['unrelated','keep']]);let broken=false;return{data,fail(value:boolean){broken=value;},getItem(key:string){if(broken)throw new Error('SecurityError');return data.get(key)??null;},setItem(key:string,value:string){if(broken)throw new Error('QuotaExceededError');data.set(key,value);},removeItem(key:string){if(broken)throw new Error('SecurityError');data.delete(key);}};}
test('original mouse gain stays the default; draft changes require explicit save/apply',()=>{
 const storage=memory(),settings=new MouseSensitivity(()=>storage);assert.equal(settings.value,1);assert.equal(settings.dirty,false);
 settings.edit(.5);assert.equal(settings.draft,.5);assert.equal(settings.value,1);assert.equal(storage.getItem(SENSITIVITY.key),null);assert.equal(settings.dirty,true);
 settings.cancel();assert.equal(settings.value,1);assert.equal(settings.draft,1);assert.equal(settings.dirty,false);
 settings.edit(.5);assert.equal(settings.apply(),true);assert.equal(settings.value,.5);assert.deepEqual(JSON.parse(storage.getItem(SENSITIVITY.key)!),{version:1,value:.5});assert.equal(new MouseSensitivity(()=>storage).value,.5);
});
test('defaults are a draft until applied, then remove the persisted override without touching unrelated storage',()=>{
 const storage=memory(),settings=new MouseSensitivity(()=>storage);settings.edit(2);settings.apply();settings.defaults();assert.equal(settings.draft,1);assert.equal(settings.value,2);settings.cancel();assert.equal(settings.draft,2);
 settings.defaults();settings.apply();assert.equal(settings.value,1);assert.equal(storage.getItem(SENSITIVITY.key),null);assert.equal(storage.getItem('unrelated'),'keep');assert.equal(new MouseSensitivity(()=>storage).value,1);
});
test('storage failure keeps current runtime value and draft available for retry/cancel',()=>{
 const storage=memory(),settings=new MouseSensitivity(()=>storage);settings.edit(.5);storage.fail(true);assert.equal(settings.apply(),false);assert.equal(settings.value,1);assert.equal(settings.draft,.5);assert.equal(settings.dirty,true);assert.match(settings.notice,/保存失败/);
 settings.cancel();assert.equal(settings.dirty,false);settings.edit(.5);storage.fail(false);assert.equal(settings.apply(),true);storage.fail(true);settings.defaults();assert.equal(settings.apply(),false);assert.equal(settings.value,.5);
 const unreadable=new MouseSensitivity(()=>{throw new Error('SecurityError');});assert.equal(unreadable.value,1);assert.match(unreadable.notice,/无法读取/);
});
test('invalid stored data and invalid edits cannot poison mouse angles; quantized round trips are stable',()=>{
 const storage=memory();for(const value of ['invalid','null','[]','{"version":2,"value":0.5}','{"version":1,"value":"0.5"}','{"version":1,"value":1e999}','{"version":1,"value":0}','{"version":1,"value":4}']){storage.data.set(SENSITIVITY.key,value);assert.equal(new MouseSensitivity(()=>storage).value,1,value);}
 storage.data.delete(SENSITIVITY.key);const settings=new MouseSensitivity(()=>storage);for(const value of [NaN,Infinity,-Infinity,0,4])assert.equal(settings.edit(value),false);assert.equal(settings.value,1);
 settings.edit(1.14999999999);assert.equal(settings.draft,1.15);settings.apply();assert.equal(new MouseSensitivity(()=>storage).value,1.15);settings.edit(1.15);assert.equal(settings.dirty,false);
});
