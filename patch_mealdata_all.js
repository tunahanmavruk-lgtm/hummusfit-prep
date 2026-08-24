const fs = require('fs');
const path = require('path');
const file = path.join(process.env.HOME, 'Desktop/prep-automation/prep-automation/src/mealData.js');
let s = fs.readFileSync(file, 'utf8');
let changes = 0;

function replace(old, nw, label) {
  if (s.includes(old)) {
    s = s.replace(old, nw);
    console.log('✅', label);
    changes++;
  } else {
    console.log('⚠️  NOT FOUND:', label);
  }
}

// ── ARNOLD 2022 BOWL ─────────────────────────────────────────
// Remove asparagus from saladStation (keep it on grill only)
replace(
  `    grill: "Arnold Chicken, Grilled Asparagus",
    flatGrill: "",
    saladStation: "Asparagus",`,
  `    grill: "Arnold Chicken, Grilled Asparagus",
    flatGrill: "",
    saladStation: "",`,
  'Arnold 2022 Bowl: remove Asparagus from salad station'
);

// ── BUFFALO CHICKEN MEATBALLS ────────────────────────────────
// Split oven into two separate duties + add rawMeats Ground Chicken
replace(
  `    name: "Buffalo Chicken Meatballs",
    yield: 120,
    baselineRate: 119,
    stove: "",
    oven: "Meatballs + Sweet Potato Fries",
    grill: "",
    flatGrill: "",
    saladStation: "",
    sauceStation: "Keto Buffalo Sauce",
    rawMeats: "",`,
  `    name: "Buffalo Chicken Meatballs",
    yield: 120,
    baselineRate: 119,
    stove: "",
    oven: "Buffalo Chicken Meatballs, Sweet Potato Fries",
    grill: "",
    flatGrill: "",
    saladStation: "",
    sauceStation: "Buffalo Meatball Sauce",
    rawMeats: "Ground Chicken",`,
  'Buffalo Chicken Meatballs: split oven duties, fix sauce name, add Ground Chicken'
);

// ── BUFFALO CRISPY CHICKEN WRAP ──────────────────────────────
replace(
  `    name: "Buffalo Crispy Chicken Wrap",
    yield: 85,
    baselineRate: 189,
    stove: "",
    oven: "Crispy Chicken",
    grill: "",
    flatGrill: "",
    saladStation: "Celery",
    sauceStation: "Buffalo Sauce",
    rawMeats: "",`,
  `    name: "Buffalo Crispy Chicken Wrap",
    yield: 85,
    baselineRate: 189,
    stove: "",
    oven: "Buffalo Crispy Chicken",
    grill: "",
    flatGrill: "",
    saladStation: "Celery",
    sauceStation: "Buffalo Crispy Chicken Sauce",
    rawMeats: "",`,
  'Buffalo Crispy Chicken Wrap: rename oven item + fix sauce name'
);

// ── CHICKEN MUSHROOM POT STICKERS ────────────────────────────
// Remove Mushroom from oven (keep salad station)
replace(
  `    name: "Chicken Mushroom Pot Stickers",
    yield: 77,
    baselineRate: 63,
    stove: "",
    oven: "Mushroom",`,
  `    name: "Chicken Mushroom Pot Stickers",
    yield: 77,
    baselineRate: 63,
    stove: "",
    oven: "",`,
  'Chicken Mushroom Pot Stickers: remove Mushroom from oven'
);

// ── CRISPY VEGAN WRAP ────────────────────────────────────────
replace(
  `    oven: "Vegan Tenders",`,
  `    oven: "Vegan Crispy Tenders",`,
  'Crispy Vegan Wrap: rename to Vegan Crispy Tenders'
);

// ── FARFALLE & CHICKEN ALFREDO ───────────────────────────────
replace(
  `    stove: "Farfalle Pasta & Sauce",
    oven: "Chicken",`,
  `    stove: "Farfalle Pasta & Sauce",
    oven: "Farfalle Chicken",`,
  'Farfalle & Chicken Alfredo: rename oven to Farfalle Chicken'
);

// ── BLUEBERRY FRENCH TOAST ───────────────────────────────────
replace(
  `    flatGrill: "Blueberry Frenchie",
    saladStation: "",
    sauceStation: "Blueberry Sauce",`,
  `    flatGrill: "Blueberry Frenchie",
    saladStation: "",
    sauceStation: "Blueberry French Toast Sauce",`,
  'Blueberry French Toast: fix sauce name'
);

// ── STRAWBERRY PROTEIN FRENCH TOAST ─────────────────────────
replace(
  `    flatGrill: "Strawberry Frenchie",
    saladStation: "",
    sauceStation: "Sauce",
    rawMeats: "",
  },
  {
    name: "Thai Chili Chicken",`,
  `    flatGrill: "Strawberry Frenchie",
    saladStation: "",
    sauceStation: "Strawberry French Toast Sauce",
    rawMeats: "",
  },
  {
    name: "Thai Chili Chicken",`,
  'Strawberry French Toast: fix sauce name'
);

// ── FIT-FIL-A ────────────────────────────────────────────────
replace(
  `    oven: "Waffle Fries, Smoked Chicken",`,
  `    oven: "Fit Fil-A Waffle Fries, Smoked Chicken",`,
  'Fit-Fil-A: rename waffle fries'
);

// ── STACKED AND JACKED ───────────────────────────────────────
replace(
  `    oven: "Potato Fries",
    grill: "",
    flatGrill: "Burger Patty",`,
  `    oven: "Stacked And Jacked Potatoes",
    grill: "",
    flatGrill: "Burger Patty",`,
  'Stacked and Jacked: rename Potato Fries to Stacked And Jacked Potatoes'
);

// ── STRONGSVILLE CHICKEN RANCH FOLD ─────────────────────────
replace(
  `    name: "Strongsville Chicken Ranch Fold",
    yield: 88,
    baselineRate: 138,
    stove: "",
    oven: "Ranch Chicken",`,
  `    name: "Strongsville Chicken Bacon Ranch Fold",
    yield: 88,
    baselineRate: 138,
    stove: "",
    oven: "Strongsville Chicken Bacon Ranch Fold",`,
  'Strongsville: rename meal + oven item'
);

// ── KETO RICOTTA MEATBALLS ───────────────────────────────────
// Already has Ground Chicken in rawMeats - confirm it's right
if (s.includes(`    name: "Keto Ricotta Meatballs"`) && s.includes(`    rawMeats: "Ground Chicken"`)) {
  console.log('✅ Keto Ricotta Meatballs: Ground Chicken already set');
} else {
  replace(
    `    name: "Keto Ricotta Meatballs",
    yield: 65,
    baselineRate: 85,
    stove: "Keto Ricotta Sauce",
    oven: "Meatballs",
    grill: "",
    flatGrill: "",
    saladStation: "",
    sauceStation: "",
    rawMeats: "Ground Chicken"`,
    `    name: "Keto Ricotta Meatballs",
    yield: 65,
    baselineRate: 85,
    stove: "Keto Ricotta Sauce",
    oven: "Meatballs",
    grill: "",
    flatGrill: "",
    saladStation: "",
    sauceStation: "",
    rawMeats: "Ground Chicken"`,
    'Keto Ricotta Meatballs: Ground Chicken confirmed'
  );
}

// ── PINEAPPLE TERIYAKI MEATBALLS ────────────────────────────
if (s.includes(`    name: "Pineapple Teriyaki Meatballs"`) && s.includes(`rawMeats: "Ground Chicken"`)) {
  console.log('✅ Pineapple Teriyaki Meatballs: Ground Chicken already set');
} else {
  replace(
    `    name: "Pineapple Teriyaki Meatballs",`,
    `    name: "Pineapple Teriyaki Meatballs",`,
    'Pineapple Teriyaki Meatballs: checking...'
  );
}

// Write file
fs.writeFileSync(file, s);
console.log(`\n✅ Done — ${changes} changes applied`);
