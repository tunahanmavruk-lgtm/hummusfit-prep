const fs = require('fs'), path = require('path');
const file = path.join(process.env.HOME, 'Desktop/prep-automation/prep-automation/src/mealData.js');
let s = fs.readFileSync(file, 'utf8');
let n = 0;
function rep(old, nw, label) {
  if (s.includes(old)) { s = s.replace(old, nw); console.log('✅', label); n++; }
  else console.log('⚠️  NOT FOUND:', label);
}

// Frozen Cube Potatoes: Breakfast Burrito — move from oven to mainKitchen
rep(
  `    name: "Breakfast Burrito",
    yield: 75,
    baselineRate: 108,
    stove: "",
    oven: "Frozen Cube Potatoes",
    grill: "",
    flatGrill: "Yellow Eggs",
    saladStation: "Cube Red and Green Peppers, Bacon",
    sauceStation: "",
    mainKitchen: '',
    rawMeats: ""`,
  `    name: "Breakfast Burrito",
    yield: 75,
    baselineRate: 108,
    stove: "",
    oven: "",
    grill: "",
    flatGrill: "Yellow Eggs",
    saladStation: "Cube Red and Green Peppers, Bacon",
    sauceStation: "",
    mainKitchen: 'Frozen Cube Potatoes',
    rawMeats: ""`,
  'Breakfast Burrito: Frozen Cube Potatoes moved oven -> mainKitchen'
);

fs.writeFileSync(file, s);
console.log(`\n${n} change(s)`);
