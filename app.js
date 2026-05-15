// ============================================================
//  HUMMUSFIT — KITCHEN PREP SHEET AUTOMATION
//  God Mode Engine — Updated May 2026
//
//  Cron: 0 2 * * 1-6  (9PM EST = 2AM UTC, Mon–Sat)
//  Railway project: scintillating-commitment
// ============================================================

const fs = require('fs');

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

const TEST_MODE = process.env.TEST_MODE === 'true' || process.argv.includes('--test');
const VERBOSE   = process.argv.includes('--verbose');

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
    console.log(`\n🌙 Tomorrow is ${dayName} — no cook scheduled. Exiting. (Sunday is a dark day)\n`);
    process.exit(0);
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
  const pdfBuffer = await generatePdf(prepSheet, groupNumber, dayName, eventName, eventMultiplier);

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
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
  console.error('\n❌ FATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
