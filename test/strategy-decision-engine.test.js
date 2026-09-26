import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {buildExitSignalRanking,buyDecision,StrategyDecisionEngine} from '../src/strategy-decision-engine.js';

const activeContext={current:{price:100,close:100,ema20:95,ema20_prev:94,macd_hist:-1,macd_hist_prev1:-2,macd_hist_prev2:-3,macd_line:1,macd_signal:0,rsi14:55,mfi14:55,obv:12,obv_prev1:11,obv_prev2:10,volume_ratio_20:1.3,buyer_power:1.3,return_5d:2,return_20d:4},previous:{price:99,ema20:94,macd_line:-1,macd_signal:0},liveHistory:[],portfolio:null,market:{}};

test('generic strategy configuration can produce a candidate without personal symbols',()=>{
  const config={symbol:'نمادآزمایشی',tier:'RULE_WATCH',trigger:{type:'condition',name:'PRICE_ABOVE',params:{value:90}}};
  const report=buyDecision(config,activeContext,{state:'RULE_WATCH'},null);
  assert.equal(report.finalState,'BUY_CANDIDATE');
});

test('empty clean install does not request market data',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'strategy-empty-')),db=openDatabase(path.join(dir,'monitor.db'));
  let calls=0;
  const marketData={async marketRows(){calls++;return[];}},runtime={telegramTargets(){return[];}},engine=new StrategyDecisionEngine({},db,marketData,runtime);
  const result=await engine.run();
  assert.equal(calls,0);
  assert.equal(result.apiCalls,0);
  assert.deepEqual(result.watchlist,[]);
  db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});

test('exit signal ranking evaluates only portfolio exits without market calls',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'exit-ranking-')),db=openDatabase(path.join(dir,'monitor.db'));
  const candles=Array.from({length:70},(_,index)=>({date:`1405-${String(Math.floor(index/28)+1).padStart(2,'0')}-${String(index%28+1).padStart(2,'0')}`,open:100,high:102,low:98,close:100,volume:1000+index}));
  db.upsertCandles('الف',candles,'test',1);db.savePortfolioPosition({symbol:'الف',quantity:1000,avgPrice:100,stopPrice:95,initialStopPrice:92});
  const result=buildExitSignalRanking(db,[{symbol:'الف',name:'شرکت الف',date:'1405-07-01',lastPrice:90,closePrice:90,openPrice:95,dayHigh:96,dayLow:89,volume:2000,hasBuyerPowerData:false}],null);
  assert.equal(result.evaluatedPositions,1);assert.equal(result.signalCount,1);assert.equal(result.items[0].finalDecision,'SELL_ALL');assert.equal(result.items[0].suggestedAction,'SELL');assert.equal(result.items[0].suggestedQuantity,1000);assert.match(result.items[0].shortReason,/۸٪/);
  db.close();fs.rmSync(dir,{recursive:true,force:true});
});
