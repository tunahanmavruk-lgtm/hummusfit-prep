// ============================================================
//  SHEETS SYNC — HummusFit KDS
//  Called from the prep-automation Railway app after PDF is
//  generated. Writes the day's prepSheet into a Google Sheet
//  tab named after the cook date (e.g. "Mon Jun 09").
//
//  Sheet columns:
//    A: Meal Name
//    B: Batches / Units
//    C: Station (primary station string)
//    D: Priority (1 = 🔴, else empty)
//    E: Status  (dropdown: ⬜ Not Started / 🟡 In Progress / 🟢 Done)
//    F: Notes   (free text, kitchen editable)
// ============================================================

const { google } = require('googleapis');

// ── Auth ─────────────────────────────────────────────────────
// Expects GOOGLE_SERVICE_ACCOUNT_JSON env var containing the
// full JSON key from a Google Cloud Service Account.
// The service account must have Editor access on the Sheet.
function getAuthClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

// ── Derive primary station label from meal data ───────────────
function stationLabel(meal) {
  const parts = [];
  if (meal.grill)        parts.push(`Grill: ${meal.grill}`);
  if (meal.flatGrill)    parts.push(`Flat Grill: ${meal.flatGrill}`);
  if (meal.oven)         parts.push(`Oven: ${meal.oven}`);
  if (meal.stove)        parts.push(`Stove: ${meal.stove}`);
  if (meal.saladStation) parts.push(`Salad: ${meal.saladStation}`);
  if (meal.sauceStation) parts.push(`Sauce: ${meal.sauceStation}`);
  if (meal.rawMeats)     parts.push(`Raw: ${meal.rawMeats}`);
  return parts.slice(0, 2).join(' | ') || '—'; // keep it short for KDS display
}

// ── Build tab name from cook date ────────────────────────────
function tabName(cookDayName) {
  // e.g. "Monday" → "Mon Jun 09"
  const now = new Date();
  // The blueprint runs the night before, so the cook day is tomorrow
  const cookDate = new Date(now);
  cookDate.setDate(cookDate.getDate() + 1);
  const label = cookDate.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month:   'short',
    day:     'numeric'
  });
  return label; // e.g. "Mon, Jun 9"
}

// ── Main sync function ────────────────────────────────────────
/**
 * Write the prepSheet to Google Sheets.
 *
 * @param {Array}  prepSheet  - Output from calculateBatches()
 * @param {number} groupNum   - 1 or 2
 * @param {string} dayName    - e.g. "Monday"
 * @param {string} eventName  - Holiday name or null
 * @returns {Promise<string>} - Sheet URL
 */
async function syncToSheets(prepSheet, groupNum, dayName, eventName) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID env var not set');

  const auth   = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const tab    = tabName(dayName);

  console.log(`\n📊 SHEETS SYNC: Writing to tab "${tab}"...`);

  // ── 1. Get or create the tab ───────────────────────────────
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheet = meta.data.sheets.find(
    s => s.properties.title === tab
  );

  let sheetId;

  if (existingSheet) {
    sheetId = existingSheet.properties.sheetId;
    console.log(`  ↻ Tab "${tab}" exists — clearing and rewriting`);
    // Clear existing content
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${tab}'`
    });
  } else {
    // Create new tab
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: tab,
              gridProperties: { rowCount: 200, columnCount: 6 }
            }
          }
        }]
      }
    });
    sheetId = addRes.data.replies[0].addSheet.properties.sheetId;
    console.log(`  + Created new tab "${tab}"`);
  }

  // ── 2. Build row data ─────────────────────────────────────
  // Only write meals that need cooking (batches > 0 or DTA with units)
  const activeMeals = prepSheet.filter(
    m => m.batches > 0 || (m.directToAssembly && m.exactUnits > 0)
  );

  // Header row
  const headerRow = ['MEAL', 'BATCHES / UNITS', 'STATION', '🔴', 'STATUS', 'NOTES'];

  const dataRows = activeMeals.map(m => {
    const batchCol = m.directToAssembly
      ? `${m.exactUnits} units (DTA)`
      : `${m.batches} batch${m.batches !== 1 ? 'es' : ''}`;

    return [
      m.name,
      batchCol,
      stationLabel(m),
      m.isPriority1 ? '🔴' : '',
      '⬜ Not Started',   // default status — kitchen team edits this
      ''                  // notes — free text
    ];
  });

  const allRows = [headerRow, ...dataRows];

  // ── 3. Write values ────────────────────────────────────────
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range:          `'${tab}'!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody:    { values: allRows }
  });

  // ── 4. Apply formatting ────────────────────────────────────
  const numDataRows = dataRows.length;
  const requests    = [];

  // Header row: dark background, white bold text
  requests.push({
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: 0, endRowIndex: 1,
        startColumnIndex: 0, endColumnIndex: 6
      },
      cell: {
        userEnteredFormat: {
          backgroundColor: { red: 0.09, green: 0.09, blue: 0.09 },
          textFormat: {
            foregroundColor: { red: 1, green: 1, blue: 1 },
            bold: true,
            fontSize: 11
          },
          horizontalAlignment: 'CENTER'
        }
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
    }
  });

  // Data rows: alternating background, larger font for kitchen readability
  for (let i = 0; i < numDataRows; i++) {
    const isEven  = i % 2 === 0;
    const rowIdx  = i + 1; // offset for header
    const meal    = activeMeals[i];
    const isPri1  = meal.isPriority1;

    // Row background: priority1 = soft red, else alternate grey/white
    const bg = isPri1
      ? { red: 1.0, green: 0.88, blue: 0.86 }
      : isEven
        ? { red: 0.97, green: 0.97, blue: 0.97 }
        : { red: 1.0,  green: 1.0,  blue: 1.0  };

    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: rowIdx, endRowIndex: rowIdx + 1,
          startColumnIndex: 0, endColumnIndex: 6
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: bg,
            textFormat: { fontSize: 12 },
            verticalAlignment: 'MIDDLE',
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)'
      }
    });
  }

  // Column widths (in pixels → units of 1/96 inch):
  //   A: Meal Name (wide), B: Batches, C: Station, D: Priority, E: Status, F: Notes
  const colWidths = [320, 160, 280, 60, 160, 200];
  colWidths.forEach((w, colIdx) => {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: colIdx,
          endIndex:   colIdx + 1
        },
        properties:  { pixelSize: w },
        fields:      'pixelSize'
      }
    });
  });

  // Row height — tall enough to read at a glance from across the kitchen
  if (numDataRows > 0) {
    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: 1,
          endIndex: numDataRows + 1
        },
        properties:  { pixelSize: 52 },
        fields:      'pixelSize'
      }
    });
  }

  // Freeze header row
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { frozenRowCount: 1 }
      },
      fields: 'gridProperties.frozenRowCount'
    }
  });

  // Status column (E) dropdown validation
  if (numDataRows > 0) {
    requests.push({
      setDataValidation: {
        range: {
          sheetId,
          startRowIndex: 1, endRowIndex: numDataRows + 1,
          startColumnIndex: 4, endColumnIndex: 5
        },
        rule: {
          condition: {
            type: 'ONE_OF_LIST',
            values: [
              { userEnteredValue: '⬜ Not Started' },
              { userEnteredValue: '🟡 In Progress' },
              { userEnteredValue: '🟢 Done' }
            ]
          },
          showCustomUi: true,
          strict: true
        }
      }
    });
  }

  // Title bar at top — merge A1:F1 area above header for day label
  // Actually: insert a title row above the header
  requests.push({
    insertDimension: {
      range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
      inheritFromBefore: false
    }
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests }
  });

  // Write title row (now row 1 after insert)
  const eventSuffix = eventName ? ` 🎉 ${eventName}` : '';
  const titleText   = `HummusFit Kitchen — Group ${groupNum} | ${tab}${eventSuffix}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range:          `'${tab}'!A1:F1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[titleText, '', '', '', '', '']]
    }
  });

  // Format the title row
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Merge A1:F1 for the title
        {
          mergeCells: {
            range: {
              sheetId,
              startRowIndex: 0, endRowIndex: 1,
              startColumnIndex: 0, endColumnIndex: 6
            },
            mergeType: 'MERGE_ALL'
          }
        },
        // Format title cell
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0, endRowIndex: 1,
              startColumnIndex: 0, endColumnIndex: 1
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.97, green: 0.62, blue: 0.18 }, // HummusFit orange
                textFormat: {
                  foregroundColor: { red: 1, green: 1, blue: 1 },
                  bold: true,
                  fontSize: 14
                },
                horizontalAlignment: 'CENTER',
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
          }
        },
        // Title row height
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 48 },
            fields: 'pixelSize'
          }
        },
        // Freeze first 2 rows (title + header)
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 2 }
            },
            fields: 'gridProperties.frozenRowCount'
          }
        }
      ]
    }
  });

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
  console.log(`  ✓ Sheet synced: ${activeMeals.length} meals written`);
  console.log(`  🔗 ${sheetUrl}`);

  return sheetUrl;
}

module.exports = { syncToSheets, tabName };
