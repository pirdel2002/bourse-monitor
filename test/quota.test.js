import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {ApiQuota} from '../src/quota.js';

test('persists and blocks API requests over the endpoint limit',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bourse-quota-')); const file=path.join(dir,'test.db');
  const config={timeZone:'Asia/Tehran',globalFiveMinutes:10,endpoints:{allSymbols:{daily:2,fiveMinutes:2}}};
  const db=openDatabase(file); const quota=new ApiQuota(db,config); const date=new Date('2026-09-23T06:00:00Z');
  quota.reserve('allSymbols',date);quota.reserve('allSymbols',date);
  assert.throws(()=>quota.reserve('allSymbols',date),/سهمیه/);
  db.close();fs.rmSync(dir,{recursive:true,force:true});
});
