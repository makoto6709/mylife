'use strict';
const KEY='kakeibo_entries_v1',SET='kakeibo_settings_v1';const HEAD=['id','date','type','category','amount','memo','payment','updatedAt','deleted','benefitType','benefitAmount','benefitDetails'];const CATS=['未分類','食費','日用品','交通費','医療費','美容','衣服','交際費','趣味','通信費','住居費','光熱費','その他'];let entries=JSON.parse(localStorage.getItem(KEY)||'[]'),settings=JSON.parse(localStorage.getItem(SET)||'{}'),token='',tokenClient=null,editing=null;
const $=id=>document.getElementById(id),yen=n=>'¥'+Number(n||0).toLocaleString('ja-JP'),today=()=>new Date().toLocaleDateString('sv-SE'),toast=t=>{const el=$('toast');el.textContent=t;document.querySelectorAll('dialog[open] .dialogStatus').forEach(el=>el.textContent=t);el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3500)};
function save(){localStorage.setItem(KEY,JSON.stringify(entries));render()};function guessCategory(s){if(/スーパー|コンビニ|食品|食料|ランチ|夕食|昼食|カフェ|弁当|パン|飲食/.test(s))return '食費';if(/薬局|ドラッグ|洗剤|日用品/.test(s))return '日用品';if(/電車|バス|タクシー|ガソリン|高速|駐車/.test(s))return '交通費';if(/病院|薬|歯科|診療/.test(s))return '医療費';if(/美容|脱毛|理髪|化粧/.test(s))return '美容';if(/服|靴|衣料/.test(s))return '衣服';if(/携帯|スマホ|ネット/.test(s))return '通信費';return 'その他'}
function classify(s){let type='支出';if(/(?:母|お母さん).*(?:買い物|買物|代行)|立替|奢られ|おごってもら|ごちそうにな/.test(s))type='対象外';else if(/秘密|内緒/.test(s))type='秘密支出';else if(/優待/.test(s))type='優待';else if(/ポイント還元|キャッシュバック|還元/.test(s))type='還元収入';else if(/給料|給与|配当|収入/.test(s))type='収入';let payment='未指定';for(const p of ['PayPay','クレジット','現金','電子マネー','銀行振込'])if(s.toLowerCase().includes(p.toLowerCase()))payment=p;return {type,category:guessCategory(s),payment}}
function parseSpeech(text, now=new Date()) {
  const s=text.normalize('NFKC').trim();
  const localDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  let day=new Date(now), hint='';
  if(/一昨日|おととい/.test(s))day.setDate(day.getDate()-2);
  else if(/昨日|きのう/.test(s))day.setDate(day.getDate()-1);
  const dm=s.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日/);
  if(dm){const candidate=new Date(Number(dm[1]||now.getFullYear()),Number(dm[2])-1,Number(dm[3]));
    if(candidate.getMonth()===Number(dm[2])-1&&candidate.getDate()===Number(dm[3]))day=candidate;
    else hint='日付を特定できませんでした。日付を確認してください。';}
  function number(value){
    const digits={'〇':0,'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};
    let n=value.replaceAll(',','').replace(/[〇零一二三四五六七八九]/g,c=>digits[c]);
    if(!/[十百千万]/.test(n))return Number(n);
    let total=0,section=0,current=0;
    for(const part of n.match(/\d+(?:\.\d+)?|[十百千万]/g)||[]){
      if(part==='万'){total+=(section+current||1)*10000;section=0;current=0;}
      else if('十百千'.includes(part)){section+=(current||1)*({'十':10,'百':100,'千':1000}[part]);current=0;}
      else current=Number(part);
    }return total+section+current;
  }
  const matches=[...s.matchAll(/([\d,〇零一二三四五六七八九十百千万.]+)\s*(?:円|えん)/g)];
  let amount=matches.length?number(matches[0][1]):0;
  if(!matches.length){const rest=s.replace(/(?:(?:\d{4})年)?\d{1,2}月\d{1,2}日/g,'');
    if(/^[\d,〇零一二三四五六七八九十百千万.]+[。.!！]?$/u.test(rest))amount=number(rest.replace(/[。.!！]$/,''));}
  const result={...classify(s),amount,date:localDate(day),memo:s,hint};
  result.category=guessCategory(s)==='その他'?'未分類':guessCategory(s);
  if(matches.length>1)result.hint+='複数の金額があります。取引額とお得額を確認してください。';
  const pointUse=/ポイント.*(?:使|利用|支払|払い)/.test(s);
  const benefitType=/優待/.test(s)?'株主優待':/クーポン/.test(s)?'クーポン割引':/キャンペーン/.test(s)?'キャンペーン特典':/ポイント|還元|キャッシュバック/.test(s)?'ポイント還元':'';
  if(benefitType&&!pointUse&&result.type!=='対象外'&&result.type!=='秘密支出'){
    result.benefitType=benefitType;result.benefitAmount=amount;
    result.type=benefitType==='ポイント還元'?'還元収入':benefitType==='株主優待'?'優待':'お得';
    result.amount=benefitType==='ポイント還元'?amount:0;
  }
  if(pointUse){result.benefitAmount=0;result.type='対象外';result.hint+='ポイント利用はお得額に再計上しません。現金の支払いがあれば別途記録してください。';}
  if(/秘密|内緒/.test(s))result.type='秘密支出';
  return result;
}
function benefitParts(entry){
  const parts=entry.benefitDetails;
  if(parts&&typeof parts==='object'&&!Array.isArray(parts)&&Object.values(parts).every(n=>Number.isSafeInteger(n)&&n>=0)&&Object.values(parts).reduce((a,b)=>a+b,0)===Number(entry.benefitAmount||0))return parts;
  return Number(entry.benefitAmount)>0?{[entry.benefitType||'その他']:Number(entry.benefitAmount)}:{};
}
function readBenefitDetails(value){if(!value)return undefined;const parts=JSON.parse(value);if(!parts||Array.isArray(parts)||typeof parts!=='object'||!Object.values(parts).every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('お得の内訳が不正です');return parts;}
function updateBenefitPreview(){
  const primary=Number($('benefitAmount').value||0),discount=Number($('receiptDiscount').value||0);
  $('entryBenefitTotal').textContent='この記録のお得合計：'+yen(primary+discount)+'（'+($('benefitType').value||'その他')+' '+yen(primary)+' ＋ 値引き・割引 '+yen(discount)+'）';
}
function openEntry(v={}){editing=v.id||null;$('dialogTitle').textContent=editing?'記録を編集':'記録を追加';$('amount').value=v.amount??'';$('memo').value=v.memo||'';$('date').value=v.date||today();$('type').value=v.type||'支出';$('category').value=v.category||'未分類';$('payment').value=v.payment||'未指定';const parts=benefitParts(v);const discount=parts['値引き・割引']||0;$('benefitType').value=v.benefitType==='値引き・割引'?'':v.benefitType||'';$('benefitAmount').value=Math.max(0,Number(v.benefitAmount||0)-discount);$('receiptDiscount').value=discount;$('entryHint').textContent=v.hint||'';$('deleteEntry').hidden=!editing;$('entryDialog').showModal();updateBenefitPreview()}
function render(){const month=$('reportMonth').value||today().slice(0,7);const year=month.slice(0,4);$('monthLabel').textContent=month.replace('-','年')+'月';const active=entries.filter(x=>!x.deleted),current=active.filter(x=>x.date.startsWith(month));$('expenseTotal').textContent=yen(current.filter(x=>x.type==='支出').reduce((s,x)=>s+Number(x.amount),0));$('incomeTotal').textContent=yen(current.filter(x=>['収入','還元収入'].includes(x.type)).reduce((s,x)=>s+Number(x.amount),0));$('secretTotal').textContent=yen(current.filter(x=>x.type==='秘密支出').reduce((n,x)=>n+Number(x.amount),0));$('annualExpense').textContent=yen(active.filter(x=>x.date.startsWith(year)&&x.type==='支出').reduce((n,x)=>n+Number(x.amount),0));$('annualIncome').textContent=yen(active.filter(x=>x.date.startsWith(year)&&['収入','還元収入'].includes(x.type)).reduce((n,x)=>n+Number(x.amount),0));$('annualBenefit').textContent=yen(active.filter(x=>x.date.startsWith(year)&&x.type!=='秘密支出'&&x.type!=='対象外').reduce((n,x)=>n+Number(x.benefitAmount||0),0));const benefit=current.filter(x=>!['秘密支出','対象外'].includes(x.type)).reduce((n,x)=>n+Number(x.benefitAmount||0),0);const expense=current.filter(x=>x.type==='支出').reduce((n,x)=>n+Number(x.amount),0);$('benefitTotal').textContent=yen(benefit);$('benefitRate').textContent=(expense+benefit?benefit/(expense+benefit)*100:0).toFixed(1)+'%';$('syncState').textContent=entries.some(x=>x.pending&&x.type!=='秘密支出')?'● 端末に保存済み・未同期あり':(settings.sheetId?'Google Sheets連携設定あり':'端末内に保存・Google未連携');const list=active.sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));$('history').replaceChildren();if(!list.length)$('history').innerHTML='<div class="empty">まだ記録がありません。<br>音声・画像・手入力から始めましょう。</div>';for(const e of list.slice(0,100)){let b=document.createElement('button');b.className='entry';const left=document.createElement('span'),right=document.createElement('strong');left.textContent=e.memo||e.category;let sub=document.createElement('span');sub.className='detail';sub.textContent=`${e.date} · ${e.type} · ${e.category}${e.type==='秘密支出'?' · この端末のみ':e.pending?' · 未同期':''}`;left.append(sub);right.textContent=(['優待','お得','対象外'].includes(e.type)?'': ['収入','還元収入'].includes(e.type)?'+':'−')+yen(e.benefitAmount&&e.amount===0?e.benefitAmount:e.amount);b.append(left,right);b.onclick=()=>openEntry(e);$('history').append(b)}const totals={};for(const e of current.filter(x=>x.type==='支出'))totals[e.category]=(totals[e.category]||0)+Number(e.amount);const max=Math.max(...Object.values(totals),1);$('report').replaceChildren();for(const [k,v] of Object.entries(totals).sort((a,b)=>b[1]-a[1])){const div=document.createElement('div');div.className='bar';div.innerHTML=`<span></span><i></i><b></b>`;div.querySelector('span').textContent=k;div.querySelector('i').style.setProperty('--pct',(v/max*100)+'%');div.querySelector('b').textContent=yen(v);$('report').append(div)}if(!Object.keys(totals).length)$('report').innerHTML='<div class="empty">今月の支出はありません</div>';const benefits={};for(const e of current){if(!['秘密支出','対象外'].includes(e.type)&&Number(e.benefitAmount)>0){for(const [k,v] of Object.entries(benefitParts(e)))benefits[k]=(benefits[k]||0)+v}}$('benefitReport').replaceChildren();for(const [k,v] of Object.entries(benefits).sort((a,b)=>b[1]-a[1])){const row=document.createElement('div');row.className='entry';const name=document.createElement('span');name.textContent=k;const val=document.createElement('strong');val.textContent=yen(v);row.append(name,val);$('benefitReport').append(row)}if(!Object.keys(benefits).length)$('benefitReport').innerHTML='<div class="empty">今月のお得記録はありません</div>'}
for(const id of ['benefitType','benefitAmount','receiptDiscount']){$(id).addEventListener('input',updateBenefitPreview);$(id).addEventListener('change',updateBenefitPreview);}
$('category').replaceChildren(...CATS.map(c=>{let o=document.createElement('option');o.textContent=c;return o}));$('entryForm').addEventListener('submit',e=>{e.preventDefault();const amount=Number($('amount').value);if(!Number.isSafeInteger(amount)||amount<0||(amount===0&&!['優待','お得','対象外'].includes($('type').value))){toast('正しい金額を入力してください');return}const primaryBenefit=Number($('benefitAmount').value||0),discountBenefit=Number($('receiptDiscount').value||0);if(!Number.isSafeInteger(primaryBenefit)||primaryBenefit<0||!Number.isSafeInteger(discountBenefit)||discountBenefit<0){toast('お得額を確認してください');return}const benefitAmount=primaryBenefit+discountBenefit;if(!Number.isSafeInteger(benefitAmount)||benefitAmount<0){toast('お得額を確認してください');return}if(primaryBenefit>0&&!$('benefitType').value){toast('お得の種類を選んでください');return}const prev=entries.find(x=>x.id===editing);const entry={id:editing||crypto.randomUUID(),date:$('date').value,type:$('type').value,category:$('category').value,amount,memo:$('memo').value.trim(),payment:$('payment').value,benefitType:$('benefitType').value||(discountBenefit?'値引き・割引':''),benefitAmount,benefitDetails:{...(primaryBenefit?{[$('benefitType').value]:primaryBenefit}:{}),...(discountBenefit?{'値引き・割引':discountBenefit}:{})},updatedAt:new Date().toISOString(),deleted:false,pending:true};const previous=prev?{...prev}:null;if(prev)Object.assign(prev,entry);else entries.push(entry);try{save()}catch(err){if(prev)Object.assign(prev,previous);else entries.pop();toast('端末に保存できません。CSVを保存し、空き容量を確認してください');return}$('entryDialog').close();toast('端末に保存しました');retrySync()});$('deleteEntry').onclick=()=>{if(!confirm('この記録を削除しますか？'))return;const e=entries.find(x=>x.id===editing);e.deleted=true;e.pending=true;e.updatedAt=new Date().toISOString();save();$('entryDialog').close()};$('closeDialog').onclick=()=>$('entryDialog').close();$('manualBtn').onclick=()=>openEntry();$('settingsBtn').onclick=()=>tab('settings');document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>tab(b.dataset.tab));function tab(t){for(const n of ['history','report','settings'])$(n+'Tab').hidden=n!==t;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===t))}
// User gesture -> showModal -> focus synchronously: iPhone keyboard dictation.
$('voiceBtn').onclick=()=>{$('voiceText').value='';$('voiceDialog').showModal();$('voiceText').focus()};
$('closeVoice').onclick=()=>$('voiceDialog').close();
$('voiceApply').onclick=()=>{const text=$('voiceText').value.trim();if(!text){toast('入力欄をタップして、キーボードのマイクで話してください');return}
  const parsed=parseSpeech(text);$('voiceDialog').close();openEntry(parsed);
  $('entryHint').textContent=parsed.hint||((parsed.amount||parsed.benefitAmount)?'内容を確認して保存してください。':'金額を入力してください。');};
setupReceiptImport();
$('clientId').value=settings.clientId||'';$('sheetId').value=settings.sheetId||'';$('saveSettings').onclick=()=>{settings={...settings,clientId:$('clientId').value.trim(),sheetId:$('sheetId').value.trim().replace(/^.*\/d\/([^/]+).*$/,'$1')};localStorage.setItem(SET,JSON.stringify(settings));toast('設定を保存しました');render()};
function requestToken(){return new Promise((resolve,reject)=>{if(!settings.clientId)return reject(Error('先にOAuthクライアントIDを設定してください'));if(!window.google?.accounts?.oauth2)return reject(Error('Google認証の読み込み待ちです'));tokenClient=google.accounts.oauth2.initTokenClient({client_id:settings.clientId,scope:'https://www.googleapis.com/auth/spreadsheets',callback:r=>{if(r.error)return reject(Error(r.error));token=r.access_token;tokenExpires=Date.now()+Math.max(0,Number(r.expires_in||3600)-60)*1000;resolve(token)},error_callback:e=>reject(Error(e.message||'認証がキャンセルされました'))});tokenClient.requestAccessToken({prompt:token?'':'consent'})})}
async function api(path,options={}){const resp=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(settings.sheetId)+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}});if(resp.status===401){token='';tokenExpires=0;throw Error('Google接続の期限が切れました。「Googleに接続」から再接続してください')}if(!resp.ok)throw Error(`Sheets API ${resp.status}: ${(await resp.text()).slice(0,200)}`);return resp.json()}
async function ensureSheet(){const meta=await api('?fields=sheets.properties.title');if(meta.sheets.some(s=>s.properties.title==='取引履歴'))return;await api(':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:'取引履歴'}}}]})})}
let syncing=false, tokenExpires=0;
async function sync(interactive=true){
  if(syncing)return;
  if(!settings.sheetId||!settings.clientId){if(interactive)tab('settings');throw Error('連携設定を入力してください');}
  if(!token||Date.now()>=tokenExpires){token='';if(!interactive)return;await requestToken();}
  syncing=true;$('syncBtn').disabled=true;
  try{
    await ensureSheet();
    const path='/values/'+encodeURIComponent("'取引履歴'!A:L");
    const remote=(await api(path)).values||[];
    if(remote.length&&remote[0].join(',')!==HEAD.join(',')&&remote[0].join(',')!==HEAD.slice(0,9).join(',')&&remote[0].join(',')!==HEAD.slice(0,11).join(','))throw Error('取引履歴の列構成が異なります。シートを確認してください');
    // Do not silently delete/migrate older private rows already stored remotely.
    if(remote.slice(1).some(r=>r[2]==='秘密支出'))throw Error('同期先に以前の秘密支出があります。非共有の別ファイルへ退避し、取引履歴から削除してから再同期してください');
    const snapshot=entries.map(e=>({...e}));
    const privateIds=new Set(snapshot.filter(e=>e.type==='秘密支出').map(e=>e.id));
    if(remote.slice(1).some(r=>privateIds.has(r[0])))throw Error('秘密支出に変更した記録が同期先に残っています。同期先の同じIDの行を削除してから再同期してください');
    const map=new Map();
    for(const r of remote.slice(1)){
      if(!r[0])continue;
      const e={id:r[0],date:r[1]||'',type:r[2]||'支出',category:r[3]||'未分類',amount:Number(r[4])||0,memo:r[5]||'',payment:r[6]||'未指定',updatedAt:r[7]||'',deleted:String(r[8]).toUpperCase()==='TRUE',benefitType:r[9]||'',benefitAmount:Number(r[10])||0,benefitDetails:readBenefitDetails(r[11]),pending:false};
      if(!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isSafeInteger(e.amount)||e.amount<0)throw Error('同期先に不正な日付・金額があります。書き込みを中止しました');
      if(!map.has(e.id)||map.get(e.id).updatedAt<e.updatedAt)map.set(e.id,e);
    }
    for(const e of snapshot.filter(e=>e.type!=='秘密支出')){const r=map.get(e.id);if(!r||e.updatedAt>=r.updatedAt)map.set(e.id,{...e,pending:false});}
    const rows=[HEAD,...[...map.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(e=>[e.id,e.date,e.type,e.category,e.amount,e.memo,e.payment,e.updatedAt,e.deleted?'TRUE':'FALSE',e.benefitType||'',Number(e.benefitAmount||0),JSON.stringify(benefitParts(e))])];
    await api(path+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({range:"'取引履歴'!A:L",majorDimension:'ROWS',values:rows})});
    // Edits made while awaiting network stay pending; private records stay local.
    for(const e of entries){const old=snapshot.find(x=>x.id===e.id);if(e.type==='秘密支出'||!old||e.updatedAt!==old.updatedAt)map.set(e.id,e);}
    entries=[...map.values()];save();$('authStatus').textContent='通常の記録をGoogle Sheetsに同期済み（秘密支出は端末内のみ）';
    if(interactive)toast('同期しました');
  }finally{syncing=false;$('syncBtn').disabled=false;}
}
function retrySync(){if(navigator.onLine&&token&&Date.now()<tokenExpires&&settings.sheetId&&entries.some(e=>e.pending&&e.type!=='秘密支出'))sync(false).catch(e=>{$('authStatus').textContent='未同期の記録は端末に保持しています。'+e.message;});}
window.addEventListener('online',retrySync);
window.addEventListener('focus',retrySync);
$('googleLogin').onclick=async()=>{try{await requestToken();$('authStatus').textContent='Google認証に成功しました';toast('接続しました。「同期する」を押してください')}catch(e){toast(e.message)}};$('syncBtn').onclick=async()=>{try{await sync()}catch(e){toast(e.message)}};
function csvCell(s){return '"'+String(s??'').replaceAll('"','""')+'"'}$('exportCsv').onclick=()=>{const rows=[HEAD,...entries.map(e=>[e.id,e.date,e.type,e.category,e.amount,e.memo,e.payment,e.updatedAt,e.deleted?'TRUE':'FALSE',e.benefitType||'',Number(e.benefitAmount||0),JSON.stringify(benefitParts(e))])];const csv='\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='家計簿_'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
$('importBtn').onclick=()=>$('csvInput').click();function parseCsv(s,delimiter=','){const out=[];let row=[],field='',quoted=false;for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(c===delimiter&&!quoted){row.push(field);field=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))out.push(row);row=[];field=''}else field+=c}row.push(field);if(row.some(Boolean))out.push(row);return out}
$('csvInput').onchange=async e=>{try{const rows=parseCsv((await e.target.files[0].text()).replace(/^\ufeff/,''));if(!['id,date,type,category,amount,memo,payment,updatedAt,deleted',HEAD.slice(0,11).join(','),HEAD.join(',')].includes(rows[0].join(',')))throw Error('このアプリのCSV形式ではありません');const map=new Map(entries.map(x=>[x.id,x]));for(const r of rows.slice(1)){if(!r[0])continue;const x={id:r[0],date:r[1],type:r[2],category:r[3],amount:Number(r[4]),memo:r[5],payment:r[6],updatedAt:r[7],deleted:r[8]==='TRUE',benefitType:r[9]||'',benefitAmount:Number(r[10])||0,benefitDetails:readBenefitDetails(r[11]),pending:true};if(!map.has(x.id)||map.get(x.id).updatedAt<x.updatedAt)map.set(x.id,x)}entries=[...map.values()];save();toast('CSVを取り込みました')}catch(err){toast(err.message)}e.target.value=''};
$('reportMonth').value=today().slice(0,7);$('reportMonth').onchange=render;
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});render();
