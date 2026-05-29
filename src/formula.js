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
    group: 1,
    burnOffDays: 0,
    carryDays: 3      // Tue + Wed + Thu
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

const LEAN_BUFFER = 1.10; // 10% safety multiplier on carry-over target

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
    name: "Father's Day Week",
    multiplier: 1.00,
    type: 'annual',
    month: 6, startDay: 14, endDay: 20
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
  eventMultiplier = 1.0
}) {
  // Apply event multiplier to both burn-off and carry target
  const adjustedBurnOff = burnOffUnits * eventMultiplier;
  const adjustedCarry   = carryUnits   * eventMultiplier;

  // Step 1: Working Inventory after burn-off (Zero-Floor Rule)
  const workingInventory = currentInventory - adjustedBurnOff;

  // Priority 1 Flag: working inventory <= 0 AND there is actual demand
  // Per 0/0 Rule: if inventory=0 AND all sales=0, deficit=0, no flag needed
  const isPriority1 = workingInventory <= 0 && (burnOffUnits > 0 || carryUnits > 0);

  // Step 2: Carry-Over Target with 10% Lean Buffer
  const carryOverTarget = adjustedCarry * LEAN_BUFFER;

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

  return {
    batches: finalBatches,
    exactUnits: null,
    directToAssembly: false,
    isPriority1,
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

    const result = calculateBatchesForMeal({
      currentInventory,
      burnOffUnits,
      carryUnits,
      yieldPerBatch: meal.yield,
      directToAssembly: isDTA,
      eventMultiplier
    });

    return {
      name:             meal.name,
      batches:          result.batches,
      exactUnits:       result.exactUnits,
      directToAssembly: result.directToAssembly,
      isPriority1:      result.isPriority1,
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
