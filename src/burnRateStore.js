// ============================================================
//  BURN RATE STORE — 30-day rolling average engine
//  Reads/writes actual daily sales to Google Sheets
//  Tab: "Burn Rates" in KDS sheet
// ============================================================

const { google } = require('googleapis');

const SHEET_ID  = process.env.GOOGLE_SHEET_ID;
const TAB_NAME  = 'Burn Rates';
const MAX_DAYS  = 30;

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

// ── Ensure the Burn Rates tab exists ─────────────────────────
async function ensureTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === TAB_NAME);
  if (existing) return existing.properties.sheetId;

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: {
            title: TAB_NAME,
            gridProperties: { rowCount: 5000, columnCount: 5 }
          }
        }
      }]
    }
  });

  // Add headers
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${TAB_NAME}'!A1:E1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['Date', 'Day', 'Meal Name', 'Units Sold', 'Group']]
    }
  });

  console.log(`  ✓ Created "${TAB_NAME}" tab`);
  return res.data.replies[0].addSheet.properties.sheetId;
}

// ── Save today's sales ────────────────────────────────────────
async function saveDailySales(meals, burnOffSales, carryOverSales, dayName, groupNum) {
  if (!SHEET_ID) { console.log('  ⚠️  No GOOGLE_SHEET_ID — skipping burn rate save'); return; }

  try {
    const auth   = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await ensureTab(sheets, SHEET_ID);

    const today = new Date().toISOString().split('T')[0];

    // Use burn-off sales (yesterday's actual) as today's real sales
    const rows = meals.map(m => {
      const sold = burnOffSales[m.name] || 0;
      return [today, dayName, m.name, sold, groupNum];
    }).filter(r => r[3] > 0); // only save meals that actually sold

    if (rows.length === 0) {
      console.log('  ℹ️  No sales to save today');
      return;
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${TAB_NAME}'!A:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows }
    });

    console.log(`  ✓ Saved ${rows.length} meal sales to Burn Rates tab`);
  } catch (err) {
    console.log(`  ⚠️  Burn rate save failed: ${err.message}`);
  }
}

// ── Read last 30 days and calculate rolling averages ─────────
async function getRollingAverages(meals) {
  const result = {};
  meals.forEach(m => result[m.name] = null); // null = no data yet

  if (!SHEET_ID) return result;

  try {
    const auth   = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `'${TAB_NAME}'!A:E`
    });

    const rows = res.data.values || [];
    if (rows.length <= 1) return result; // headers only

    // Calculate cutoff date (30 days ago)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    // Aggregate sales per meal within window
    const salesByMeal = {};
    const datesByMeal = {};

    for (const row of rows.slice(1)) { // skip header
      const [date, , mealName, soldStr] = row;
      if (!date || !mealName || date < cutoffStr) continue;

      const sold = parseInt(soldStr) || 0;
      if (!salesByMeal[mealName]) {
        salesByMeal[mealName] = 0;
        datesByMeal[mealName] = new Set();
      }
      salesByMeal[mealName] += sold;
      datesByMeal[mealName].add(date);
    }

    // Calculate rolling average per meal
    for (const meal of meals) {
      const name = meal.name;
      if (salesByMeal[name] && datesByMeal[name].size >= 5) {
        // Need at least 5 days of data before trusting the average
        const daysWithSales = datesByMeal[name].size;
        result[name] = Math.round(salesByMeal[name] / daysWithSales);
      }
    }

    const mealsWithData = Object.values(result).filter(v => v !== null).length;
    console.log(`  ✓ Rolling averages loaded: ${mealsWithData} meals with 5+ days data`);

  } catch (err) {
    console.log(`  ⚠️  Rolling avg load failed: ${err.message}`);
  }

  return result;
}

module.exports = { saveDailySales, getRollingAverages };
