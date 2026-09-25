import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const cleanTicker=value=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9_]/g,'');
const cleanDate=value=>String(value||'').replace(/\D/g,'').slice(0,8);
const finite=value=>Number.isFinite(Number(value));
const div=(a,b)=>Math.trunc(a/b),mod=(a,b)=>a-Math.trunc(a/b)*b;
function g2d(gy,gm,gd){let d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*mod(gm+9,12)+2,5)+gd-34840408;d=d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752;return d;}
function d2g(jdn){let j=4*jdn+139361631;j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908;const i=div(mod(j,1461),4)*5+308,gd=div(mod(i,153),5)+1,gm=mod(div(i,153),12)+1,gy=div(j,1461)-100100+div(8-gm,6);return {gy,gm,gd};}
function jalCal(jy,withoutLeap=false){const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];let gy=jy+621,leapJ=-14,jp=breaks[0],jm=0,jump=0;if(jy<jp||jy>=breaks.at(-1))throw new Error('سال خارج از محدوده است.');for(let i=1;i<breaks.length;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ+=div(jump,33)*8+div(mod(jump,33),4);jp=jm;}let n=jy-jp;leapJ+=div(n,33)*8+div(mod(n,33)+3,4);if(mod(jump,33)===4&&jump-n===4)leapJ++;const leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150,march=20+leapJ-leapG;if(withoutLeap)return {gy,march};if(jump-n<6)n=n-jump+div(jump+4,33)*33;let leap=mod(mod(n+1,33)-1,4);if(leap===-1)leap=4;return {leap,gy,march};}
function d2j(jdn){const g=d2g(jdn);let jy=g.gy-621;const r=jalCal(jy,false),jdn1f=g2d(g.gy,3,r.march);let k=jdn-jdn1f;if(k>=0){if(k<=185)return {jy,jm:1+div(k,31),jd:mod(k,31)+1};k-=186;}else{jy--;k+=179;if(r.leap===1)k++;}return {jy,jm:7+div(k,30),jd:mod(k,30)+1};}
export function normalizeTradeDate(value){const date=cleanDate(value);if(!/^\d{8}$/.test(date))return '';const year=Number(date.slice(0,4)),month=Number(date.slice(4,6)),day=Number(date.slice(6,8));if(year<1700)return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const j=d2j(g2d(year,month,day));return `${j.jy}-${String(j.jm).padStart(2,'0')}-${String(j.jd).padStart(2,'0')}`;}

export function parseRahavardText(text,limit=300){
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean),rows=[];let ticker='';
  for(const line of lines){
    if(line.startsWith('<Ticker>'))continue;
    const p=line.split(',');if(p.length<9)continue;
    const currentTicker=cleanTicker(p[0]),date=normalizeTradeDate(p[2]),values=p.slice(4,9).map(Number);
    if(!currentTicker||!date||!values.every(finite)||values.slice(0,4).some(x=>x<=0)||values[4]<0)continue;
    ticker=ticker||currentTicker;if(currentTicker!==ticker)throw new Error('یک فایل شامل بیش از یک نماد است.');
    rows.push({date,open:values[0],high:values[1],low:values[2],close:values[3],volume:values[4]});
  }
  rows.sort((a,b)=>a.date.localeCompare(b.date));
  return {ticker,candles:rows.slice(-Math.max(50,Math.min(1000,Number(limit)||300)))};
}

const equal=(a,b)=>finite(a)&&finite(b)&&Math.abs(Number(a)-Number(b))<0.0001;
export function matchTicker(last,catalog,manual={}){
  if(!last)return {symbol:null,method:'none',candidates:[]};
  const forced=manual[cleanTicker(last.ticker)];if(forced&&catalog.some(x=>x.symbol===forced))return {symbol:forced,method:'manual',candidates:[forced]};
  const ranked=catalog.map(row=>{
    let score=0;
    if(equal(row.volume,last.candle.volume))score+=5;
    if(equal(row.openPrice,last.candle.open))score+=2;
    if(equal(row.dayHigh,last.candle.high))score+=2;
    if(equal(row.dayLow,last.candle.low))score+=2;
    if(equal(row.closePrice,last.candle.close)||equal(row.lastPrice,last.candle.close))score+=3;
    return score>=7?{symbol:row.symbol,score}:null;
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  if(ranked.length&&(!ranked[1]||ranked[0].score>ranked[1].score))return {symbol:ranked[0].symbol,method:'fingerprint',candidates:ranked.slice(0,5).map(x=>x.symbol)};
  return {symbol:null,method:'unmatched',candidates:ranked.slice(0,5).map(x=>x.symbol)};
}

function listEntries(file){
  const output=execFileSync('unzip',['-Z1',file],{encoding:'utf8',maxBuffer:2_000_000});
  return output.split(/\r?\n/).filter(x=>/\.txt$/i.test(x));
}

export function importRahavardZip(buffer,db,{limit=300,maxEntries=1200}={}){
  if(!Buffer.isBuffer(buffer)||buffer.length<4||buffer[0]!==0x50||buffer[1]!==0x4b)throw new Error('فایل ZIP معتبر نیست.');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bourse-history-')),file=path.join(dir,'history.zip');
  try{
    fs.writeFileSync(file,buffer);const entries=listEntries(file);if(!entries.length)throw new Error('فایل متنی تاریخچه داخل ZIP پیدا نشد.');if(entries.length>maxEntries)throw new Error('تعداد فایل‌های ZIP بیش از حد مجاز است.');
    const catalog=db.allSymbolDetails(),manual=db.getDataState('history-symbol-map')||{},result={files:entries.length,importedSymbols:0,importedCandles:0,invalid:[],unmatched:[],latestDate:null};
    for(const entry of entries){
      let parsed;
      try{const raw=execFileSync('unzip',['-p',file,entry],{encoding:'utf8',maxBuffer:8_000_000});parsed=parseRahavardText(raw,limit);}catch(error){result.invalid.push({file:entry,error:error.message});continue;}
      if(!parsed.ticker||!parsed.candles.length){result.invalid.push({file:entry,error:'کندل معتبر پیدا نشد.'});continue;}
      const candle=parsed.candles.at(-1),matched=matchTicker({ticker:parsed.ticker,candle},catalog,manual);
      if(!matched.symbol){result.unmatched.push({ticker:parsed.ticker,file:entry,lastDate:candle.date,lastClose:candle.close,candidates:matched.candidates});continue;}
      db.upsertCandles(matched.symbol,parsed.candles,'rahavard-performance',1);result.importedSymbols++;result.importedCandles+=parsed.candles.length;result.latestDate=!result.latestDate||candle.date>result.latestDate?candle.date:result.latestDate;
      manual[parsed.ticker]=matched.symbol;
    }
    db.setDataState('history-symbol-map',manual);db.setDataState('history-import:last',{...result,unmatched:result.unmatched.slice(0,200),invalid:result.invalid.slice(0,100),importedAt:new Date().toISOString()});
    return result;
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}

export function saveHistoryMappings(db,input){
  const current=db.getDataState('history-symbol-map')||{},catalog=new Set(db.allSymbolDetails().map(x=>x.symbol));
  for(const item of Array.isArray(input)?input:[]){const ticker=cleanTicker(item.ticker),symbol=String(item.symbol||'').trim();if(!ticker||!catalog.has(symbol))throw new Error(`نگاشت ${ticker||'نامشخص'} معتبر نیست.`);current[ticker]=symbol;}
  db.setDataState('history-symbol-map',current);return current;
}
