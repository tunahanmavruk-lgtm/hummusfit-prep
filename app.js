// ============================================================
//  HUMMUSFIT — KITCHEN PREP SHEET AUTOMATION
//  God Mode Engine — Updated May 2026
//
//  Cron: 0 2 * * 1-6  (9PM EST = 2AM UTC, Mon–Sat)
//  Railway project: scintillating-commitment
// ============================================================

const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

// Load .env for local dev only (Railway injects env vars natively)
if (fs.existsSync('.env')) {
  const lines = fs.readFileSync('.env', 'utf8').split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key && !process.env[key]) process.env[key] = val;
      }
    }
  });
}

const { GROUP1_MEALS, GROUP2_MEALS, DIRECT_TO_ASSEMBLY } = require('./src/mealData');
const { fetchInventory, fetchSales }                      = require('./src/shopify');
const { calculateBatches, getDayGroup, getDayName,
        getEventMultiplier, getTodayEST, COOK_SCHEDULE }   = require('./src/formula');
const { generatePdf }                                     = require('./src/generatePdf');
const { syncToSheets } = require('./src/sheetsSync');
const { sendEmail }                                       = require('./src/emailer');

const http = require('http');
const cron = require('node-cron');
const path = require('path');
const PDF_PATH = path.join(__dirname, 'latest_blueprint.pdf');

const TEST_MODE = process.env.TEST_MODE === 'true' || process.argv.includes('--test');
const VERBOSE   = process.argv.includes('--verbose');

// ── CLOUDINARY UPLOAD ────────────────────────────────────────
async function uploadToCloudinary(pdfBuffer) {
  try {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dtwtlbkqm';
    const apiKey    = process.env.CLOUDINARY_API_KEY    || '781763156221262';
    const apiSecret = process.env.CLOUDINARY_API_SECRET || 'ewG2wHHrAW8o-hY4MP8tJjpXGVw';

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const publicId  = 'hummusfit_blueprint_latest';
    
    // Generate signature
    const sigStr = `overwrite=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(sigStr).digest('hex');

    // Build multipart form
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const fields = { timestamp, api_key: apiKey, signature, public_id: publicId, overwrite: 'true' };
    
    let body = '';
    for (const [k, v] of Object.entries(fields)) {
      body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
    }
    body += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="blueprint.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
    
    const bodyPrefix = Buffer.from(body);
    const bodySuffix = Buffer.from(`\r\n--${boundary}--\r\n`);
    const fullBody   = Buffer.concat([bodyPrefix, pdfBuffer, bodySuffix]);

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`;
    
    const result = await new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullBody.length
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(fullBody);
      req.end();
    });

    if (result.secure_url) {
      console.log(`  ✓ PDF uploaded to Cloudinary: ${result.secure_url}`);
      return result.secure_url;
    } else {
      console.warn('  ⚠️  Cloudinary upload failed:', JSON.stringify(result));
      return null;
    }
  } catch(e) {
    console.warn('  ⚠️  Cloudinary upload error:', e.message);
    return null;
  }
}

// ── CLOSED NOTICE PDF ────────────────────────────────────────
async function generateClosedPdf() {
  const puppeteer = require('puppeteer');
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    background: #1C4A45;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px;
  }
  .logo-text {
    font-size: 28pt;
    font-weight: 900;
    color: #2BBFAA;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .logo-text span { color: #E8612C; }
  .divider {
    width: 200px;
    height: 4px;
    background: linear-gradient(90deg, #2BBFAA, #E8612C);
    margin: 20px auto;
    border-radius: 2px;
  }
  .closed-text {
    font-size: 42pt;
    font-weight: 900;
    color: white;
    text-transform: uppercase;
    letter-spacing: 4px;
    line-height: 1.1;
    margin-bottom: 20px;
  }
  .closed-text span { color: #E8612C; }
  .sub-text {
    font-size: 16pt;
    color: rgba(255,255,255,0.7);
    font-weight: 600;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 40px;
  }
  .reopen {
    background: #2BBFAA;
    color: white;
    font-size: 14pt;
    font-weight: 800;
    padding: 16px 40px;
    border-radius: 8px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .footer {
    position: absolute;
    bottom: 30px;
    color: rgba(255,255,255,0.4);
    font-size: 8pt;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="logo-text">Hummus<span>FIT</span></div>
  <div class="divider"></div>
  <div class="closed-text">Kitchen<br><span>Closed</span></div>
  <div class="sub-text">Sunday — Dark Day</div>
  <div class="reopen">We reopen Monday 🥙</div>
  <div class="footer">HummusFit Kitchen Automation · myhummusfit.com</div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/root/.cache/puppeteer/chrome/linux-124.0.6367.91/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1056, height: 816 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      landscape: true,
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' }
    });

    console.log('  ✓ Closed notice PDF generated');

    // Save closed PDF so HTTP server serves it at /blueprint
    fs.writeFileSync(PDF_PATH, pdfBuffer);
    // Upload to Cloudinary so QR code shows the closed notice
    await uploadToCloudinary(pdfBuffer);
    console.log('  ✓ Closed notice live on QR code');

    // Send closed notice email
    try {
      await sendEmail(pdfBuffer, 'Closed', 'Sunday');
      console.log('  ✓ Closed notice emailed to kitchen team');
    } catch (emailErr) {
      console.error('  ❌ Email failed:', emailErr.message);
    }

  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  HUMMUSFIT KITCHEN — GOD MODE PREP SHEET GENERATOR');
  console.log(`  ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
  console.log('═══════════════════════════════════════════════════════');

  // ── STEP 0: Determine today's group ──────────────────────────────────────
  // DAY_OVERRIDE allows manual testing of any cook day from Railway Variables
  const dayName     = process.env.DAY_OVERRIDE || getDayName();
  const groupNumber = process.env.DAY_OVERRIDE
    ? (COOK_SCHEDULE[process.env.DAY_OVERRIDE]?.group || null)
    : getDayGroup();

  if (!groupNumber) {
    console.log(`\n🌙 Tomorrow is a dark day — generating CLOSED notice PDF...\n`);
    await generateClosedPdf();
    return;
  }

  const schedule = COOK_SCHEDULE[dayName];
  const meals    = groupNumber === 1 ? GROUP1_MEALS : GROUP2_MEALS;

  console.log(`\n📅 Today: ${dayName} → GROUP ${groupNumber} (${meals.length} meals)`);
  console.log(`   Burn-Off: ${schedule.burnOffDays} day(s) | Carry Target: ${schedule.carryDays} day(s)\n`);

  // ── Check for holiday event ───────────────────────────────────────────────
  const { multiplier: eventMultiplier, eventName } = getEventMultiplier(new Date(), schedule.carryDays);
  if (eventName) {
    console.log(`🎉 EVENT OVERRIDE ACTIVE: ${eventName}`);
    console.log(`   Demand multiplier: ${(eventMultiplier * 100).toFixed(0)}% of normal\n`);
  }

  // ── STEP 1 & 2: Fetch data ────────────────────────────────────────────────
  let inventory, sales;

  if (TEST_MODE) {
    console.log('⚠️  TEST MODE — Using randomized dummy data (no Shopify calls)\n');
    inventory = {};
    sales = {
      burnOffSales:   {},
      carryOverSales: {}
    };
    meals.forEach(meal => {
      sales.burnOffSales[meal.name]   = Math.floor(Math.random() * 80) + 10;
      sales.carryOverSales[meal.name] = Math.floor(Math.random() * 300) + 50;
    });
    meals.forEach(meal => {
      inventory[meal.name] = Math.floor(Math.random() * 250);
      sales[meal.name]     = Math.floor(Math.random() * 200) + 10;
    });
  } else {
    console.log('📦 STEP 1: Pulling 6AM inventory from Shopify...\n');
    inventory = await fetchInventory(meals);

    console.log("\n📊 STEP 2: Pulling sales data from Shopify...");
    sales = await fetchSales(meals, dayName);
  }

  // ── STEP 3: God Mode batch calculation ───────────────────────────────────
  console.log('\n🧮 STEP 3: Running God Mode batch formula...\n');
  const prepSheet = calculateBatches(meals, inventory, sales, 1, dayName, DIRECT_TO_ASSEMBLY);

  // Console summary
  const active   = prepSheet.filter(m => m.batches > 0 || m.directToAssembly);
  const priority = prepSheet.filter(m => m.isPriority1);
  const zeros    = prepSheet.filter(m => m.batches === 0 && !m.directToAssembly);

  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log('│  PREP SHEET SUMMARY                                     │');
  console.log('├─────────────────────────────────────────────────────────┤');

  if (priority.length > 0) {
    console.log('│  🔴 PRIORITY 1 — FIRE THESE FIRST:                     │');
    priority.forEach(m => {
      console.log(`│    ⚠️  ${m.name.padEnd(40)} ${String(m.batches).padStart(3)} batches`);
    });
    console.log('├─────────────────────────────────────────────────────────┤');
  }

  prepSheet
    .filter(m => m.batches > 0 && !m.isPriority1 && !m.directToAssembly)
    .forEach(m => {
      const bar = '█'.repeat(Math.min(m.batches, 15));
      console.log(`│  ${m.name.padEnd(35)} ${String(m.batches).padStart(3)}  ${bar}`);
    });

  // Direct to Assembly items
  const dtaItems = prepSheet.filter(m => m.directToAssembly && m.exactUnits > 0);
  if (dtaItems.length > 0) {
    console.log('├─────────────────────────────────────────────────────────┤');
    console.log('│  📦 DIRECT TO ASSEMBLY (exact units):                   │');
    dtaItems.forEach(m => {
      console.log(`│    ${m.name.padEnd(40)} ${String(m.exactUnits).padStart(4)} units`);
    });
  }

  console.log(`├─────────────────────────────────────────────────────────┤`);
  console.log(`│  (+ ${zeros.length} meals at 0 batches — skip today)              │`);
  console.log('└─────────────────────────────────────────────────────────┘\n');

  if (VERBOSE) {
    console.log('\n📋 FULL CALCULATION BREAKDOWN:');
    prepSheet.forEach(m => {
      const d = m._debug;
      console.log(`\n  ${m.name}${m.isPriority1 ? ' 🔴 PRIORITY 1' : ''}`);
      console.log(`    Inventory: ${d.currentInventory} | 7-day sales: ${d.totalSales} | Daily rate: ${d.dailyRate}`);
      if (eventMultiplier !== 1.0) {
        console.log(`    Event multiplier: ${eventMultiplier} | Adjusted rate: ${d.adjustedRate}`);
      }
      console.log(`    Burn-off (${d.burnOffDays}d): ${d.burnOff} | Working inv: ${d.workingInventory}`);
      console.log(`    Carry target (${d.carryDays}d × 1.10): ${d.carryOverTarget} | Deficit: ${d.unitDeficit}`);
      if (m.directToAssembly) {
        console.log(`    → DIRECT TO ASSEMBLY: ${m.exactUnits} units`);
      } else {
        console.log(`    Raw batches: ${d.rawBatches} → Final: ${m.batches}`);
      }
    });
  }

  // ── STEP 4: Generate PDF ─────────────────────────────────────────────────
  console.log('📄 STEP 4: Generating prep sheet PDF...\n');
  // Cache meals data for /meals endpoint
  const today = new Date().toISOString().split('T')[0];
  // Rich intelligence cache for Formula Intelligence dashboard
  cachedIntelligence = {
    date:      new Date().toISOString().split('T')[0],
    generatedAt: new Date().toISOString(),
    group:     groupNumber,
    cookDay:   dayName,
    totalBatches: prepSheet.filter(m => m.batches > 0).reduce((s,m) => s+m.batches, 0),
    meals: prepSheet.map(m => {
      const d = m._debug || {};
      const inv = Number(d.currentInventory) || 0;
      const daily = Number(d.dailyRate) || 0;
      const daysOfStock = daily > 0 ? (inv / daily).toFixed(1) : '∞';
      const carryTarget = Number(d.carryOverTarget) || 0;
      const deficit = Number(d.unitDeficit) || 0;
      const burnOff = Number(d.burnOff) || 0;
      const workingInv = Number(d.workingInventory) || 0;
      const carryDays = Number(d.carryDays) || 0;
      const burnOffDays = Number(d.burnOffDays) || 0;

      // Plain English reason
      let reason = '';
      let status = '';
      if (m.isPriority1 && inv === 0) {
        reason = `Completely out of stock — must cook today to have food available tomorrow PM`;
        status = 'critical';
      } else if (m.isPriority1 && inv < daily) {
        reason = `Only ${inv} units left — less than 1 day of supply. Will stock out before tomorrow's packaging lands`;
        status = 'critical';
      } else if (m.isPriority1) {
        reason = `Below minimum stock floor — need at least ${carryTarget.toFixed(0)} units on hand`;
        status = 'urgent';
      } else if (m.batches === 0 && daily === 0) {
        reason = `No sales data — may be a slow mover or recently stocked. Skipping to avoid expiry waste`;
        status = 'skip';
      } else if (m.batches === 0) {
        reason = `Well stocked — ${inv} units on hand = ${daysOfStock} days of supply. No need to cook today`;
        status = 'stocked';
      } else {
        const nextLanding = dayName === 'Monday' ? 'Tuesday PM' : dayName === 'Tuesday' ? 'Wednesday PM' : dayName === 'Wednesday' ? 'Thursday PM' : dayName === 'Thursday' ? 'Friday PM' : dayName === 'Friday' ? 'Saturday PM' : 'Monday PM';
        const coverUntil = dayName === 'Monday' ? 'Wednesday PM' : dayName === 'Tuesday' ? 'Thursday PM' : dayName === 'Wednesday' ? 'Friday PM' : dayName === 'Thursday' ? 'Monday PM' : dayName === 'Friday' ? 'Tuesday PM' : 'Wednesday PM';
        reason = `Has ${inv} units (${daysOfStock} days). Burns ${daily.toFixed(0)}/day. Cooking ${m.batches} batches → packages ${nextLanding} → must cover until ${coverUntil}`;
        status = m.batches >= 8 ? 'heavy' : 'normal';
      }

      return {
        name: m.name,
        batches: m.batches,
        isPriority1: m.isPriority1,
        isDeathSpiral: m.isDeathSpiral,
        currentInventory: inv,
        dailyRate: daily,
        daysOfStock,
        burnOffDays,
        burnOff,
        workingInventory: workingInv,
        carryDays,
        carryTarget: carryTarget.toFixed(0),
        deficit: deficit.toFixed(0),
        reason,
        status,
        yield: d.yield || 0,
      };
    })
  };

  cachedMealsData = {
    date: new Date().toISOString().split('T')[0],
    group: groupNumber,
    meals: prepSheet
      .filter(m => (m.batches > 0 && !m.directToAssembly) || (m.directToAssembly && m.exactUnits > 0))
      .sort((a, b) => b.batches - a.batches)
      .map(m => ({
        name: m.name,
        quantity: m.directToAssembly ? m.exactUnits : m.batches
      }))
  };

  // Same-Day Packaging Alert — fires when 5+ meals have less than 1 day of stock
  const atRiskMeals = prepSheet.filter(m => {
    const debug = m._debug || {};
    const currInv = Number(debug.currentInventory) || 0;
    const totalSales = (Number(debug.burnOffUnits) || 0) + (Number(debug.carryUnits) || 0);
    const totalDays = (schedule.burnOffDays || 1) + (schedule.carryDays || 2);
    const dailyRate = totalDays > 0 && totalSales > 0 ? totalSales / totalDays : 0;
    return dailyRate > 0 && currInv < dailyRate && m.batches > 0;
  });
  const sameDayAlert = atRiskMeals.length >= 5;
  if (sameDayAlert) {
    console.log('\n🚨 SAME-DAY PACKAGING ALERT: ' + atRiskMeals.length + ' meals under 1 day of stock');
  }

  const pdfBuffer = await generatePdf(prepSheet, groupNumber, dayName, eventName, eventMultiplier, sameDayAlert);

  // ── Save PDF to disk for HTTP serving
  fs.writeFileSync(PDF_PATH, pdfBuffer);
  console.log('  ✓ PDF saved for HTTP serving');

  // ── STEP 5: Send email ───────────────────────────────────────────────────
  if (TEST_MODE) {
    const filename = `PrepSheet_TEST_${dayName}_Group${groupNumber}.pdf`;
    fs.writeFileSync(filename, pdfBuffer);
    console.log(`\n✅ TEST MODE: PDF saved locally as "${filename}"`);
    console.log('   Open it to verify formatting before going live.\n');
  } else {
  
  console.log('📧 STEP 5: Sending email via Resend...\n');
    await sendEmail(pdfBuffer, groupNumber, dayName);
    console.log('\n✅ DONE! Master Blueprint delivered.\n');

  // Upload to Cloudinary for QR code access
  console.log('☁️  STEP 6: Uploading to Cloudinary for QR access...');
  await uploadToCloudinary(pdfBuffer);
  // ── STEP 7: Sync to Google Sheets KDS ─────────────────────
  try {
    console.log('\n📊 STEP 7: Syncing to Google Sheets KDS...');
    const sheetUrl = await syncToSheets(prepSheet, groupNumber, dayName, eventName);
    console.log(`  ✓ KDS sheet live: ${sheetUrl}`);
  } catch (sheetErr) {
    console.error('  ⚠️  Sheets sync failed (non-fatal):', sheetErr.message);
  }
  }
}


// ── Formula Intelligence Dashboard HTML ──────────────────────
function buildIntelligenceHTML(data) {
  if (!data) return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="background:#111;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><div style="font-size:64px">&#127769;</div><div style="font-size:24px;margin-top:16px">No blueprint yet &mdash; check back after 9PM</div></div></body></html>';

  const cookDay = data.cookDay || '';
  const group = data.group || '';
  const date = data.date || '';
  const totalBatches = data.totalBatches || 0;
  const meals = data.meals || [];

  const cooking = meals.filter(m => m.batches > 0).sort((a,b) => b.batches - a.batches);
  const skipped = meals.filter(m => m.batches === 0).sort((a,b) => b.currentInventory - a.currentInventory);
  const critical = meals.filter(m => m.isPriority1);

  // Cook day explanation
  const cookDayExplanations = {
    Monday:    { packages: 'Tuesday PM', covers: 'Tuesday + Wednesday', next: 'Wednesday cook lands Thursday PM', days: 2 },
    Tuesday:   { packages: 'Wednesday PM', covers: 'Wednesday + Thursday', next: 'Thursday cook lands Friday PM', days: 2 },
    Wednesday: { packages: 'Thursday PM', covers: 'Thursday + Friday', next: 'Friday cook lands Saturday PM', days: 2 },
    Thursday:  { packages: 'Friday PM', covers: 'Friday + Saturday + Sunday', next: 'Saturday cook lands Monday PM', days: 3 },
    Friday:    { packages: 'Saturday PM', covers: 'Saturday + Sunday + Monday', next: 'Monday cook lands Tuesday PM', days: 3 },
    Saturday:  { packages: 'Monday PM', covers: 'Monday + Tuesday + Wednesday', next: 'Tuesday cook lands Wednesday PM', days: 3 },
  };
  const dayInfo = cookDayExplanations[cookDay] || {};

  const statusColor = {
    critical: '#ff4d4d',
    urgent: '#ff8c00',
    heavy: '#f5c542',
    normal: '#4cd964',
    stocked: '#555',
    skip: '#444',
  };

  const statusLabel = {
    critical: '🚨 COOK NOW',
    urgent: '🔴 PRIORITY',
    heavy: '🟡 HIGH DEMAND',
    normal: '🟢 COOKING',
    stocked: '✅ SKIP — WELL STOCKED',
    skip: '⚫ SKIP — NO DATA',
  };

  const cookingCards = cooking.map(m => `
    <div class="card" style="border-left:4px solid ${statusColor[m.status] || '#4cd964'}">
      <div class="card-top">
        <div>
          <div class="card-name">${m.name}</div>
          <div class="card-status" style="color:${statusColor[m.status] || '#4cd964'}">${statusLabel[m.status] || '🟢 COOKING'}</div>
        </div>
        <div class="card-batches" style="color:${statusColor[m.status] || '#4cd964'}">${m.batches}</div>
      </div>
      <div class="card-reason">${m.reason}</div>
      <div class="card-stats">
        <span class="stat-pill">📦 ${m.currentInventory} on hand</span>
        <span class="stat-pill">🔥 ${m.dailyRate.toFixed(0)}/day burn</span>
        <span class="stat-pill">📅 ${m.daysOfStock} days left</span>
        <span class="stat-pill">🎯 ${m.carryTarget} unit target</span>
        <span class="stat-pill">📉 ${m.deficit} deficit</span>
      </div>
    </div>
  `).join('');

  const skippedCards = skipped.map(m => `
    <div class="card card-skip">
      <div class="card-top">
        <div>
          <div class="card-name">${m.name}</div>
          <div class="card-status" style="color:#555">${statusLabel[m.status] || '✅ SKIP'}</div>
        </div>
        <div class="card-batches" style="color:#444">0</div>
      </div>
      <div class="card-reason" style="color:#555">${m.reason}</div>
      <div class="card-stats">
        <span class="stat-pill" style="opacity:.5">📦 ${m.currentInventory} on hand</span>
        <span class="stat-pill" style="opacity:.5">🔥 ${m.dailyRate.toFixed(0)}/day burn</span>
        <span class="stat-pill" style="opacity:.5">📅 ${m.daysOfStock} days left</span>
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HummusFit — Formula Intelligence</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;min-height:100vh}
.header{background:#111;border-bottom:3px solid #F89F1B;padding:20px 40px;display:flex;align-items:center;justify-content:space-between}
.header-left h1{font-size:26px;font-weight:800;color:#F89F1B;text-transform:uppercase;letter-spacing:.08em}
.header-left p{font-size:13px;color:#666;font-weight:500;margin-top:4px;letter-spacing:.05em;text-transform:uppercase}
.clock{font-size:22px;color:#555;font-variant-numeric:tabular-nums}
.explainer{background:#111;border-bottom:1px solid #1e1e1e;padding:20px 40px}
.explainer h2{font-size:16px;font-weight:700;color:#F89F1B;text-transform:uppercase;letter-spacing:.1em;margin-bottom:12px}
.explainer-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.explain-box{background:#1a1a1a;border-radius:10px;padding:14px 16px;border:1px solid #222}
.explain-box .label{font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#555;margin-bottom:6px}
.explain-box .value{font-size:15px;font-weight:700;color:#f0f0f0}
.explain-box .sub{font-size:12px;color:#666;margin-top:4px;line-height:1.4}
.stats-bar{display:flex;background:#111;border-bottom:1px solid #1e1e1e}
.stat-box{flex:1;padding:16px 20px;text-align:center;border-right:1px solid #1e1e1e}
.stat-box:last-child{border-right:none}
.stat-num{font-size:42px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.stat-label{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#555;margin-top:4px}
.section{padding:24px 40px}
.section-title{font-size:14px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:#555;margin-bottom:16px;display:flex;align-items:center;gap:10px}
.section-title span{font-size:20px}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.card{background:#161616;border-radius:12px;padding:18px;border:1px solid #222}
.card-skip{opacity:.5}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}
.card-name{font-size:16px;font-weight:700;line-height:1.2;color:#fff;margin-bottom:4px}
.card-status{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.card-batches{font-size:38px;font-weight:800;font-variant-numeric:tabular-nums;flex-shrink:0;margin-left:12px}
.card-reason{font-size:13px;color:#999;line-height:1.5;margin-bottom:12px;padding:10px;background:#0d0d0d;border-radius:8px;border-left:3px solid #222}
.card-stats{display:flex;flex-wrap:wrap;gap:6px}
.stat-pill{font-size:11px;padding:3px 8px;background:#1e1e1e;border-radius:5px;color:#777;border:1px solid #2a2a2a}
.refresh-bar{position:fixed;bottom:0;left:0;right:0;height:3px;background:#1a1a1a}
.refresh-fill{height:100%;background:#F89F1B;width:0%;transition:width .1s linear}
.last-sync{position:fixed;bottom:6px;right:20px;font-size:11px;color:#333}
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <h1>🥙 Formula Intelligence</h1>
    <p>Group ${group} · ${cookDay} ${date} · Next-Day Packaging</p>
  </div>
  <div class="clock" id="clock">--:--</div>
</div>

<div class="explainer">
  <h2>📖 How Today's List Was Built</h2>
  <div class="explainer-grid">
    <div class="explain-box">
      <div class="label">Cook Day</div>
      <div class="value">${cookDay}</div>
      <div class="sub">Group ${group} meals cook today in the kitchen</div>
    </div>
    <div class="explain-box">
      <div class="label">Packages</div>
      <div class="value">${dayInfo.packages || '—'}</div>
      <div class="sub">Food is packaged the next day and added to Shopify</div>
    </div>
    <div class="explain-box">
      <div class="label">Must Cover</div>
      <div class="value">${dayInfo.covers || '—'}</div>
      <div class="sub">${dayInfo.days || 0} days of customer demand before next cook lands</div>
    </div>
    <div class="explain-box">
      <div class="label">Next Restock</div>
      <div class="value" style="font-size:13px">${dayInfo.next || '—'}</div>
      <div class="sub">When the next Group ${group} cook hits Shopify shelves</div>
    </div>
  </div>
</div>

<div class="stats-bar">
  <div class="stat-box">
    <div class="stat-num" style="color:#F89F1B">${totalBatches}</div>
    <div class="stat-label">Total Batches Today</div>
  </div>
  <div class="stat-box">
    <div class="stat-num" style="color:#ff4d4d">${critical.length}</div>
    <div class="stat-label">🚨 Critical — Out of Stock</div>
  </div>
  <div class="stat-box">
    <div class="stat-num" style="color:#4cd964">${cooking.length}</div>
    <div class="stat-label">Meals Cooking Today</div>
  </div>
  <div class="stat-box">
    <div class="stat-num" style="color:#555">${skipped.length}</div>
    <div class="stat-label">Meals Skipped — Well Stocked</div>
  </div>
</div>

<div class="section">
  <div class="section-title"><span>🍳</span> COOKING TODAY — ${cooking.length} MEALS (${totalBatches} BATCHES)</div>
  <div class="cards">${cookingCards}</div>
</div>

<div class="section">
  <div class="section-title"><span>✅</span> SKIPPED TODAY — ALREADY WELL STOCKED (${skipped.length} MEALS)</div>
  <div class="cards">${skippedCards}</div>
</div>

<div class="last-sync" id="last-sync">Last updated: ${new Date(data.generatedAt || Date.now()).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'America/New_York'})}</div>
<div class="refresh-bar"><div class="refresh-fill" id="refresh-fill"></div></div>

<script>
function updateClock(){
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true,timeZone:'America/New_York'});
}
updateClock();setInterval(updateClock,1000);

const REFRESH_MS = 60000;
let fillInterval;
function startBar(){
  const fill = document.getElementById('refresh-fill');
  let elapsed = 0; clearInterval(fillInterval); fill.style.width='0%';
  fillInterval = setInterval(()=>{ elapsed+=100; fill.style.width=Math.min((elapsed/REFRESH_MS)*100,100)+'%'; },100);
}
startBar();
setInterval(()=>{ window.location.reload(); }, REFRESH_MS);
</script>
</body>
</html>`;
}

// ── HTTP SERVER — serves latest PDF at /blueprint ───────────
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() }));

  } else if (req.url === '/blueprint' || req.url === '/') {
    if (fs.existsSync(PDF_PATH)) {
      const pdf = fs.readFileSync(PDF_PATH);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="HummusFit_Blueprint.pdf"',
        'Content-Length': pdf.length
      });
      res.end(pdf);
    } else {
      res.writeHead(404);
      res.end('No blueprint available yet.');
    }
  } else if (req.url === '/api/intelligence') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cachedIntelligence || { error: 'No blueprint generated yet — check back after 9PM' }));

  } else if (req.url === '/intelligence') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(buildIntelligenceHTML(cachedIntelligence));

  } else if (req.url === '/meals') {
    if (cachedMealsData) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(cachedMealsData, null, 2));
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Meal data not yet generated. Try again after 6PM.' }));
    }
  } else if (req.url === '/meals') {
    if (cachedMealsData) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(cachedMealsData, null, 2));
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Meal data not yet generated. Try again after 6PM.' }));
    }
  } else if (req.method === 'POST' && req.url === '/run-now') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'triggered', message: 'Blueprint generation started — check /blueprint in ~60 seconds' }));
    console.log('\n🔄 Manual /run-now triggered — running main()...');
    main().catch(err => {
      console.error('\n❌ RUN-NOW ERROR:', err.message);
      console.error(err.stack);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`\n🌐 PDF server running on port ${PORT}`);
});

// Cache for /meals endpoint
let cachedMealsData = null;
let cachedIntelligence = null;

// Cache for /meals endpoint

// Run immediately on startup
main().catch(err => {
  console.error('\n❌ FATAL ERROR:', err.message);
  console.error(err.stack);
});

// Schedule daily at 1AM UTC (9PM EDT) Sunday–Friday (skips Saturday — no Sunday cook)
cron.schedule('0 1 * * 0-5', () => {
  console.log('\n⏰ Cron triggered — running main()...');
  main().catch(err => {
    console.error('\n❌ CRON ERROR:', err.message);
    console.error(err.stack);
  });
});

console.log('\n⏳ Server alive. Next run at 1AM UTC (9PM EDT).');
