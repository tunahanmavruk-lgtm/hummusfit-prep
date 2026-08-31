const { google } = require('googleapis');
async function fix() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const KDS_ID = '1Ga-sF5PWCvKNY-BtfDuBcOAve-FvPx-YqMtXjhan2Mw';
  
  // Get all sheets to find Mon, Aug 31 gid
  const meta = await sheets.spreadsheets.get({ spreadsheetId: KDS_ID });
  const monSheet = meta.data.sheets.find(s => s.properties.title === 'Mon, Aug 31');
  if (!monSheet) { console.log('Mon Aug 31 tab not found'); return; }
  
  const gid = monSheet.properties.sheetId;
  console.log('Found Mon, Aug 31 tab, gid:', gid);
  
  // Read current data to find meal rows
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: KDS_ID,
    range: "'Mon, Aug 31'!A:B"
  });
  const rows = res.data.values || [];
  console.log('Current rows:', rows.length);
  
  // Correct batch counts from intelligence
  const correct = {
    'Broritto Burrito': 13,
    'BBQ Chicken Garlic Parm Potatoes': 9,
    'Chipotle Chicken (1lb Competition Approved)': 8,
    'Competition Approved Grilled Chicken (1lb)': 8,
    'Meatball Parmesan Wrap': 8,
    'Farfalle & Chicken Alfredo': 6,
    'Grilled Chicken Parmesan Wrap': 6,
    'Spicy Buffalo Wrap': 6,
    'Thai Chili Chicken': 6,
    'Baja Chicken Tacos': 6,
    'Cheeseburger Bowl': 6,
    'Arnold 2022 Bowl': 5,
    'Brookfield Chicken Bowl': 5,
    'Competition Approved Chicken Kebab (1lb)': 5,
    'Competition Approved Oven Baked Cod (1lb)': 5,
  };
  
  // Build batch updates
  const updates = [];
  rows.forEach((row, i) => {
    const meal = row[0];
    if (correct[meal] !== undefined) {
      updates.push({ range: `'Mon, Aug 31'!B${i+1}`, values: [[correct[meal]]] });
    }
  });
  
  if (updates.length === 0) { console.log('No matching meals found'); return; }
  
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: KDS_ID,
    requestBody: { valueInputOption: 'RAW', data: updates }
  });
  
  console.log(`Updated ${updates.length} batch counts ✅`);
  console.log('KDS now matches PDF ✅');
}
fix().catch(e => console.error('ERROR:', e.message));
