import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePersianCondition,evaluateExpression,validateExpression} from '../src/conditions.js';

test('parses Persian AND condition with Persian digits',()=>{
  const expression=parsePersianCondition('تثبیت بالای ۳۳۰۰ و قدرت خریدار بیشتر از ۱.۳');
  assert.equal(expression.op,'AND');
  assert.equal(expression.children[0].operator,'stabilizes_above');
  assert.equal(expression.children[0].value,3300);
  assert.equal(expression.children[1].field,'buyerPower');
});

test('evaluates a nested AND OR expression',()=>{
  const expression={type:'group',op:'AND',children:[
    {type:'rule',field:'lastPrice',operator:'gt',value:3300},
    {type:'group',op:'OR',children:[
      {type:'rule',field:'buyerPower',operator:'gte',value:1.3},
      {type:'rule',field:'bidAskRatio',operator:'gte',value:3}
    ]}
  ]};
  validateExpression(expression);
  const result=evaluateExpression(expression,{lastPrice:3350,buyerPower:1.1,bidAskRatio:4},[]);
  assert.equal(result.state,'active');
});

test('stabilization requires consecutive samples',()=>{
  const expression={type:'rule',field:'lastPrice',operator:'stabilizes_above',value:3300,options:{samples:3}};
  assert.equal(evaluateExpression(expression,{lastPrice:3350},[{lastPrice:3310},{lastPrice:3330},{lastPrice:3350}]).state,'active');
  assert.equal(evaluateExpression(expression,{lastPrice:3350},[{lastPrice:3290},{lastPrice:3330},{lastPrice:3350}]).state,'inactive');
});

test('sell queue must exist before it is cleared',()=>{
  const expression={type:'rule',field:'sellQueueValue',operator:'sell_queue_cleared'};
  const result=evaluateExpression(expression,{sellQueueValue:0},[{sellQueueValue:1000000},{sellQueueValue:0}]);
  assert.equal(result.state,'active');
});
