const average = values => values.length ? values.reduce((sum, x) => sum + x, 0) / values.length : 0;

export function calculateRsi(closes, period = 14) {
  if (closes.length <= period) return null;
  const changes = closes.slice(-period - 1).slice(1).map((value, index) => value - closes.slice(-period - 1)[index]);
  const gains = changes.map(x => Math.max(0, x));
  const losses = changes.map(x => Math.max(0, -x));
  const avgGain = average(gains);
  const avgLoss = average(losses);
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

export function technicalSummary(candles) {
  const ordered = [...candles].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const closes = ordered.map(x => Number(x.close)).filter(x => x > 0);
  if (closes.length < 50) return { valid: false, reason: 'کمتر از ۵۰ کندل معتبر' };
  const last = closes.at(-1);
  const sma20 = average(closes.slice(-20));
  const sma50 = average(closes.slice(-50));
  const rsi14 = calculateRsi(closes, 14);
  const momentum20 = closes.length >= 21 ? ((last / closes.at(-21)) - 1) * 100 : 0;
  let adjustment = 0;
  const reasons = [];
  if (last > sma20 && sma20 > sma50) { adjustment += 10; reasons.push('روند میان‌مدت صعودی'); }
  else if (last < sma20 && sma20 < sma50) { adjustment -= 10; reasons.push('روند میان‌مدت نزولی'); }
  if (rsi14 >= 50 && rsi14 <= 68) { adjustment += 5; reasons.push(`RSI متعادل ${rsi14.toFixed(0)}`); }
  else if (rsi14 > 75) { adjustment -= 6; reasons.push(`اشباع خرید RSI ${rsi14.toFixed(0)}`); }
  else if (rsi14 < 30) { adjustment -= 4; reasons.push(`ضعف روند RSI ${rsi14.toFixed(0)}`); }
  if (momentum20 > 15) { adjustment -= 3; reasons.push('رشد تند ۲۰روزه'); }
  if (momentum20 < -10) { adjustment -= 5; reasons.push('مومنتوم ۲۰روزه منفی'); }
  return {
    valid: true,
    adjustment: Math.max(-15, Math.min(15, adjustment)),
    rsi14: Number(rsi14.toFixed(1)),
    sma20: Math.round(sma20),
    sma50: Math.round(sma50),
    momentum20: Number(momentum20.toFixed(1)),
    reasons
  };
}

export function applyTechnical(signal, technical) {
  if (!technical?.valid) return { ...signal, technical };
  const score = Math.max(0, Math.min(100, signal.score + technical.adjustment));
  let action = 'HOLD';
  if (score >= 70) action = 'BUY';
  if (score <= 35) action = 'SELL';
  return { ...signal, score, action, reasons: [...signal.reasons, ...technical.reasons].slice(0, 6), technical };
}
