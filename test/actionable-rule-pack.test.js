import test from 'node:test';
import assert from 'node:assert/strict';
import {actionableRulePack} from '../src/actionable-rule-pack.js';
import {isFreshActionQuote,resolveActionableOrder} from '../src/actionable-order.js';
import {evaluateCondition,validateRuleExpressionV2} from '../src/rule-engine-v2.js';

test('all sourced candidates and photographed holdings have unique, valid action rules',()=>{
  assert.equal(actionableRulePack.length,40);
  assert.equal(new Set(actionableRulePack.map(x=>x.ruleId)).size,40);
  for(const rule of actionableRulePack){
    validateRuleExpressionV2(rule.expression);
    assert.ok(['BUY_ALERT','SELL_ALERT'].includes(rule.action));
    assert.equal(rule.actionParams.executableOnly,true);
  }
  assert.equal(actionableRulePack.find(x=>x.symbol==='سهگمت'),undefined);
  assert.equal(actionableRulePack.find(x=>x.symbol==='شیران'),undefined);
  assert.equal(actionableRulePack.find(x=>x.symbol==='ومهان').enabled,false);
  assert.equal(actionableRulePack.find(x=>x.ruleId==='ACTION_SELL_فولاد').enabled,false);
});

test('an order needs an exact size, allowed price and recent confirmed cash',()=>{
  const buy=actionableRulePack.find(x=>x.ruleId==='ACTION_BUY_بنیرو');
  const now=new Date(),dateParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const date=`${dateParts.year}-${dateParts.month}-${dateParts.day}`,time=`${dateParts.hour}:${dateParts.minute}:00`;
  const context={marketRow:{lastPrice:3750,lowerLimit:3500,upperLimit:4000,date,time},portfolio:null,current:{price:3750}};
  const recent={availableToman:12_000_000,updatedAt:new Date().toISOString()};
  const order=resolveActionableOrder(buy,context,recent);
  assert.equal(order.quantity,26498);assert.equal(order.limitPrice,3760);
  assert.equal(resolveActionableOrder(buy,context,{availableToman:10_000_000,updatedAt:recent.updatedAt}),null);
  assert.equal(resolveActionableOrder(buy,{...context,marketRow:{...context.marketRow,lastPrice:3800}},recent),null);
  assert.equal(resolveActionableOrder(buy,context,{...recent,updatedAt:'2020-01-01T00:00:00Z'}),null);
  assert.equal(isFreshActionQuote({...context.marketRow,date:'2020-01-01'}),false);
  assert.equal(resolveActionableOrder(actionableRulePack.find(x=>x.symbol==='ومهان'),context,recent),null);
});

test('OBV must not undercut the historical low to confirm Vahafez',()=>{
  const condition={name:'OBV_HOLD_RECENT_LOW'};
  assert.equal(evaluateCondition(condition,{current:{obv:101,obv_low_10:100}}).state,'active');
  assert.equal(evaluateCondition(condition,{current:{obv:99,obv_low_10:100}}).state,'inactive');
  assert.equal(evaluateCondition(condition,{current:{obv:99}}).state,'insufficient');
});
