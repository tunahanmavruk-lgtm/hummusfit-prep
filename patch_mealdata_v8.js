const fs = require('fs'), path = require('path');
const file = path.join(process.env.HOME, 'Desktop/prep-automation/prep-automation/src/mealData.js');
let s = fs.readFileSync(file, 'utf8');

const old = `    name: "Texas Queso Steak Bowl",
    yield: 70,
    baselineRate: 80,
    stove: "Lime Rice, Queso Sauce",
    oven: "",
    grill: "",
    flatGrill: "Cube Seasoned Steak",
    saladStation: "Bean Salad, Onion & Peppers",
    sauceStation: "",
    mainKitchen: '',
    holbrook: '',
    rawMeats: "Cube Steak",`;

const new_ = old.replace('stove: "Lime Rice, Queso Sauce",', 'stove: "Lime Rice",');

if (s.includes(old)) {
  s = s.replace(old, new_);
  fs.writeFileSync(file, s);
  console.log('✅ Queso Sauce removed from Texas Queso Steak Bowl stove field. File written.');
} else {
  console.log('❌ ABORTED — exact block not found. File NOT written.');
  process.exit(1);
}
