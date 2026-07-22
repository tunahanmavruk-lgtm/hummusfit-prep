// ============================================================
//  SHEETS SYNC — HummusFit KDS v5
//  Matches TV display exactly:
//  - White rows, alternating light grey
//  - No priority/red column
//  - Station cells show task name only
//  - Orange (#E8612C) for In Progress, Teal (#2BBFAA) for Done
//  - Clean black header row matching TV column headers
// ============================================================

const { google } = require('googleapis');

function getAuthClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

// Column indices (0-based) — NO priority column, matches TV exactly
const COL = {
  MEAL:       0,  // A
  BATCHES:    1,  // B
  STOVE:      2,  // C
  OVEN:       3,  // D
  GRILL:      4,  // E
  FLAT_GRILL: 5,  // F
  SALAD:      6,  // G
  SAUCE:      7,  // H
  RAW_MEATS:  8   // I
};
const TOTAL_COLS = 9;

const STATION_COLS = [
  { key: 'stove',        col: COL.STOVE,      header: 'STOVE'      },
  { key: 'oven',         col: COL.OVEN,        header: 'OVEN'       },
  { key: 'grill',        col: COL.GRILL,       header: 'GRILL'      },
  { key: 'flatGrill',    col: COL.FLAT_GRILL,  header: 'FLAT GRILL' },
  { key: 'saladStation', col: COL.SALAD,       header: 'SALAD'      },
  { key: 'sauceStation', col: COL.SAUCE,       header: 'SAUCE'      },
  { key: 'rawMeats',     col: COL.RAW_MEATS,   header: 'RAW MEATS'  },
];

function tabName() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

// Colors matching TV display
const COLOR_BLACK  = { red: 0.067, green: 0.067, blue: 0.067 };
const COLOR_WHITE  = { red: 1,     green: 1,     blue: 1     };
const COLOR_GREY   = { red: 0.973, green: 0.973, blue: 0.973 };
const COLOR_ORANGE = { red: 0.910, green: 0.380, blue: 0.173 }; // #E8612C
const COLOR_TEAL   = { red: 0.169, green: 0.749, blue: 0.667 }; // #2BBFAA
const COLOR_BADGE_BG = { red: 0.933, green: 0.933, blue: 0.933 };

async function syncToSheets(prepSheet, groupNum, dayName, eventName) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID env var not set');

  const auth   = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const tab    = tabName();

  console.log(`\n📊 SHEETS SYNC: Writing to tab "${tab}"...`);

  // ── 1. Get or create tab ──────────────────────────────────
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find(s => s.properties.title === tab);
  let sheetId;

  if (existing) {
    sheetId = existing.properties.sheetId;
    console.log(`  ↻ Tab "${tab}" exists — clearing`);
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${tab}'` });
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            setDataValidation: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 300, startColumnIndex: 0, endColumnIndex: TOTAL_COLS },
              rule: null
            }
          },
          {
            unmergeCells: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 300, startColumnIndex: 0, endColumnIndex: TOTAL_COLS }
            }
          }
        ]
      }
    });
  } else {
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: tab,
              gridProperties: { rowCount: 300, columnCount: TOTAL_COLS }
            }
          }
        }]
      }
    });
    sheetId = addRes.data.replies[0].addSheet.properties.sheetId;
    console.log(`  + Created tab "${tab}"`);
  }

  // ── 2. Active meals sorted by batch count desc ────────────
  const activeMeals = prepSheet
    .filter(m => m.batches > 0 || (m.directToAssembly && m.exactUnits > 0))
    .sort((a, b) => (b.batches || 0) - (a.batches || 0));

  // ── 3. Build value rows ───────────────────────────────────
  const eventSuffix = eventName ? ` — ${eventName}` : '';
  const titleText   = `HummusFit Kitchen — Group ${groupNum} | ${tab}${eventSuffix}`;

  const headerRow = ['MEAL NAME', '#', 'STOVE', 'OVEN', 'GRILL', 'FLAT GRILL', 'SALAD', 'SAUCE', 'RAW MEATS'];

  // Station cells: just the task name (dropdown overlaid separately)
  const dataRows = activeMeals.map(m => {
    const row = new Array(TOTAL_COLS).fill('');
    row[COL.MEAL]    = m.name;
    row[COL.BATCHES] = m.directToAssembly ? `${m.exactUnits} units` : String(m.batches);
    STATION_COLS.forEach(({ key, col }) => {
      row[col] = m[key] || '';
    });
    return row;
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [
        [titleText, ...new Array(TOTAL_COLS - 1).fill('')],
        headerRow,
        ...dataRows
      ]
    }
  });

  // ── 4. Formatting ─────────────────────────────────────────
  const requests = [];

  // Title row: orange background, white bold text, merged
  requests.push(
    {
      mergeCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: TOTAL_COLS },
        mergeType: 'MERGE_ALL'
      }
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: TOTAL_COLS },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLOR_ORANGE,
            textFormat: { foregroundColor: COLOR_WHITE, bold: true, fontSize: 13, fontFamily: 'Oswald' },
            horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 44 }, fields: 'pixelSize'
      }
    }
  );

  // Header row: black background, white bold — matches TV column headers
  requests.push(
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: TOTAL_COLS },
        cell: {
          userEnteredFormat: {
            backgroundColor: COLOR_BLACK,
            textFormat: { foregroundColor: COLOR_WHITE, bold: true, fontSize: 10, fontFamily: 'Oswald' },
            horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 36 }, fields: 'pixelSize'
      }
    }
  );

  // Data rows
  const numDataRows = activeMeals.length;
  for (let i = 0; i < numDataRows; i++) {
    const rowIdx = i + 2;
    const isEven = i % 2 === 0;
    const bg = isEven ? COLOR_WHITE : COLOR_GREY;

    // Row base
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: TOTAL_COLS },
        cell: {
          userEnteredFormat: {
            backgroundColor: bg,
            textFormat: { fontSize: 11, fontFamily: 'Arial' },
            verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)'
      }
    });

    // Meal name: bold, larger
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: COL.MEAL, endColumnIndex: COL.MEAL + 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12, fontFamily: 'Oswald' } } },
        fields: 'userEnteredFormat.textFormat'
      }
    });

    // Batch count: centered, bold, large
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: COL.BATCHES, endColumnIndex: COL.BATCHES + 1 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true, fontSize: 16, fontFamily: 'Oswald' }
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
      }
    });

    // Station cells: dropdown where task exists
    STATION_COLS.forEach(({ key, col }) => {
      const task = activeMeals[i][key] || '';

      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: col, endColumnIndex: col + 1 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'LEFT',
              textFormat: { fontSize: 10 },
              wrapStrategy: 'WRAP'
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment,textFormat,wrapStrategy)'
        }
      });

      if (!task) return;

      // Dropdown: task name → Not Started / In Progress / Done
      requests.push({
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: rowIdx, endRowIndex: rowIdx + 1,
            startColumnIndex: col, endColumnIndex: col + 1
          },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: [
                { userEnteredValue: task },
                { userEnteredValue: `${task} — 🟡 In Progress` },
                { userEnteredValue: `${task} — 🟢 Done` }
              ]
            },
            showCustomUi: true,
            strict: false
          }
        }
      });
    });
  }

  // Column widths matching TV grid
  [240, 52, 140, 150, 150, 130, 140, 130, 150].forEach((w, colIdx) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
        properties: { pixelSize: w }, fields: 'pixelSize'
      }
    });
  });

  // Data row height
  if (numDataRows > 0) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 2, endIndex: numDataRows + 2 },
        properties: { pixelSize: 52 }, fields: 'pixelSize'
      }
    });
  }

  // Freeze title + header
  requests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 2 } },
      fields: 'gridProperties.frozenRowCount'
    }
  });

  // Auto-collapse rows 1-11 (station summary) and 56-65 (summary footer)
  requests.push({ addDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 11 } } });
  requests.push({ addDimensionGroup: { range: { sheetId, dimension: 'ROWS', startIndex: 55, endIndex: 65 } } });

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
  console.log(`  ✓ Sheet synced: ${activeMeals.length} meals`);
  console.log(`  🔗 ${sheetUrl}`);
  return sheetUrl;
}

module.exports = { syncToSheets, tabName };
