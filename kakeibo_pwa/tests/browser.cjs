// Run: NODE_PATH=<directory containing playwright> node kakeibo_pwa/tests/browser.cjs
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{cwd:path.resolve(__dirname,'../..'),stdio:'ignore'});
(async()=>{
  let browser;
  try{
    for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:8765');break;}catch{await new Promise(r=>setTimeout(r,100));}}
    const engine=process.env.ENGINE==='webkit'?webkit:chromium;
    browser=await engine.launch({headless:true});
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true,serviceWorkers:'block'});
    await context.route('https://accounts.google.com/**',r=>r.abort());
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/kakeibo_pwa/');
    const samples=[['500円',{amount:500,category:'未分類',type:'支出'}],['コンビニで500円',{amount:500,category:'食費'}],['昨日スーパーで2500円',{amount:2500,date:'2026-10-18',category:'食費'}],['母の買い物で3000円',{amount:3000,type:'対象外'}],['ポイント100円もらった',{amount:100,benefitAmount:100,benefitType:'ポイント還元',type:'還元収入'}],['株主優待で1000円得した',{amount:0,benefitAmount:1000,type:'優待'}],['スーパーで５００円',{amount:500}],['スーパーで五百円',{amount:500}],['1万2500円',{amount:12500}],['一昨日500円',{date:'2026-10-17'}],['ポイント100円使った',{benefitAmount:0,type:'対象外'}],['クーポンで200円得した',{type:'お得',amount:0,benefitAmount:200}],['10月2日スーパー',{amount:0}],['秘密の買い物500円',{type:'秘密支出'}]];
    for(const [text,want] of samples){const got=await page.evaluate(text=>parseSpeech(text,new Date(2026,9,19,12)),text);for(const [key,value]of Object.entries(want))assert.equal(got[key],value,`${text}: ${key}`);}
    await page.click('#voiceBtn');assert.equal(await page.locator('#voiceDialog').evaluate(e=>e.open),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'voiceText');
    await page.fill('#voiceText','スーパーで500円');await page.click('#voiceApply');assert.equal(await page.inputValue('#amount'),'500');assert.equal(await page.inputValue('#category'),'食費');await page.click('#saveEntry');
    let stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('kakeibo_entries_v1')));assert.equal(stored.length,1);const id=stored[0].id;
    await page.reload();assert.equal(await page.locator('#history .entry').count(),1);
    await page.click('#history .entry');await page.fill('#amount','600');await page.click('#saveEntry');stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('kakeibo_entries_v1')));assert.equal(stored.length,1);assert.equal(stored[0].id,id);assert.equal(stored[0].amount,600);
    await page.click('#voiceBtn');await page.fill('#voiceText','株主優待で1000円得した');await page.click('#voiceApply');await page.click('#saveEntry');assert.equal(await page.locator('#history .entry').count(),2);
    await page.click('#voiceBtn');await page.fill('#voiceText','秘密の買い物500円');await page.click('#voiceApply');await page.click('#saveEntry');assert.match(await page.textContent('#secretTotal'),/500/);assert.match(await page.textContent('#expenseTotal'),/600/);
    // A failed Sheets write must leave all pending local records untouched.
    await page.evaluate(()=>{settings={sheetId:'test',clientId:'test'};token='test';tokenExpires=Date.now()+60000;});
    let written;
    await context.route('https://sheets.googleapis.com/**',async r=>{
      const req=r.request();
      if(req.method()==='PUT'){written=JSON.parse(req.postData());return r.fulfill({status:503,body:'offline'});}
      return r.fulfill({status:200,contentType:'application/json',body:req.url().includes('fields=')?JSON.stringify({sheets:[{properties:{title:'取引履歴'}}]}):JSON.stringify({values:[]})});
    });
    const failure=await page.evaluate(()=>sync().then(()=>'',e=>e.message));assert.match(failure,/503/);assert.equal(written.values.some(r=>r[2]==='秘密支出'),false);assert.equal(await page.evaluate(()=>entries.every(e=>e.pending)),true);
    // Successful retry is idempotent and keeps secrets on device.
    await context.unroute('https://sheets.googleapis.com/**');let rows=[];
    await context.route('https://sheets.googleapis.com/**',async r=>{const req=r.request();if(req.method()==='PUT'){rows=JSON.parse(req.postData()).values;return r.fulfill({status:200,body:'{}'});}return r.fulfill({status:200,contentType:'application/json',body:req.url().includes('fields=')?JSON.stringify({sheets:[{properties:{title:'取引履歴'}}]}):JSON.stringify({values:rows})});});
    await page.evaluate(()=>sync());await page.evaluate(()=>sync());assert.equal(rows.length,3);assert.equal(new Set(rows.slice(1).map(r=>r[0])).size,2);assert.equal(await page.evaluate(()=>entries.length),3);assert.equal(rows.some(r=>r[2]==='秘密支出'),false);
    // Local edits made during an in-flight write survive and remain pending.
    await context.unroute('https://sheets.googleapis.com/**');
    await context.route('https://sheets.googleapis.com/**',async r=>{const req=r.request();if(req.method()==='PUT'){await page.evaluate(()=>{entries[0].amount=777;entries[0].updatedAt=new Date(Date.now()+1000).toISOString();entries[0].pending=true;save();});return r.fulfill({status:200,body:'{}'});}return r.fulfill({status:200,contentType:'application/json',body:req.url().includes('fields=')?JSON.stringify({sheets:[{properties:{title:'取引履歴'}}]}):JSON.stringify({values:rows})});});
    await page.evaluate(()=>sync());assert.equal(await page.evaluate(()=>entries[0].amount),777);assert.equal(await page.evaluate(()=>entries[0].pending),true);
    await page.evaluate(()=>{token='';});
    const downloadPromise=page.waitForEvent('download');await page.click('#settingsBtn');await page.click('#exportCsv');const download=await downloadPromise;assert.match(download.suggestedFilename(),/家計簿_/);
    await page.click('nav button[data-tab="history"]');await page.locator('#history .entry').first().click();page.once('dialog',d=>d.accept());await page.click('#deleteEntry');assert.equal(await page.locator('#history .entry').count(),2);
    await context.setOffline(true);await page.click('#manualBtn');await page.fill('#amount','123');await page.click('#saveEntry');assert.equal(await page.locator('#history .entry').count(),3);
    assert.deepEqual(errors,[]);await page.screenshot({path:path.resolve(__dirname,'../../../qa-mobile.png'),fullPage:true});
    console.log(`PASS ${engine===webkit?'WebKit':'Chromium'}: ${samples.length} parser cases; voice form, CRUD, reload, benefit-only save, separate totals, CSV, offline save, sync failure/retry/idempotence/privacy/concurrent edit`);
    await context.close();
  }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
