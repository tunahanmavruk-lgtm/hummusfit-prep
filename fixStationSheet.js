const { google } = require('googleapis');

const SHEET_ID = '1RPMZIlTlZtSXQYDb-cjGUbSeeamiHcYNCaV6DglGiJM';

async function main() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) { console.error('Set GOOGLE_SERVICE_ACCOUNT_JSON first'); process.exit(1); }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const allSheets = meta.data.sheets;
  console.log(`Found ${allSheets.length} tabs`);

  const requests = [];
  for (const sheet of allSheets) {
    const sheetId = sheet.properties.sheetId;
    // Rows 1-11: station summary header — collapsible
    requests.push({ addDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 11 } } });
    // Rows 56-65: summary footer — collapsible  
    requests.push({ addDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: 55, endIndex: 65 } } });
  }

  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } });
  console.log('Done — rows 1-11 and 56-65 are now collapsible on all tabs');
}

main().catch(console.error);
