function findRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['candle_daily_adjusted', 'candle_daily', 'candle_intraday', 'data', 'results', 'result', 'items']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  throw new Error('ساختار پاسخ BRSAPI شناخته نشد. نمونه پاسخ را در اختیار توسعه‌دهنده بگذارید.');
}

function pick(row, names, fallback = 0) {
  for (const name of names) if (row?.[name] !== undefined && row[name] !== null) return row[name];
  return fallback;
}

export function brsHeaders(config) {
  return {
    accept: 'application/json',
    'accept-language': 'fa-IR,fa;q=0.9,en;q=0.8',
    'user-agent': config.userAgent
  };
}

export function normalizeBrsSymbol(row) {
  const hasOrderBookData = ['pd1','qd1','po1','qo1','bestBuyPrice','bestBuyVolume','bestSellPrice','bestSellVolume'].some(key => row?.[key] !== undefined && row[key] !== null);
  const hasBuyerPowerData = ['Buy_I_Volume','buyVolumeReal','buy_I_Volume','realBuyVolume'].some(key => row?.[key] !== undefined && row[key] !== null)
    && ['Sell_I_Volume','sellVolumeReal','sell_I_Volume','realSellVolume'].some(key => row?.[key] !== undefined && row[key] !== null);
  const hasDayRangeData = ['pmin','dayLow','priceMin'].some(key => row?.[key] !== undefined && row[key] !== null)
    && ['pmax','dayHigh','priceMax'].some(key => row?.[key] !== undefined && row[key] !== null);
  const lastPrice = Number(pick(row, ['pl', 'lastPrice', 'pDrCotVal', 'priceLast']));
  const closePrice = Number(pick(row, ['pc', 'closePrice', 'pClosing', 'priceClose']));
  const upperLimit = Number(pick(row, ['tmax', 'priceMaxAllowed']));
  const lowerLimit = Number(pick(row, ['tmin', 'priceMinAllowed']));
  const bestBuyPrice = Number(pick(row, ['pd1', 'bestBuyPrice']));
  const bestBuyVolume = Number(pick(row, ['qd1', 'bestBuyVolume']));
  const bestSellPrice = Number(pick(row, ['po1', 'bestSellPrice']));
  const bestSellVolume = Number(pick(row, ['qo1', 'bestSellVolume']));
  const dayLow = Number(pick(row, ['pmin', 'dayLow', 'priceMin']));
  const dayHigh = Number(pick(row, ['pmax', 'dayHigh', 'priceMax']));
  const openPrice = Number(pick(row, ['pf', 'openPrice', 'priceFirst']));
  const monthlyAverage = Number(pick(row, ['tvol_avg_1m', 'avgVolume30', 'monthlyAverageVolume', 'averageVolume']));
  const baseVolume = Number(pick(row, ['bvol']));
  const usableBaseVolume = baseVolume >= 1000 ? baseVolume : 0;
  const buyVolumeReal = Number(pick(row, ['Buy_I_Volume', 'buyVolumeReal', 'buy_I_Volume', 'realBuyVolume']));
  const buyCountReal = Number(pick(row, ['Buy_CountI', 'buyCountReal', 'buy_I_Count', 'realBuyCount']));
  const sellVolumeReal = Number(pick(row, ['Sell_I_Volume', 'sellVolumeReal', 'sell_I_Volume', 'realSellVolume']));
  const sellCountReal = Number(pick(row, ['Sell_CountI', 'sellCountReal', 'sell_I_Count', 'realSellCount']));
  const buyerAverage = buyCountReal > 0 ? buyVolumeReal / buyCountReal : 0;
  const sellerAverage = sellCountReal > 0 ? sellVolumeReal / sellCountReal : 0;
  const orderBook = [1,2,3,4,5].map(level => ({
    level,
    buyPrice: Number(pick(row, [`pd${level}`])), buyVolume: Number(pick(row, [`qd${level}`])), buyCount: Number(pick(row, [`zd${level}`])),
    sellPrice: Number(pick(row, [`po${level}`])), sellVolume: Number(pick(row, [`qo${level}`])), sellCount: Number(pick(row, [`zo${level}`]))
  }));
  const totalBidVolume = orderBook.reduce((sum,x)=>sum+x.buyVolume,0);
  const totalAskVolume = orderBook.reduce((sum,x)=>sum+x.sellVolume,0);
  return {
    symbol: String(pick(row, ['l18', 'symbol', 'lVal18AFC', 'ticker', 'نماد'], '')),
    name: String(pick(row, ['l30', 'name', 'lVal30', 'companyName', 'نام'], '')),
    lastPrice,
    closePrice,
    openPrice,
    dayLow,
    dayHigh,
    upperLimit,
    lowerLimit,
    changePct: Number(pick(row, ['plp', 'changePct', 'priceChangePercent', 'percent'])),
    volume: Number(pick(row, ['tvol', 'volume', 'qTotTran5J', 'tradeVolume'])),
    avgVolume30: monthlyAverage || usableBaseVolume,
    volumeBenchmarkType: monthlyAverage ? 'میانگین ماه' : usableBaseVolume ? 'حجم مبنا' : null,
    buyVolumeReal,
    buyCountReal,
    sellVolumeReal,
    sellCountReal,
    buyerPower: sellerAverage > 0 ? buyerAverage / sellerAverage : 0,
    bestBuyPrice,
    bestBuyVolume,
    bestSellPrice,
    bestSellVolume,
    totalBidVolume,
    totalAskVolume,
    bidAskRatio: totalAskVolume > 0 ? totalBidVolume / totalAskVolume : totalBidVolume > 0 ? 999 : 0,
    orderBook,
    hasOrderBookData,
    hasBuyerPowerData,
    hasDayRangeData,
    buyQueueValue: bestBuyPrice === upperLimit ? bestBuyPrice * bestBuyVolume : 0,
    sellQueueValue: bestSellPrice === lowerLimit ? bestSellPrice * bestSellVolume : 0,
    state: String(pick(row, ['state'], '')),
    date: String(pick(row, ['date'], '')),
    time: String(pick(row, ['time'], '')),
    industry: String(pick(row, ['cs'], '')),
    market: String(pick(row, ['m'], '')),
    eps: Number(pick(row, ['eps'])),
    pe: Number(pick(row, ['pe'])),
    groupPe: Number(pick(row, ['g_pe'])),
    baseVolume: Number(pick(row, ['bvol'])),
    marketValue: Number(pick(row, ['mv'])),
    tradeCount: Number(pick(row, ['tno'])),
    tradeValue: Number(pick(row, ['tval'])),
    assemblies: Array.isArray(row?.assembly) ? row.assembly.map(item => ({
      title: String(item?.title || ''),
      dateTitle: item?.date_title || null,
      datePublish: item?.date_publish || null,
      timePublish: item?.time_publish || null,
      content: String(item?.content || '')
    })) : []
  };
}

export async function fetchBrsSymbols(config, beforeRequest = null) {
  const { apiKey, baseUrl, allSymbolsPath, allSymbolsType, apiKeyHeader, apiKeyQuery } = config;
  if (!apiKey || !baseUrl || !allSymbolsPath) {
    throw new Error('تنظیمات BRSAPI کامل نیست. BRS_API_KEY، BRS_BASE_URL و BRS_ALL_SYMBOLS_PATH را وارد کنید.');
  }
  const url = new URL(allSymbolsPath, baseUrl);
  url.searchParams.set('type', String(allSymbolsType || 1));
  const headers = brsHeaders(config);
  if (apiKeyQuery) url.searchParams.set(apiKeyQuery, apiKey);
  else headers[apiKeyHeader] = apiKey;

  beforeRequest?.('allSymbols');
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`BRSAPI HTTP ${response.status}`);
  const payload = await response.json();
  return findRows(payload).map(normalizeBrsSymbol).filter(row => row.symbol);
}

export async function fetchBrsWatchlist(config, watchlist, beforeRequest = null) {
  const { apiKey, baseUrl, symbolPath } = config;
  if (!apiKey || !baseUrl || !symbolPath) {
    throw new Error('تنظیمات نماد BRSAPI کامل نیست. BRS_API_KEY، BRS_BASE_URL و BRS_SYMBOL_PATH را وارد کنید.');
  }
  if (!watchlist?.length) throw new Error('برای استفاده از Symbol API، حداقل یک نماد در WATCHLIST قرار دهید.');
  const results = [];
  for (const symbol of watchlist) {
    const url = new URL(symbolPath, baseUrl);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('l18', symbol);
    beforeRequest?.('symbol');
    const response = await fetch(url, { headers: brsHeaders(config), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`BRSAPI Symbol ${symbol} HTTP ${response.status}`);
    const normalized = normalizeBrsSymbol(await response.json());
    if (normalized.symbol) results.push(normalized);
  }
  return results;
}

export function normalizeBrsIndex(row) {
  return {
    date: String(row?.date || ''),
    time: String(row?.time || ''),
    state: String(row?.state || ''),
    index: Number(row?.index || 0),
    indexChange: Number(row?.index_change || 0),
    equalWeight: Number(row?.index_equalWeight || 0),
    equalWeightChange: Number(row?.index_equalWeight_change || 0),
    marketValue: Number(row?.mv || 0),
    tradeCount: Number(row?.tno || 0),
    tradeVolume: Number(row?.tvol || 0),
    tradeValue: Number(row?.tval || 0)
  };
}

export async function fetchBrsIndex(config, type = 1, beforeRequest = null) {
  const { apiKey, baseUrl, indexPath } = config;
  if (!apiKey || !baseUrl || !indexPath) {
    throw new Error('تنظیمات شاخص BRSAPI کامل نیست. BRS_API_KEY، BRS_BASE_URL و BRS_INDEX_PATH را وارد کنید.');
  }
  const url = new URL(indexPath, baseUrl);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('type', String(type));
  beforeRequest?.('index');
  const response = await fetch(url, { headers: brsHeaders(config), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`BRSAPI Index HTTP ${response.status}`);
  return normalizeBrsIndex(await response.json());
}

export function normalizeCandles(payload) {
  const rows = findRows(payload);
  return rows.map(row => ({
    date: String(row?.date || ''),
    time: String(row?.time || ''),
    open: Number(row?.open || 0),
    high: Number(row?.high || 0),
    low: Number(row?.low || 0),
    close: Number(row?.close || 0),
    volume: Number(row?.volume || 0)
  })).filter(row => row.date && row.close > 0);
}

export async function fetchBrsCandles(config, symbol, type = 3, count = 120, beforeRequest = null) {
  const { apiKey, baseUrl, candlePath } = config;
  if (!apiKey || !baseUrl || !candlePath) throw new Error('تنظیمات کندل BRSAPI کامل نیست.');
  const url = new URL(candlePath, baseUrl);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('type', String(type));
  url.searchParams.set('l18', symbol);
  url.searchParams.set('count', String(count));
  beforeRequest?.('candlestick');
  const response = await fetch(url, { headers: brsHeaders(config), signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`BRSAPI Candlestick ${symbol} HTTP ${response.status}`);
  return normalizeCandles(await response.json()).slice(0, count);
}
