import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {AuthService} from '../src/security.js';
import {saveSystemMonitorSettings,systemMonitorSettings} from '../src/system-signal-monitor.js';

test('system signal monitors are separate per-user switches with safe defaults',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'system-monitors-')),db=openDatabase(path.join(dir,'monitor.db'));new AuthService(db,'strong-admin-token');const user=db.listUsers()[0];
  assert.deepEqual(systemMonitorSettings(db,user.id),{buySignals:false,exitSignals:false,marketRules:true,intervalMinutes:60,buyLastRunAt:null,exitLastRunAt:null});
  const saved=saveSystemMonitorSettings(db,user.id,{buySignals:true,exitSignals:true,marketRules:false});
  assert.equal(saved.buySignals,true);assert.equal(saved.exitSignals,true);assert.equal(saved.marketRules,false);
  const marketRule=db.listRulesV2().find(rule=>rule.visibility==='GLOBAL');
  assert.deepEqual(db.subscribedUserIds(marketRule.id),[]);
  saveSystemMonitorSettings(db,user.id,{marketRules:true});
  assert.deepEqual(db.subscribedUserIds(marketRule.id),[user.id]);
  db.close();fs.rmSync(dir,{recursive:true,force:true});
});
