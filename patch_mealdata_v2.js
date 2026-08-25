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

// 1. Breakfast Burrito — cut veggies → cube red and green peppers
replace(
  `    saladStation: "Cut Veggies",\n    sauceStation: "",\n    rawMeats: ""\n  },\n  {\n    name: "Buffalo Chicken Quesadilla"`,
  `    saladStation: "Cube Red and Green Peppers",\n    sauceStation: "",\n    rawMeats: ""\n  },\n  {\n    name: "Buffalo Chicken Quesadilla"`,
  'Breakfast Burrito: Cut Veggies → Cube Red and Green Peppers'
);

// 2. Buffalo Chicken Quesadilla — Salad & Mix → Buffalo Chicken Quesadilla Veggies, Taco Pulled Chicken → Buffalo Quesadilla Chicken
replace(
  `    name: "Buffalo Chicken Quesadilla",\n    yield: 87,\n    baselineRate: 110,\n    stove: "Taco Pulled Chicken",\n    oven: "",\n    grill: "",\n    flatGrill: "",\n    saladStation: "Salad & Mix",`,
  `    name: "Buffalo Chicken Quesadilla",\n    yield: 87,\n    baselineRate: 110,\n    stove: "Buffalo Quesadilla Chicken",\n    oven: "",\n    grill: "",\n    flatGrill: "",\n    saladStation: "Buffalo Chicken Quesadilla Veggies",`,
  'Buffalo Chicken Quesadilla: fix stove name + salad name'
);

// 3. Keto Ricotta Meatballs — oven Meatballs → Keto Ricotta Meatballs
replace(
  `    name: "Keto Ricotta Meatballs",\n    yield: 65,\n    baselineRate: 85,\n    stove: "Keto Ricotta Sauce",\n    oven: "Meatballs",`,
  `    name: "Keto Ricotta Meatballs",\n    yield: 65,\n    baselineRate: 85,\n    stove: "Keto Ricotta Sauce",\n    oven: "Keto Ricotta Meatballs",`,
  'Keto Ricotta Meatballs: oven Meatballs → Keto Ricotta Meatballs'
);

// 4. Rigatoni & Meatballs — Chicken Meatballs → Rigatoni Chicken Meatballs, bundle sauce+pasta
replace(
  `    name: "Rigatoni & Meatballs",\n    yield: 85,\n    baselineRate: 111,\n    stove: "Rigatoni Sauce",\n    oven: "Chicken Meatballs",`,
  `    name: "Rigatoni & Meatballs",\n    yield: 85,\n    baselineRate: 111,\n    stove: "Rigatoni Pasta & Sauce",\n    oven: "Rigatoni Chicken Meatballs",`,
  'Rigatoni & Meatballs: bundle stove, rename oven'
);

// 5. Closed on Sunday — Chicken Tenders → Crispy Chicken Bowl Tenders, Fil-A Sauce → CFA Sauce
replace(
  `    name: "Closed on Sunday Crispy Chicken Bowl",\n    yield: 70,\n    baselineRate: 175,\n    stove: "",\n    oven: "Russet Potato Wedges, Chicken Tenders",\n    grill: "",\n    flatGrill: "",\n    saladStation: "",\n    sauceStation: "Fil-A Sauce",`,
  `    name: "Closed on Sunday Crispy Chicken Bowl",\n    yield: 70,\n    baselineRate: 175,\n    stove: "",\n    oven: "Russet Potato Wedges, Crispy Chicken Bowl Tenders",\n    grill: "",\n    flatGrill: "",\n    saladStation: "",\n    sauceStation: "CFA Sauce",`,
  'Closed on Sunday: rename tenders + sauce'
);

// 6. Arches Mac Daddy — remove Onion Pickle from salad
replace(
  `    name: "The Arches Mac Daddy Wrap",\n    yield: 70,\n    baselineRate: 54,\n    stove: "Ground Beef",\n    oven: "",\n    grill: "",\n    flatGrill: "",\n    saladStation: "Onion Pickle",`,
  `    name: "The Arches Mac Daddy Wrap",\n    yield: 70,\n    baselineRate: 54,\n    stove: "Ground Beef",\n    oven: "",\n    grill: "",\n    flatGrill: "",\n    saladStation: "",`,
  'Arches Mac Daddy: remove Onion Pickle from salad'
);

// 7. West Coast Secret Sauce Bowl — Fil-A Sauce → West Coast Secret Sauce
replace(
  `    name: "West Coast Secret Sauce Bowl",\n    yield: 70,\n    baselineRate: 0,\n    stove: "Ground Beef",\n    oven: "Russet Wedge Potatoes",\n    grill: "",\n    flatGrill: "Caramelized Onion",\n    saladStation: "Caramelized Onion",\n    sauceStation: "Fil-A Sauce",`,
  `    name: "West Coast Secret Sauce Bowl",\n    yield: 70,\n    baselineRate: 0,\n    stove: "Ground Beef",\n    oven: "Russet Wedge Potatoes",\n    grill: "",\n    flatGrill: "Caramelized Onion",\n    saladStation: "Caramelized Onion",\n    sauceStation: "West Coast Secret Sauce",`,
  'West Coast Secret Sauce Bowl: Fil-A Sauce → West Coast Secret Sauce'
);

// 8. Chicken Taco Bowl — split Taco Pulled Chicken into its own entry
replace(
  `    name: "Chicken Taco Bowl",\n    yield: 80,\n    baselineRate: 117,\n    stove: "Brown Rice, Taco Pulled Chicken",`,
  `    name: "Chicken Taco Bowl",\n    yield: 80,\n    baselineRate: 117,\n    stove: "Brown Rice, Chicken Taco Bowl Chicken",`,
  'Chicken Taco Bowl: rename stove pulled chicken to be meal-specific'
);

// 9. BBQ Meltdown — rename flatGrill BBQ Chicken to BBQ Chicken - BBQ Meltdown
replace(
  `    name: "BBQ Meltdown",\n    yield: 70,\n    baselineRate: 120,\n    stove: "Jasmine Rice",\n    oven: "",\n    grill: "",\n    flatGrill: "BBQ Chicken",`,
  `    name: "BBQ Meltdown",\n    yield: 70,\n    baselineRate: 120,\n    stove: "Jasmine Rice",\n    oven: "",\n    grill: "",\n    flatGrill: "BBQ Chicken - BBQ Meltdown",`,
  'BBQ Meltdown: rename flatGrill item to distinguish from other BBQ Chicken'
);

// 10. Philly — add Peppers & Onions together in salad
replace(
  `    name: "Philly Cheesesteak Quesadilla",\n    yield: 70,\n    baselineRate: 80,\n    stove: "",\n    oven: "",\n    grill: "",\n    flatGrill: "Philly Cheesesteak, Onion & Peppers",\n    saladStation: "Peppers, Onions",`,
  `    name: "Philly Cheesesteak Quesadilla",\n    yield: 70,\n    baselineRate: 80,\n    stove: "",\n    oven: "",\n    grill: "",\n    flatGrill: "Philly Cheesesteak, Onion & Peppers",\n    saladStation: "Peppers and Onions for Philly",`,
  'Philly: rename salad to Peppers and Onions for Philly'
);

// 11. Salad veggies for Honey Garlic Tacos — veggies → cole slaw mix
replace(
  `    saladStation: "Mix Popcorn with Thai Chili, Veggies",`,
  `    saladStation: "Mix Popcorn with Thai Chili, Cole Slaw Mix",`,
  'Honey Garlic Tacos: Veggies → Cole Slaw Mix'
);

// 12. West Coast — Russet Wedge Potatoes stays (already same as Closed on Sunday russet)
// Both will be merged into one pill by the engine since same ingredient name

fs.writeFileSync(file, s);
console.log(`\n✅ Done — ${changes} changes applied`);
