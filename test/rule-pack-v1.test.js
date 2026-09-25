import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {defaultRulePackV1} from '../src/rule-pack-v1.js';
import {evaluateCondition,validateRuleExpressionV2} from '../src/rule-engine-v2.js';

test('rule pack is valid, unique, enabled and uses the requested cooldowns',()=>{
  const ids=new Set();
  for(const rule of defaultRulePackV1){
    validateRuleExpressionV2(rule.expression);
    assert.equal(ids.has(rule.ruleId),false,`duplicate ${rule.ruleId}`);ids.add(rule.ruleId);
    assert.equal(rule.enabled,true,`${rule.ruleId} must be enabled`);
    assert.equal(rule.cooldownMinutes,['WARNING','SELL','EXIT'].includes(rule.severity)?15:45,rule.ruleId);
  }
  assert.equal(defaultRulePackV1.length,221);
  assert.equal(defaultRulePackV1.find(x=>x.ruleId==='PORTFOLIO_عیار_BUYER_POWER_COLLAPSE'),undefined);
  assert.ok(defaultRulePackV1.find(x=>x.ruleId==='PORTFOLIO_عیار_PROFIT_5'));
});

test('rule pack installation is idempotent and preserves user rules',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rule-pack-')),db=openDatabase(path.join(dir,'db.sqlite'));
  db.createRuleV2({ruleId:'USER_RULE',symbol:'فولاد',name:'قاعده کاربر',scope:'SYMBOL',severity:'WATCH',expression:{type:'condition',name:'PRICE_ABOVE',params:{value:1}},action:'ALERT'});
  assert.equal(db.installRulePack(defaultRulePackV1).added,221);
  assert.equal(db.installRulePack(defaultRulePackV1).added,0);
  assert.ok(db.listRulesV2().find(x=>x.ruleId==='USER_RULE'));
  assert.equal(db.listRulesV2().length,222);db.close();
});

test('new downside, queue and recovery score conditions evaluate locally',()=>{
  assert.equal(evaluateCondition({name:'BUYER_POWER_BELOW',params:{value:.7}},{current:{buyer_power:.6}}).state,'active');
  assert.equal(evaluateCondition({name:'BUY_QUEUE_VALUE_CHANGE_15M_ABOVE',params:{value:30}},{market:{buy_queue_value:140},market15m:{buy_queue_value:100}}).state,'active');
  const current={macd_hist:-1,macd_hist_prev1:-2,macd_hist_prev2:-3,rsi14:55,mfi14:60,obv:12,obv_prev1:10,obv_prev2:11,volume_ratio_20:1.4,buyer_power:1.3,price:120,ema20:110,ema50:100};
  assert.equal(evaluateCondition({name:'TECH_RECOVERY_VERY_STRONG'},{current}).state,'active');
});
