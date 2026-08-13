// ============================================================
//  BURN RATE STORE — 30-day rolling average engine
// ============================================================
const { google } = require('googleapis');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TAB_NAME = 'Burn Rates';
const MAX_DAYS = 30;

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

async function ensureTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === TAB_NAME);
  if (existing) return existing.properties.sheetId;
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: TAB_NAME, gridProperties: { rowCount: 5000, columnCount: 5 } } } }] }
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId, range: `'${TAB_NAME}'!A1:E1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [['Date', 'Day', 'Meal Name', 'Units Sold', 'Group']] }
  });
  const newSheetId = res.data.replies[0].addSheet.properties.sheetId;

  // Hide the tab so it never appears on iPad/KDS display
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: newSheetId, hidden: true },
          fields: 'hidden'
        }
      }]
    }
  });

  console.log(`  ✓ Created "${TAB_NAME}" tab (hidden)`);
  return newSheetId;
}

async function saveDailySales(meals, burnOffSales, carryOverSales, dayName, groupNum, burnDayCount = 1, carryDayCount = 3) {
  if (!SHEET_ID) { console.log('  ⚠️  No GOOGLE_SHEET_ID — skipping'); return; }
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets, SHEET_ID);
    const today = new Date().toISOString().split('T')[0];
    const rows = meals
      .map(m => {
        const totalSales = (burnOffSales[m.name] || 0) + (carryOverSales[m.name] || 0);
        const totalDays  = burnDayCount + carryDayCount;
        const dailyRate  = totalDays > 0 ? Math.round(totalSales / totalDays) : 0;
        return [today, dayName, m.name, dailyRate, groupNum];
      })
      .filter(r => r[3] >= 0); // save true daily rate including 0-sales days
    if (rows.length === 0) { console.log('  ℹ️  No sales to save'); return; }
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `'${TAB_NAME}'!A:E`,
      valueInputOption: 'USER_ENTERED', requestBody: { values: rows }
    });
    console.log(`  ✓ Saved ${rows.length} meal sales to Burn Rates tab`);
  } catch (err) {
    console.log(`  ⚠️  Burn rate save failed: ${err.message}`);
  }
}

async function getRollingAverages(meals) {
  const result = {};
  meals.forEach(m => result[m.name] = null);
  if (!SHEET_ID) return result;
  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID, range: `'${TAB_NAME}'!A:E`
    });
    const rows = res.data.values || [];
    if (rows.length <= 1) return result;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const salesByMeal = {};
    const datesByMeal = {};
    for (const row of rows.slice(1)) {
      const [date, , mealName, soldStr] = row;
      if (!date || !mealName || date < cutoffStr) continue;
      const sold = parseInt(soldStr) || 0;
      if (!salesByMeal[mealName]) { salesByMeal[mealName] = 0; datesByMeal[mealName] = new Set(); }
      salesByMeal[mealName] += sold;
      datesByMeal[mealName].add(date);
    }
    for (const meal of meals) {
      const name = meal.name;
      if (salesByMeal[name] && datesByMeal[name].size >= 3) {
        result[name] = Math.round(salesByMeal[name] / datesByMeal[name].size);
      }
    }
    const count = Object.values(result).filter(v => v !== null).length;
    console.log(`  ✓ Rolling averages: ${count} meals with 5+ days data`);
  } catch (err) {
    console.log(`  ⚠️  Rolling avg load failed: ${err.message}`);
  }
  return result;
}

module.exports = { saveDailySales, getRollingAverages };
