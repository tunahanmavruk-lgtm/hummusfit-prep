// ============================================================
//  SHEETS SYNC — HummusFit KDS v4
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

// Column indices (0-based)
const COL = {
  MEAL: 0, BATCHES: 1, PRIORITY: 2,
  STOVE: 3, OVEN: 4, GRILL: 5, FLAT_GRILL: 6,
  SALAD: 7, SAUCE: 8, RAW_MEATS: 9
};
const TOTAL_COLS = 10;

const STATION_COLS = [
  { key: 'stove',        col: COL.STOVE,      header: '▲ STOVE'      },
  { key: 'oven',         col: COL.OVEN,        header: '◉ OVEN'       },
  { key: 'grill',        col: COL.GRILL,       header: '⬡ GRILL'      },
  { key: 'flatGrill',    col: COL.FLAT_GRILL,  header: '▬ FLAT GRILL' },
  { key: 'saladStation', col: COL.SALAD,       header: '✦ SALAD'      },
  { key: 'sauceStation', col: COL.SAUCE,       header: '◈ SAUCE'      },
  { key: 'rawMeats',     col: COL.RAW_MEATS,   header: '◆ RAW MEATS'  },
];

function tabName() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return now.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

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
    // Clear all validation AND unmerge all cells (clean slate)
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

  // ── 2. Active meals ───────────────────────────────────────
  const activeMeals = prepSheet.filter(
    m => m.batches > 0 || (m.directToAssembly && m.exactUnits > 0)
  );

  // ── 3. Build rows ─────────────────────────────────────────
  const eventSuffix = eventName ? ` 🎉 ${eventName}` : '';
  const titleText   = `HummusFit Kitchen — Group ${groupNum} | ${tab}${eventSuffix}`;

  const headerRow = [
    'MEAL NAME', '#', '🔴',
    '▲ STOVE', '◉ OVEN', '⬡ GRILL', '▬ FLAT GRILL',
    '✦ SALAD', '◈ SAUCE', '◆ RAW MEATS'
  ];

  // Station cell default value = "Task Name — ⬜ Not Started"
  const dataRows = activeMeals.map(m => {
    const row = new Array(TOTAL_COLS).fill('');
    row[COL.MEAL]     = m.name;
    row[COL.BATCHES]  = m.directToAssembly ? `${m.exactUnits} units` : String(m.batches);
    row[COL.PRIORITY] = m.isPriority1 ? '🔴' : '';
    STATION_COLS.forEach(({ key, col }) => {
      const task = m[key] || '';
      row[col] = task ? `${task} — ⬜ Not Started` : '';
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

  // Title row
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
            backgroundColor: { red: 0.97, green: 0.62, blue: 0.18 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 14 },
            horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 50 }, fields: 'pixelSize'
      }
    }
  );

  // Header row
  requests.push(
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: TOTAL_COLS },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.09, green: 0.09, blue: 0.09 },
            textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 },
            horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)'
      }
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 44 }, fields: 'pixelSize'
      }
    }
  );

  // Data rows
  const numDataRows = activeMeals.length;
  for (let i = 0; i < numDataRows; i++) {
    const rowIdx = i + 2;
    const meal   = activeMeals[i];
    const isEven = i % 2 === 0;

    const bg = meal.isPriority1
      ? { red: 1.0, green: 0.88, blue: 0.86 }
      : isEven
        ? { red: 0.96, green: 0.96, blue: 0.96 }
        : { red: 1.0,  green: 1.0,  blue: 1.0  };

    // Base row format
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: TOTAL_COLS },
        cell: {
          userEnteredFormat: {
            backgroundColor: bg,
            textFormat: { fontSize: 10 },
            verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)'
      }
    });

    // Meal name bold
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: COL.MEAL, endColumnIndex: COL.MEAL + 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 12 } } },
        fields: 'userEnteredFormat.textFormat'
      }
    });

    // Batch count: centered, orange, bold
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: COL.BATCHES, endColumnIndex: COL.BATCHES + 1 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true, fontSize: 14, foregroundColor: { red: 0.97, green: 0.50, blue: 0.10 } }
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
      }
    });

    // Priority: centered
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: COL.PRIORITY, endColumnIndex: COL.PRIORITY + 1 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { fontSize: 14 } } },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
      }
    });

    // Station cells — dropdown only where task exists
    // Options: "Task — ⬜ Not Started" (default, already written), "Task — 🟡 In Progress", "Task — 🟢 Done"
    STATION_COLS.forEach(({ key, col }) => {
      const task = meal[key] || '';

      // Center all station cells
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: col, endColumnIndex: col + 1 },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
              textFormat: { fontSize: 10 },
              wrapStrategy: 'WRAP'
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment,textFormat,wrapStrategy)'
        }
      });

      if (!task) return;

      // Dropdown: 3 options with task name embedded
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
                { userEnteredValue: `${task} — ⬜ Not Started` },
                { userEnteredValue: `${task} — 🟡 In Progress` },
                { userEnteredValue: `${task} — 🟢 Done`        },
              ]
            },
            showCustomUi: true,
            strict: true
          }
        }
      });
    });
  }

  // Column widths
  [240, 65, 40, 130, 130, 150, 120, 130, 120, 130].forEach((w, colIdx) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: colIdx, endIndex: colIdx + 1 },
        properties: { pixelSize: w }, fields: 'pixelSize'
      }
    });
  });

  // Row heights
  if (numDataRows > 0) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 2, endIndex: numDataRows + 2 },
        properties: { pixelSize: 60 }, fields: 'pixelSize'
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

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
  console.log(`  ✓ Sheet synced: ${activeMeals.length} meals written`);
  console.log(`  🔗 ${sheetUrl}`);
  return sheetUrl;
}

module.exports = { syncToSheets, tabName };
