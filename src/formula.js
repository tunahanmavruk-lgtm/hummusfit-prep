// ============================================================
//  GOD MODE FORMULA ENGINE — HummusFit Kitchen Automation
//  Updated May 2026
//
//  Rules hardcoded:
//  1. Ceiling Function: always round UP (Math.ceil), never down
//  2. Zero-Floor Rule: negative working inventory becomes a
//     positive deficit added to the carry-over target
//  3. No 1-Batch Rule: if 0 < batches < 2, auto-bump to 2
//  4. Priority 1 Flag: if working inventory <= 0, flag RED
//  5. Direct to Assembly: bypass batch math, print exact units
//  6. Holiday Protocol: event multiplier on burn + carry target
//  7. 10% Lean Buffer: hardcoded 1.10 on carry-over target
// ============================================================

// ── Cook Day Schedule ────────────────────────────────────────
// burnOffDays: days of sales to subtract from inventory
// carryDays:   days the batch must cover going forward
const COOK_SCHEDULE = {
  Sunday: {
    group: null,
    burnOffDays: 0,
    carryDays: 0      // Dark day — no cooking
  },
  Monday: {
    group: 1,
    burnOffDays: 1,
    carryDays: 2      // Tue + Wed
  },
  Tuesday: {
    group: 2,
    burnOffDays: 2,   // Tue + Wed (food not live until Wed 5PM)
    carryDays: 2      // Thu + Fri
  },
  Wednesday: {
    group: 1,
    burnOffDays: 2,   // Wed + Thu (food not live until Thu 5PM)
    carryDays: 2      // Fri + Sat
  },
  Thursday: {
    group: 2,
    burnOffDays: 2,   // Thu + Fri (food not live until Fri 5PM)
    carryDays: 2      // Sat + Sun
  },
  Friday: {
    group: 1,
    burnOffDays: 2,   // Fri + Sat (food not live until Sat 5PM)
    carryDays: 3      // Sun + Mon + Tue
  },
  Saturday: {
    group: 2,
    burnOffDays: 2,   // Sat + Sun (food not live until Mon 5PM)
    carryDays: 3      // Mon + Tue + Wed
  }
};

const LEAN_BUFFER = 1.05; // 20% safety multiplier — temporarily elevated to compensate for stockout week data distortion (revert to 1.05 after June 22)

// Launch overrides — forces minimum batch count for new meals during launch week
const LAUNCH_OVERRIDES = {
  "Closed on Sunday Crispy Chicken Bowl":         { minBatches: 3, from: "2026-06-09", until: "2026-06-22" },
  "The Golden Arches Wrap":            { minBatches: 3, from: "2026-06-22", until: "2026-07-05" },
  "The Texas Queso Steak Bowl":        { minBatches: 3, from: "2026-07-07", until: "2026-07-19" },
  "The Philly Cheesesteak Quesadilla": { minBatches: 3, from: "2026-07-19", until: "2026-08-02" },
  "Honey Garlic Crispy Chicken Tacos": { minBatches: 3, from: "2026-08-04", until: "2026-08-16" },
  "West Coast Secret Sauce Bowl":      { minBatches: 3, from: "2026-08-17", until: "2026-08-30" },
};

// ── Holiday / Event Dictionary ───────────────────────────────
// Maps date ranges to demand multipliers.
// multiplier < 1.0 = dip (cook less)
// multiplier > 1.0 = spike (cook more)
// ── Holiday/Event Multipliers (sourced from Gemini God Mode) ─
// multiplier > 1.0 = spike (cook more)
// multiplier < 1.0 = dip (cook less)
// Alert threshold: multiplier >= 1.20 triggers high-volume week
// The rolling baseline automatically adjusts — no manual override needed
const EVENT_DICTIONARY = [
  {
    name: "New Year's Resolution Week",
    multiplier: 1.04,
    type: 'annual',
    month: 1, startDay: 1, endDay: 7
  },
  {
    name: "Super Bowl Week",
    multiplier: 1.17,
    type: 'annual',
    month: 2, startDay: 3, endDay: 9  // First full week of Feb
  },
  {
    name: "Valentine's Day Week",
    multiplier: 1.10,
    type: 'annual',
    month: 2, startDay: 10, endDay: 16
  },
  {
    name: "Easter Week",
    multiplier: 0.96,
    type: 'annual',
    month: 4, startDay: 14, endDay: 20
  },
  {
    name: "Mother's Day Week",
    multiplier: 0.98,
    type: 'annual',
    month: 5, startDay: 8, endDay: 14
  },
  {
    name: "Memorial Day Week",
    multiplier: 1.06,
    type: 'annual',
    month: 5, startDay: 24, endDay: 26
  },
  {
    name: "Father's Day Sale",
    multiplier: 1.00,
    type: 'annual',
    month: 6, startDay: 17, endDay: 21
  },

  {
    name: "July 4th Week",
    multiplier: 1.05,
    type: 'annual',
    month: 7, startDay: 1, endDay: 7
  },
  {
    name: "Back to School / Labor Day Week",
    multiplier: 1.20,
    type: 'annual',
    month: 8, startDay: 29, endDay: 31,
    extraMonth: 9, extraStartDay: 1, extraEndDay: 4
  },
  {
    name: "Halloween Week",
    multiplier: 1.05,
    type: 'annual',
    month: 10, startDay: 27, endDay: 31
  },
  {
    name: "Thanksgiving / BFCM Week",
    multiplier: 1.51,
    type: 'annual',
    month: 11, startDay: 24, endDay: 30
  },
  {
    name: "Christmas Week",
    multiplier: 1.00,
    type: 'annual',
    month: 12, startDay: 23, endDay: 29
  },
  {
    name: "New Year's Dec 30 - Jan 6",
    multiplier: 1.17,
    type: 'annual',
    month: 12, startDay: 30, endDay: 31,
    extraMonth: 1, extraStartDay: 1, extraEndDay: 6
  }
];

/**
 * Check if any carry-over target dates fall within a known event window.
 * Returns the event multiplier (1.0 if no event).
 *
 * @param {Date} executionDate - The date the script is running
 * @param {number} carryDays   - How many days forward to check
 * @returns {{ multiplier: number, eventName: string|null }}
 */
function getEventMultiplier(executionDate, carryDays) {
  // Build array of all dates in the carry window
  const targetDates = [];
  for (let i = 1; i <= carryDays; i++) {
    const d = new Date(executionDate);
    d.setDate(d.getDate() + i);
    targetDates.push(d);
  }

  for (const event of EVENT_DICTIONARY) {
    for (const date of targetDates) {
      const month = date.getMonth() + 1; // 1-indexed
      const day   = date.getDate();

      // Primary date range
      const inPrimary = (
        event.type === 'annual' &&
        month === event.month &&
        day >= event.startDay &&
        day <= event.endDay
      );

      // Extra date range (for events that span month boundaries)
      const inExtra = (
        event.extraMonth &&
        month === event.extraMonth &&
        day >= event.extraStartDay &&
        day <= event.extraEndDay
      );

      if (inPrimary || inExtra) {
        console.log(`  🎯 Event match: ${event.name} (${(event.multiplier * 100).toFixed(0)}% demand)`);
        return { multiplier: event.multiplier, eventName: event.name };
      }
    }
  }

  return { multiplier: 1.0, eventName: null };
}

/**
 * Calculate batches required for a single meal.
 *
 * God Mode Exact 1-Week Math:
 *   burnOff          = exact units sold on burn-off day(s) last week × eventMultiplier
 *   workingInventory = currentInventory - burnOff
 *   carryOverTarget  = exact units sold on carry days last week × LEAN_BUFFER × eventMultiplier
 *   unitDeficit      = max(0, carryOverTarget - workingInventory)
 *   rawBatches       = ⌈unitDeficit / yieldPerBatch⌉
 *
 * @param {object} params
 * @param {number}  params.currentInventory  - Units on hand at 6AM
 * @param {number}  params.burnOffUnits      - Exact units sold on burn-off day(s) last week
 * @param {number}  params.carryUnits        - Exact units sold on carry days last week
 * @param {number}  params.yieldPerBatch     - Units produced per batch
 * @param {boolean} params.directToAssembly  - Bypass batch math, return exact units
 * @param {number}  params.eventMultiplier   - Holiday multiplier (default 1.0)
 * @returns {object} result
 */
function calculateBatchesForMeal({
  currentInventory,
  burnOffUnits,
  carryUnits,
  yieldPerBatch,
  directToAssembly = false,
  eventMultiplier = 1.0,
  targetDays = 3.5,
  burnOffDays = 1,
  carryDays = 2
}) {
  // Apply event multiplier to both burn-off and carry target
  const adjustedBurnOff = burnOffUnits * eventMultiplier;
  const adjustedCarry   = carryUnits   * eventMultiplier;

  // Step 1: Working Inventory after burn-off (Zero-Floor Rule)
  const workingInventory = currentInventory - adjustedBurnOff;

  // Priority 1 Flag: working inventory <= 0 AND there is actual demand
  // Per 0/0 Rule: if inventory=0 AND all sales=0, deficit=0, no flag needed
  const isPriority1 = workingInventory <= 0 && (burnOffUnits > 0 || carryUnits > 0);

  // Step 2: Carry-Over Target — daily rate × targetDays
  // More reliable than raw carry sales which get distorted by stockouts
  const totalSalesUnits = adjustedBurnOff + adjustedCarry;
  const totalSalesDays  = burnOffDays + carryDays;
  const dailyRateInner  = totalSalesDays > 0 && totalSalesUnits > 0 ? totalSalesUnits / totalSalesDays : 0;
  const carryOverTarget = dailyRateInner * targetDays * LEAN_BUFFER;

  // Step 3: Unit Deficit
  const unitDeficit = Math.max(0, carryOverTarget - workingInventory);

  // Direct to Assembly — skip batch math, return exact unit count
  if (directToAssembly) {
    return {
      batches: 0,
      exactUnits: Math.ceil(unitDeficit),
      directToAssembly: true,
      isPriority1,
      _debug: {
        burnOffUnits: adjustedBurnOff.toFixed(1),
        workingInventory: workingInventory.toFixed(1),
        carryOverTarget: carryOverTarget.toFixed(1),
        unitDeficit: unitDeficit.toFixed(1)
      }
    };
  }

  // Step 4: Raw Batches — Ceiling Function (always round UP)
  const rawBatches = unitDeficit / yieldPerBatch;

  // Step 5: No 1-Batch Rule
  let finalBatches;
  if (rawBatches <= 0) {
    finalBatches = 0;
  } else if (rawBatches < 2) {
    finalBatches = 2; // No 1-Batch Rule
  } else {
    finalBatches = Math.ceil(rawBatches);
  }

  const isOverstocked = workingInventory > (carryOverTarget * 2) && carryOverTarget > 0;

  return {
    batches: finalBatches,
    exactUnits: null,
    directToAssembly: false,
    isPriority1,
    isOverstocked,
    overstockUnits: isOverstocked ? Math.round(workingInventory - carryOverTarget) : 0,
    _debug: {
      burnOffUnits: adjustedBurnOff.toFixed(1),
      workingInventory: workingInventory.toFixed(1),
      carryOverTarget: carryOverTarget.toFixed(1),
      unitDeficit: unitDeficit.toFixed(1),
      rawBatches: rawBatches.toFixed(2)
    }
  };
}

/**
 * Run the full batch calculation for all meals in a group.
 *
 * @param {Array}  meals          - Array of meal objects from mealData.js
 * @param {object} inventory      - { mealName: quantity }
 * @param {object} sales          - { mealName: totalSold }
 * @param {number} salesWindowDays - How many days the sales data covers (default 7)
 * @param {string} dayName        - e.g. "Friday"
 * @returns {Array} prepSheet sorted by batches descending
 */
function calculateBatches(meals, inventory, sales, salesWindowDays = 7, dayName = null) {
  const day      = dayName || getTodayEST();
  const schedule = COOK_SCHEDULE[day];
  if (!schedule) throw new Error(`No cook schedule for ${day}. Sunday is a dark day.`);

  const { burnOffDays, carryDays } = schedule;

  // Check for holiday event multiplier
  const executionDate = new Date();
  const { multiplier: eventMultiplier, eventName } = getEventMultiplier(executionDate, carryDays);

  if (eventName) {
    console.log(`\n🎉 EVENT DETECTED: ${eventName} — Applying ${(eventMultiplier * 100).toFixed(0)}% demand multiplier\n`);
  }

  const prepSheet = meals.map(meal => {
    const currentInventory = inventory[meal.name]              || 0;
    const burnOffUnits     = (sales.burnOffSales  || {})[meal.name] || 0;
    const carryUnits       = (sales.carryOverSales || {})[meal.name] || 0;
    const isDTA            = meal.directToAssembly === true;

    // Daily rate and target days — calculated before formula call
    const totalSalesUnits     = burnOffUnits + carryUnits;
    const totalSalesDays      = burnOffDays + carryDays;
    const dailyRate           = totalSalesDays > 0 && totalSalesUnits > 0 ? totalSalesUnits / totalSalesDays : 0;
    const isThursday          = day === 'Thursday';
    const isFriday            = day === 'Friday';
    const isSaturday          = day === 'Saturday';
    // TARGET_DAYS per cook day:
    // Mon/Tue/Wed: 3.5 days — next same-group cook arrives ~3.5 days later
    // Thursday:   5.5 days — covers full weekend through Tuesday
    // Friday:     4.0 days — covers Sat+Sun+Mon+Tue until Monday cook hits Tuesday
    // Saturday:   3.0 days — packaged Monday, covers Mon eve through Wed when Tue cook arrives
    // TARGET_DAYS = exact days food must last until next same-group cook is packaged & on shelves
    // Monday:   3.5 days — Mon cook -> Tue packaged -> Tue PM HQ -> must last until Wed cook arrives Thu PM
    // Tuesday:  4.5 days — Tue cook -> Wed packaged -> Wed PM HQ -> must last until Thu cook arrives Fri PM
    // Wednesday:3.5 days — Wed cook -> Thu packaged -> Thu PM HQ -> must last until Fri cook arrives Sat PM
    // Thursday: 5.5 days — Thu cook -> Fri packaged -> Fri PM HQ -> must last until Mon cook arrives Tue PM (covers full weekend)
    // Friday:   4.0 days — Fri cook -> Sat packaged -> Sat PM HQ -> must last until Mon cook arrives Tue PM
    // Saturday: 3.0 days — Sat cook -> Mon packaged -> Mon PM HQ -> must last until Tue cook arrives Wed PM
    const isTuesday           = day === 'Tuesday';
    const isWednesday         = day === 'Wednesday';
    const TARGET_DAYS         = isThursday ? 5.5 : isFriday ? 4.0 : isSaturday ? 3.0 : isTuesday ? 3.5 : isWednesday ? 3.5 : 3.5;
    // Target inventory = daily rate × days to cover

    const result = calculateBatchesForMeal({
      currentInventory,
      burnOffUnits,
      carryUnits,
      yieldPerBatch: meal.yield,
      directToAssembly: isDTA,
      eventMultiplier,
      targetDays: TARGET_DAYS,
      burnOffDays,
      carryDays
    });

    // Cap: units to cook = target - working inventory after burn
    // Must use eventMultiplier so cap matches formula's adjusted demand
    const adjustedDailyRate   = dailyRate * eventMultiplier;
    const adjustedTargetInv   = adjustedDailyRate * TARGET_DAYS;
    const workingInvForCap    = Math.max(0, currentInventory - burnOffUnits);
    const maxUnitsToCook      = adjustedDailyRate > 0 ? Math.max(0, adjustedTargetInv - workingInvForCap) : 999999;
    const maxBatchesByCap     = Math.floor(maxUnitsToCook / meal.yield);
    const hasDeficit          = result.batches > 0;
    const rawCapped           = hasDeficit ? Math.min(result.batches, maxBatchesByCap) : 0;
    // Only allow 1 batch if existing inventory covers at least 1.5 days of demand
    // This prevents under-cooking high-velocity meals
    const oneBatchTotal       = currentInventory + meal.yield;
    const oneBatchFitsInCap   = oneBatchTotal <= adjustedTargetInv;
    const hasEnoughExisting   = currentInventory >= (adjustedDailyRate * 1.5);
    // Priority 1 override: if working inventory is negative, always cook at least 1 batch
    const isPriority1Override = result.isPriority1 && rawCapped === 0;
    const cappedBatches       = isPriority1Override ? 1
      : rawCapped > 0 && rawCapped < 2 && hasDeficit
      ? (oneBatchFitsInCap && hasEnoughExisting ? 1 : 2)
      : rawCapped;

    // Launch override — force minimum batches AFTER cap logic
    const launchOverride = LAUNCH_OVERRIDES[meal.name];
    const launchActive   = launchOverride && new Date() >= new Date(launchOverride.from) && new Date() <= new Date(launchOverride.until);
    const finalBatches   = launchActive && cappedBatches < launchOverride.minBatches
      ? launchOverride.minBatches
      : cappedBatches;

    const daysToSellThrough   = dailyRate > 0 ? currentInventory / dailyRate : 999;
    const shelfLifeRisk       = daysToSellThrough > 4 && currentInventory > 0 && dailyRate > 0;

    return {
      name:             meal.name,
      batches:          finalBatches,
      exactUnits:       result.exactUnits,
      directToAssembly: result.directToAssembly,
      isPriority1:      result.isPriority1,
      isOverstocked:    result.isOverstocked,
      overstockUnits:   result.overstockUnits,
      shelfLifeRisk,
      daysToSellThrough: Math.round(daysToSellThrough * 10) / 10,
      stove:            meal.stove        || '',
      oven:             meal.oven         || '',
      grill:            meal.grill        || '',
      flatGrill:        meal.flatGrill    || '',
      saladStation:     meal.saladStation || '',
      sauceStation:     meal.sauceStation || '',
      rawMeats:         meal.rawMeats     || '',
      eventMultiplier,
      eventName:        eventName || null,
      _debug: {
        ...result._debug,
        currentInventory,
        burnOffUnits,
        carryUnits,
        yield: meal.yield
      }
    };
  });

  // Sort: Priority 1 (red) first, then by batch count descending, zeros last
  prepSheet.sort((a, b) => {
    if (a.isPriority1 && !b.isPriority1) return -1;
    if (!a.isPriority1 && b.isPriority1) return 1;
    if (a.directToAssembly && !b.directToAssembly) return 1;
    if (!a.directToAssembly && b.directToAssembly) return -1;
    return b.batches - a.batches;
  });

  return prepSheet;
}

/**
 * Get TOMORROW's day name in EST.
 * The prep sheet runs the night before the cook day,
 * so we always generate the sheet for the NEXT cook day.
 * e.g. Sunday night → Monday sheet
 *      Monday night → Tuesday sheet
 */
function getTomorrowEST() {
  const now = new Date();
  // Advance by 1 day
  now.setDate(now.getDate() + 1);
  const estStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
  return estStr;
}

// Keep getTodayEST for any direct callers
function getTodayEST() {
  const now = new Date();
  return now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
}

/**
 * Get group number for TOMORROW's cook (1 or 2), or null if tomorrow is Sunday.
 */
function getDayGroup() {
  const day = getTomorrowEST();
  return COOK_SCHEDULE[day]?.group || null;
}

/**
 * Get TOMORROW's day name in EST (the cook day we are prepping for).
 */
function getDayName() {
  return getTomorrowEST();
}

module.exports = {
  calculateBatches,
  calculateBatchesForMeal,
  getCookSchedule: (day) => COOK_SCHEDULE[day],
  getEventMultiplier,
  getTodayEST,
  getDayGroup,
  getDayName,
  COOK_SCHEDULE,
  LEAN_BUFFER,
  EVENT_DICTIONARY
};
