const { getRollingAverages } = require('./src/burnRateStore.js');
const meals = [{name:'Broritto Burrito'},{name:'BBQ Meltdown'},{name:'Zeus Bowl'},{name:'Closed on Sunday Crispy Chicken Bowl'},{name:'Texas Queso Steak Bowl'}];
getRollingAverages(meals).then(avgs => {
  const active = Object.entries(avgs).filter(([k,v]) => v !== null);
  console.log('Active rolling avgs:', active.length);
  active.forEach(([m,r]) => console.log(' ', m + ':', r + '/day'));
  if (active.length === 0) console.log('Still 0 — data accumulating, will activate soon');
}).catch(e => console.error('ERROR:', e.message));
