import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {formatMonitorAlert} from '../src/telegram.js';
import {openDatabase} from '../src/db.js';
import {MonitorEngine} from '../src/monitor-engine.js';

test('alert contains action, quantity and proposed price',()=>{
  const text=formatMonitorAlert({symbol:'فولاد',title:'خرید فولاد',actionType:'BUY',quantity:24200,proposedPrice:3300,maxAmountToman:7990000},{lastPrice:3350,closePrice:3340,buyerPower:1.5,bidAskRatio:4},{state:'active',children:[{state:'active',description:'آخرین قیمت ۳٬۳۵۰ > ۳٬۳۰۰',rule:{}}]});
  assert.match(text,/۲۴٬۲۰۰ سهم/);assert.match(text,/۳٬۳۰۰ ریال/);assert.match(text,/خرید/);assert.match(text,/سفارش واقعی ثبت نشده/);
});

test('suppresses legacy sell monitoring for symbols outside the portfolio',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'legacy-sell-')),db=openDatabase(path.join(dir,'db.sqlite')),monitor=db.createMonitor({title:'حد ضرر',symbol:'فولاد',inputMode:'builder',sourceText:'',expression:{type:'rule',field:'lastPrice',operator:'lt',value:3000},actionType:'SELL_STOP_LOSS',quantity:100,proposedPrice:2900,startAt:new Date().toISOString(),endAt:new Date(Date.now()+3600000).toISOString(),intervalMinutes:5,cooldownMinutes:15}),engine=new MonitorEngine({telegram:{}},db,{});const output=await engine.evaluateMonitor(monitor,{symbol:'فولاد',lastPrice:2900,state:'مجاز'});assert.equal(output.state,'insufficient');assert.equal(output.telegramSent,false);db.close();});
