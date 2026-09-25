import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {conditionCatalogV2,evaluateCondition,evaluateRuleExpression} from '../src/rule-engine-v2.js';
import {buyDecision,exitDecision,StrategyDecisionEngine} from '../src/strategy-decision-engine.js';
import {REVERSAL_WATCH_STRATEGY,reversalWatchRulePack,reversalWatchSymbols} from '../src/reversal-watch-v1.js';

const activeContext={current:{price:3760,close:3755,high:3780,ema20:3700,ema20_prev1:3690,ema50:3600,macd_line:5,macd_signal:4,macd_hist:-2,macd_hist_prev1:-5,macd_hist_prev2:-9,obv:120,obv_prev1:100,obv_prev2:105,obv_low_10:80,volume_ratio_20:1.3,buyer_power:1.25,real_money_flow:1000,return_5d:3,return_20d:8},previous:{price:3650,ema20:3680,macd_line:3,macd_signal:4,mfi14:35},liveHistory:[],portfolio:null};

test('adds ten local conditions and evaluates AT_LEAST',()=>{
  assert.equal(conditionCatalogV2.length,63);
  assert.equal(evaluateCondition({name:'CLOSE_ABOVE_EMA20'},activeContext).state,'active');
  assert.equal(evaluateCondition({name:'RETURN_BELOW',params:{periods:5,value:10}},activeContext).state,'active');
  const expression={type:'group',logic:'AT_LEAST',minMatches:2,children:[{type:'condition',name:'EMA20_NON_DECREASING',params:{}},{type:'condition',name:'OBV_TURN_UP',params:{}},{type:'condition',name:'BUYER_POWER_BELOW',params:{value:.8}}]};
  const result=evaluateRuleExpression(expression,activeContext);assert.equal(result.state,'active');assert.equal(result.values.matches,2);
});

test('primary can become BUY_NOW only with complete order, stop and target',()=>{
  const config=reversalWatchSymbols.find(x=>x.symbol==='بنیرو'),report=buyDecision(config,activeContext,{state:'RULE_WATCH'},{availableToman:20_000_000,updatedAt:new Date().toISOString()});
  assert.equal(report.trigger,'active');assert.equal(report.momentumMatches>=2,true);assert.equal(report.flowMatches>=1,true);assert.equal(report.finalState,'BUY_NOW');
});

test('secondary trigger advances only one state per snapshot',()=>{
  const config={...reversalWatchSymbols.find(x=>x.symbol==='ثامید'),trigger:{type:'condition',name:'OBV_TURN_UP',params:{}}},report=buyDecision(config,activeContext,{state:'SECONDARY_WATCH'});
  assert.equal(report.trigger,'active');assert.equal(report.finalState,'RULE_WATCH');
});

test('weaker trigger participation does not satisfy stronger final flow threshold',()=>{
  const config=reversalWatchSymbols.find(x=>x.symbol==='وبملت'),context={...activeContext,current:{...activeContext.current,price:1520,volume_ratio_20:1.1,buyer_power:1.1,real_money_flow:-100},previous:{...activeContext.previous,price:1500}},report=buyDecision(config,context,{state:'RULE_WATCH'});
  assert.equal(report.trigger,'active');assert.equal(report.flowMatches,0);assert.equal(report.finalState,'TRIGGERED_WAIT_CONFIRMATION');
});

test('hard stop wins and two weakness confirmations produce profit taking',()=>{
  const position={symbol:'نمونه',quantity:100,avg_price:100,highest_price_since_entry:130,initial_stop_price:92,stop_price:92};
  const weak={current:{...activeContext.current,price:119,close:90,ema20:100,obv:90,obv_prev1:100,obv_prev2:95,real_money_flow:-100},previous:{...activeContext.previous,macd_line:5,macd_signal:4},portfolio:position};
  assert.equal(exitDecision(position,weak).finalDecision,'TAKE_PROFIT');
  const loss={...weak,current:{...weak.current,price:91,high:91}};assert.equal(exitDecision(position,loss).exitRule,'HARD_STOP');
});

test('managed upsert does not rewrite unmanaged rules',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'managed-rules-')),db=openDatabase(path.join(dir,'db.sqlite'));
  const first=db.upsertManagedRulePack(REVERSAL_WATCH_STRATEGY,reversalWatchRulePack);assert.equal(first.added,18);
  const second=db.upsertManagedRulePack(REVERSAL_WATCH_STRATEGY,reversalWatchRulePack);assert.equal(second.unchanged,18);
  db.createRuleV2({ruleId:'USER_RULE',symbol:'فولاد',name:'کاربر',scope:'SYMBOL',severity:'INFO',expression:{type:'condition',name:'PRICE_ABOVE',params:{value:1}},action:'ALERT'});
  assert.throws(()=>db.upsertManagedRulePack(REVERSAL_WATCH_STRATEGY,[{...reversalWatchRulePack[0],ruleId:'USER_RULE'}]),/بازنویسی نشد/);
  assert.equal(db.raw.prepare('PRAGMA table_info(portfolio_positions)').all().some(x=>x.name==='initial_stop_price'),true);db.close();
});

test('offline dry run evaluates all 18 symbols without market API calls',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'offline-dry-')),db=openDatabase(path.join(dir,'db.sqlite'));
  const marketData={async marketRows(){throw new Error('API must not be called');}},runtime={telegramTargets(){throw new Error('Telegram must not be called');}},engine=new StrategyDecisionEngine({},db,marketData,runtime),result=await engine.run({dryRun:true,offline:true});
  assert.equal(result.watchlist.length,18);assert.equal(result.apiCalls,0);assert.equal(result.portfolio.length,0);db.close();
});
