const digitMap={ '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9','٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9' };
export const normalizeText=value=>String(value||'').replace(/[۰-۹٠-٩]/g,x=>digitMap[x]).replace(/[٬،]/g,',').replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/صف\s*فروش/g,'صف فروش').trim();
const numberFrom=value=>Number(String(value).replace(/,/g,''));

export const ruleCatalog=[
  {operator:'lt',label:'کمتر از',needsValue:true,fields:['lastPrice','closePrice','buyerPower','volume','tradeCount','bidAskRatio']},
  {operator:'lte',label:'کمتر یا مساوی',needsValue:true,fields:['lastPrice','closePrice','buyerPower','volume','tradeCount','bidAskRatio']},
  {operator:'gt',label:'بیشتر از',needsValue:true,fields:['lastPrice','closePrice','buyerPower','volume','tradeCount','bidAskRatio']},
  {operator:'gte',label:'بیشتر یا مساوی',needsValue:true,fields:['lastPrice','closePrice','buyerPower','volume','tradeCount','bidAskRatio']},
  {operator:'crosses_above',label:'عبور به بالای',needsValue:true,fields:['lastPrice','closePrice']},
  {operator:'crosses_below',label:'عبور به پایین',needsValue:true,fields:['lastPrice','closePrice']},
  {operator:'stabilizes_above',label:'تثبیت بالای',needsValue:true,fields:['lastPrice','closePrice'],options:['samples','minutes']},
  {operator:'stabilizes_below',label:'تثبیت پایین',needsValue:true,fields:['lastPrice','closePrice'],options:['samples','minutes']},
  {operator:'between',label:'داخل محدوده',needsRange:true,fields:['lastPrice','closePrice','dayLow','dayHigh']},
  {operator:'rebounds_from_range',label:'برگشت از محدوده',needsRange:true,fields:['lastPrice'],options:['minutes']},
  {operator:'sell_queue_cleared',label:'جمع‌شدن صف فروش',fields:['sellQueueValue']},
  {operator:'buy_queue_formed',label:'تشکیل صف خرید',fields:['buyQueueValue']}
];

export const fieldCatalog=[
  {value:'lastPrice',label:'آخرین قیمت'},{value:'closePrice',label:'قیمت پایانی'},{value:'dayLow',label:'کف روز'},{value:'dayHigh',label:'سقف روز'},
  {value:'buyerPower',label:'قدرت خریدار'},{value:'volume',label:'حجم معاملات'},{value:'tradeCount',label:'تعداد معاملات'},
  {value:'bidAskRatio',label:'نسبت حجم تقاضا به عرضه'},{value:'sellQueueValue',label:'ارزش صف فروش'},{value:'buyQueueValue',label:'ارزش صف خرید'}
];

function textRule(part){
  const p=normalizeText(part);
  let m;
  if(/جمع\s*شدن|جمع\s*شود|جمع\s*شده/.test(p)&&/صف فروش/.test(p)) return {type:'rule',field:'sellQueueValue',operator:'sell_queue_cleared'};
  if(/تشکیل/.test(p)&&/صف خرید/.test(p)) return {type:'rule',field:'buyQueueValue',operator:'buy_queue_formed'};
  if((m=/(?:تثبیت|حفظ)(?:\s+قیمت)?\s+(?:در\s+)?بالای\s+([\d,\.]+)/.exec(p))) return {type:'rule',field:'lastPrice',operator:'stabilizes_above',value:numberFrom(m[1]),options:{samples:3,minutes:15}};
  if((m=/(?:تثبیت)(?:\s+قیمت)?\s+(?:در\s+)?پایین(?:‌|\s)*تر از\s+([\d,\.]+)/.exec(p))) return {type:'rule',field:'lastPrice',operator:'stabilizes_below',value:numberFrom(m[1]),options:{samples:3,minutes:15}};
  if((m=/برگشت\s+از\s+محدوده\s+([\d,\.]+)\s*(?:تا|[-–])\s*([\d,\.]+)/.exec(p))) return {type:'rule',field:'lastPrice',operator:'rebounds_from_range',min:numberFrom(m[1]),max:numberFrom(m[2]),options:{minutes:60}};
  if((m=/(?:قدرت خریدار)\s+(?:بالاتر|بیشتر)\s+از\s+([\d,\.]+)/.exec(p))) return {type:'rule',field:'buyerPower',operator:'gt',value:numberFrom(m[1])};
  if((m=/(?:تقاضا|حجم تقاضا).*?(\d+(?:\.\d+)?)\s*برابر\s*(?:عرضه)?/.exec(p))) return {type:'rule',field:'bidAskRatio',operator:'gte',value:numberFrom(m[1])};
  if((m=/(?:قیمت|آخرین)?\s*(?:کمتر|پایین(?:‌|\s)*تر)\s+از\s+([\d,\.]+)/.exec(p))) return {type:'rule',field:'lastPrice',operator:'lt',value:numberFrom(m[1])};
  if((m=/(?:قیمت|آخرین)?\s*(?:بیشتر|بالاتر)\s+از\s+([\d,\.]+)/.exec(p))) return {type:'rule',field:'lastPrice',operator:'gt',value:numberFrom(m[1])};
  if((m=/(?:پس\s*گرفتن|عبور\s+به\s+بالای|عبور\s+از)\s+([\d,\.]+)/.exec(p))) return {type:'rule',field:'lastPrice',operator:'crosses_above',value:numberFrom(m[1])};
  throw new Error(`عبارت قابل تبدیل نیست: «${part.trim()}». آن را با قاعده‌ساز تعریف کنید.`);
}

export function parsePersianCondition(text){
  const normalized=normalizeText(text);
  if(!normalized) throw new Error('متن شرط خالی است.');
  const orParts=normalized.split(/\s+یا\s+/).filter(Boolean);
  const groups=orParts.map(orPart=>{
    const andParts=orPart.split(/\s+و\s+/).filter(Boolean);
    const children=andParts.map(textRule);
    return children.length===1?children[0]:{type:'group',op:'AND',children};
  });
  return groups.length===1?groups[0]:{type:'group',op:'OR',children:groups};
}

export function validateExpression(node,depth=0){
  if(depth>6) throw new Error('عمق گروه‌های شرط بیشتر از حد مجاز است.');
  if(!node||typeof node!=='object') throw new Error('ساختار شرط معتبر نیست.');
  if(node.type==='group'){
    if(!['AND','OR'].includes(node.op)) throw new Error('عملگر گروه باید AND یا OR باشد.');
    if(!Array.isArray(node.children)||node.children.length<1||node.children.length>30) throw new Error('هر گروه باید ۱ تا ۳۰ عضو داشته باشد.');
    node.children.forEach(x=>validateExpression(x,depth+1)); return node;
  }
  if(node.type!=='rule') throw new Error('نوع عضو شرط معتبر نیست.');
  const definition=ruleCatalog.find(x=>x.operator===node.operator);
  if(!definition) throw new Error(`عملگر ناشناخته: ${node.operator}`);
  if(!definition.fields.includes(node.field)) throw new Error(`فیلد ${node.field} برای این عملگر مجاز نیست.`);
  if(definition.needsValue&&!Number.isFinite(Number(node.value))) throw new Error('مقدار عددی شرط معتبر نیست.');
  if(definition.needsRange&&(!Number.isFinite(Number(node.min))||!Number.isFinite(Number(node.max))||Number(node.min)>Number(node.max))) throw new Error('محدوده شرط معتبر نیست.');
  return node;
}

const displayNumber=n=>Number(n).toLocaleString('fa-IR',{maximumFractionDigits:2});
const fieldName=field=>fieldCatalog.find(x=>x.value===field)?.label||field;

function evaluateRule(rule,current,history){
  const value=Number(current?.[rule.field]); const previous=history.length>1?history.at(-2):null; const prevValue=Number(previous?.[rule.field]);
  const explicitlyUnavailable=(['bidAskRatio','sellQueueValue','buyQueueValue'].includes(rule.field)&&current?.hasOrderBookData===false)
    ||(rule.field==='buyerPower'&&current?.hasBuyerPowerData===false)
    ||(['dayLow','dayHigh'].includes(rule.field)&&current?.hasDayRangeData===false);
  const valid=Number.isFinite(value)&&!explicitlyUnavailable; let active=false; let insufficient=false; let description='';
  switch(rule.operator){
    case 'lt': insufficient=!valid; active=valid&&value<Number(rule.value); description=`${fieldName(rule.field)} ${displayNumber(value)} < ${displayNumber(rule.value)}`; break;
    case 'lte': insufficient=!valid; active=valid&&value<=Number(rule.value); description=`${fieldName(rule.field)} ${displayNumber(value)} ≤ ${displayNumber(rule.value)}`; break;
    case 'gt': insufficient=!valid; active=valid&&value>Number(rule.value); description=`${fieldName(rule.field)} ${displayNumber(value)} > ${displayNumber(rule.value)}`; break;
    case 'gte': insufficient=!valid; active=valid&&value>=Number(rule.value); description=`${fieldName(rule.field)} ${displayNumber(value)} ≥ ${displayNumber(rule.value)}`; break;
    case 'between': insufficient=!valid; active=valid&&value>=Number(rule.min)&&value<=Number(rule.max); description=`${fieldName(rule.field)} ${displayNumber(value)} در محدوده ${displayNumber(rule.min)}–${displayNumber(rule.max)}`; break;
    case 'crosses_above': insufficient=!valid||!Number.isFinite(prevValue); active=!insufficient&&prevValue<=Number(rule.value)&&value>Number(rule.value); description=`عبور ${fieldName(rule.field)} از ${displayNumber(rule.value)}؛ قبلی ${displayNumber(prevValue)}، فعلی ${displayNumber(value)}`; break;
    case 'crosses_below': insufficient=!valid||!Number.isFinite(prevValue); active=!insufficient&&prevValue>=Number(rule.value)&&value<Number(rule.value); description=`نزول ${fieldName(rule.field)} از ${displayNumber(rule.value)}؛ قبلی ${displayNumber(prevValue)}، فعلی ${displayNumber(value)}`; break;
    case 'stabilizes_above':
    case 'stabilizes_below': { const samples=Math.max(2,Number(rule.options?.samples||3)); const recent=history.slice(-samples); insufficient=recent.length<samples||recent.some(x=>!Number.isFinite(Number(x[rule.field]))); active=!insufficient&&recent.every(x=>rule.operator==='stabilizes_above'?Number(x[rule.field])>Number(rule.value):Number(x[rule.field])<Number(rule.value)); description=`${recent.length}/${samples} نمونه ${rule.operator==='stabilizes_above'?'بالای':'پایین'} ${displayNumber(rule.value)}`; break; }
    case 'rebounds_from_range': { const touched=history.some(x=>Number(x.lastPrice)>=Number(rule.min)&&Number(x.lastPrice)<=Number(rule.max)); insufficient=history.length<2; active=!insufficient&&touched&&Number(current.lastPrice)>Number(rule.max); description=`قیمت ${displayNumber(current.lastPrice)}؛ تماس با محدوده ${displayNumber(rule.min)}–${displayNumber(rule.max)}: ${touched?'بله':'خیر'}`; break; }
    case 'sell_queue_cleared': { const hadQueue=history.slice(0,-1).some(x=>x.hasOrderBookData!==false&&Number(x.sellQueueValue)>0); insufficient=current?.hasOrderBookData===false||history.length<2; active=!insufficient&&hadQueue&&Number(current.sellQueueValue)===0; description=insufficient&&current?.hasOrderBookData===false?'داده ردیف سفارش موجود نیست.':`صف فروش فعلی ${displayNumber(current.sellQueueValue)}؛ صف قبلی: ${hadQueue?'ثبت شده':'ثبت نشده'}`; break; }
    case 'buy_queue_formed': { const hadNoQueue=history.slice(0,-1).some(x=>x.hasOrderBookData!==false&&Number(x.buyQueueValue)===0); insufficient=current?.hasOrderBookData===false||history.length<2; active=!insufficient&&hadNoQueue&&Number(current.buyQueueValue)>0; description=insufficient&&current?.hasOrderBookData===false?'داده ردیف سفارش موجود نیست.':`صف خرید فعلی ${displayNumber(current.buyQueueValue)}`; break; }
  }
  return {state:insufficient?'insufficient':active?'active':'inactive',description,rule};
}

export function evaluateExpression(node,current,history=[]){
  if(node.type==='rule') return evaluateRule(node,current,history);
  const children=node.children.map(x=>evaluateExpression(x,current,history));
  let state;
  if(node.op==='AND') state=children.some(x=>x.state==='inactive')?'inactive':children.some(x=>x.state==='insufficient')?'insufficient':'active';
  else state=children.some(x=>x.state==='active')?'active':children.some(x=>x.state==='insufficient')?'insufficient':'inactive';
  return {state,description:`گروه ${node.op}`,children};
}
