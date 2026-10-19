'use strict';
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../receipt.js'),'utf8'),ctx=vm.createContext({});vm.runInContext(source,ctx);
const samples=[
 ['スーパー\n2026/10/19 12:35\n小計 463\n合計 ¥500\n消費税 37\nお預り 1000\nお釣り 500',{amount:500,date:'2026-10-19',memo:'スーパー'}],
 ['コンビニ\n合計\n¥1,234\n内税 91',{amount:1234}],
 ['電子レシート\nお買上合計 2,500円\nポイント 25',{amount:2500}],
 ['STORE\nTOTAL 1234\nCASH 2000\nCHANGE 766',{amount:1234}],
 ['商品A 200円\n商品B 300円',{amount:0}],
 ['合計 1000円\nお支払金額 900円',{amount:900}],
 ['合計 500円\n合計 800円',{amount:500,ambiguous:true}],
 ['店\n2026年2月30日\n合計５００円',{amount:500,date:'',invalidDate:true}],
 ['merchant: テストスーパー\ndate: 2026-10-19\namount: 500',{memo:'テストスーパー',amount:500,date:'2026-10-19'}],
 ['合 計 ¥ 1 7 , 0 3 7',{amount:17037}],
 ['合計 ¥17, 037',{amount:17037}],
 ['合 計 ¥１７，０３７\n株主優待券 ¥1,800\nAEON Pay(クレジット) ¥15,237\nお釣り ¥0',{receiptTotal:17037,amount:15237,benefitAmount:1800,payment:'AEON Pay'}],
 ['合計17037\n株主優待券1800\nAEON Pay15200',{amount:17037,benefitAmount:1800}],
 ['割引 10% -13\nアプリクーポン5%引 5% −6\n合計500',{amount:500,receiptDiscountAmount:19,receiptDiscountCount:2}],
 ['割引 -13\n値引合計 -13\n合計500',{receiptDiscountAmount:13}],
 ['返品 -500\n2026-10-19\n合計1000',{receiptDiscountAmount:0}],
 ['割引 -1 2 3\n合計500',{receiptDiscountAmount:123}],
 ['値引合計 -200\n合計500',{receiptDiscountAmount:200}],
 ['合計17037\n株 主 優 待 券 ¥1,800',{amount:17037,benefitAmount:1800,cashAmount:null}],
 ['合計17037\n株主優待券\n¥1,800\nAEON Pay ¥15,237',{amount:15237,benefitAmount:1800}],
 ['合計15237\n株主優待券1800\nAEON Pay読み取り失敗',{amount:15237,benefitAmount:1800,cashAmount:null}],
 ['¥500',{amount:500}],['合計 8円',{amount:8}],['内税合計 80円',{amount:0}],
];
const amounts=[13,6,14,7,14,7,18,8,9,15,20,84,29,30,30,30,30,33,34,294,35,129,132,162,162,207,222];
samples.push([amounts.map(n=>`割引 -${n}`).join('\n')+'\n合 計 ¥ 1 7 , 0 3 7\n株主優待券 ¥1,800\nAEON Pay ¥15,237',{amount:15237,benefitAmount:1800,receiptDiscountAmount:1774,receiptDiscountCount:27}]);
for(const [text,want]of samples){ctx.input=text;const result=vm.runInContext('parseReceiptText(input)',ctx);for(const[k,v]of Object.entries(want))assert.equal(result[k],v,`${text}: ${k}`);}
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.match(html,/id="imageInput"[^>]*accept="image\/\*" hidden/);assert.match(html,/id="cameraInput"[^>]*capture="environment"/);assert.match(html,/id="receiptFileInput"[^>]*\.pdf/);
console.log(`PASS: ${samples.length} receipt total/date/ambiguity cases; separate camera/photo/file selectors`);
