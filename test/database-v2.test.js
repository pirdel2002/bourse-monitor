import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';

test('symbol search prioritizes ticker and returns cached quote',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bourse-db-')),db=openDatabase(path.join(dir,'x.db'));db.upsertSymbols([{symbol:'فولاد',name:'فولاد مبارکه',lastPrice:3350},{symbol:'افولاد',name:'شرکت نمونه فولاد',lastPrice:10}]);const rows=db.searchSymbols('فولاد');assert.equal(rows[0].symbol,'فولاد');assert.equal(rows[0].lastPrice,3350);db.close();});
test('delete monitor cascades its archived events',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bourse-db-')),db=openDatabase(path.join(dir,'x.db')),monitor=db.createMonitor({title:'x',symbol:'فولاد',inputMode:'text',sourceText:'قیمت بیشتر از 1',expression:{type:'rule',field:'lastPrice',operator:'gt',value:1},actionType:'BUY',quantity:1,proposedPrice:1,maxAmountToman:null,startAt:new Date().toISOString(),endAt:new Date(Date.now()+60000).toISOString(),intervalMinutes:1,cooldownMinutes:1});db.addEvent(monitor.id,'active',{state:'active'},null,true);assert.equal(db.recentEvents().length,1);db.deleteMonitor(monitor.id);assert.equal(db.recentEvents().length,0);db.close();});
