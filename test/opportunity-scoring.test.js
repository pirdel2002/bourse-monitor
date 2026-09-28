import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openDatabase} from '../src/db.js';
import {applyPositionPolicy,buildOpportunityRanking,buildOpportunityShortReason,calculateOpportunityV2,calculatePreMove,calculateRealMoneyFlowMetrics,classifyNextLegEntry,classifyOpportunityState,classifySetup,normalizeDecisionReasons,scoreOpportunityAnalysis,scoreSymbol} from '../src/opportunity-scoring.js';

const candles=(start=100,count=90)=>Array.from({length:count},(_,index)=>{const close=start+index*.35+(index>84?(index-84)*1.2:0);return{date:`1405-${String(Math.floor(index/28)+1).padStart(2,'0')}-${String(index%28+1).padStart(2,'0')}`,open:close-.5,high:close+1,low:close-1,close,volume:1000+index*12};});

test('normalizes opportunity score over available data and keeps coverage explicit',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opportunity-')),db=openDatabase(path.join(dir,'db.sqlite'));
  db.upsertCandles('الف',candles(), 'test',1);
  const row={symbol:'الف',name:'شرکت آزمایشی',lastPrice:145,closePrice:144,openPrice:142,dayHigh:146,dayLow:141,volume:5000,tradeValue:700000,buyVolumeReal:3500,buyCountReal:10,sellVolumeReal:1500,sellCountReal:10,buyerPower:2.33,hasBuyerPowerData:true,eps:20,pe:4,groupPe:8,date:'1405-04-10'};
  const item=scoreSymbol(db,row);
  assert.equal(Number.isFinite(item.opportunityScore),true);
  assert.equal(Number.isFinite(item.confirmationScore),true);
  assert.equal(item.dataCoverage<100,true);
  assert.equal(item.components.find(component=>component.key==='flow').coveragePct<100,true);
  assert.equal(item.indicators.realMoneyFlow3d,null);
  const ranking=buildOpportunityRanking(db,[row],{limit:100});
  assert.equal(ranking.items.length,1);
  assert.equal(ranking.items[0].symbol,'الف');
  assert.equal(ranking.methodology.v2Weights.entry,.35);
  db.close();
});

test('does not treat unavailable buyer-flow data as neutral observed data',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opportunity-missing-')),db=openDatabase(path.join(dir,'db.sqlite'));
  db.upsertCandles('ب',candles(200), 'test',1);
  const item=scoreSymbol(db,{symbol:'ب',name:'نماد بدون جریان',lastPrice:245,closePrice:244,openPrice:243,dayHigh:246,dayLow:242,volume:1800,hasBuyerPowerData:false,date:'1405-04-10'});
  assert.equal(item.indicators.buyerPower,null);
  assert.equal(item.indicators.realMoneyFlow,null);
  assert.equal(item.components.find(component=>component.key==='flow').coveragePct<80,true);
  db.close();
});

const scenario=(symbol,overrides={})=>{
  const context={price:10350,close:10350,low:10200,ema20:10300,ema20_prev1:10280,ema50:9800,rsi14:56,rsi14_prev1:52,mfi14:58,mfi14_prev1:51,macd_line:120,macd_signal:150,macd_hist:-30,macd_hist_prev1:-70,macd_hist_prev2:-120,obv:150000,obv_prev1:145000,obv_prev5:125000,obv_high_20:155000,obv_low_20:90000,close_prev5:10200,bbw:.12,bbw_prev1:.11,bbw_prev2:.12,bbw_percentile_120:15,atr14:260,atr14_prev:280,volume:1800000,volume_sma20:1000000,volume_ratio_20:1.8,buyer_power:1.7,real_money_flow:250000000,return_5d:4,return_20d:12,high_20:11500,low_10:9750,low_20:9400,...overrides};
  const signals={macd_recovery_early:context.macd_hist<0&&context.macd_hist>context.macd_hist_prev1&&context.macd_hist_prev1>context.macd_hist_prev2,macd_bullish_cross:false,obv_turn_up:context.obv>context.obv_prev1};
  return scoreOpportunityAnalysis({symbol,name:symbol,lastPrice:context.price,closePrice:context.close,tradeValue:1_000_000_000,eps:100,pe:5,groupPe:8},{valid:true,candleCount:120,asOf:'1405-07-04',context,signals});
};

test('Pipad: good trend and RSI cannot hide bearish MACD plus MFI below 40',()=>{
  const item=scenario('پی‌پاد',{price:7560,close:7560,ema20:7272,ema20_prev1:7250,ema50:6237,rsi14:64.75,rsi14_prev1:62,mfi14:37.21,mfi14_prev1:38,macd_line:376,macd_signal:531,macd_hist:-156,macd_hist_prev1:-140,macd_hist_prev2:-120,volume_ratio_20:1.4,buyer_power:1.4,real_money_flow:10000000,high_20:8000,low_10:7000,low_20:6700,return_5d:5,return_20d:20});
  assert.equal(item.confirmationScore<=60,true);
  assert.equal(item.confirmationGates.momentum,60);
});

test('Zegoldasht: improving negative histogram can produce an early entry',()=>{
  const item=scenario('زگلدشت',{recent_correction_pct:6,mfi14_prev1:38});
  assert.equal(item.trigger.type,'EARLY_REVERSAL_ENTRY');
  assert.equal(['EARLY_ENTRY','BUY_CANDIDATE'].includes(item.state),true);
  assert.equal(item.confirmationScore<=85,true);
});

test('Shepdis: strongly negative real money flow caps confirmation',()=>{
  const item=scenario('شپدیس',{macd_line:180,macd_signal:150,macd_hist:30,macd_hist_prev1:10,macd_hist_prev2:-10,real_money_flow:-200_000_000,buyer_power:.7,volume_ratio_20:1.6});
  assert.equal(item.confirmationScore<=55,true);
  assert.equal(item.confirmationGates.flow,55);
  assert.equal(item.warnings.includes('STRONG_NEGATIVE_REAL_MONEY_FLOW'),true);
});

test('Damin: price above max buy blocks candidate and requests pullback',()=>{
  const item=scenario('دامین',{price:11000,close:11000,ema20:10000,ema20_prev1:9900,ema50:9000,macd_line:200,macd_signal:150,macd_hist:50,macd_hist_prev1:20,macd_hist_prev2:-10,high_20:12000,low_10:9500,low_20:9000,return_5d:8,return_20d:15});
  assert.equal(item.noChaseStatus,'FAIL_ABOVE_MAX_BUY');
  assert.equal(item.state,'WAIT_FOR_PULLBACK');
  assert.equal(item.buyNowEligible,false);
});

test('Dedana: healthy early recovery is not rejected before MACD cross',()=>{
  const item=scenario('ددانا',{macd_line:90,macd_signal:130,macd_hist:-40,macd_hist_prev1:-90,macd_hist_prev2:-160,recent_correction_pct:7,mfi14_prev1:37});
  assert.equal(item.trigger.type,'EARLY_REVERSAL_ENTRY');
  assert.notEqual(item.state,'REJECT');
  assert.equal(item.reasons.includes('EARLY_REVERSAL_CONFIRMED'),true);
});

const decisionBase={opportunityScoreActual:82,confirmationScoreActual:82,triggerPass:true,earlyReversalConfirmed:false,breakoutConfirmed:false,noChaseStatus:'PASS',structureValid:true,flowSafe:true,currentPrice:100,maxBuyPrice:105,earlyEntryMaxPrice:null,riskPctActual:6,rewardRiskActual:1.8,stopAvailable:true,targetAvailable:true,coverageSufficient:true,position:false,executionReady:false,earlyEntryPositionPct:50};

test('Zegoldasht: 79/77 early reversal becomes partial early entry',()=>{
  const decision=classifyOpportunityState({...decisionBase,opportunityScoreActual:79,confirmationScoreActual:77,earlyReversalConfirmed:true,earlyEntryMaxPrice:104});
  assert.equal(decision.state,'EARLY_ENTRY');
  assert.equal(decision.action,'BUY_PARTIAL');
  assert.equal(decision.positionSizePct,50);
  assert.deepEqual(decision.stateReasons,['EARLY_REVERSAL_CONFIRMED','PRICE_IN_BUY_ZONE','FLOW_SAFE','NO_CHASE_PASS']);
  assert.equal(classifyOpportunityState({...decisionBase,opportunityScoreActual:79,confirmationScoreActual:77,earlyReversalConfirmed:true,earlyEntryMaxPrice:104,earlyEntryPositionPct:35}).positionSizePct,35);
});

test('Zghiam: valid price with RR 1.47 waits for risk reward, not pullback',()=>{
  const decision=classifyOpportunityState({...decisionBase,currentPrice:10870,maxBuyPrice:10963,rewardRiskActual:1.47});
  assert.equal(decision.state,'WAIT_FOR_RISK_REWARD');
  assert.deepEqual(decision.stateReasons,['TRIGGER_CONFIRMED']);
  assert.deepEqual(decision.missingConditions,['REWARD_RISK_BELOW_1_5']);
});

test('Pipad and Damin: price above max always waits for pullback',()=>{
  for(const symbol of ['پی‌پاد','دامین']){
    const decision=classifyOpportunityState({...decisionBase,currentPrice:110,maxBuyPrice:105});
    assert.equal(decision.state,'WAIT_FOR_PULLBACK',symbol);
    assert.equal(decision.buyNowEligible,false,symbol);
  }
});

test('early entry above its tighter price limit waits for pullback',()=>{
  const decision=classifyOpportunityState({...decisionBase,opportunityScoreActual:79,confirmationScoreActual:77,earlyReversalConfirmed:true,currentPrice:104.5,maxBuyPrice:105,earlyEntryMaxPrice:104});
  assert.equal(decision.state,'WAIT_FOR_PULLBACK');
  assert.deepEqual(decision.stateReasons,['SETUP_POTENTIAL']);
  assert.deepEqual(decision.missingConditions,['EARLY_ENTRY_PRICE_ABOVE_LIMIT']);
});

test('missing stop or target waits for risk data and blocks early entry',()=>{
  const decision=classifyOpportunityState({...decisionBase,opportunityScoreActual:79,confirmationScoreActual:77,earlyReversalConfirmed:true,stopAvailable:false,targetAvailable:false});
  assert.equal(decision.state,'WAIT_FOR_RISK_DATA');
  assert.deepEqual(decision.stateReasons,['TRIGGER_CONFIRMED']);
  assert.deepEqual(decision.missingConditions,['STOP_REQUIRED','TARGET_REQUIRED_FOR_BUY_NOW']);
  assert.equal(decision.buyNowEligible,false);
});

test('risk reward boundary uses unrounded values',()=>{
  assert.equal(classifyOpportunityState({...decisionBase,rewardRiskActual:1.496}).state,'WAIT_FOR_RISK_REWARD');
  assert.equal(classifyOpportunityState({...decisionBase,rewardRiskActual:1.5}).state,'BUY_CANDIDATE');
});

const nextLegBase={currentPrice:7530,resistance:7650,pullbackBuyLow:7300,pullbackBuyHigh:7400,pullbackMaxBuyPrice:7475,breakoutMaxPrice:7803,structureValid:true,flowSafe:true,obvSafe:true,mfiReady:true,priceHoldingSupport:true,breakoutVolumeConfirmed:false,breakoutBuyerPowerConfirmed:false,breakoutMoneyFlowConfirmed:false,breakoutMomentumConfirmed:true,pullbackRiskPct:6,pullbackRewardRisk:1.8,breakoutRiskPct:5,breakoutRewardRisk:1.8,pullbackStopAvailable:true,pullbackTargetAvailable:true,breakoutStopAvailable:true,breakoutTargetAvailable:true};

test('Sbag classifies a strong consolidation after impulse as NEXT_LEG_SETUP',()=>{
  const context={price:7530,close:7530,ema20:7328,ema20_prev1:7300,ema50:6716,max_gain_40_pct:18,return_20d:10,high_20:7700,high_40_previous_segment:6900,recent_correction_pct:3,range_compression_10_ratio:.65,consolidation_bars:9,consolidation_score:78,recent_consolidation:true,bbw:.1,bbw_percentile_120:15,atr14:279,atr14_prev:285,macd_hist:-93,macd_hist_prev1:-120,macd_hist_prev2:-150,mfi14:52.84,mfi14_prev1:49,obv:346400000,obv_prev1:344000000,obv_high_20:350000000,obv_low_20:250000000};
  const setup=classifySetup(context,{obv_turn_up:true},{structureValid:true,breakoutConfirmed:false,noChaseStatus:'PASS'});
  assert.equal(setup.primarySetupType,'NEXT_LEG_SETUP');
  assert.equal(setup.priorImpulseExists,true);
  assert.equal(setup.recentConsolidation,true);
});

test('A: next leg between pullback max and resistance waits for either route',()=>{
  assert.equal(classifyNextLegEntry(nextLegBase).state,'WAIT_FOR_PULLBACK_OR_BREAKOUT');
});

test('B: healthy next-leg pullback activates PULLBACK_ENTRY',()=>{
  const decision=classifyNextLegEntry({...nextLegBase,currentPrice:7350});
  assert.equal(decision.state,'PULLBACK_ENTRY');
  assert.equal(decision.entryType,'PULLBACK_ENTRY');
});

test('C: fully confirmed breakout inside breakout max activates BREAKOUT_ENTRY',()=>{
  const decision=classifyNextLegEntry({...nextLegBase,currentPrice:7700,breakoutVolumeConfirmed:true,breakoutBuyerPowerConfirmed:true,breakoutMoneyFlowConfirmed:true});
  assert.equal(decision.state,'BREAKOUT_ENTRY');
  assert.equal(decision.entryType,'BREAKOUT_ENTRY');
});

test('D and E: breakout without volume or positive flow cannot buy',()=>{
  const noVolume=classifyNextLegEntry({...nextLegBase,currentPrice:7700,breakoutBuyerPowerConfirmed:true,breakoutMoneyFlowConfirmed:true});
  const negativeFlow=classifyNextLegEntry({...nextLegBase,currentPrice:7700,breakoutVolumeConfirmed:true,breakoutBuyerPowerConfirmed:true,breakoutMoneyFlowConfirmed:false});
  assert.equal(noVolume.state,'WAIT_FOR_BREAKOUT_CONFIRMATION');
  assert.equal(noVolume.missingConditions.includes('BREAKOUT_VOLUME_CONFIRMATION'),true);
  assert.equal(negativeFlow.state,'WAIT_FOR_BREAKOUT_CONFIRMATION');
  assert.equal(negativeFlow.missingConditions.includes('BREAKOUT_FLOW_CONFIRMATION'),true);
});

test('F: price over breakout max fails no-chase and waits for pullback',()=>{
  const decision=classifyNextLegEntry({...nextLegBase,currentPrice:7900,breakoutVolumeConfirmed:true,breakoutBuyerPowerConfirmed:true,breakoutMoneyFlowConfirmed:true});
  assert.equal(decision.state,'WAIT_FOR_PULLBACK');
  assert.equal(decision.noChaseStatus,'FAIL_ABOVE_BREAKOUT_MAX');
});

test('G: valid breakout with RR below 1.5 waits for risk reward',()=>{
  const decision=classifyNextLegEntry({...nextLegBase,currentPrice:7700,breakoutVolumeConfirmed:true,breakoutBuyerPowerConfirmed:true,breakoutMoneyFlowConfirmed:true,breakoutRewardRisk:1.49});
  assert.equal(decision.state,'WAIT_FOR_RISK_REWARD');
});

test('H: a genuine recovery from weakness remains EARLY_REVERSAL',()=>{
  const context={price:98,close:98,ema20:100,ema20_prev1:101,ema50:92,max_gain_40_pct:5,return_20d:-4,high_20:110,high_40_previous_segment:112,recent_correction_pct:10,range_compression_10_ratio:1.1,bbw:.18,bbw_percentile_120:45,macd_hist:-2,macd_hist_prev1:-5,macd_hist_prev2:-9,mfi14:43,mfi14_prev1:35,rsi14:49,rsi14_prev1:42,obv:1200,obv_prev1:1180,obv_high_20:1500,obv_low_20:900};
  const setup=classifySetup(context,{obv_turn_up:true},{structureValid:true,breakoutConfirmed:false,noChaseStatus:'PASS'});
  assert.equal(setup.primarySetupType,'EARLY_REVERSAL');
});

test('short reasons use actual decision values without inventing evidence',()=>{
  assert.match(buildOpportunityShortReason({state:'WAIT_FOR_RISK_REWARD',rewardRisk:1.34,missingConditions:['REWARD_RISK_BELOW_1_5']}),/۱٫۳۴.*۱٫۵۰/);
  assert.match(buildOpportunityShortReason({state:'WAIT_FOR_PULLBACK',currentPrice:7560,maxBuyPrice:7414,noChaseStatus:'FAIL_ABOVE_MAX_BUY',missingConditions:['FAIL_ABOVE_MAX_BUY']}),/۷٬۵۶۰.*۷٬۴۱۴/);
  const trigger=buildOpportunityShortReason({state:'WAIT_FOR_TRIGGER',missingConditions:['MACD_HISTOGRAM_IMPROVING','VOLUME_CONFIRMATION']});
  assert.match(trigger,/هیستوگرام MACD/);assert.match(trigger,/حجم/);
  assert.equal(buildOpportunityShortReason({state:'WAIT_FOR_PULLBACK_OR_BREAKOUT',missingConditions:['PULLBACK_TO_BUY_ZONE','BREAKOUT_ABOVE_RESISTANCE']}),'قیمت بالاتر از محدوده پولبک و هنوز زیر مقاومت است');
});

test('passed reasons never remain in missing conditions',()=>{
  const normalized=normalizeDecisionReasons(['PRICE_IN_PULLBACK_ZONE','SUPPORT_HOLDING','FLOW_SAFE'],['FLOW_SAFE','MACD_HISTOGRAM_IMPROVING']);
  assert.deepEqual(normalized.stateReasons,['PRICE_IN_PULLBACK_ZONE','SUPPORT_HOLDING','FLOW_SAFE']);
  assert.deepEqual(normalized.missingConditions,['MACD_HISTOGRAM_IMPROVING']);
});

test('low confirmation pullback cannot receive a full position',()=>{
  const low=applyPositionPolicy({state:'PULLBACK_ENTRY',positionSizePct:100},70),medium=applyPositionPolicy({state:'PULLBACK_ENTRY',positionSizePct:100},80),full=applyPositionPolicy({state:'PULLBACK_ENTRY',positionSizePct:50},85);
  assert.equal(low.positionSizePct,50);assert.equal(low.suggestedAction,'BUY_PARTIAL');
  assert.equal(medium.positionSizePct,75);assert.equal(full.positionSizePct,100);assert.equal(full.suggestedAction,'BUY');
});

test('pullback entry output keeps pass reasons out of missing conditions',()=>{
  const item=scenario('ولپارس',{max_gain_40_pct:18,recent_correction_pct:4,range_compression_10_ratio:.6,high_40_previous_segment:10000,price:10300,close:10300,ema20:10300,low:10250,high_20:11500,mfi14:55,mfi14_prev1:50});
  const overlap=item.stateReasons.filter(code=>item.missingConditions.includes(code));
  assert.deepEqual(overlap,[]);
  if(item.state==='PULLBACK_ENTRY'&&item.confirmationScoreActual<75)assert.notEqual(item.positionSizePct,100);
});

const v2Input=(context={},extra={})=>({context:{price:100,close:100,ema20:98,ema20_prev1:97,ema50:90,volume_ratio_20:1.2,buyer_power:1.2,real_money_flow:10,macd_hist:-1,macd_hist_prev1:-2,macd_hist_prev2:-3,rsi14:52,rsi14_prev1:49,mfi14:52,mfi14_prev1:48,obv:110,obv_prev1:105,obv_prev5:90,high_20:110,bbw_percentile_120:15,atr14:2,atr14_prev:2.1,max_gain_40_pct:18,recent_correction_pct:4,range_10_pct:5,...context},row:{tradeValue:1000,eps:10,pe:5,groupPe:8,...extra.row},components:[{key:'trend',normalizedScore:80},{key:'structure',normalizedScore:80},{key:'fundamental',normalizedScore:70}],setup:{primarySetupType:'EARLY_REVERSAL',priorImpulseExists:true,priorImpulsePct:context.max_gain_40_pct??18,recentCorrectionPct:context.recent_correction_pct??4,recentConsolidation:true,healthyCorrection:true,obvHoldRecentHigh:true,bbwCompressed:true,atrStable:true,rangeCompressed:true,earlyReversalConfirmed:true,...extra.setup},plan:{suggestedBuyLow:98,suggestedBuyHigh:102,maxBuyPrice:104,resistance:110,rewardRisk:extra.rewardRisk??1.8},opportunityV1:80,structureValid:true,position:extra.position||null});

test('V2 lowers freshness for a large unreset prior move',()=>{const result=calculateOpportunityV2(v2Input({max_gain_40_pct:60,recent_correction_pct:1,rsi14:72,buyer_power:5,volume_ratio_20:.5},{setup:{recentConsolidation:false,priorImpulsePct:60,recentCorrectionPct:1,bbwCompressed:false,rangeCompressed:false,atrStable:false}}));assert.equal(result.freshnessScore<60,true);assert.equal(result.netExtensionPenalty>=8,true);});
test('V2 rewards a fresh move with participation',()=>{const result=calculateOpportunityV2(v2Input({max_gain_40_pct:18,return_20d:0,macd_hist:1,macd_hist_prev1:-1,volume_ratio_20:4,real_money_flow:100,buyer_power:1.8}));assert.equal(result.freshnessScore>=70,true);assert.equal(result.momentumReadinessScore>=50,true);});
test('huge buyer power without volume is not strong flow',()=>{const result=calculateOpportunityV2(v2Input({buyer_power:20,volume_ratio_20:.2,real_money_flow:100}));assert.equal(result.strongFlow,false);assert.equal(result.flowQualityScore<75,true);});
test('buyer power with volume, money and OBV confirms strong flow',()=>{const result=calculateOpportunityV2(v2Input({buyer_power:2,volume_ratio_20:1.5,real_money_flow:100,obv:120,obv_prev1:110}));assert.equal(result.confirmedStrongFlow,true);});
test('healthy reset credits but does not erase extension penalty',()=>{const result=calculateOpportunityV2(v2Input({max_gain_40_pct:80,recent_correction_pct:15,bbw_percentile_120:10},{setup:{primarySetupType:'NEXT_LEG_SETUP',priorImpulsePct:80,recentCorrectionPct:15,recentConsolidation:true}}));assert.equal(result.recoveryCredit,5);assert.equal(result.rawExtensionPenalty,12);assert.equal(result.netExtensionPenalty,7);assert.equal(result.setupQualityScore>0,true);});
test('risk reward quality preserves hard gate boundaries',()=>{assert.equal(calculateOpportunityV2(v2Input({}, {rewardRisk:1.26})).riskRewardQualityScore,40);assert.equal(calculateOpportunityV2(v2Input({}, {rewardRisk:1.85})).riskRewardQualityScore,80);assert.equal(classifyOpportunityState({...decisionBase,rewardRiskActual:1.26}).buyNowEligible,false);});
test('missing fundamental growth is coverage loss, not observed zero',()=>{const result=calculateOpportunityV2(v2Input({}, {row:{salesYoy:null,cumulativeSalesYoy:null,ttmProfitGrowth:null}}));assert.equal(result.fundamentalCoveragePct<100,true);assert.notEqual(result.fundamentalConfidence,'HIGH');});
test('recovery credit requires correction even with compression',()=>{const a=calculateOpportunityV2(v2Input({recent_correction_pct:1,consolidation_bars:12,consolidation_score:80,bbw_percentile_120:10},{setup:{priorImpulsePct:45,recentCorrectionPct:1,recentConsolidation:true}})),b=calculateOpportunityV2(v2Input({recent_correction_pct:6,consolidation_bars:12,consolidation_score:80,bbw_percentile_120:15},{setup:{priorImpulsePct:45,recentCorrectionPct:6,recentConsolidation:true}}));assert.equal(a.recoveryCredit,0);assert.equal(b.recoveryCredit,5);});
test('negative money flow caps buyer-power divergence',()=>{const result=calculateOpportunityV2(v2Input({buyer_power:4,volume_ratio_20:1.5,real_money_flow:-150,value:1000}));assert.equal(result.flowDivergence,'BP_POSITIVE_MONEY_NEGATIVE');assert.equal(result.strongFlow,false);assert.equal(result.flowQualityScore<=55,true);assert.equal(result.entryQualityScore<=65,true);});
test('setup quality without strong evidence cannot saturate',()=>{const result=calculateOpportunityV2(v2Input({obv:100,obv_prev5:100,macd_hist:-3,macd_hist_prev1:-2,macd_hist_prev2:-1,bbw_percentile_120:80},{setup:{primarySetupType:'NEXT_LEG_SETUP',obvHoldRecentHigh:false,bbwCompressed:false,earlyReversalConfirmed:false}}));assert.equal(result.strongEvidenceCount,0);assert.equal(result.setupQualityScore<=69,true);});
test('strong trend alone is not a next-leg setup',()=>{const context={price:120,close:120,ema20:110,ema20_prev1:109,ema50:100,max_gain_40_pct:30,recent_correction_pct:1,consolidation_bars:0,consolidation_score:0,macd_hist:-1,macd_hist_prev1:-.5,macd_hist_prev2:0,mfi14:50,mfi14_prev1:50};const result=classifySetup(context,{}, {structureValid:true,breakoutConfirmed:false,noChaseStatus:'PASS'});assert.notEqual(result.primarySetupType,'NEXT_LEG_SETUP');});
test('early-move applies extension penalty without reset',()=>{const result=calculateOpportunityV2(v2Input({max_gain_40_pct:90,recent_correction_pct:2,rsi14:72,ema20:90,price:100},{setup:{priorImpulsePct:90,recentCorrectionPct:2,recentConsolidation:false}}),{rankingMode:'EARLY_MOVE'});assert.equal(result.recoveryCredit,0);assert.equal(result.rawExtensionPenalty,12);assert.equal(result.rankingScore<result.adjustedOpportunityV2,true);});
test('real money flow percent uses official traded value',()=>{const positive=calculateRealMoneyFlowMetrics({moneyFlow:10,officialTradedValue:100}),negative=calculateRealMoneyFlowMetrics({moneyFlow:-15,officialTradedValue:100});assert.equal(positive.realMoneyFlowPct,10);assert.equal(positive.realMoneyFlowClass,'STRONG_POSITIVE');assert.equal(negative.realMoneyFlowPct,-15);assert.equal(negative.realMoneyFlowClass,'STRONG_NEGATIVE');assert.equal(negative.realMoneyFlowPctSource,'DIRECT_TRADED_VALUE');});
test('real money flow falls back to price times volume',()=>{const result=calculateRealMoneyFlowMetrics({moneyFlow:100,price:10,volume:100});assert.equal(result.realMoneyFlowPct,10);assert.equal(result.realMoneyFlowPctSource,'ESTIMATED_PRICE_X_VOLUME');assert.equal(result.flowDataStatus,'ESTIMATED');});
test('suspect money flow percent is invalid and unavailable denominator is safe',()=>{const suspect=calculateRealMoneyFlowMetrics({moneyFlow:1500,officialTradedValue:100}),missing=calculateRealMoneyFlowMetrics({moneyFlow:10});assert.equal(suspect.realMoneyFlowPctValid,false);assert.equal(suspect.flowDataStatus,'SUSPECT');assert.equal(suspect.realMoneyFlowPct,null);assert.equal(missing.flowDataStatus,'UNAVAILABLE');assert.equal(missing.realMoneyFlowPct,null);});
test('negative flow percent preserves V2.1 caps and divergence',()=>{const result=calculateOpportunityV2(v2Input({buyer_power:4,volume_ratio_20:1.5,real_money_flow:-15,value:100},{row:{tradeValue:100}}));assert.equal(result.realMoneyFlowPct,-15);assert.equal(result.realMoneyFlowClass,'STRONG_NEGATIVE');assert.equal(result.flowDivergence,'BP_POSITIVE_MONEY_NEGATIVE');assert.equal(result.strongFlow,false);assert.equal(result.flowQualityScore<=55,true);assert.equal(result.entryQualityScore<=65,true);});

const preMoveInput=(context={},extra={})=>({context:{price:101,close:101,ema20:100,ema20_prev1:99.8,ema50:95,volume_ratio_20:1.05,buyer_power:1.3,return_1d:.4,return_5d:1,bbw_percentile_120:10,atr_compression_score:85,range_contraction_score:85,consolidation_score:80,consolidation_detected:true,support_preserved:true,obv:110,obv_high_20:112,obv_slope_5:10,rsi14:52,rsi14_prev1:50,rsi_slope_3:4,mfi14:54,mfi14_prev1:51,mfi_slope_3:5,macd_hist:-1,macd_hist_prev1:-2,macd_hist_prev2:-3,base_position_pct:55,...context},row:{upperLimit:110,buyQueueValue:0,...extra.row},setup:{},plan:{suggestedBuyLow:99,suggestedBuyHigh:102,maxBuyPrice:104,resistance:108},structureValid:true,noChaseStatus:'PASS',breakoutConfirmed:false,rewardRiskActual:1.8,flowMetrics:{realMoneyFlowPct:5},signals:{}});
test('quiet accumulation and compression rank highly before the move',()=>{const result=calculatePreMove(preMoveInput());assert.equal(result.primaryOpportunityStage,'PRE_MOVE');assert.equal(result.preMoveAdjustedScore>=70,true);assert.equal(result.moveAlreadyStarted,false);assert.equal(result.preMovePriceLocationScore>=85,true);});
test('volume and buyer power explosion move a candidate to a later stage',()=>{const result=calculatePreMove(preMoveInput({volume_ratio_20:4,buyer_power:6,return_1d:3.5},{row:{upperLimit:102}}));assert.equal(result.moveAlreadyStarted,true);assert.equal(result.moveAlreadyStartedPenalty>=20,true);assert.notEqual(result.primaryOpportunityStage,'PRE_MOVE');});
test('extreme buyer power lowers pre-move participation without rejecting the setup',()=>{const normal=calculatePreMove(preMoveInput()),extreme=calculatePreMove(preMoveInput({buyer_power:8}));assert.equal(extreme.preMoveParticipationScore<normal.preMoveParticipationScore,true);assert.equal(extreme.preMoveStructureScore,normal.preMoveStructureScore);});
test('negative flow and falling OBV cannot become PRE_MOVE_READY',()=>{const result=calculatePreMove(preMoveInput({obv_slope_5:-20,obv:80,real_money_flow:-20},{row:{tradeValue:100}}));const withFlow=calculatePreMove({...preMoveInput({obv_slope_5:-20,obv:80}),flowMetrics:{realMoneyFlowPct:-18}});assert.notEqual(withFlow.preMoveState,'PRE_MOVE_READY');assert.equal(withFlow.preMoveAccumulationScore<60,true);});
test('price above maximum buy receives late-move evidence',()=>{const result=calculatePreMove({...preMoveInput({price:108,close:108}),plan:{suggestedBuyLow:99,suggestedBuyHigh:102,maxBuyPrice:104,resistance:110}});assert.equal(result.moveAlreadyStartedReasons.includes('ABOVE_MAX_BUY'),true);assert.equal(result.preMovePriceLocationScore<85,true);});
test('confirmed breakout has BREAKOUT as primary stage',()=>{const result=calculatePreMove({...preMoveInput(),breakoutConfirmed:true});assert.equal(result.primaryOpportunityStage,'BREAKOUT');});
test('missing flow reduces pre-move coverage without fabricated percent',()=>{const input=preMoveInput();input.flowMetrics={realMoneyFlowPct:null};input.context.buyer_power=null;const result=calculatePreMove(input);assert.equal(result.preMoveDataCoveragePct<100,true);assert.equal(Number.isFinite(result.preMoveAdjustedScore),true);});
