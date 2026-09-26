import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';

test('a fresh database has no personal monitors and includes the managed market pack',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clean-install-'));
  const db=openDatabase(path.join(dir,'monitor.db'));
  assert.equal(db.listMonitors().length,0);
  const rules=db.listRulesV2();
  assert.equal(rules.length,5);
  assert.equal(rules.every(rule=>rule.visibility==='GLOBAL'&&rule.managed_pack==='system_market_v1'),true);
  db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});

test('opening an existing database preserves user rules',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'upgrade-preserve-'));
  const filename=path.join(dir,'monitor.db');
  let db=openDatabase(filename);
  db.createRuleV2({ruleId:'USER_RULE',symbol:'نمادآزمایشی',name:'قاعده کاربر',description:'',enabled:true,scope:'SYMBOL',severity:'BUY',expression:{type:'condition',name:'PRICE_ABOVE',params:{value:100}},action:'BUY_ALERT',actionParams:{source:'manual'},cooldownMinutes:45,oncePerDay:false,intervalMinutes:5});
  db.close();
  db=openDatabase(filename);
  const rules=db.listRulesV2();
  assert.equal(rules.length,6);
  assert.equal(rules.some(rule=>rule.ruleId==='USER_RULE'),true);
  db.close();
  fs.rmSync(dir,{recursive:true,force:true});
});
