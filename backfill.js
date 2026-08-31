const { google } = require('googleapis');
const { GROUP1_MEALS, GROUP2_MEALS } = require('./src/mealData');

// Access internal function directly
const shopifyModule = require('./src/shopify');
const fetchInventory = shopifyModule.fetchInventory;

// We'll use fetchSales which IS exported, called per day
async function fetchOneDaySales(date, meals) {
  const { fetchInventory: fi, fetchSales } = require('./src/shopify');
  // Use Shopify orders API directly
  const start = new Date(date); start.setHours(0,0,0,0);
  const end = new Date(date); end.setHours(23,59,59,999);
  
  // Call internal fetchOrdersForRange via a workaround
  const axios = require('axios');
  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_TOKEN;
  
  const url = `https://${store}/admin/api/2024-01/orders.json?status=any&created_at_min=${start.toISOString()}&created_at_max=${end.toISOString()}&limit=250&financial_status=paid`;
  const res = await axios.get(url, { headers: { 'X-Shopify-Access-Token': token } });
  const orders = res.data.orders || [];
  
  const sales = {};
  for (const meal of meals) sales[meal.name.toLowerCase()] = 0;
  
  for (const order of orders) {
    for (const item of order.line_items || []) {
      const name = item.name.toLowerCase();
      if (sales[name] !== undefined) sales[name] += item.quantity;
    }
  }
  return sales;
}

async function backfill() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;

  const rows = [];
  const days = 21;

  for (let i = 1; i <= days; i++) {
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
      const sales = await fetchOneDaySales(date, meals);
      let total = 0;
      for (const meal of meals) {
        const units = sales[meal.name.toLowerCase()] || 0;
        rows.push([dateStr, dayName, meal.name, units, groupNum]);
        total += units;
      }
      console.log(`✓ (${total} units sold)`);
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {
      console.log(`skipped: ${e.message.slice(0,50)}`);
    }
  }

  if (!rows.length) { console.log('No data'); return; }

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
