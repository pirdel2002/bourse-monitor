import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {buildOpportunityRanking,scoreSymbol} from '../src/opportunity-scoring.js';

const candles=(start=100,count=90)=>Array.from({length:count},(_,index)=>{const close=start+index*.35+(index>84?(index-84)*1.2:0);return{date:`1405-${String(Math.floor(index/28)+1).padStart(2,'0')}-${String(index%28+1).padStart(2,'0')}`,open:close-.5,high:close+1,low:close-1,close,volume:1000+index*12};});

test('normalizes opportunity score over available data and keeps coverage explicit',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opportunity-')),db=openDatabase(path.join(dir,'db.sqlite'));
  db.upsertCandles('الف',candles(), 'test',1);
  const row={symbol:'الف',name:'شرکت آزمایشی',lastPrice:145,closePrice:144,openPrice:142,dayHigh:146,dayLow:141,volume:5000,tradeValue:700000,buyVolumeReal:3500,buyCountReal:10,sellVolumeReal:1500,sellCountReal:10,buyerPower:2.33,hasBuyerPowerData:true,eps:20,pe:4,groupPe:8,date:'1405-04-10'};
  const item=scoreSymbol(db,row);
  assert.equal(Number.isFinite(item.opportunityScore),true);
  assert.equal(Number.isFinite(item.confirmationScore),true);
  assert.equal(item.dataCoverage<100,true);
  assert.equal(item.components.find(component=>component.key==='flow').coveragePct<100,true);
  assert.equal(item.indicators.realMoneyFlow3d,null);
  const ranking=buildOpportunityRanking(db,[row],{limit:100});
  assert.equal(ranking.items.length,1);
  assert.equal(ranking.items[0].symbol,'الف');
  assert.equal(ranking.methodology.weights.flow,25);
  db.close();
});

test('does not treat unavailable buyer-flow data as neutral observed data',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opportunity-missing-')),db=openDatabase(path.join(dir,'db.sqlite'));
  db.upsertCandles('ب',candles(200), 'test',1);
  const item=scoreSymbol(db,{symbol:'ب',name:'نماد بدون جریان',lastPrice:245,closePrice:244,openPrice:243,dayHigh:246,dayLow:242,volume:1800,hasBuyerPowerData:false,date:'1405-04-10'});
  assert.equal(item.indicators.buyerPower,null);
  assert.equal(item.indicators.realMoneyFlow,null);
  assert.equal(item.components.find(component=>component.key==='flow').coveragePct<80,true);
  db.close();
});
