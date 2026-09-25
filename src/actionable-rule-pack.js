// This pack is deliberately opt-in. An analysis is not an order unless its
// quantity and limit price have a documented source.
const c=(name,params={})=>({type:'condition',name,params});
const and=(...children)=>({type:'group',logic:'AND',children});
const or=(...children)=>({type:'group',logic:'OR',children});
const range=(min,max)=>c('PRICE_IN_RANGE',{min,max});
const above=value=>c('PRICE_ABOVE',{value});
const crossAbove=value=>c('PRICE_CROSS_ABOVE',{value});
const crossBelow=value=>c('PRICE_CROSS_BELOW',{value});
const volume=value=>c('VOLUME_RATIO_ABOVE',{value});
const buyer=value=>c('BUYER_POWER_ABOVE',{value});
const mfi=value=>c('MFI_ABOVE',{value});
const rsi=value=>c('RSI_ABOVE',{value});
const early=c('MACD_RECOVERY_EARLY');
const obvUp=c('OBV_TURN_UP');
const obvHigh=c('OBV_BREAK_HIGH',{periods:10});
const confirmed=or(early,c('MACD_BULLISH_CROSS'));

const buys=[
  ['پخش',7500,13250,and(range(13200,13300),mfi(50),or(obvUp,obvHigh),confirmed)],
  ['دکپسول',570,173500,and(range(172000,174000),mfi(60),or(obvUp,obvHigh),confirmed)],
  ['بنیرو',26498,3760,and(range(3740,3780),mfi(50),obvHigh,confirmed)],
  ['بکابل',18283,5450,and(range(5400,5500),rsi(50),or(obvUp,obvHigh),confirmed)],
  ['فهامون',21200,4700,and(range(4650,4750),obvUp,early)],
  ['سکرما',2860,69800,and(range(69500,70000),mfi(50),or(obvUp,obvHigh),confirmed)],
  ['دامین',6680,14950,and(range(14800,15050),mfi(50),obvUp,confirmed)],
  ['شیراز',1485,67300,and(range(66500,67500),rsi(50),c('OBV_HOLD_RECENT_LOW'),confirmed)],
  ['شجم',9800,10200,and(range(10100,10250),c('SUPPORT_HOLD',{level:10100,tolerance_pct:1}),confirmed)],
  ['وحافظ',42500,2370,and(above(2350),c('PRICE_ABOVE_EMA50'),confirmed,c('OBV_HOLD_RECENT_LOW'),volume(1.3))],
  // No authorised order sizes exist for the remaining analysed symbols.
  ['پردیس',null,2050,and(range(2050,2100),early,or(obvUp,obvHigh))],
  ['ومهان',null,5800,and(mfi(40),obvUp,early)],
  ['تکاردان',null,null,and(mfi(40),obvUp,early,c('BBW_BELOW',{value:.15}))],
  ['درهاور',null,15400,and(crossAbove(15400),rsi(50),mfi(40),early)],
  ['ثامید',null,1880,and(crossAbove(1880),obvUp,early)],
  ['تملت',null,null,and(c('BBW_BELOW',{value:.15}),c('EMA20_50_GAP_BELOW',{value:8}),early,obvHigh)],
  ['فباهنر',null,null,and(c('EMA20_ABOVE_EMA50'),confirmed,obvUp)],
  ['قاسم',null,null,and(confirmed,obvHigh,c('MFI_CROSS_ABOVE',{value:50}))],
  ['شتهران',null,null,and(volume(2),buyer(1.5))],
  ['کروی',null,null,and(volume(2),buyer(1.5))]
];

const holdings=[
  ['وبملت',70535,1484],['حتاید',10000,8610],['فولاد',23476,2689],
  ['وستهران',75308,987],['شتران',10400,6637],['تابان',2772,12800],
  ['کالا',5300,10920],['مبین',4800,12100],['فملی',1500,24480],
  ['متقال',155,191845],['البرز',6800,2280],['عیار',25,642752],
  ['همراه',1500,10200],['لبن',441,9831],['فقره',181,15818],
  ['داروند',283,5083],['غزنجان',109,6928]
];
const downside=or(c('MACD_BEARISH_CROSS'),and(c('OBV_TURN_DOWN'),c('MFI_CROSS_BELOW',{value:50})),and(c('BUYER_POWER_BELOW',{value:.8}),volume(1.5)));

function rule(symbol,id,side,expression,order,{enabled=true,scope='SYMBOL',description=''}={}){
  return {ruleId:`ACTION_${id}`,symbol,name:`${symbol}: ${side==='BUY'?'خرید':'فروش'} مشروط`,description,enabled,
    scope,severity:side==='BUY'?'BUY':'SELL',expression,action:side==='BUY'?'BUY_ALERT':'SELL_ALERT',
    actionParams:{pack:'actionable-1405-07-03',executableOnly:true,order,source:'تحلیل‌های ۱۴۰۵/۰۷/۰۳؛ قبل از استفاده با حساب کارگزاری تطبیق شود'},
    cooldownMinutes:side==='BUY'?45:15,oncePerDay:false,intervalMinutes:5};
}

export function buildActionableRulePack(){
  const rules=[];
  for(const [symbol,quantity,limitPrice,expression] of buys){
    // Price or size unknown: keep the analysis, but prevent misleading action alerts.
    rules.push(rule(symbol,`BUY_${symbol}`,'BUY',expression,{quantity,limitPrice},
      {enabled:Number.isInteger(quantity)&&quantity>0&&limitPrice>0,description:quantity?'ورود مشروط؛ سقف قیمت و تعداد از برنامه قبلی':'تعداد/سقف قیمت نیازمند تصمیم کاربر'}));
  }
  for(const [symbol,quantity,avgPrice] of holdings){
    const trigger=symbol==='عیار'?c('TRAILING_STOP',{value:5}):
      and(c('PROFIT_ABOVE',{value:9}),downside);
    // Position in the database must match the account; screenshot quantities are reference only.
    rules.push(rule(symbol,`SELL_${symbol}`,'SELL',trigger,{quantity:null,limitPrice:null,quantityMode:'PORTFOLIO_ALL',priceMode:'LIVE_BID'},
      {enabled:false,scope:'PORTFOLIO',description:`در تصویر ارسالی: ${quantity} واحد، میانگین ${avgPrice} ریال؛ درصد فروش و موجودی قابل‌فروش تأیید نشده‌اند.`}));
  }
  const stops=[['حتاید',7800],['شتران',6500],['مبین',11600]];
  for(const [symbol,level] of stops)rules.push(rule(symbol,`STOP_${symbol}`,'SELL',crossBelow(level),{quantityMode:'PORTFOLIO_ALL',priceMode:'LIVE_BID'},
    {enabled:false,scope:'PORTFOLIO',description:`سطح خروج ${level} ریال؛ قیمت سفارش نباید به‌صورت قیمت گذشته فرض شود.`}));
  return rules;
}

export const actionableRulePack=Object.freeze(buildActionableRulePack());
