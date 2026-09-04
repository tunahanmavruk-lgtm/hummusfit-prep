const fs = require('fs'), path = require('path');
const file = path.join(process.env.HOME, 'Desktop/prep-automation/prep-automation/src/mealData.js');
let s = fs.readFileSync(file, 'utf8');

if (s.includes("holbrook: '',")) {
  console.log('⚠️  ABORTED: "holbrook" field already present in file. Patch already applied — not running again.');
  process.exit(1);
}

// 1. Add `holbrook: '',` after every `mainKitchen: '...',` line (any content, not just empty)
const mkCount = (s.match(/mainKitchen: '[^']*',/g) || []).length;
s = s.replace(/mainKitchen: '[^']*',/g, function(m) { return m + "\n    holbrook: '',"; });
console.log(`Step 1: added holbrook field to ${mkCount} meal blocks`);

// 2/3. Move Basmati Rice / Sticky Rice: stove -> holbrook
// mainKitchen content can now be non-empty (e.g. 'Ground Beef'), so match any quoted content there.
const fieldBlockRe = ing => new RegExp(
  `stove: "${ing}",(\\s*\\n\\s*oven:[^\\n]*\\n\\s*grill:[^\\n]*\\n\\s*flatGrill:[^\\n]*\\n\\s*saladStation:[^\\n]*\\n\\s*sauceStation:[^\\n]*\\n\\s*mainKitchen: '[^']*',\\n\\s*holbrook: '',)`,
  'g'
);

let basmatiHits = 0;
s = s.replace(fieldBlockRe('Basmati Rice'), function(match, tail) {
  basmatiHits++;
  const newTail = tail.replace("holbrook: '',", "holbrook: 'Basmati Rice',");
  return 'stove: "",' + newTail;
});
console.log(`Step 2: Basmati Rice moved on ${basmatiHits} meals (expected 7)`);

let stickyHits = 0;
s = s.replace(fieldBlockRe('Sticky Rice'), function(match, tail) {
  stickyHits++;
  const newTail = tail.replace("holbrook: '',", "holbrook: 'Sticky Rice',");
  return 'stove: "",' + newTail;
});
console.log(`Step 3: Sticky Rice moved on ${stickyHits} meals (expected 3)`);

// 4. Chipotle Chicken: Broritto Burrito only, oven -> holbrook
const old4 = `    name: "Broritto Burrito",
    yield: 75,
    baselineRate: 277,
    stove: "",
    oven: "Chipotle Chicken",
    grill: "",
    flatGrill: "",
    saladStation: "Burrito Salad",
    sauceStation: "",
    mainKitchen: '',
    holbrook: '',
    rawMeats: "Filet Chicken",`;
const new4 = old4.replace('oven: "Chipotle Chicken",', 'oven: "",').replace("holbrook: '',", "holbrook: 'Chipotle Chicken',");
let step4ok = false;
if (s.includes(old4)) { s = s.replace(old4, new4); step4ok = true; }
console.log(`Step 4: Chipotle Chicken (Broritto Burrito) -> holbrook: ${step4ok ? 'OK' : 'NOT FOUND — check formatting'}`);

if (basmatiHits !== 7) {
  console.log(`\n❌ ABORTED — expected 7 Basmati Rice moves, got ${basmatiHits}. File NOT written.`);
  process.exit(1);
}
if (stickyHits !== 3) {
  console.log(`\n❌ ABORTED — expected 3 Sticky Rice moves, got ${stickyHits}. File NOT written.`);
  process.exit(1);
}
if (!step4ok) {
  console.log(`\n❌ ABORTED — Chipotle Chicken block not found/changed. File NOT written.`);
  process.exit(1);
}

fs.writeFileSync(file, s);
console.log('\n✅ All checks passed — file written successfully.');
