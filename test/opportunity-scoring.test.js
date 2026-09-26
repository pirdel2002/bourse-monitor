import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {buildOpportunityRanking,scoreOpportunityAnalysis,scoreSymbol} from '../src/opportunity-scoring.js';

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

const scenario=(symbol,overrides={})=>{
  const context={price:10350,close:10350,low:10200,ema20:10300,ema20_prev1:10280,ema50:9800,rsi14:56,rsi14_prev1:52,mfi14:58,mfi14_prev1:51,macd_line:120,macd_signal:150,macd_hist:-30,macd_hist_prev1:-70,macd_hist_prev2:-120,obv:150000,obv_prev1:145000,obv_prev5:125000,obv_high_20:155000,obv_low_20:90000,close_prev5:10200,bbw:.12,bbw_prev1:.11,bbw_prev2:.12,bbw_percentile_120:15,atr14:260,atr14_prev:280,volume:1800000,volume_sma20:1000000,volume_ratio_20:1.8,buyer_power:1.7,real_money_flow:250000000,return_5d:4,return_20d:12,high_20:11500,low_10:9750,low_20:9400,...overrides};
  const signals={macd_recovery_early:context.macd_hist<0&&context.macd_hist>context.macd_hist_prev1&&context.macd_hist_prev1>context.macd_hist_prev2,macd_bullish_cross:false,obv_turn_up:context.obv>context.obv_prev1};
  return scoreOpportunityAnalysis({symbol,name:symbol,lastPrice:context.price,closePrice:context.close,tradeValue:1_000_000_000,eps:100,pe:5,groupPe:8},{valid:true,candleCount:120,asOf:'1405-07-04',context,signals});
};

test('Pipad: good trend and RSI cannot hide bearish MACD plus MFI below 40',()=>{
  const item=scenario('پی‌پاد',{price:7560,close:7560,ema20:7272,ema20_prev1:7250,ema50:6237,rsi14:64.75,rsi14_prev1:62,mfi14:37.21,mfi14_prev1:38,macd_line:376,macd_signal:531,macd_hist:-156,macd_hist_prev1:-140,macd_hist_prev2:-120,volume_ratio_20:1.4,buyer_power:1.4,real_money_flow:10000000,high_20:8000,low_10:7000,low_20:6700,return_5d:5,return_20d:20});
  assert.equal(item.confirmationScore<=60,true);
  assert.equal(item.confirmationGates.momentum,60);
});

test('Zegoldasht: improving negative histogram can produce an early entry',()=>{
  const item=scenario('زگلدشت');
  assert.equal(item.trigger.type,'EARLY_REVERSAL_ENTRY');
  assert.equal(['EARLY_ENTRY','BUY_CANDIDATE'].includes(item.state),true);
  assert.equal(item.confirmationScore<=85,true);
});

test('Shepdis: strongly negative real money flow caps confirmation',()=>{
  const item=scenario('شپدیس',{macd_line:180,macd_signal:150,macd_hist:30,macd_hist_prev1:10,macd_hist_prev2:-10,real_money_flow:-200_000_000,buyer_power:.7,volume_ratio_20:1.6});
  assert.equal(item.confirmationScore<=55,true);
  assert.equal(item.confirmationGates.flow,55);
  assert.equal(item.warnings.includes('STRONG_NEGATIVE_REAL_MONEY_FLOW'),true);
});

test('Damin: price above max buy blocks candidate and requests pullback',()=>{
  const item=scenario('دامین',{price:11000,close:11000,ema20:10000,ema20_prev1:9900,ema50:9000,macd_line:200,macd_signal:150,macd_hist:50,macd_hist_prev1:20,macd_hist_prev2:-10,high_20:12000,low_10:9500,low_20:9000,return_5d:8,return_20d:15});
  assert.equal(item.noChaseStatus,'FAIL_ABOVE_MAX_BUY');
  assert.equal(item.state,'WAIT_FOR_PULLBACK');
  assert.equal(item.buyNowEligible,false);
});

test('Dedana: healthy early recovery is not rejected before MACD cross',()=>{
  const item=scenario('ددانا',{macd_line:90,macd_signal:130,macd_hist:-40,macd_hist_prev1:-90,macd_hist_prev2:-160});
  assert.equal(item.trigger.type,'EARLY_REVERSAL_ENTRY');
  assert.notEqual(item.state,'REJECT');
  assert.equal(item.reasons.includes('EARLY_REVERSAL_CONFIRMED'),true);
});
