const fs = require('fs'), path = require('path');
const file = path.join(process.env.HOME, 'Desktop/prep-automation/prep-automation/src/mealData.js');
let s = fs.readFileSync(file, 'utf8');

// Chicken Parm Wrap: Grilled Chicken Parmesan Wrap, oven -> holbrook
const old = `    name: "Grilled Chicken Parmesan Wrap",
    yield: 70,
    baselineRate: 129,
    stove: "",
    oven: "Chicken Parm Wrap",
    grill: "",
    flatGrill: "",
    saladStation: "",
    sauceStation: "",
    mainKitchen: '',
    holbrook: '',
    rawMeats: "Filet Chicken",`;
const new_ = old.replace('oven: "Chicken Parm Wrap",', 'oven: "",').replace("holbrook: '',", "holbrook: 'Chicken Parm Wrap',");

if (s.includes(old)) {
  s = s.replace(old, new_);
  fs.writeFileSync(file, s);
  console.log('✅ Chicken Parm Wrap (Grilled Chicken Parmesan Wrap): oven -> holbrook. File written.');
} else {
  console.log('❌ ABORTED — exact block not found. File NOT written. Formatting may have shifted since last patch — paste current lines around "Grilled Chicken Parmesan Wrap" to investigate.');
  process.exit(1);
}
