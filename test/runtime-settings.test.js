import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {SecretVault} from '../src/security.js';
import {RuntimeSettings} from '../src/runtime-settings.js';

const base={telegram:{token:'bot-secret',chatId:'1'},brs:{apiKey:'api-secret',baseUrl:'https://example.test',allSymbolsPath:'/all',allSymbolsType:1,symbolPath:'/symbol',indexPath:'/index',candlePath:'/candle',apiKeyHeader:'X-Key',apiKeyQuery:'key',userAgent:'UA'}};
test('runtime settings preserve masked secrets and rotate balanced providers',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'runtime-')),db=openDatabase(path.join(dir,'x.db')),runtime=new RuntimeSettings(db,new SecretVault('vault-key'),base);const initial=runtime.public();assert.match(initial.telegramBots[0].token,/^••••/);const saved=runtime.mergeMasked({...initial,apiMode:'balance',apiProviders:[...initial.apiProviders,{id:'second',name:'second',apiKey:'key-2',enabled:true,priority:2,baseUrl:'https://example.test'}]});assert.match(saved.apiProviders[0].apiKey,/^••••/);assert.equal(runtime.internal().apiProviders[0].apiKey,'api-secret');const first=runtime.orderedProviders()[0].id,second=runtime.orderedProviders()[0].id;assert.notEqual(first,second);db.close();});
