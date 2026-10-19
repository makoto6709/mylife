'use strict';
// No receipt bytes leave the browser. Libraries/language data are fetched on demand.
function parseReceiptText(raw, now=new Date()) {
  const text=raw.normalize('NFKC').replace(/\r/g,'');
  const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
  // Join OCR-separated digits only within one monetary token, preserving separate amounts.
  const money=line=>{line=line.replace(/(?<=\d)\s*(,)\s*(?=\d)/g,',').replace(/(\d) +(\d)(?= *(?:\d|,|円|$))/g,'$1$2');while(/\d +\d/.test(line))line=line.replace(/(\d) +(\d)/g,'$1$2');return [...line.matchAll(/(?:[¥￥]\s*)?(\d[\d,]*(?:\.\d{1,2})?)/g)].map(m=>Number(m[1].replaceAll(',',''))).filter(n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999);};
  const candidates=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    // Tax, received cash and change are never transaction total candidates.
    if(/^(?:小計|税額|消費税|内税|外税|お預|預り|お釣|釣銭|つり|残高|累計|ポイント|割引|値引)/i.test(line))continue;
    const rank=/お支払(?:い)?(?:合計|金額|額)|請求(?:金額|額)|総(?:合計|額)|ご利用金額|^(?:amount|金額)\s*[:：]|grand\s*total|amount\s*(?:paid|due)/i.test(line)?3:/合\s*計|お買上(?:げ)?(?:金額|額)|現計|^total\b/i.test(line)?2:0;
    if(!rank)continue;
    const tail=line.replace(/^.*?(?:お支払(?:い)?(?:合計|金額|額)?|請求(?:金額|額)|総(?:合計|額)|ご利用金額|^(?:amount|金額)\s*[:：]|grand\s*total|amount\s*(?:paid|due)|合\s*計|お買上(?:げ)?(?:金額|額)|現計|total)/i,'');
    let values=money(tail);
    if(!values.length&&i+1<lines.length&&/^[¥￥\s\d,円.]+$/.test(lines[i+1]))values=money(lines[i+1]);
    if(values.length)candidates.push({amount:values[0],rank});
  }
  candidates.sort((a,b)=>b.rank-a.rank);
  let amount=candidates[0]?.amount||0;
  if(!candidates.length){const standalone=lines.filter(l=>/^[¥￥]\s*[\d,]+(?:円)?$/.test(l));if(standalone.length===1)amount=money(standalone[0])[0]||0;}
  const best=candidates.filter(c=>c.rank===candidates[0]?.rank);
  const ambiguous=new Set(best.map(c=>c.amount)).size>1;
  const d=text.match(/(?:((?:19|20)\d{2})[年/\-.])\s*(\d{1,2})[月/\-.]\s*(\d{1,2})日?/);
  let date='',invalidDate=false;
  if(d){const candidate=new Date(+d[1],+d[2]-1,+d[3]);if(candidate.getFullYear()===+d[1]&&candidate.getMonth()===+d[2]-1&&candidate.getDate()===+d[3])date=`${d[1]}-${d[2].padStart(2,'0')}-${d[3].padStart(2,'0')}`;else invalidDate=true;}
  const merchant=lines.find(l=>/^(?:merchant|store|shop|店名|店舗名)\s*[:：]/i.test(l));
  const memo=merchant?.replace(/^[^:：]+[:：]\s*/,'')||lines.find(l=>!/^\d|領収|レシート|receipt|電子レシート|登録番号|tel|電話|〒/i.test(l))||'レシート';
  const discountRows=[];const discountSummaries=[];
  for(const line of lines){
    if(/返品|返金|取消|電話|TEL|FAX|合\s*計|小\s*計|お支払|お釣|残高|\d{2,4}[/-]\d{1,2}[/-]\d{1,2}/i.test(line)&&!/割引合計|値引合計|割引総額|値引総額/.test(line))continue;
    const match=line.match(/[-−‐–—]\s*[¥￥]?\s*(\d[\d, ]*)(?:円)?\s*$/);
    if(!match)continue;const value=Number(match[1].replace(/[ ,]/g,''));if(!Number.isSafeInteger(value)||value<=0)continue;
    (/割引合計|値引合計|割引総額|値引総額/.test(line)?discountSummaries:discountRows).push(value);
  }
  const receiptDiscountAmount=discountRows.length?discountRows.reduce((sum,n)=>sum+n,0):Math.max(0,...discountSummaries);
  const receiptDiscountCount=discountRows.length;
  const receiptTotal=amount;
  let benefitAmount=0,cashAmount=null,payment='未指定',benefitHint='';
  const voucherLabel=/株\s*主\s*優\s*待(?:\s*券)?/;
  const voucherIndex=lines.findIndex(l=>voucherLabel.test(l));
  if(voucherIndex>=0){
    const rest=lines[voucherIndex].replace(/^.*?株\s*主\s*優\s*待(?:\s*券)?/,'');
    let v=money(rest)[0]||0;
    if(!v&&/^[¥￥\s\d,円.]+$/.test(lines[voucherIndex+1]||''))v=money(lines[voucherIndex+1])[0]||0;
    const paid=lines.find(l=>/^(?:AEON\s*Pay|イオンペイ|クレジット|クレジットカード|現金|電子マネー|PayPay|WAON)/i.test(l));
    const p=paid?money(paid.replace(/^[^¥￥\d]*/,''))[0]:null;
    // Recognized voucher benefit is independent of the cash reconciliation.
    if(v>0){
      benefitAmount=v;
      if(receiptTotal>=v&&p!==null&&p+v===receiptTotal){cashAmount=p;amount=p;payment=/AEON\s*Pay/i.test(paid)?'AEON Pay':/PayPay/i.test(paid)?'PayPay':/クレジット/.test(paid)?'クレジット':/現金/.test(paid)?'現金':'電子マネー';}
      else benefitHint='株主優待'+v.toLocaleString('ja-JP')+'円をお得に計上します。支払額との照合ができないため金額欄を確認してください。支出からは自動で差し引いていません。';
    }else benefitHint='株主優待の記載がありますが額を読み取れませんでした。お得の種類に株主優待を選び、金額を入力してください。';
  }
  return {amount,date,memo,ambiguous,invalidDate,receiptTotal,receiptDiscountAmount,receiptDiscountCount,benefitAmount,benefitType:benefitAmount?'株主優待':'',cashAmount,payment,benefitHint};
}
function setupReceiptImport(){
  const byId=id=>document.getElementById(id);
  let task=null,sourceFile=null,previewURL='',pdfModule=null,scriptPromise=null;
  const progress=message=>{byId('receiptStatus').textContent=message;};
  function clearPreview(){if(previewURL)URL.revokeObjectURL(previewURL);previewURL='';byId('receiptPreview').removeAttribute('src');byId('receiptPreview').hidden=true;}
  function updateCandidate(){
    const parsed=parseReceiptText(byId('receiptText').value);
    byId('receiptCandidate').textContent=parsed.amount?`取引候補：${parsed.amount.toLocaleString('ja-JP')}円${parsed.benefitAmount?' ／ 株主優待 '+parsed.benefitAmount.toLocaleString('ja-JP')+'円（レシート合計 '+parsed.receiptTotal.toLocaleString('ja-JP')+'円）':''}${parsed.receiptDiscountAmount?' ／ 値引き・割引 '+parsed.receiptDiscountAmount.toLocaleString('ja-JP')+'円（'+parsed.receiptDiscountCount+'件）':''}${parsed.date?' ／ '+parsed.date:''}${parsed.ambiguous?'（金額の候補が複数あります）':''}`:'金額を特定できません。読み取り文字を直すか、取引画面で入力してください。';
  }
  function checkpoint(job){if(job.cancelled)throw Error('読み取りを中止しました');}
  function deadline(promise,ms,job,label){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{job.cancelled=true;job.worker?.terminate();reject(Error(label+'が時間内に完了しませんでした。通信を確認し、再試行するか文字を貼り付けてください。'));},ms);
      job.abort=()=>{clearTimeout(timer);reject(Error('読み取りを中止しました'));};
      Promise.resolve(promise).then(value=>{clearTimeout(timer);if(job.cancelled)reject(Error('読み取りを中止しました'));else resolve(value);},error=>{clearTimeout(timer);reject(error);});
    });
  }
  function loadScript(){
    if(window.Tesseract)return Promise.resolve();
    if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('OCRライブラリを取得できませんでした'));document.head.append(s);}).catch(error=>{scriptPromise=null;throw error;});
    return scriptPromise;
  }
  async function recognize(input,job){
    progress('文字認識を準備中… 初回は日本語データをダウンロードします');
    await deadline(loadScript(),20000,job,'OCRの準備');checkpoint(job);
    const creating=window.Tesseract.createWorker('jpn',1,{
      workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
      corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0',
      langPath:'https://tessdata.projectnaptha.com/4.0.0',
      logger:info=>{if(!job.cancelled)progress((info.status==='recognizing text'?'文字を読み取り中':'認識データを準備中')+`… ${Math.round((info.progress||0)*100)}%`);},
      errorHandler:error=>{if(!job.cancelled)progress('文字認識でエラーが発生しました。再試行できます。');}
    });
    creating.then(worker=>{if(job.cancelled)worker.terminate();},()=>{});
    const worker=await deadline(creating,90000,job,'認識データの取得');job.worker=worker;checkpoint(job);
    try{return (await deadline(worker.recognize(input),90000,job,'文字認識')).data.text;}
    finally{await worker.terminate();job.worker=null;}
  }
  async function imageCanvas(file,job){
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();img.src=url;
      await deadline(new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('この画像形式を開けませんでした。JPEG・PNGやスクリーンショットで再選択してください。'));}),20000,job,'画像の読み込み');
      const scale=Math.min(Math.max(1,900/img.naturalWidth),1600/img.naturalWidth,Math.sqrt(3000000/(img.naturalWidth*img.naturalHeight)));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const context=canvas.getContext('2d');if(!context)throw Error('画像を処理できませんでした');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);return canvas;
    }finally{URL.revokeObjectURL(url);}
  }
  async function readPDF(file,job){
    progress('PDFを開いています…');
    if(!pdfModule)pdfModule=await deadline(import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs'),25000,job,'PDFの準備');
    pdfModule.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const loading=pdfModule.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});job.pdfLoading=loading;
    let pdf;
    try{
      pdf=await deadline(loading.promise,30000,job,'PDFの読み込み');
      if(pdf.numPages>5)throw Error('PDFは5ページ以内に分けて選択してください。複数のレシートは1件ずつ取り込みます。');
      const texts=[];
      for(let n=1;n<=pdf.numPages;n++){
        checkpoint(job);progress(`PDF ${n}/${pdf.numPages}ページを読み取り中…`);
        const page=await pdf.getPage(n),content=await page.getTextContent();
        let text='',previousY=null;
        for(const item of content.items){if(typeof item.str!=='string')continue;const y=item.transform?.[5];if(previousY!==null&&Math.abs(y-previousY)>3)text+='\n';text+=item.str+(item.hasEOL?'\n':' ');previousY=y;}
        if(text.replace(/\s/g,'').length<10){
          const base=page.getViewport({scale:1}),scale=Math.min(2,2000/Math.max(base.width,base.height));const viewport=page.getViewport({scale});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
          await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
          try{text=await recognize(canvas,job);}finally{canvas.width=canvas.height=1;}
        }texts.push(text);page.cleanup();
      }return texts.join('\n\n');
    }finally{await loading.destroy();job.pdfLoading=null;}
  }
  function setBusy(busy){byId('receiptRead').disabled=busy||!sourceFile;byId('receiptCancel').hidden=!busy;for(const id of ['receiptCamera','receiptPhoto','receiptFile'])byId(id).disabled=busy;byId('receiptApply').disabled=busy;byId('receiptText').disabled=busy;}
  async function readFile(file){
    if(task)return;
    sourceFile=file;byId('receiptFileName').textContent=file.name;byId('receiptText').value='';byId('receiptCandidate').textContent='';clearPreview();
    if(file.size>20*1024*1024){progress('ファイルは20MB以内にしてください。');setBusy(false);return;}
    const job={cancelled:false};task=job;setBusy(true);
    try{
      let text='';const ext=file.name.split('.').pop().toLowerCase();
      if(file.type==='application/pdf'||ext==='pdf')text=await readPDF(file,job);
      else if(file.type.startsWith('image/')||/^(jpg|jpeg|png|webp|heic|heif)$/.test(ext)){
        previewURL=URL.createObjectURL(file);byId('receiptPreview').src=previewURL;byId('receiptPreview').hidden=false;
        progress('画像のサイズを調整しています…');const canvas=await imageCanvas(file,job);
        try{text=await recognize(canvas,job);}finally{canvas.width=canvas.height=1;}
      }else if(/^(txt|csv|tsv|json|html|htm)$/.test(ext)||file.type.startsWith('text/')){
        if(file.size>2*1024*1024)throw Error('文字データは2MB以内にしてください');
        text=await file.text();
        if(/^(html|htm)$/.test(ext)){text=text.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<\/?(?:br|p|div|tr|li|h[1-6])\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'\"').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
        else if(ext==='json'){
          const data=JSON.parse(text);if(Array.isArray(data))throw Error('複数の取引データは1件ずつ取り込んでください。バックアップCSVは設定画面から復元できます。');
          text=Object.entries(data).map(([key,value])=>`${key}: ${typeof value==='object'?JSON.stringify(value):value}`).join('\n');
        }else if(/^(csv|tsv)$/.test(ext)){
          const rows=typeof parseCsv==='function'?parseCsv(text.replace(/^\uFEFF/,''),ext==='tsv'?'\t':','):[];
          if(rows.length===2&&rows[0].length===rows[1].length)text=rows[0].map((key,i)=>`${key}: ${rows[1][i]}`).join('\n');
          else if(rows.length>2)throw Error('複数行のCSV一括登録には対応していません。レシートは1件ずつ、バックアップCSVは設定画面から取り込んでください。');
        }
      }else throw Error('対応形式は写真、PDF、TXT、CSV、TSV、JSON、HTMLです。ExcelやメールはPDFに保存して選択してください。');
      checkpoint(job);byId('receiptText').value=text.slice(0,100000);updateCandidate();progress(text.trim()?'読み取りが完了しました。金額・日付を確認して「取引へ反映」を押してください。':'文字を読み取れませんでした。再撮影するか、下の欄にレシートの文字を貼り付けてください。');
    }catch(error){if(!window.Tesseract)scriptPromise=null;progress(error.message||'読み取りに失敗しました。再試行するか、文字を貼り付けてください。');}
    finally{task=null;setBusy(false);}
  }
  byId('photoBtn').onclick=()=>{byId('receiptDialog').showModal();};
  byId('receiptCamera').onclick=()=>byId('cameraInput').click();byId('receiptPhoto').onclick=()=>byId('imageInput').click();byId('receiptFile').onclick=()=>byId('receiptFileInput').click();
  for(const id of ['cameraInput','imageInput','receiptFileInput'])byId(id).onchange=event=>{const file=event.target.files?.[0];event.target.value='';if(file)readFile(file);};
  byId('receiptRead').onclick=()=>{if(sourceFile)readFile(sourceFile);};
  function cancel(){if(task){task.cancelled=true;task.worker?.terminate();task.pdfLoading?.destroy();task.abort?.();}}
  byId('receiptCancel').onclick=cancel;
  byId('closeReceipt').onclick=()=>{cancel();byId('receiptDialog').close();};
  byId('receiptDialog').addEventListener('cancel',cancel);
  byId('receiptDialog').addEventListener('close',clearPreview);
  byId('receiptText').oninput=updateCandidate;
  byId('receiptApply').onclick=()=>{
    const text=byId('receiptText').value.trim();if(!text){progress('読み取り文字がありません。ファイルを選ぶか、文字を貼り付けてください。');return;}
    const parsed=parseReceiptText(text);const category=guessCategory(text);byId('receiptDialog').close();
    openEntry({amount:parsed.amount||'',date:parsed.date||today(),memo:parsed.memo,category:category==='その他'?'未分類':category,benefitAmount:parsed.benefitAmount+parsed.receiptDiscountAmount,benefitDetails:{...(parsed.benefitAmount?{[parsed.benefitType]:parsed.benefitAmount}:{}),...(parsed.receiptDiscountAmount?{'値引き・割引':parsed.receiptDiscountAmount}:{})},benefitType:parsed.benefitType||(parsed.receiptDiscountAmount?'値引き・割引':''),payment:parsed.payment,hint:`${parsed.receiptDiscountAmount?'値引き・割引'+parsed.receiptDiscountAmount.toLocaleString('ja-JP')+'円をお得に加算。支払額からは再度差し引きません。':''}${parsed.benefitHint}${parsed.cashAmount!==null?'レシート合計'+parsed.receiptTotal.toLocaleString('ja-JP')+'円＝支払'+parsed.amount.toLocaleString('ja-JP')+'円＋株主優待'+parsed.benefitAmount.toLocaleString('ja-JP')+'円。':''}${parsed.ambiguous?'複数の金額があります。':''}${parsed.invalidDate?'日付を読み取れませんでした。':''}レシートからの候補です。金額・日付・内容を確認して保存してください。元ファイルは保存されません。`});
  };
  setBusy(false);
}
