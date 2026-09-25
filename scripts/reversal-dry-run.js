import path from 'node:path';
import {loadDotEnv,getConfig} from '../src/config.js';
import {openDatabase} from '../src/db.js';
import {conditionCatalogV2} from '../src/rule-engine-v2.js';
import {buildPortfolioExitRulePack,REVERSAL_WATCH_STRATEGY,reversalWatchRulePack} from '../src/reversal-watch-v1.js';
import {StrategyDecisionEngine} from '../src/strategy-decision-engine.js';

loadDotEnv();
const config=getConfig(),dbFile=path.resolve(process.argv[2]||config.dbPath),db=openDatabase(dbFile);
try{
  const rulesBefore=Number(db.raw.prepare('SELECT count(*) count FROM rules_v2').get().count),conditionsAfter=conditionCatalogV2.length,conditionsBefore=conditionsAfter-10,pack=[...reversalWatchRulePack,...buildPortfolioExitRulePack(db.portfolioPositions().map(x=>x.symbol))],seed=db.upsertManagedRulePack(REVERSAL_WATCH_STRATEGY,pack),rulesAfter=Number(db.raw.prepare('SELECT count(*) count FROM rules_v2').get().count);
  const engine=new StrategyDecisionEngine(config,db,{async marketRows(){throw new Error('Offline Dry Run must not call API.');}},{telegramTargets(){throw new Error('Offline Dry Run must not call Telegram.');}}),result=await engine.run({dryRun:true,offline:true});
  process.stdout.write(`${JSON.stringify({database:dbFile,migrationVersion:Number(db.raw.prepare('SELECT max(version) version FROM schema_migrations').get().version||0),rulesBefore,rulesAfter,conditionsBefore,conditionsAfter,seed,...result},null,2)}\n`);
}finally{db.close();}
