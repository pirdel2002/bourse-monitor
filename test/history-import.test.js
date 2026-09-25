import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRahavardText,matchTicker,normalizeTradeDate} from '../src/history-import.js';
import {saveHistoryMappings} from '../src/history-import.js';
import {openDatabase} from '../src/db.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('parses Rahavard performance rows and keeps the requested tail',()=>{
  const header='<Ticker>,<Per>,<DTYYYYMMDD>,<TIME>,<Open>,<High>,<Low>,<Close>,<Vol>,<Openint>',rows=[
    'FEOLAD,d,20260921,000000,3280,3300,3200,3300,3581143472,3290,type7,900001',
    'FEOLAD,d,20260922,000000,3380,3380,3200,3230,3705610251,3260,type7,900001',
    'FEOLAD,d,20260923,000000,3350,3350,3280,3350,2210827100,3350,type7,900001'];
  const parsed=parseRahavardText([header,...rows].join('\r\n'),2);assert.equal(parsed.ticker,'FEOLAD');assert.equal(parsed.candles.length,3);assert.equal(parsed.candles.at(-1).date,'1405-07-01');assert.equal(parsed.candles.at(-1).close,3350);
});

test('normalizes Gregorian archive dates to the Jalali database calendar',()=>{assert.equal(normalizeTradeDate('20260923'),'1405-07-01');assert.equal(normalizeTradeDate('20260225'),'1404-12-06');assert.equal(normalizeTradeDate('14050701'),'1405-07-01');});

test('matches a file candle to a unique AllSymbols fingerprint',()=>{
  const catalog=[{symbol:'فولاد',date:'1405-07-01',openPrice:3350,dayHigh:3350,dayLow:3280,closePrice:3350,lastPrice:3350,volume:2210827100},{symbol:'نمونه',date:'1405-07-01',openPrice:1,dayHigh:2,dayLow:1,closePrice:2,lastPrice:2,volume:10}];
  const match=matchTicker({ticker:'FEOLAD',candle:{date:'1405-07-01',open:3350,high:3350,low:3280,close:3350,volume:2210827100}},catalog,{});assert.equal(match.symbol,'فولاد');assert.equal(match.method,'fingerprint');
});

test('manual mapping has priority',()=>{const match=matchTicker({ticker:'X',candle:{date:'20260923'}},[{symbol:'فولاد'}],{X:'فولاد'});assert.equal(match.symbol,'فولاد');assert.equal(match.method,'manual');});

test('manual history mapping creates a missing Persian symbol',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'history-map-')),db=openDatabase(path.join(dir,'x.db'));saveHistoryMappings(db,[{ticker:'NEWCO',symbol:'نمادجدید'}]);assert.equal(db.symbolDetail('نمادجدید').name,'نمادجدید');assert.equal(db.getDataState('history-symbol-map').NEWCO,'نمادجدید');db.close();});
