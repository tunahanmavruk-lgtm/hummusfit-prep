const PRODUCTION_TIME_ZONE = 'America/New_York';
const PRODUCTION_HOUR = 19;
const PRODUCTION_NIGHTS = new Set(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

function getProductionClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PRODUCTION_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { weekday: values.weekday, hour: Number(values.hour) };
}

function shouldRunScheduled(date = new Date()) {
  const { weekday, hour } = getProductionClock(date);
  return PRODUCTION_NIGHTS.has(weekday) && hour === PRODUCTION_HOUR;
}

module.exports = {
  PRODUCTION_TIME_ZONE,
  getProductionClock,
  shouldRunScheduled
};
