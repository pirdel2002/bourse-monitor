import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIndicatorAnalysis} from '../src/indicator-engine.js';

const candles=Array.from({length:120},(_,index)=>{const close=1000+index*5+Math.sin(index/4)*20;return {date:`1405-${String(Math.floor(index/28)+1).padStart(2,'0')}-${String(index%28+1).padStart(2,'0')}`,open:close-3,high:close+12,low:close-14,close,volume:100000+index*1000};});

test('builds the requested indicator context from cached candles and one live candle',()=>{const analysis=buildIndicatorAnalysis(candles,{date:'1405-07-03',lastPrice:1640,closePrice:1635,openPrice:1620,dayHigh:1650,dayLow:1610,volume:350000,tradeValue:500000000,tradeCount:900,buyVolumeReal:220000,buyCountReal:20,sellVolumeReal:120000,sellCountReal:20,buyerPower:220/120,hasBuyerPowerData:true});assert.equal(analysis.valid,true);for(const key of ['ema20','ema50','rsi14','macd_line','macd_signal','macd_hist','mfi14','obv','atr14','bbw','volume_sma20','volume_ratio_20','max_gain_40_pct','recent_correction_pct','range_compression_10_ratio','tech_recovery_score'])assert.equal(Number.isFinite(analysis.context[key]),true,key);assert.equal(analysis.context.buyer_power>1.8,true);assert.equal(analysis.rows.length,14);});

test('reports insufficient history without inventing values',()=>{const analysis=buildIndicatorAnalysis(candles.slice(0,10));assert.equal(analysis.valid,false);assert.match(analysis.reason,/۵۰ کندل/);assert.equal(analysis.context.ema50,null);});
