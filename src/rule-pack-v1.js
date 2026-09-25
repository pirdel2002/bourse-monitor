const condition=(name,params={})=>({type:'condition',name,params});
const and=conditions=>conditions.length===1?conditions[0]:{type:'group',logic:'AND',children:conditions};
const or=conditions=>({type:'group',logic:'OR',children:conditions});
const priorities={A:new Set(['دکپسول','پخش','بنیرو','بکابل','فهامون']),B:new Set(['سکرما','دامین','شجم','شیراز','پردیس','وحافظ']),C:new Set(['سهگمت','تکاردان','درهاور','ثامید','ومهان','تملت','فباهنر','قاسم']),critical:new Set(['حتاید','شتران','مبین','فولاد','البرز','تابان','همراه','وبملت'])};
const priorityFor=symbol=>priorities.critical.has(symbol)?'PORTFOLIO_CRITICAL':priorities.A.has(symbol)?'A':priorities.B.has(symbol)?'B':priorities.C.has(symbol)?'C':'NORMAL';
const cooldownFor=severity=>['WARNING','SELL','EXIT'].includes(severity)?15:45;
const rules=[];

function add(symbol,status,ruleId,severity,conditions,action,message='',options={}){
  rules.push({ruleId,symbol:symbol||null,name:message||ruleId,description:status||'',enabled:options.enabled!==false,scope:options.scope||'SYMBOL',severity,expression:and(conditions),action,actionParams:{message:message||ruleId,priority:options.priority||priorityFor(symbol),pack:'rule-pack-1405-07-03',symbolStatus:status||null,...options.actionParams},cooldownMinutes:options.cooldownMinutes||cooldownFor(severity),oncePerDay:Boolean(options.oncePerDay),intervalMinutes:options.intervalMinutes||5});
}

const C={
  priceRange:(min,max)=>condition('PRICE_IN_RANGE',{min,max}),priceAbove:value=>condition('PRICE_ABOVE',{value}),crossAbove:value=>condition('PRICE_CROSS_ABOVE',{value}),crossBelow:value=>condition('PRICE_CROSS_BELOW',{value}),
  macdEarly:()=>condition('MACD_RECOVERY_EARLY'),macdNear:()=>condition('MACD_RECOVERY_NEAR_ZERO'),macdBear:()=>condition('MACD_BEARISH_CROSS'),mfiAbove:value=>condition('MFI_ABOVE',{value}),mfiCrossAbove:value=>condition('MFI_CROSS_ABOVE',{value}),mfiCrossBelow:value=>condition('MFI_CROSS_BELOW',{value}),rsiAbove:value=>condition('RSI_ABOVE',{value}),rsiCrossAbove:value=>condition('RSI_CROSS_ABOVE',{value}),
  obvUp:()=>condition('OBV_TURN_UP'),obvDown:()=>condition('OBV_TURN_DOWN'),obvHigh:periods=>condition('OBV_BREAK_HIGH',{periods}),volume:value=>condition('VOLUME_RATIO_ABOVE',{value}),buyerAbove:value=>condition('BUYER_POWER_ABOVE',{value}),buyerBelow:value=>condition('BUYER_POWER_BELOW',{value}),ema20:()=>condition('EMA_RECLAIM_20'),ema50:()=>condition('EMA_RECLAIM_50'),emaTrend:()=>condition('EMA20_ABOVE_EMA50'),emaGap:value=>condition('EMA20_50_GAP_BELOW',{value}),bbw:value=>condition('BBW_BELOW',{value}),profit:value=>condition('PROFIT_ABOVE',{value}),trailing:value=>condition('TRAILING_STOP',{value})
};

add('پخش','ACTIVE_BUY_CANDIDATE','PAKHSH_SUPPORT_ZONE','WATCH',[C.priceRange(13200,13300)],'ALERT','پخش وارد محدوده حمایت/ورود شد');
add('پخش','ACTIVE_BUY_CANDIDATE','PAKHSH_MACD_RECOVERY','BUY',[C.macdEarly(),C.mfiAbove(50)],'BUY_ALERT','پخش: خروج اولیه MACD از اصلاح + MFI مناسب');
add('پخش','ACTIVE_BUY_CANDIDATE','PAKHSH_OBV_CONFIRM','BUY',[C.obvHigh(10)],'BUY_ALERT','پخش: OBV سقف ۱۰ کندل را شکست');
add('پخش','ACTIVE_BUY_CANDIDATE','PAKHSH_BREAKOUT','STRONG_BUY',[C.crossAbove(13900),C.volume(1.5),C.buyerAbove(1.2)],'BUY_ALERT','پخش: شکست معتبر مقاومت ۱۳۹۰۰');
add('پخش','ACTIVE_BUY_CANDIDATE','PAKHSH_BREAKOUT_STRONG','STRONG_BUY',[C.crossAbove(14200),C.volume(1.5)],'BUY_ALERT','پخش: شکست پرقدرت ۱۴۲۰۰');
add('پخش','ACTIVE_BUY_CANDIDATE','PAKHSH_STRUCTURAL_BREAK','EXIT',[C.crossBelow(12250)],'EXIT_ALERT','پخش: شکست ساختاری ۱۲۲۵۰');

add('دکپسول','PRIMARY_BUY_CANDIDATE','DKAPSUL_ENTRY_ZONE','WATCH',[C.priceRange(172000,174000)],'ALERT','دکپسول وارد محدوده ورود شد');
add('دکپسول','PRIMARY_BUY_CANDIDATE','DKAPSUL_MACD_RECOVERY','BUY',[C.macdEarly(),C.mfiAbove(60)],'BUY_ALERT','دکپسول: بازیابی MACD با MFI مناسب');
add('دکپسول','PRIMARY_BUY_CANDIDATE','DKAPSUL_OBV_CONFIRM','BUY',[C.obvHigh(10)],'BUY_ALERT','دکپسول: شکست سقف ۱۰ کندل OBV');
add('دکپسول','PRIMARY_BUY_CANDIDATE','DKAPSUL_BREAKOUT','STRONG_BUY',[C.crossAbove(183000),C.volume(1.5),C.buyerAbove(1.2)],'BUY_ALERT','دکپسول: شکست معتبر ۱۸۳۰۰۰');
add('دکپسول','PRIMARY_BUY_CANDIDATE','DKAPSUL_BREAKOUT_MAIN','STRONG_BUY',[C.crossAbove(188000),C.volume(1.5)],'BUY_ALERT','دکپسول: شکست مقاومت اصلی ۱۸۸۰۰۰');
add('دکپسول','PRIMARY_BUY_CANDIDATE','DKAPSUL_SUPPORT_BREAK','WARNING',[C.crossBelow(167000)],'ALERT','دکپسول: هشدار شکست حمایت ۱۶۷۰۰۰');
add('دکپسول','PRIMARY_BUY_CANDIDATE','DKAPSUL_INVALID','EXIT',[C.crossBelow(161000)],'EXIT_ALERT','دکپسول: ابطال سناریو زیر ۱۶۱۰۰۰');
add('دکپسول','PRIMARY_BUY_CANDIDATE','DKAPSUL_TARGET_198','SELL',[C.crossAbove(198000)],'PARTIAL_PROFIT','دکپسول: بررسی سیو سود در ۱۹۸۰۰۰');
add('دکپسول','PRIMARY_BUY_CANDIDATE','DKAPSUL_TARGET_211','SELL',[C.crossAbove(211000)],'PARTIAL_PROFIT','دکپسول: بررسی سیو سود در ۲۱۱۰۰۰');

add('بنیرو','SERIOUS_BUY_CANDIDATE','BENERO_SUPPORT','WATCH',[C.priceRange(3740,3780)],'ALERT','بنیرو وارد محدوده حمایت شد');
add('بنیرو','SERIOUS_BUY_CANDIDATE','BENERO_READY','BUY',[C.mfiCrossAbove(50),C.macdEarly()],'BUY_ALERT','بنیرو: آمادگی حرکت');
add('بنیرو','SERIOUS_BUY_CANDIDATE','BENERO_OBV','BUY',[C.obvHigh(10)],'BUY_ALERT','بنیرو: شکست سقف OBV');
add('بنیرو','SERIOUS_BUY_CANDIDATE','BENERO_BREAKOUT','STRONG_BUY',[C.crossAbove(3900),C.volume(1.5),C.buyerAbove(1.2)],'BUY_ALERT','بنیرو: شکست معتبر ۳۹۰۰');
add('بنیرو','SERIOUS_BUY_CANDIDATE','BENERO_BREAKOUT_4000','STRONG_BUY',[C.crossAbove(4000),C.volume(1.5)],'BUY_ALERT','بنیرو: شکست ۴۰۰۰ با حجم');
add('بنیرو','SERIOUS_BUY_CANDIDATE','BENERO_STOP','EXIT',[C.crossBelow(3540)],'EXIT_ALERT','بنیرو: حد خروج ساختاری');

add('بکابل','SERIOUS_BUY_CANDIDATE','BKABL_SUPPORT','WATCH',[C.priceRange(5400,5500)],'ALERT','بکابل وارد محدوده حمایت شد');
add('بکابل','SERIOUS_BUY_CANDIDATE','BKABL_RSI','BUY',[C.rsiCrossAbove(50)],'BUY_ALERT','بکابل: عبور RSI از ۵۰');
add('بکابل','SERIOUS_BUY_CANDIDATE','BKABL_MACD','BUY',[C.macdEarly()],'BUY_ALERT','بکابل: خروج اولیه MACD از اصلاح');
add('بکابل','SERIOUS_BUY_CANDIDATE','BKABL_OBV','BUY',[C.obvHigh(10)],'BUY_ALERT','بکابل: شکست سقف OBV');
add('بکابل','SERIOUS_BUY_CANDIDATE','BKABL_RECLAIM','BUY',[C.crossAbove(5750),C.rsiAbove(50)],'BUY_ALERT','بکابل: بازپس‌گیری ۵۷۵۰');
add('بکابل','SERIOUS_BUY_CANDIDATE','BKABL_BREAKOUT','STRONG_BUY',[C.crossAbove(6050),C.volume(1.5),C.buyerAbove(1.2)],'BUY_ALERT','بکابل: شکست معتبر ۶۰۵۰');
add('بکابل','SERIOUS_BUY_CANDIDATE','BKABL_STOP','EXIT',[C.crossBelow(5400)],'EXIT_ALERT','بکابل: شکست حمایت ۵۴۰۰');

add('فهامون','WATCH_ACTIVE_ORDER','FAHAMON_SUPPORT','WATCH',[C.priceRange(4650,4750)],'ALERT','فهامون وارد محدوده حمایت شد');
add('فهامون','WATCH_ACTIVE_ORDER','FAHAMON_MACD','BUY',[C.macdEarly()],'BUY_ALERT','فهامون: خروج اولیه MACD از اصلاح');
add('فهامون','WATCH_ACTIVE_ORDER','FAHAMON_OBV','BUY',[C.obvUp()],'BUY_ALERT','فهامون: برگشت صعودی OBV');
add('فهامون','WATCH_ACTIVE_ORDER','FAHAMON_RECLAIM','BUY',[C.crossAbove(5050),C.macdEarly()],'BUY_ALERT','فهامون: بازپس‌گیری ۵۰۵۰');
add('فهامون','WATCH_ACTIVE_ORDER','FAHAMON_BREAKOUT','STRONG_BUY',[C.crossAbove(5300),C.volume(1.5)],'BUY_ALERT','فهامون: شکست ۵۳۰۰ با حجم');

add('سکرما','ACTIVE_ORDER','SEKORMA_SUPPORT','WATCH',[C.priceRange(69500,70000)],'ALERT','سکرما وارد محدوده حمایت شد');
add('سکرما','ACTIVE_ORDER','SEKORMA_READY','BUY',[C.macdEarly(),C.mfiAbove(50)],'BUY_ALERT','سکرما: آمادگی حرکت');
add('سکرما','ACTIVE_ORDER','SEKORMA_OBV','BUY',[C.obvUp()],'BUY_ALERT','سکرما: برگشت OBV');
add('سکرما','ACTIVE_ORDER','SEKORMA_RESISTANCE','STRONG_BUY',[C.crossAbove(74000),C.volume(1.5)],'BUY_ALERT','سکرما: شکست مقاومت ۷۴۰۰۰');
add('سکرما','ACTIVE_ORDER','SEKORMA_STOP','EXIT',[C.crossBelow(67000)],'EXIT_ALERT','سکرما: حد خروج ۶۷۰۰۰');

add('دامین','ACTIVE_ORDER','DAMIN_SUPPORT','WATCH',[C.priceRange(14800,15050)],'ALERT','دامین وارد محدوده حمایت شد');
add('دامین','ACTIVE_ORDER','DAMIN_MACD','BUY',[C.macdEarly(),C.mfiAbove(50)],'BUY_ALERT','دامین: بازیابی MACD و MFI');
add('دامین','ACTIVE_ORDER','DAMIN_OBV','BUY',[C.obvUp()],'BUY_ALERT','دامین: برگشت OBV');
add('دامین','ACTIVE_ORDER','DAMIN_BREAKDOWN','EXIT',[C.crossBelow(14800),C.volume(1.2)],'EXIT_ALERT','دامین: شکست حمایت با حجم');

add('شیراز','CONDITIONAL_ORDER','SHIRAZ_SUPPORT','WATCH',[C.priceRange(66500,67500)],'ALERT','شیراز وارد محدوده حمایت شد');
add('شیراز','CONDITIONAL_ORDER','SHIRAZ_READY','BUY',[C.rsiCrossAbove(50),C.macdEarly()],'BUY_ALERT','شیراز: آمادگی حرکت');
add('شیراز','CONDITIONAL_ORDER','SHIRAZ_OBV_WARNING','WARNING',[C.obvDown()],'ALERT','شیراز: هشدار افت OBV');
add('شیراز','CONDITIONAL_ORDER','SHIRAZ_RECLAIM','BUY',[C.crossAbove(69800),C.rsiAbove(50)],'BUY_ALERT','شیراز: بازپس‌گیری ۶۹۸۰۰');
add('شیراز','CONDITIONAL_ORDER','SHIRAZ_STOP','EXIT',[C.crossBelow(66500)],'EXIT_ALERT','شیراز: شکست حمایت ۶۶۵۰۰');

add('شجم','PULLBACK_BUY','SHEJAM_ENTRY','BUY',[C.priceRange(10100,10250)],'BUY_ALERT','شجم وارد محدوده ورود شد');
add('شجم','PULLBACK_BUY','SHEJAM_MACD','BUY',[C.macdEarly()],'BUY_ALERT','شجم: خروج اولیه MACD از اصلاح');
add('شجم','PULLBACK_BUY','SHEJAM_BREAKOUT','STRONG_BUY',[C.crossAbove(10900),C.volume(1.5)],'BUY_ALERT','شجم: شکست ۱۰۹۰۰ با حجم');
add('شجم','PULLBACK_BUY','SHEJAM_STOP','EXIT',[C.crossBelow(9500)],'EXIT_ALERT','شجم: حد خروج ۹۵۰۰');

add('پردیس','SERIOUS_WATCH','PARDIS_SUPPORT','WATCH',[C.priceRange(2030,2060)],'ALERT','پردیس وارد محدوده حمایت شد');
add('پردیس','SERIOUS_WATCH','PARDIS_MACD','BUY',[C.macdNear()],'BUY_ALERT','پردیس: MACD نزدیک صفر');
add('پردیس','SERIOUS_WATCH','PARDIS_OBV','BUY',[C.obvHigh(10)],'BUY_ALERT','پردیس: شکست سقف OBV');
add('پردیس','SERIOUS_WATCH','PARDIS_ENTRY_CONFIRM','BUY',[C.priceRange(2050,2100),C.macdEarly(),C.obvUp()],'BUY_ALERT','پردیس: تأیید ورود چندشرطی');
add('پردیس','SERIOUS_WATCH','PARDIS_STOP','EXIT',[C.crossBelow(1940)],'EXIT_ALERT','پردیس: تضعیف سناریو زیر ۱۹۴۰');
add('پردیس','SERIOUS_WATCH','PARDIS_RESISTANCE','WATCH',[C.crossAbove(2200)],'ALERT','پردیس: عبور از مقاومت ۲۲۰۰');

add('وحافظ','SERIOUS_WATCH','VAHAFEZ_RECLAIM_2350','BUY',[C.crossAbove(2350),C.ema20()],'BUY_ALERT','وحافظ: بازپس‌گیری ۲۳۵۰ و EMA20');
add('وحافظ','SERIOUS_WATCH','VAHAFEZ_EMA50','BUY',[C.ema50(),C.macdEarly()],'BUY_ALERT','وحافظ: بازپس‌گیری EMA50');
add('وحافظ','SERIOUS_WATCH','VAHAFEZ_OBV','BUY',[C.obvUp()],'BUY_ALERT','وحافظ: برگشت OBV');
add('وحافظ','SERIOUS_WATCH','VAHAFEZ_STRONG','STRONG_BUY',[C.crossAbove(2370),C.macdEarly(),C.obvUp(),C.volume(1.3)],'BUY_ALERT','وحافظ: تأیید قوی ورود');
add('وحافظ','SERIOUS_WATCH','VAHAFEZ_STOP','EXIT',[C.crossBelow(2220)],'EXIT_ALERT','وحافظ: حد خروج ۲۲۲۰');
add('وحافظ','SERIOUS_WATCH','VAHAFEZ_TP1','SELL',[C.crossAbove(2480)],'PARTIAL_PROFIT','وحافظ: هدف اول ۲۴۸۰');
add('وحافظ','SERIOUS_WATCH','VAHAFEZ_TP2','SELL',[C.crossAbove(2560)],'PARTIAL_PROFIT','وحافظ: هدف دوم ۲۵۶۰');

add('ومهان','WATCH_ONLY','VMAHAN_MFI','WATCH',[C.mfiCrossAbove(35)],'ALERT','ومهان: بازیابی اولیه MFI');
add('ومهان','WATCH_ONLY','VMAHAN_READY','BUY',[C.mfiAbove(40),C.obvUp(),C.macdEarly()],'BUY_ALERT','ومهان: آمادگی حرکت');
add('ومهان','WATCH_ONLY','VMAHAN_RECLAIM','BUY',[C.crossAbove(5800),C.volume(1.3)],'BUY_ALERT','ومهان: بازپس‌گیری ۵۸۰۰');
add('ومهان','WATCH_ONLY','VMAHAN_STRONG','STRONG_BUY',[C.crossAbove(5900),C.volume(1.5),C.buyerAbove(1.2)],'BUY_ALERT','ومهان: تأیید قوی ۵۹۰۰');
add('ومهان','WATCH_ONLY','VMAHAN_STOP','EXIT',[C.crossBelow(5000)],'EXIT_ALERT','ومهان: شکست ساختاری ۵۰۰۰');

add('تکاردان','CONDITIONAL_WATCH','TAKARDAN_MFI','WATCH',[C.mfiCrossAbove(35)],'ALERT','تکاردان: بازیابی اولیه MFI');
add('تکاردان','CONDITIONAL_WATCH','TAKARDAN_READY','BUY',[C.mfiAbove(40),C.obvUp(),C.macdEarly()],'BUY_ALERT','تکاردان: آمادگی حرکت');
add('تکاردان','CONDITIONAL_WATCH','TAKARDAN_STRONG_OBV','BUY',[C.obvHigh(10)],'BUY_ALERT','تکاردان: شکست سقف OBV');

add('درهاور','CONDITIONAL_WATCH','DARHAVAR_SUPPORT','WATCH',[C.priceRange(14400,14600)],'ALERT','درهاور وارد محدوده حمایت شد');
add('درهاور','CONDITIONAL_WATCH','DARHAVAR_RSI','WATCH',[C.rsiCrossAbove(50)],'ALERT','درهاور: عبور RSI از ۵۰');
add('درهاور','CONDITIONAL_WATCH','DARHAVAR_READY','BUY',[C.rsiAbove(50),C.mfiAbove(40),C.macdEarly()],'BUY_ALERT','درهاور: آمادگی حرکت');
add('درهاور','CONDITIONAL_WATCH','DARHAVAR_RECLAIM','STRONG_BUY',[C.crossAbove(15400),C.volume(1.3)],'BUY_ALERT','درهاور: بازپس‌گیری ۱۵۴۰۰');

add('ثامید','WAVE2_WATCH','SAMID_SUPPORT','WATCH',[C.priceRange(1780,1820)],'ALERT','ثامید وارد محدوده حمایت شد');
add('ثامید','WAVE2_WATCH','SAMID_READY','BUY',[C.obvUp(),C.macdEarly()],'BUY_ALERT','ثامید: آمادگی موج دوم');
add('ثامید','WAVE2_WATCH','SAMID_RECLAIM','BUY',[C.crossAbove(1880),C.macdEarly()],'BUY_ALERT','ثامید: بازپس‌گیری ۱۸۸۰');
add('ثامید','WAVE2_WATCH','SAMID_STOP','EXIT',[C.crossBelow(1680)],'EXIT_ALERT','ثامید: حد خروج ۱۶۸۰');

add('سهگمت','SECONDARY_WATCH','SEHEGMAT_SUPPORT','WATCH',[C.priceRange(136000,140000)],'ALERT','سهگمت وارد محدوده حمایت شد');
add('سهگمت','SECONDARY_WATCH','SEHEGMAT_READY','BUY',[C.mfiAbove(50),C.obvUp(),C.macdEarly()],'BUY_ALERT','سهگمت: آمادگی حرکت');
add('سهگمت','SECONDARY_WATCH','SEHEGMAT_BREAKOUT','STRONG_BUY',[C.crossAbove(150000),C.volume(1.5)],'BUY_ALERT','سهگمت: شکست ۱۵۰۰۰۰ با حجم');

add('تملت','WAVE2_WATCH','TEMELLAT_SETUP','WATCH',[C.bbw(.15),C.emaGap(8)],'ALERT','تملت: فشردگی تکنیکی');
add('تملت','WAVE2_WATCH','TEMELLAT_READY','BUY',[C.macdEarly(),C.obvUp()],'BUY_ALERT','تملت: آمادگی موج دوم');
add('تملت','WAVE2_WATCH','TEMELLAT_OBV','BUY',[C.obvHigh(10)],'BUY_ALERT','تملت: شکست سقف OBV');

add('فباهنر','WAVE2_WATCH','FBAHONAR_EMA50','WATCH',[C.ema50()],'ALERT','فباهنر: بازپس‌گیری EMA50');
add('فباهنر','WAVE2_WATCH','FBAHONAR_READY','BUY',[C.emaTrend(),C.macdEarly(),C.obvUp()],'BUY_ALERT','فباهنر: آمادگی موج دوم');
add('فباهنر','WAVE2_WATCH','FBAHONAR_STRONG','BUY',[C.obvHigh(10),C.volume(1.3)],'BUY_ALERT','فباهنر: تأیید قوی OBV و حجم');

add('قاسم','WATCH_NO_NUMERIC_LEVELS','GHASEM_MACD','WATCH',[C.macdEarly()],'ALERT','قاسم: بازیابی MACD');
add('قاسم','WATCH_NO_NUMERIC_LEVELS','GHASEM_OBV','WATCH',[C.obvHigh(10)],'ALERT','قاسم: شکست سقف OBV');
add('قاسم','WATCH_NO_NUMERIC_LEVELS','GHASEM_MONEY_FLOW','WATCH',[C.mfiCrossAbove(50)],'ALERT','قاسم: بازیابی جریان پول');

for(const symbol of ['شتهران','کروی']){
  const prefix=symbol==='شتهران'?'SHTEHRAN':'KOROY';
  add(symbol,'LIMITED_HISTORY',`${prefix}_VOLUME`,'WATCH',[C.volume(2)],'ALERT',`${symbol}: حجم بیش از دو برابر میانگین`);
  add(symbol,'LIMITED_HISTORY',`${prefix}_BUYER_POWER`,'WATCH',[C.buyerAbove(1.5)],'ALERT',`${symbol}: قدرت خریدار بالای ۱.۵`);
}

const portfolioSymbols=['وبملت','حتاید','فولاد','وستهران','شتران','تابان','کالا','مبین','فملی','متقال','البرز','عیار','همراه','لبن','فقره','داروند','غزنجان'];
for(const symbol of portfolioSymbols){
  const key=`PORTFOLIO_${symbol}`;
  add(symbol,'OWNED',`${key}_PROFIT_5`,'WATCH',[C.profit(5)],'PROFIT_REVIEW',`${symbol}: بازبینی سود ۵ درصد`,{scope:'PORTFOLIO',oncePerDay:true});
  add(symbol,'OWNED',`${key}_PROFIT_9`,'SELL',[C.profit(9)],'PARTIAL_PROFIT',`${symbol}: بازبینی سیو سود ۹ درصد`,{scope:'PORTFOLIO',oncePerDay:true});
  add(symbol,'OWNED',`${key}_TRAILING_5`,'WARNING',[C.trailing(5)],'ALERT',`${symbol}: فعال‌شدن حد متحرک ۵ درصد`,{scope:'PORTFOLIO'});
  if(symbol==='عیار')continue;
  add(symbol,'OWNED',`${key}_BUYER_POWER_COLLAPSE`,'WARNING',[C.buyerBelow(.7),C.volume(1.5)],'ALERT',`${symbol}: افت قدرت خریدار با حجم بالا`,{scope:'PORTFOLIO'});
  add(symbol,'OWNED',`${key}_SELL_PRESSURE`,'WARNING',[C.obvDown(),C.mfiCrossBelow(40)],'ALERT',`${symbol}: تأیید فشار فروش`,{scope:'PORTFOLIO'});
  add(symbol,'OWNED',`${key}_PROFIT_9_WEAKNESS`,'SELL',[C.profit(9),or([C.macdBear(),C.obvDown(),C.mfiCrossBelow(50),C.buyerBelow(.8)])],'PARTIAL_PROFIT',`${symbol}: سود بالای ۹ درصد همراه با ضعف تکنیکی`,{scope:'PORTFOLIO',oncePerDay:true,priority:'CRITICAL'});
}

add('حتاید','OWNED','HETAYED_SUPPORT_WARNING','WARNING',[C.crossBelow(8150)],'ALERT','حتاید: شکست حمایت ۸۱۵۰');
add('حتاید','OWNED','HETAYED_STOP','EXIT',[C.crossBelow(7800)],'EXIT_ALERT','حتاید: حد خروج ۷۸۰۰');
add('حتاید','OWNED','HETAYED_BREAKOUT','BUY',[C.crossAbove(8600),C.buyerAbove(1.2)],'ALERT','حتاید: شکست ۸۶۰۰ با قدرت خریدار');
add('حتاید','OWNED','HETAYED_TP','SELL',[C.crossAbove(8800)],'PARTIAL_PROFIT','حتاید: بازبینی سیو سود ۸۸۰۰');
add('شتران','OWNED','SHETRAN_STOP','EXIT',[C.crossBelow(6500)],'EXIT_ALERT','شتران: حد خروج ۶۵۰۰');
add('شتران','OWNED','SHETRAN_TP1','SELL',[C.crossAbove(7100)],'PARTIAL_PROFIT','شتران: هدف اول ۷۱۰۰');
add('شتران','OWNED','SHETRAN_TP2','SELL',[C.crossAbove(7350)],'PARTIAL_PROFIT','شتران: هدف دوم ۷۳۵۰');
add('مبین','OWNED','MOBIN_STOP','EXIT',[C.crossBelow(11600)],'EXIT_ALERT','مبین: حد خروج ۱۱۶۰۰');
add('مبین','OWNED','MOBIN_TP1','SELL',[C.crossAbove(12700)],'PARTIAL_PROFIT','مبین: هدف اول ۱۲۷۰۰');
add('مبین','OWNED','MOBIN_TP2','SELL',[C.crossAbove(13200)],'PARTIAL_PROFIT','مبین: هدف دوم ۱۳۲۰۰');
add('تابان','OWNED','TABAN_PROFIT_PROTECT','SELL',[C.profit(50)],'ALERT','تابان: حفاظت از سود بالای ۵۰ درصد',{scope:'PORTFOLIO',oncePerDay:true});
add('تابان','OWNED','TABAN_21000','SELL',[C.priceAbove(21000)],'PARTIAL_PROFIT','تابان: بازبینی فروش بالای ۲۱۰۰۰');
add('تابان','OWNED','TABAN_WEAKNESS','WARNING',[C.macdBear(),C.obvDown()],'ALERT','تابان: ضعف همزمان MACD و OBV');
add('فولاد','OWNED_PROFIT_MANAGEMENT','FOOLAD_WEAKNESS','WARNING',[C.macdBear(),C.obvDown()],'ALERT','فولاد: ضعف همزمان MACD و OBV');
add('فولاد','OWNED_PROFIT_MANAGEMENT','FOOLAD_PROFIT_LOCK','SELL',[C.profit(20),C.mfiCrossBelow(50)],'PARTIAL_PROFIT','فولاد: قفل سود با افت MFI',{scope:'PORTFOLIO',oncePerDay:true});
add('البرز','OWNED','ALBORZ_PROFIT_LOCK','SELL',[C.profit(30),C.macdBear()],'PARTIAL_PROFIT','البرز: قفل سود با کراس نزولی MACD',{scope:'PORTFOLIO',oncePerDay:true});
add('البرز','OWNED','ALBORZ_OBV_WARNING','WARNING',[C.profit(25),C.obvDown()],'ALERT','البرز: هشدار OBV در سود بالا',{scope:'PORTFOLIO',oncePerDay:true});
add('داروند','OWNED','DARVAND_PROFIT_LOCK','SELL',[C.profit(25),C.macdBear()],'PARTIAL_PROFIT','داروند: قفل سود با کراس نزولی MACD',{scope:'PORTFOLIO',oncePerDay:true});
add('وبملت','OWNED','WEBMELLAT_RECOVERY','WATCH',[C.obvUp(),C.buyerAbove(1.2)],'ALERT','وبملت: نشانه بازیابی تقاضا');
add('وبملت','OWNED','WEBMELLAT_SELL_PRESSURE','WARNING',[C.obvDown(),C.buyerBelow(.8)],'ALERT','وبملت: فشار فروش تأیید شد');
add('همراه','OWNED','HAMRAH_RECOVERY','WATCH',[C.macdEarly(),C.obvUp(),C.mfiCrossAbove(40)],'ALERT','همراه: نشانه بازیابی چندشرطی');

add(null,'MARKET','MARKET_RISK_ON','INFO',[condition('MARKET_RISK_ON')],'ALERT','بازار وارد وضعیت RISK ON شد',{scope:'MARKET',priority:'MARKET'});
add(null,'MARKET','MARKET_RISK_OFF','WARNING',[condition('MARKET_RISK_OFF')],'ALERT','بازار وارد وضعیت RISK OFF شد',{scope:'MARKET',priority:'MARKET'});
add(null,'MARKET','MARKET_VOLUME_SURGE','INFO',[condition('MARKET_VOLUME_HIGH',{value:1.5})],'ALERT','جهش ارزش معاملات خرد بازار',{scope:'MARKET',priority:'MARKET'});
add(null,'MARKET','MARKET_BUY_QUEUE_EXPANSION','INFO',[condition('BUY_QUEUE_VALUE_CHANGE_15M_ABOVE',{value:30})],'ALERT','رشد بیش از ۳۰ درصد ارزش صف خرید در ۱۵ دقیقه',{scope:'MARKET',priority:'MARKET'});
add(null,'MARKET','MARKET_SELL_QUEUE_EXPANSION','WARNING',[condition('SELL_QUEUE_VALUE_CHANGE_15M_ABOVE',{value:30})],'ALERT','رشد بیش از ۳۰ درصد ارزش صف فروش در ۱۵ دقیقه',{scope:'MARKET',priority:'MARKET'});

export const defaultRulePackV1=Object.freeze(rules);
