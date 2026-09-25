import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {buyDecision,StrategyDecisionEngine} from '../src/strategy-decision-engine.js';

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
