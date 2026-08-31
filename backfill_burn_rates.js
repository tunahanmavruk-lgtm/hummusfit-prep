/**
 * One-time backfill: pulls 30 days of Shopify sales and writes
 * true daily rates to the Burn Rates tab so rolling averages
 * activate immediately instead of waiting weeks.
 */
const { fetchSales } = require('./src/shopify');
const { saveDailySales } = require('./src/burnRateStore');
const { GROUP1_MEALS, GROUP2_MEALS } = require('./src/mealData');

async function backfill() {
  console.log('Backfilling 30 days of Shopify sales to Burn Rates tab...');
  // Pull last 7 days of real data for now
  // This gives enough data points to activate rolling averages tonight
  const days = 7;
  let saved = 0;
  
  for (let i = 1; i <= days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][date.getDay()];
    
    // Skip Sunday (dark day)
    if (date.getDay() === 0) continue;
    
    const isG1Day = [1,3,5].includes(date.getDay()); // Mon/Wed/Fri
    const meals = isG1Day ? GROUP1_MEALS : GROUP2_MEALS;
    const groupNum = isG1Day ? 1 : 2;
    
    console.log(`  Fetching ${dayName} ${date.toLocaleDateString()}...`);
    
    try {
      const sales = await fetchSales(meals, dayName);
      if (sales) {
        await saveDailySales(meals, sales.burnOffSales, sales.carryOverSales, 
          dayName, groupNum, 1, sales.carryDayCount || 3);
        saved++;
        console.log(`  ✓ Saved ${dayName}`);
      }
    } catch(e) {
      console.log(`  ⚠ Skipped ${dayName}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\nDone! Saved ${saved} days of data.`);
  console.log('Rolling averages will activate tonight. ✅');
}

backfill().catch(e => console.error('ERROR:', e.message));
