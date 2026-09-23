import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMonitorAlert} from '../src/telegram.js';

test('alert contains action, quantity and proposed price',()=>{
  const text=formatMonitorAlert({symbol:'فولاد',title:'خرید فولاد',actionType:'BUY',quantity:24200,proposedPrice:3300,maxAmountToman:7990000},{lastPrice:3350,closePrice:3340,buyerPower:1.5,bidAskRatio:4},{state:'active',children:[{state:'active',description:'آخرین قیمت ۳٬۳۵۰ > ۳٬۳۰۰',rule:{}}]});
  assert.match(text,/۲۴٬۲۰۰ سهم/);assert.match(text,/۳٬۳۰۰ ریال/);assert.match(text,/خرید/);assert.match(text,/سفارش واقعی ثبت نشده/);
});
