const base = [
  { symbol: 'فولاد', name: 'فولاد مبارکه اصفهان', lastPrice: 2860, avgVolume30: 90_000_000 },
  { symbol: 'وبملت', name: 'بانک ملت', lastPrice: 3120, avgVolume30: 130_000_000 },
  { symbol: 'عیار', name: 'صندوق طلای عیار', lastPrice: 165000, avgVolume30: 25_000_000 }
];

export async function fetchMockSymbols() {
  const now = Date.now() / 30000;
  return base.map((item, index) => {
    const wave = Math.sin(now + index * 1.8);
    const buyerPower = 1.1 + (wave + 1) * 0.65;
    return {
      ...item,
      lastPrice: Math.round(item.lastPrice * (1 + wave * 0.008)),
      closePrice: item.lastPrice,
      changePct: Number((wave * 2.8).toFixed(2)),
      volume: Math.round(item.avgVolume30 * (1.1 + (wave + 1) * 0.65)),
      buyVolumeReal: Math.round(12_000_000 * buyerPower),
      buyCountReal: 900,
      sellVolumeReal: 10_000_000,
      sellCountReal: 900,
      buyerPower,
      dayLow: Math.round(item.lastPrice * .98),
      dayHigh: Math.round(item.lastPrice * 1.03),
      lowerLimit: Math.round(item.lastPrice * .97),
      upperLimit: Math.round(item.lastPrice * 1.03),
      bestBuyPrice: Math.round(item.lastPrice * (1 + wave * .008)),
      bestBuyVolume: 12_000_000,
      bestSellPrice: Math.round(item.lastPrice * (1 + wave * .008)) + 10,
      bestSellVolume: 3_000_000,
      totalBidVolume: 12_000_000,
      totalAskVolume: 3_000_000,
      bidAskRatio: 4,
      hasOrderBookData: true,
      hasBuyerPowerData: true,
      hasDayRangeData: true,
      buyQueueValue: wave > 0.6 ? 8_000_000_000 : 0,
      sellQueueValue: wave < -0.6 ? 7_000_000_000 : 1
    };
  });
}

export async function fetchMockIndex() {
  return {
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toISOString().slice(11, 19),
    state: 'آزمایشی',
    index: 2_756_970,
    indexChange: -33_000,
    equalWeight: 814_270,
    equalWeightChange: -9_859,
    marketValue: 87_748_425_774_158_880,
    tradeCount: 493_959,
    tradeVolume: 16_326_463_426,
    tradeValue: 134_757_329_520_715
  };
}
