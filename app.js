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
        getEventMultiplier, COOK_SCHEDULE }               = require('./src/formula');
const { generatePdf }                                     = require('./src/generatePdf');
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
  <div class="sub-text">Saturday — Dark Day</div>
  <div class="reopen">We reopen Monday 🥙</div>
  <div class="footer">HummusFit Kitchen Automation · myhummusfit.com</div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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

    // Upload to Cloudinary so QR code shows the closed notice
    await uploadToCloudinary(pdfBuffer);
    console.log('  ✓ Closed notice live on QR code');

    // Send closed notice email
    try {
      await sendEmail(pdfBuffer, 'Closed', 'Saturday');
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
    console.log(`\n🌙 Tomorrow is Saturday — generating CLOSED notice PDF...\n`);
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
  cachedMealsData = {
    date: today,
    group: groupNumber,
    meals: prepSheet
      .filter(m => (m.batches > 0 && !m.directToAssembly) || (m.directToAssembly && m.exactUnits > 0))
      .sort((a, b) => b.batches - a.batches)
      .map(m => ({
        name: m.name,
        quantity: m.directToAssembly ? m.exactUnits : m.batches
      }))
  };

  const pdfBuffer = await generatePdf(prepSheet, groupNumber, dayName, eventName, eventMultiplier);

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
  }
}

// ── HTTP SERVER — serves latest PDF at /blueprint ───────────
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === '/blueprint' || req.url === '/') {
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
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => {
  console.log(`\n🌐 PDF server running on port ${PORT}`);
});

// Cache for /meals endpoint
let cachedMealsData = null;

// Run immediately on startup
main().catch(err => {
  console.error('\n❌ FATAL ERROR:', err.message);
  console.error(err.stack);
});

// Schedule daily at 11PM UTC (6PM EST) every day
cron.schedule('0 22 * * *', () => {
  console.log('\n⏰ Cron triggered — running main()...');
  main().catch(err => {
    console.error('\n❌ CRON ERROR:', err.message);
    console.error(err.stack);
  });
});

console.log('\n⏳ Server alive. Next run at 10PM UTC (6PM EDT).');
