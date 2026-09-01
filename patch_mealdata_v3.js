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

// 1. Vegan Beef - move from rawMeats to oven (Vegan Chorizo Quesadilla)
replace(
  `    saladStation: "Vegan Quesadillas Mix",\n    sauceStation: "",\n    mainKitchen: '',\n    rawMeats: "Vegan Beef",`,
  `    saladStation: "Vegan Quesadillas Mix",\n    sauceStation: "",\n    mainKitchen: '',\n    rawMeats: "",`,
  'Vegan Beef: remove from rawMeats'
);
replace(
  `    name: "Vegan Chorizo Quesadilla",\n    isVegan: true,\n    yield: 45,\n    stove: "",\n    oven: "Vegan Chorizo",`,
  `    name: "Vegan Chorizo Quesadilla",\n    isVegan: true,\n    yield: 45,\n    stove: "",\n    oven: "Vegan Chorizo, Vegan Beef",`,
  'Vegan Beef: add to oven'
);

// 2. Arches Mac Daddy - add White Onion to salad
replace(
  `    name: "The Arches Mac Daddy Wrap",\n    yield: 70,\n    baselineRate: 54,\n    stove: "Ground Beef",\n    oven: "",\n    grill: "",\n    flatGrill: "",\n    saladStation: "",\n    sauceStation: "Arches Mac Daddy Sauce",`,
  `    name: "The Arches Mac Daddy Wrap",\n    yield: 70,\n    baselineRate: 54,\n    stove: "Ground Beef",\n    oven: "",\n    grill: "",\n    flatGrill: "",\n    saladStation: "White Onion",\n    sauceStation: "Arches Mac Daddy Sauce",`,
  'Arches Mac Daddy: add White Onion to salad'
);

// 3. Breakfast Burrito - add Bacon to salad, Frozen Cube Potatoes in oven
replace(
  `    name: "Breakfast Burrito",\n    yield: 75,\n    baselineRate: 108,\n    stove: "",\n    oven: "Cube Potatoes",\n    grill: "",\n    flatGrill: "Yellow Eggs",\n    saladStation: "Cube Red and Green Peppers",`,
  `    name: "Breakfast Burrito",\n    yield: 75,\n    baselineRate: 108,\n    stove: "",\n    oven: "Frozen Cube Potatoes",\n    grill: "",\n    flatGrill: "Yellow Eggs",\n    saladStation: "Cube Red and Green Peppers, Bacon",`,
  'Breakfast Burrito: Frozen Cube Potatoes + Bacon in salad'
);

// 4. BBQ Chicken Garlic Parm Potatoes - oven rename to Cube Potatoes
replace(
  `    oven: "Parm Potatoes",`,
  `    oven: "Cube Potatoes",`,
  'BBQ Chicken Garlic Parm: oven -> Cube Potatoes'
);

// 5. Texas Hash - add Cube Potatoes to oven
replace(
  `    oven: "Texas Potatoes",`,
  `    oven: "Texas Potatoes, Cube Potatoes",`,
  'Texas Hash: add Cube Potatoes to oven'
);

// 6. Salad - remove Mix Popcorn (Honey Garlic Tacos)
replace(
  `    saladStation: "Mix Popcorn with Thai Chili, Cole Slaw Mix",`,
  `    saladStation: "Cole Slaw Mix",`,
  'Honey Garlic Tacos: remove Mix Popcorn from salad'
);

// 7. Salad - remove Mix Clean Bulk (Clean Bulk Pasta Bowl)
replace(
  `    saladStation: "Mix Clean Bulk, Cut Parsley",`,
  `    saladStation: "Cut Parsley",`,
  'Clean Bulk: remove Mix Clean Bulk from salad'
);

// 8. Salad - remove Chopped Pickles (BBQ Meltdown)
replace(
  `    saladStation: "Chopped Pickles",`,
  `    saladStation: "",`,
  'BBQ Meltdown: remove Chopped Pickles from salad'
);

fs.writeFileSync(file, s);
console.log(`\n✅ Done — ${changes} changes applied`);
