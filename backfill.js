const { google } = require('googleapis');
const { fetchDaySalesForDate } = require('./src/shopify');
const { GROUP1_MEALS, GROUP2_MEALS } = require('./src/mealData');

async function backfill() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  const rows = [];

  for (let i = 1; i <= 28; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dow = date.getDay();
    if (dow === 0) continue;
    const dateStr = date.toISOString().split('T')[0];
    const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow];
    const isG1 = [1,3,5].includes(dow);
    const meals = isG1 ? GROUP1_MEALS : GROUP2_MEALS;
    const groupNum = isG1 ? 1 : 2;
    process.stdout.write(`Fetching ${dayName} ${dateStr}... `);
    try {
      const sales = await fetchDaySalesForDate(date, meals);
      let total = 0;
      for (const meal of meals) {
        const units = sales[meal.name] || sales[meal.name.toLowerCase()] || 0;
        const rate = Math.round(units / 1);
        rows.push([dateStr, dayName, meal.name, rate, groupNum]);
        total += units;
      }
      console.log(`✓ ${total} units`);
      await new Promise(r => setTimeout(r, 400));
    } catch(e) {
      console.log(`skip: ${e.message.slice(0,60)}`);
    }
  }

  if (!rows.length) { console.log('No data fetched'); return; }

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID, range: "'Burn Rates'!A2:E"
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "'Burn Rates'!A:E",
    valueInputOption: 'RAW',
    requestBody: { values: rows }
  });

  const dates = [...new Set(rows.map(r => r[0]))];
  console.log(`\n✅ Backfilled ${rows.length} rows across ${dates.length} dates`);
  console.log('Rolling averages activate tonight ✅');
}
backfill().catch(e => console.error('ERROR:', e.message));
