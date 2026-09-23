const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ratio = (a, b) => b > 0 ? a / b : 0;

export function analyzeSymbol(row, market = null) {
  const changePct = Number(row.changePct || 0);
  const volumeRatio = ratio(Number(row.volume || 0), Number(row.avgVolume30 || 0));
  const buyerPower = ratio(
    ratio(Number(row.buyVolumeReal || 0), Number(row.buyCountReal || 0)),
    ratio(Number(row.sellVolumeReal || 0), Number(row.sellCountReal || 0))
  );
  const queueRatio = ratio(Number(row.buyQueueValue || 0), Math.max(1, Number(row.sellQueueValue || 0)));

  let score = 50;
  const reasons = [];

  const trendPoints = clamp(changePct * 4, -20, 20);
  score += trendPoints;
  if (changePct >= 1) reasons.push(`رشد قیمت ${changePct.toFixed(1)}٪`);
  if (changePct <= -1) reasons.push(`افت قیمت ${Math.abs(changePct).toFixed(1)}٪`);

  if (volumeRatio >= 2) {
    score += 15;
    reasons.push(`حجم ${volumeRatio.toFixed(1)} برابر ${row.volumeBenchmarkType || 'میانگین'}`);
  } else if (volumeRatio >= 1.2) {
    score += 7;
    reasons.push('حجم بالاتر از میانگین');
  } else if (volumeRatio > 0 && volumeRatio < 0.5) {
    score -= 7;
    reasons.push('حجم ضعیف');
  }

  if (buyerPower >= 2) {
    score += 18;
    reasons.push(`قدرت خریدار ${buyerPower.toFixed(1)}`);
  } else if (buyerPower >= 1.3) {
    score += 9;
    reasons.push('برتری خریدار حقیقی');
  } else if (buyerPower > 0 && buyerPower < 0.7) {
    score -= 15;
    reasons.push('برتری فروشنده حقیقی');
  }

  if (queueRatio >= 3 && Number(row.buyQueueValue || 0) > 0) {
    score += 8;
    reasons.push('تقاضای سنگین');
  }
  if (Number(row.sellQueueValue || 0) > Number(row.buyQueueValue || 0) * 3) {
    score -= 10;
    reasons.push('عرضه سنگین');
  }

  if (market?.indexChange < 0 && market?.equalWeightChange < 0) {
    score -= 8;
    reasons.push('فشار منفی بازار و هم‌وزن');
  } else if (market?.indexChange > 0 && market?.equalWeightChange > 0) {
    score += 5;
    reasons.push('هم‌جهتی مثبت بازار');
  }

  score = Math.round(clamp(score, 0, 100));
  let action = 'HOLD';
  if (score >= 70) action = 'BUY';
  if (score <= 35) action = 'SELL';

  const price = Number(row.lastPrice || row.closePrice || 0);
  return {
    symbol: row.symbol,
    name: row.name || row.symbol,
    action,
    score,
    price,
    changePct,
    volumeRatio: Number(volumeRatio.toFixed(2)),
    buyerPower: Number(buyerPower.toFixed(2)),
    stopLoss: action === 'BUY' && price ? Math.round(price * 0.94) : null,
    takeProfit: action === 'BUY' && price ? Math.round(price * 1.12) : null,
    reasons: reasons.slice(0, 4),
    observedAt: new Date().toISOString()
  };
}

export function rankSignals(rows, watchlist = [], market = null, filters = {}) {
  const allowed = new Set(watchlist);
  const minTradeCount = Number(filters.minTradeCount || 0);
  const minTradeValue = Number(filters.minTradeValue || 0);
  return rows
    .filter(row => !allowed.size || allowed.has(row.symbol))
    .filter(row => Number(row.lastPrice || row.closePrice || 0) > 0)
    .filter(row => Number(row.tradeCount || 0) >= minTradeCount)
    .filter(row => Number(row.tradeValue || 0) >= minTradeValue)
    .map(row => analyzeSymbol(row, market))
    .sort((a, b) => b.score - a.score);
}
