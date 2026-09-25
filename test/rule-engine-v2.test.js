import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {evaluateCondition,evaluateRuleExpression,normalizeRuleExpressionV2,RuleEngineV2,validateRuleExpressionV2} from '../src/rule-engine-v2.js';

test('evaluates MACD recovery and a confirmed breakout',()=>{const context={current:{price:3910,volume_ratio_20:1.8,buyer_power:1.4,macd_hist:-20,macd_hist_prev1:-60,macd_hist_prev2:-100},previous:{price:3880}};assert.equal(evaluateCondition({name:'MACD_RECOVERY_EARLY'},context).state,'active');const expression={type:'group',logic:'AND',children:[{type:'condition',name:'BREAKOUT_CONFIRMED',params:{level:3900,volume_ratio:1.5,buyer_power:1.2}},{type:'condition',name:'MACD_RECOVERY_EARLY'}]};assert.equal(evaluateRuleExpression(expression,context).state,'active');});

test('normalizes the compact JSON rule format used by imports',()=>{const expression=normalizeRuleExpressionV2({op:'AND',conditions:[{type:'PRICE_CROSS_ABOVE',value:3900},{type:'VOLUME_RATIO_ABOVE',value:1.5}]});validateRuleExpressionV2(expression);assert.deepEqual(expression,{type:'group',logic:'AND',children:[{type:'condition',name:'PRICE_CROSS_ABOVE',params:{value:3900}},{type:'condition',name:'VOLUME_RATIO_ABOVE',params:{value:1.5}}]});});

test('creates the versioned schema and feeds multiple rules from one market snapshot',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rule-v2-')),db=openDatabase(path.join(dir,'db.sqlite'));db.createRuleV2({ruleId:'R1',symbol:'بنیرو',name:'قیمت',scope:'SYMBOL',severity:'BUY',expression:{type:'condition',name:'PRICE_ABOVE',params:{value:3900}},action:'BUY_ALERT'});db.createRuleV2({ruleId:'R2',symbol:'بنیرو',name:'قدرت',scope:'SYMBOL',severity:'WATCH',expression:{type:'condition',name:'BUYER_POWER_ABOVE',params:{value:1.2}},action:'ALERT'});let calls=0;const marketData={async marketRows(){calls++;return[{symbol:'بنیرو',lastPrice:4000,changePct:2,buyerPower:1.4,tradeValue:1_000_000,buyVolumeReal:20,sellVolumeReal:10,closePrice:3990,name:'بنیرو'}];},async ruleContext(symbol,row,market){return{current:{price:row.lastPrice,buyer_power:row.buyerPower},previous:{price:3800,buyer_power:1},liveHistory:[],portfolio:null,market};}};const runtime={telegramTargets(){return[];}},engine=new RuleEngineV2({},db,marketData,runtime),output=await engine.run();assert.equal(output.rules,2);assert.equal(calls,1);assert.equal(output.results.every(x=>x.state==='active'),true);assert.equal(db.listRulesV2().length,2);db.close();});
