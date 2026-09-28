import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');

test('mobile opportunity ranking uses responsive cards and hides decision extras',()=>{
  assert.match(css,/\.opportunity-main-row,\.exit-signal-table tbody tr\{display:grid/);
  assert.match(css,/\.opportunity-main-row \.decision-extra\{display:none\}/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(app,/data-label="پیشنهاد قیمت"/);
});

test('CSV retains analysis, debug and dual-entry fields after table simplification',()=>{
  for(const field of ['PrimarySetupType','MatchedSetupTypes','Momentum Gate','Flow Gate','Price Gate','PullbackBuyLow','PullbackRewardRisk','BreakoutMaxPrice','BreakoutRewardRisk','MissingConditions','InternalFlags'])assert.equal(app.includes(`'${field}'`),true,field);
});

test('multi-dimensional filter preserves legacy and typed tokens',()=>{
  for(const state of ['PULLBACK_ENTRY','EARLY_ENTRY','BREAKOUT_ENTRY','SECOND_ENTRY_CANDIDATE','BUY_CANDIDATE','WAIT_FOR_TRIGGER','WAIT_FOR_BREAKOUT_CONFIRMATION','WAIT_FOR_PULLBACK_OR_BREAKOUT','WAIT_FOR_PULLBACK','WAIT_FOR_RISK_REWARD','WAIT_FOR_RISK_DATA','RULE_WATCH','SECONDARY_WATCH','REJECT'])assert.equal(app.includes(state),true,state);
  assert.match(app,/typeof x==='string'\?\{type:'status',value:x\}/);
  for(const type of ['stage','preMoveType','status','action'])assert.match(app,new RegExp(`filterSection\\([^\\n]+?'${type}'`));
  assert.match(app,/opportunityFilterTokens\.filter/);
  assert.match(app,/BUY_CANDIDATE:'کاندید؛ هنوز بدون ورود'/);
  assert.match(app,/SECONDARY_WATCH:'پایش ثانویه'/);
});

test('filter is staged, grouped, mobile-safe and parent selection remains independent',()=>{
  for(const title of ['مرحله فرصت','نوع موقعیت پیش از حرکت','وضعیت','اقدام'])assert.match(app,new RegExp(title));
  assert.match(app,/opportunityFilterDraft/);assert.match(app,/commitOpportunityFilters/);assert.match(app,/remove-filter/);
  assert.match(html,/id="applyOpportunityFilters"/);assert.match(html,/id="clearOpportunityFilters"/);assert.match(html,/role="dialog"/);
  assert.match(css,/width:min\(540px/);assert.match(css,/z-index:1000/);assert.match(css,/position:fixed;inset:0;top:auto/);assert.match(css,/min-height:48px/);
  assert.match(app,/FIRST_MOVE_PREP:'آماده حرکت اول'/);assert.match(app,/NEXT_LEG_PREP:'آماده موج بعدی'/);assert.match(app,/REVERSAL_PREP:'آماده برگشت'/);
});

test('decision table, analysis detail and collapsed debug remain separate',()=>{
  assert.match(app,/جزئیات موتور تصمیم‌گیری/);
  assert.match(app,/<details class="engine-debug">/);
  assert.match(app,/function opportunityAnalysis/);
  assert.match(app,/item\.shortReason/);
});

test('exit signal page is available to every authenticated user',()=>{
  assert.match(html,/data-page="exit-signals"/);
  assert.match(html,/id="page-exit-signals"/);
  assert.match(app,/api\/exit-signals/);
});

test('primary opportunity UI is Persian and summary cards apply filters',()=>{
  assert.match(app,/NEXT_LEG_SETUP:'آماده موج بعدی'/);
  assert.match(app,/PULLBACK_ENTRY:'ورود روی پولبک'/);
  assert.match(app,/data-opportunity-quick="actionable"/);
  assert.match(app,/opportunityQuickFilter=card\.dataset\.opportunityQuick/);
});

test('score model is below the table, collapsed by default, and help works on click',()=>{
  assert.ok(html.indexOf('id="opportunityTable"')<html.indexOf('مدل امتیازدهی و وزن شاخص‌ها'));
  assert.match(html,/<details class="panel opportunity-guide engine-debug">/);
  assert.match(html,/data-help="کیفیت کلی فرصت/);
  assert.match(app,/opportunityHelp.*querySelectorAll\('\[data-help\]'\)/);
});

test('system monitor switches are separate from manual rule cards',()=>{
  for(const id of ['systemBuySignals','systemExitSignals','systemMarketRules'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(app,/api\/system-monitors/);
  assert.match(app,/items\.filter\(x=>x\.visibility!==\'GLOBAL\'\)/);
});

test('V2.3 ranking modes and exit CSV are available',()=>{
  for(const mode of ['PRE_MOVE','ALL_OPPORTUNITIES','EARLY_MOVE','NEXT_LEG','BREAKOUT','PORTFOLIO_SECOND_ENTRY'])assert.match(html,new RegExp(`value="${mode}"`));
  for(const field of ['AdjustedOpportunityV2','FreshnessScore','RawExtensionPenalty','NetExtensionPenalty','FlowDivergence'])assert.equal(app.includes(field),true,field);
  assert.match(html,/value="PRE_MOVE" selected/);
  assert.match(html,/id="downloadExitCsv"/);assert.match(app,/function downloadExitCsv/);
});
