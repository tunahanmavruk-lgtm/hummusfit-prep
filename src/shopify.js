// ============================================================
//  SHOPIFY API MODULE — GOD MODE EXACT 1-WEEK LOGIC
//  Updated May 2026
//
//  Burn-Off: Pull exact matching day(s) from 1 week ago
//  Carry Target: Pull exact matching days from last week
//  Channel: Online Store ONLY (no POS)
//
//  BURN-OFF MATRIX:
//  Monday    → last Monday's sales
//  Tuesday   → 0 (hardcoded, strategic front-load)
//  Wednesday → 0 (hardcoded, straight to shelf)
//  Thursday  → last Wednesday + last Thursday sales
//  Friday    → last Friday's sales
//  Saturday  → last Saturday's sales
//
//  CARRY-OVER TARGET MATRIX:
//  Monday    → last Tue + Wed + Thu
//  Tuesday   → custom fortress build (last Tue+Wed+Thu+Fri+Sat+Sun)
//  Wednesday → last Thu + Fri
//  Thursday  → last Fri + Sat + Sun
//  Friday    → last Sat + Sun + Mon + Tue
//  Saturday  → last Sun + Mon + Tue + Wed
// ============================================================

const SHOPIFY_STORE = process.env.SHOPIFY_STORE || 'myhummusfit.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const LOCATION_ID   = process.env.SHOPIFY_LOCATION_ID || 'gid://shopify/Location/103133642999';

const GQL_URL  = `https://${SHOPIFY_STORE}/admin/api/2026-01/graphql.json`;
const REST_URL = `https://${SHOPIFY_STORE}/admin/api/2026-01`;

const headers = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': SHOPIFY_TOKEN
};

const DAY_INDEX = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6
};

// ── Exact 1-week burn-off day config ─────────────────────────
const BURN_OFF_CONFIG = {
  Sunday:    { days: [],                      hardcoded: true  },
  Monday:    { days: ['Monday'],              hardcoded: false },
  Tuesday:   { days: ['Tuesday','Wednesday'],  hardcoded: false },
  Wednesday: { days: ['Wednesday','Thursday'], hardcoded: false },
  Thursday:  { days: ['Thursday','Friday'],    hardcoded: false },
  Friday:    { days: ['Friday','Saturday'],   hardcoded: false },
  Saturday:  { days: ['Saturday','Sunday'],   hardcoded: false }
};

// ── Exact 1-week carry-over target day config ─────────────────
const CARRY_CONFIG = {
  Sunday:    ['Tuesday','Wednesday','Thursday'],
  Monday:    ['Tuesday','Wednesday'],
  Tuesday:   ['Thursday','Friday'],
  Wednesday: ['Friday','Saturday'],
  Thursday:  ['Saturday','Sunday'],
  Friday:    ['Sunday','Monday','Tuesday'],
  Saturday:  ['Monday','Tuesday','Wednesday']
};

function sanitizeForQuery(name) {
  return name
    .replace(/"/g, '\"')
    .trim();
}

function buildTitleQuery(name) {
  // Strip parenthetical content for Shopify search compatibility
  // e.g. "Comp. Grilled Chicken (Poppie)" -> search "Comp. Grilled Chicken"
  // Shopify will still find the exact product via partial title match
  const stripped = name.replace(/\s*\([^)]*\)/g, '').trim();
  const safe = sanitizeForQuery(stripped);
  return `title:${safe}`;
}

async function graphql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) {
    console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
    throw new Error('Shopify GraphQL error');
  }
  return json.data;
}

// ── FETCH INVENTORY ───────────────────────────────────────────
async function fetchInventory(meals) {
  console.log(`Fetching inventory for ${meals.length} meals...`);
  const inventory = {};
  const BATCH_SIZE = 6;

  for (let i = 0; i < meals.length; i += BATCH_SIZE) {
    const batch = meals.slice(i, i + BATCH_SIZE);
    const queryParts = batch.map((meal, idx) => {
      const titleQuery = buildTitleQuery(meal.name);
      return `
        meal_${idx}: products(first: 1, query: "${titleQuery}") {
          edges {
            node {
              title
              variants(first: 1) {
                edges {
                  node {
                    inventoryItem {
                      inventoryLevel(locationId: "${LOCATION_ID}") {
                        quantities(names: ["available"]) {
                          name
                          quantity
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
    });

    const query = `{ ${queryParts.join('\n')} }`;
    const data  = await graphql(query);

    batch.forEach((meal, idx) => {
      const edges = data[`meal_${idx}`]?.edges || [];
      if (edges.length === 0) {
        console.warn(`  ⚠️  No Shopify product found for: "${meal.name}"`);
        inventory[meal.name] = 0;
        return;
      }
      const variant    = edges[0].node.variants.edges[0]?.node;
      const quantities = variant?.inventoryItem?.inventoryLevel?.quantities || [];
      const available  = quantities.find(q => q.name === 'available');
      inventory[meal.name] = available ? available.quantity : 0;
      console.log(`  ✓ ${meal.name}: ${inventory[meal.name]} available`);
    });

    if (i + BATCH_SIZE < meals.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  return inventory;
}

// ── GET DATE OF LAST OCCURRENCE OF A DAY ─────────────────────
// Returns the most recent past date that was a given day of week
// e.g. getLastOccurrence('Monday') from Sunday May 11 → Mon May 5
function getLastOccurrence(dayName, referenceDate = new Date()) {
  const targetIdx = DAY_INDEX[dayName];
  const d = new Date(referenceDate);
  d.setHours(12, 0, 0, 0); // Use noon to avoid DST edge cases

  // Go back until we hit the target day, starting from yesterday
  d.setDate(d.getDate() - 1);
  while (d.getDay() !== targetIdx) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

// ── GET DAY RANGE (midnight to midnight) ─────────────────────
function getDayRange(date) {
  // Use EST timezone (UTC-5) to match Shopify online store order times
  // EST midnight = 05:00 UTC, EST end of day = 04:59:59 next day UTC
  const estOffset = 5 * 60 * 60 * 1000; // 5 hours in ms

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const startUTC = new Date(start.getTime() + estOffset);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const endUTC = new Date(end.getTime() + estOffset);

  return { start: startUTC, end: endUTC };
}

// ── FETCH ORDERS FOR A DATE RANGE (Online Only) ───────────────
async function fetchOrdersForRange(start, end) {
  const orders = [];
  let pageUrl = `${REST_URL}/orders.json?status=any&financial_status=paid&source_name=web&created_at_min=${start.toISOString()}&created_at_max=${end.toISOString()}&limit=250&fields=id,source_name,line_items`;
  let pageCount = 0;

  while (pageUrl && pageCount < 10) {
    pageCount++;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let res, json;
    try {
      res  = await fetch(pageUrl, { headers, signal: controller.signal });
      json = await res.json();
    } catch (err) {
      clearTimeout(timeout);
      console.warn(`  ⚠️  Fetch timeout: ${err.message}`);
      break;
    }
    clearTimeout(timeout);

    const batch = (json.orders || []);
    orders.push(...batch);

    const linkHeader = res.headers.get('link') || '';
    const nextMatch  = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    pageUrl = nextMatch ? nextMatch[1] : null;
    if (pageUrl) await new Promise(r => setTimeout(r, 100));
  }

  return orders;
}

// ── COUNT MEAL SALES FROM ORDERS ─────────────────────────────
function normalizeTitle(str) {
  // Replace all whitespace variants (narrow space, non-breaking space, etc.)
  // with a standard single space, then lowercase and trim
  return str
    .replace(/[            ﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function countSalesFromOrders(orders, meals) {
  const salesMap = {};
  meals.forEach(m => salesMap[m.name.toLowerCase()] = 0);

  for (const order of orders) {
    for (const item of order.line_items) {
      const titleNorm = normalizeTitle(item.title);
      for (const meal of meals) {
        if (titleNorm === normalizeTitle(meal.name)) {
          salesMap[meal.name.toLowerCase()] += item.quantity;
          break;
        }
      }
    }
  }
  return salesMap;
}

// ── FETCH SALES FOR A SPECIFIC DAY NAME ──────────────────────
async function fetchDaySales(dayName, meals) {
  const date = getLastOccurrence(dayName);
  const { start, end } = getDayRange(date);
  console.log(`  Fetching ${dayName} (${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})...`);
  const orders = await fetchOrdersForRange(start, end);
  return countSalesFromOrders(orders, meals);
}

// ── MAIN: FETCH SALES ─────────────────────────────────────────
// Returns { burnOff, carryTarget } per meal — both as raw unit counts
// (not rates). Formula divides by 1 since these ARE the daily amounts.
async function fetchSales(meals, cookDay) {
  const burnConfig  = BURN_OFF_CONFIG[cookDay];
  const carryDays   = CARRY_CONFIG[cookDay];

  console.log(`\n📊 God Mode Sales Pull for ${cookDay} cook:`);
  console.log(`   Burn-Off days : ${burnConfig.hardcoded ? '0 (hardcoded)' : burnConfig.days.join(' + ')}`);
  console.log(`   Carry days    : ${carryDays.join(' + ')}\n`);

  // ── Burn-Off Sales ────────────────────────────────────────
  const burnOffSales = {};
  meals.forEach(m => burnOffSales[m.name] = 0);

  if (!burnConfig.hardcoded) {
    for (const dayName of burnConfig.days) {
      const daySales = await fetchDaySales(dayName, meals);
      meals.forEach(m => {
        burnOffSales[m.name] += daySales[m.name.toLowerCase()] || 0;
      });
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // ── Carry-Over Target Sales ───────────────────────────────
  const carryOverSales = {};
  meals.forEach(m => carryOverSales[m.name] = 0);

  for (const dayName of carryDays) {
    const daySales = await fetchDaySales(dayName, meals);
    meals.forEach(m => {
      carryOverSales[m.name] += daySales[m.name.toLowerCase()] || 0;
    });
    await new Promise(r => setTimeout(r, 100));
  }

  // Log summary
  console.log('\n  Sales summary (burn | carry):');
  meals.forEach(m => {
    const b = burnOffSales[m.name];
    const c = carryOverSales[m.name];
    if (b > 0 || c > 0) {
      console.log(`  ✓ ${m.name}: burn=${b} | carry=${c}`);
    }
  });

  return { burnOffSales, carryOverSales };
}

module.exports = { fetchInventory, fetchSales };
