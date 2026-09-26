import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {AuthService,SecretVault} from '../src/security.js';
import {RuntimeSettings} from '../src/runtime-settings.js';

const base={telegram:{token:'',chatId:''},brs:{apiKey:'shared-key',baseUrl:'https://example.test',allSymbolsPath:'/all',allSymbolsType:1,symbolPath:'/symbol',indexPath:'/index',candlePath:'/candle',apiKeyHeader:'X-API-Key',apiKeyQuery:'key',userAgent:'test'}};
const monitorInput={title:'پایش',symbol:'فولاد',inputMode:'builder',sourceText:'',expression:{type:'rule',field:'lastPrice',operator:'gt',value:1},actionType:'BUY',quantity:1,proposedPrice:1,maxAmountToman:null,startAt:new Date().toISOString(),endAt:new Date(Date.now()+60000).toISOString(),intervalMinutes:1,cooldownMinutes:1};

test('users have isolated portfolios, monitors, rules and telegram settings',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'multi-user-')),db=openDatabase(path.join(dir,'x.db')),auth=new AuthService(db,'a-strong-password'),senior=db.userByUsername('admin'),normal=auth.createUser({username:'trader',displayName:'معامله‌گر',password:'another-strong-password',role:'NORMAL'}),runtime=new RuntimeSettings(db,new SecretVault('vault-key'),base);
  db.savePortfolioPosition({symbol:'فولاد',quantity:10,avgPrice:100},senior.id);
  db.savePortfolioPosition({symbol:'فولاد',quantity:20,avgPrice:200},normal.id);
  assert.equal(db.portfolioPosition('فولاد',senior.id).quantity,10);
  assert.equal(db.portfolioPosition('فولاد',normal.id).quantity,20);
  db.createMonitor(monitorInput,senior.id);
  assert.equal(db.listMonitors({userId:senior.id}).length,1);
  assert.equal(db.listMonitors({userId:normal.id}).length,0);
  db.createRuleV2({ruleId:'SAME',symbol:'فولاد',name:'قاعده',scope:'SYMBOL',severity:'WATCH',expression:{type:'condition',name:'PRICE_ABOVE',params:{value:1}},action:'ALERT'},senior.id);
  db.createRuleV2({ruleId:'SAME',symbol:'فولاد',name:'قاعده',scope:'SYMBOL',severity:'WATCH',expression:{type:'condition',name:'PRICE_ABOVE',params:{value:2}},action:'ALERT'},normal.id);
  assert.equal(db.listRulesV2({userId:senior.id}).filter(x=>x.visibility==='PERSONAL').length,1);
  assert.equal(db.listRulesV2({userId:normal.id}).filter(x=>x.visibility==='PERSONAL').length,1);
  runtime.mergeMasked({telegramBots:[{id:'a',name:'A',token:'1:a',chatId:'1',enabled:true,primary:true}]},senior.id,true);
  runtime.mergeMasked({telegramBots:[{id:'b',name:'B',token:'2:b',chatId:'2',enabled:true,primary:true}]},normal.id,false);
  assert.equal(runtime.telegramTargets(senior.id)[0].chatId,'1');
  assert.equal(runtime.telegramTargets(normal.id)[0].chatId,'2');
  assert.equal(runtime.public(normal.id,false).apiProviders.length,0);
  assert.equal(runtime.orderedProviders().length,1);
  db.close();fs.rmSync(dir,{recursive:true,force:true});
});

test('the last active senior cannot be demoted or disabled',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'last-senior-')),db=openDatabase(path.join(dir,'x.db')),auth=new AuthService(db,'a-strong-password'),senior=db.userByUsername('admin');
  assert.throws(()=>auth.updateUser(senior.id,{displayName:'مدیر',role:'NORMAL',active:true}),/آخرین کاربر ارشد/);
  assert.throws(()=>auth.updateUser(senior.id,{displayName:'مدیر',role:'SENIOR',active:false}),/آخرین کاربر ارشد/);
  db.close();fs.rmSync(dir,{recursive:true,force:true});
});
