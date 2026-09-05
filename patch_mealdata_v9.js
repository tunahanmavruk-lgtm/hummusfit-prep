const fs = require('fs'), path = require('path');
const file = path.join(process.env.HOME, 'Desktop/prep-automation/prep-automation/src/mealData.js');
let s = fs.readFileSync(file, 'utf8');
let n = 0;
function rep(old, new_, label) {
  if (s.includes(old)) { s = s.replace(old, new_); console.log('✅', label); n++; }
  else { console.log('❌ NOT FOUND:', label); process.exitCode = 1; }
}

// 1. BBQ Chicken Mac Bowl: salad "Cut Parsley, Scallions" -> "Cut Scallions"
rep(
  '    saladStation: "Cut Parsley, Scallions",',
  '    saladStation: "Cut Scallions",',
  'BBQ Chicken Mac Bowl: salad -> Cut Scallions only'
);

// 2. Zeus Bowl V2: Cube Potatoes oven -> mainKitchen (append to existing Chicken Kebab)
rep(
  `    stove: "",
    oven: "Cube Potatoes",
    grill: "",
    flatGrill: "",
    saladStation: "",
    sauceStation: "Zeus Sauce",
    mainKitchen: 'Chicken Kebab',
    holbrook: '',
    rawMeats: "Cube Chicken"
  },`,
  `    stove: "",
    oven: "",
    grill: "",
    flatGrill: "",
    saladStation: "",
    sauceStation: "Zeus Sauce",
    mainKitchen: 'Chicken Kebab, Cube Potatoes',
    holbrook: '',
    rawMeats: "Cube Chicken"
  },`,
  'Zeus Bowl V2: Cube Potatoes oven -> mainKitchen (appended)'
);

// 3. BBQ Chicken Garlic Parm Potatoes: Cube Potatoes oven -> mainKitchen
rep(
  `    stove: "BBQ Chicken Garlic Parm Potatoes Sauce",
    oven: "Cube Potatoes",
    grill: "",
    flatGrill: "BBQ Garlic Parm Chicken",
    saladStation: "",
    sauceStation: "",
    mainKitchen: '',
    holbrook: '',
    rawMeats: "Cube Chicken",`,
  `    stove: "BBQ Chicken Garlic Parm Potatoes Sauce",
    oven: "",
    grill: "",
    flatGrill: "BBQ Garlic Parm Chicken",
    saladStation: "",
    sauceStation: "",
    mainKitchen: 'Cube Potatoes',
    holbrook: '',
    rawMeats: "Cube Chicken",`,
  'BBQ Chicken Garlic Parm Potatoes: Cube Potatoes oven -> mainKitchen'
);

// 4. Texas Queso Steak Bowl: "Bean Salad, Onion & Peppers" -> "Red Bean Corn Salad, Peppers and Onions"
rep(
  '    saladStation: "Bean Salad, Onion & Peppers",',
  '    saladStation: "Red Bean Corn Salad, Peppers and Onions",',
  'Texas Queso Steak Bowl: salad renamed to canonical Red Bean Corn Salad + Peppers and Onions'
);

// 5. Philly Cheesesteak Quesadilla: "Peppers and Onions for Philly" -> "Peppers and Onions"
rep(
  '    saladStation: "Peppers and Onions for Philly",',
  '    saladStation: "Peppers and Onions",',
  'Philly Cheesesteak Quesadilla: salad renamed to canonical Peppers and Onions'
);

if (n === 5) {
  fs.writeFileSync(file, s);
  console.log('\n✅ All 5 changes applied — file written.');
} else {
  console.log(`\n❌ Only ${n}/5 changes matched — file NOT written. Investigate before retrying.`);
  process.exit(1);
}
