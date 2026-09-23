function minutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) throw new Error(`زمان نامعتبر: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function marketClock(date = new Date(), timeZone = 'Asia/Tehran') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const get = type => parts.find(x => x.type === type)?.value;
  return { weekday: get('weekday'), hour: Number(get('hour')), minute: Number(get('minute')) };
}

export function isMarketWindow(schedule, date = new Date()) {
  const clock = marketClock(date, schedule.timeZone);
  if (!['Sat', 'Sun', 'Mon', 'Tue', 'Wed'].includes(clock.weekday)) return false;
  const now = clock.hour * 60 + clock.minute;
  return now >= minutes(schedule.start) && now <= minutes(schedule.end);
}
