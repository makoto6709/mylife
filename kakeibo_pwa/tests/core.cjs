'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const storage=new Map();const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,classList:{add(){},remove(){}}});return elements.get(id);};
const ctx=vm.createContext({console,Date,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},document:{getElementById:element,querySelectorAll:()=>[]},window:{addEventListener(){}},navigator:{onLine:true},setTimeout(){}});
// Evaluate production parser and production Sheets implementation, without the browser UI bindings.
vm.runInContext(source.slice(0,source.indexOf('function openEntry')),ctx);
vm.runInContext("function save(){localStorage.setItem(KEY,JSON.stringify(entries))}function tab(){}",ctx);
vm.runInContext(source.slice(source.indexOf('function requestToken'),source.indexOf("$('googleLogin').onclick")),ctx);
const get=code=>vm.runInContext(code,ctx);
const samples=[['500円',{amount:500,category:'未分類',type:'支出'}],['コンビニで500円',{amount:500,category:'食費'}],['昨日スーパーで2500円',{date:'2026-10-18',amount:2500,category:'食費'}],['母の買い物で3000円',{type:'対象外',amount:3000}],['ポイント100円もらった',{amount:100,type:'還元収入',benefitType:'ポイント還元',benefitAmount:100}],['株主優待で1000円得した',{amount:0,type:'優待',benefitAmount:1000}],['スーパーで５００円',{amount:500}],['五百円',{amount:500}],['二千五百円',{amount:2500}],['1万2500円',{amount:12500}],['1.5万円',{amount:15000}],['500',{amount:500}],['10月2日スーパー',{amount:0}],['一昨日500円',{date:'2026-10-17'}],['2025年12月31日500円',{date:'2025-12-31'}],['ポイント100円使った',{type:'対象外',benefitAmount:0}],['秘密の買い物500円',{type:'秘密支出'}],['クーポン200円得した',{type:'お得',amount:0,benefitAmount:200}]];
for(const [s,want] of samples){ctx.input=s;const got=get('parseSpeech(input,new Date(2026,9,19,12))');for(const [k,v]of Object.entries(want))assert.equal(got[k],v,`${s}: ${k}`);}
assert.match(get("parseSpeech('2月30日500円').hint"),/日付/);
get("entries=[{id:'expense',date:'2026-10-19',type:'支出',category:'食費',amount:500,memo:'スーパー',updatedAt:'2026-10-19T01:00:00Z',pending:true},{id:'private',date:'2026-10-19',type:'秘密支出',amount:300,memo:'秘密',updatedAt:'2026-10-19T01:00:00Z',pending:true}];settings={sheetId:'test',clientId:'test'};token='test';tokenExpires=Date.now()+600000;");
let rows=[],writes=0,fail=false,duringWrite=null;
ctx.fetch=async(url,options={})=>{
 if(options.method==='PUT'){writes++;const sent=JSON.parse(options.body).values;assert.equal(sent.some(r=>r[2]==='秘密支出'),false);if(duringWrite)duringWrite();if(fail)return{ok:false,status:503,text:async()=> 'offline'};rows=sent;return{ok:true,status:200,json:async()=>({})};}
 return{ok:true,status:200,json:async()=>url.includes('fields=')?{sheets:[{properties:{title:'取引履歴'}}]}:{values:rows}};
};
(async()=>{
 fail=true;await assert.rejects(get('sync()'),/503/);assert.equal(get('entries.every(e=>e.pending)'),true);assert.equal(storage.has('kakeibo_entries_v1'),false);
 fail=false;await get('sync()');await get('sync()');assert.equal(rows.length,2);assert.equal(get('entries.length'),2);assert.equal(get("entries.find(e=>e.id==='private').pending"),true);assert.equal(get("entries.find(e=>e.id==='expense').pending"),false);
 duringWrite=()=>get("entries.find(e=>e.id==='expense').amount=750;entries.find(e=>e.id==='expense').updatedAt='2026-10-19T02:00:00Z';entries.find(e=>e.id==='expense').pending=true");await get('sync()');assert.equal(get("entries.find(e=>e.id==='expense').amount"),750);assert.equal(get("entries.find(e=>e.id==='expense').pending"),true);duringWrite=null;
 const writeCount=writes;rows.push(['legacy','2026-10-18','秘密支出','その他',900,'private','','2026-10-18T00:00:00Z','FALSE','','']);await assert.rejects(get('sync()'),/以前の秘密支出/);assert.equal(writes,writeCount);
 rows=[['wrong header']];await assert.rejects(get('sync()'),/列構成/);assert.equal(writes,writeCount);
 rows=[get('HEAD'),['private','2026-10-19','支出','食費',300,'previously public','','2026-10-19T00:00:00Z','FALSE','','']];await assert.rejects(get('sync()'),/同期先に残って/);assert.equal(writes,writeCount);
 ctx.fetch=async()=>({ok:false,status:401});await assert.rejects(get("api('/values/test')"),/期限/);assert.equal(get('token'),'');
 assert.equal(get('syncing'),false);assert.equal(element('syncBtn').disabled,false);
 // CSV quoting and parser handle embedded commas, quotes and newlines.
 vm.runInContext(source.slice(source.indexOf('function csvCell'),source.indexOf("$('exportCsv').onclick")),ctx);
 vm.runInContext(source.slice(source.indexOf('function parseCsv'),source.indexOf("$('csvInput').onchange")),ctx);
 ctx.value='スーパー, "食品"\n2行目';assert.equal(get("parseCsv(csvCell(value))[0][0]"),ctx.value);
 // Worker cleanup and fetch handling stay inside kakeibo's namespace and scope.
 const handlers={};let deleted=[],matched=[],responded=false;
 const workerCtx=vm.createContext({URL,Response,Promise,location:{origin:'https://example.test'},self:{location:{origin:'https://example.test'},registration:{scope:'https://example.test/mylife/kakeibo_pwa/'},addEventListener:(name,handler)=>handlers[name]=handler},caches:{keys:async()=>['kakeibo-v1','calendar-v1','kakeibo-v4.1.2'],delete:async key=>deleted.push(key),match:async(req,opts)=>{matched.push(opts.cacheName);return 'cached';}},fetch:async()=>{throw Error('offline')}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),workerCtx);
 await new Promise((resolve,reject)=>handlers.activate({waitUntil:p=>p.then(resolve,reject)}));assert.deepEqual(deleted,['kakeibo-v1']);
 handlers.fetch({request:{method:'GET',url:'https://example.test/mylife/calendar/'},respondWith:()=>responded=true});assert.equal(responded,false);
 await new Promise((resolve,reject)=>handlers.fetch({request:{method:'GET',url:'https://example.test/mylife/kakeibo_pwa/app.js'},respondWith:p=>p.then(resolve,reject)}));assert.deepEqual(matched,['kakeibo-v4.1.2']);
 console.log(`PASS: ${samples.length} input cases, invalid date, failed sync retention, retry, ID deduplication, private exclusion, in-flight edit, legacy private/header safeguards, expired OAuth, CSV escaping, worker cache isolation/offline fallback`);
})().catch(e=>{console.error(e);process.exitCode=1;});
