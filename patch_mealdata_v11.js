const fs = require('fs'), path = require('path');
const file = path.join(process.env.HOME, 'Desktop/prep-automation/prep-automation/src/mealData.js');
let s = fs.readFileSync(file, 'utf8');

const old = `    name: "Texas Queso Steak Bowl",
    yield: 70,
    baselineRate: 80,
    stove: "Lime Rice",
    oven: "",
    grill: "",
    flatGrill: "Cube Seasoned Steak",
    saladStation: "Red Bean Corn Salad, Peppers and Onions",
    sauceStation: "",
    mainKitchen: '',
    holbrook: '',
    rawMeats: "Cube Steak",`;

const new_ = old.replace(
  'flatGrill: "Cube Seasoned Steak",',
  'flatGrill: "Cube Seasoned Steak, Onion & Peppers",'
);

if (s.includes(old)) {
  s = s.replace(old, new_);
  fs.writeFileSync(file, s);
  console.log('✅ Texas Queso Steak Bowl: Onion & Peppers added to flatGrill field. File written.');
} else {
  console.log('❌ ABORTED — exact block not found. File NOT written.');
  process.exit(1);
}
