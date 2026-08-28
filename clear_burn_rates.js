const { google } = require('googleapis');
async function clear() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "'Burn Rates'!A:E"
  });
  const rows = (res.data.values || []).length;
  console.log('Rows found:', rows, '(including header)');
  await sheets.spreadsheets.values.clear({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "'Burn Rates'!A2:E"
  });
  console.log('Cleared', rows - 1, 'inflated rows ✅');
  console.log('Tonight cron saves Day 1 of clean data');
  console.log('Rolling averages activate: Tue Sep 2 (G2), Wed Sep 3 (G1)');
}
clear().catch(e => console.error('ERROR:', e.message));
