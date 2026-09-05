const fs = require('fs'), path = require('path');
const file = path.join(process.env.HOME, 'Desktop/prep-automation/prep-automation/src/mealData.js');
let s = fs.readFileSync(file, 'utf8');

const old = `    name: "TexMex Potato Hash",
    yield: 84,
    baselineRate: 120,
    stove: "",
    oven: "Texas Potatoes, Cube Potatoes",
    grill: "",
    flatGrill: "",
    saladStation: "Texas Hash Salad",
    sauceStation: "",
    mainKitchen: 'Ground Beef',
    holbrook: '',
    rawMeats: "",`;

const new_ = `    name: "TexMex Potato Hash",
    yield: 84,
    baselineRate: 120,
    stove: "",
    oven: "Texas Potatoes",
    grill: "",
    flatGrill: "",
    saladStation: "Texas Hash Salad",
    sauceStation: "",
    mainKitchen: 'Ground Beef, Cube Potatoes',
    holbrook: '',
    rawMeats: "",`;

if (s.includes(old)) {
  s = s.replace(old, new_);
  fs.writeFileSync(file, s);
  console.log('✅ TexMex Potato Hash: Cube Potatoes moved oven -> mainKitchen (Texas Potatoes stays on oven). File written.');
} else {
  console.log('❌ ABORTED — exact block not found. File NOT written.');
  process.exit(1);
}
