const fs=require('fs'),path=require('path');
const file=path.join(process.env.HOME,'Desktop/prep-automation/prep-automation/src/mealData.js');
let s=fs.readFileSync(file,'utf8');let n=0;
function rep(re,fn,label){const before=s;s=s.replace(re,fn);if(s!==before){console.log('✅',label);n++;}else console.log('⚠️  NOT FOUND:',label);}

// 1. Buffalo Crispy Chicken: oven -> mainKitchen (any meal that has it in oven)
rep(/oven:\s*"([^"]*)Buffalo Crispy Chicken([^"]*)",(\s*[\s\S]*?)mainKitchen:\s*''/g,(m,a,b,mid)=>{
  let ovenRest=(a+b).replace(/^,\s*|,\s*$/g,'').replace(/,\s*,/g,',').trim();
  return `oven: "${ovenRest}",${mid}mainKitchen: 'Buffalo Crispy Chicken'`;
},'Buffalo Crispy Chicken -> Main Kitchen');

// 2. Nacho Average Vegan Bowl: Sweet Fries -> mainKitchen as Sweet Potato Fries
rep(/oven:\s*"Vegan Beef, Sweet Fries",([\s\S]*?)mainKitchen:\s*''/,(m,mid)=>`oven: "Vegan Beef",${mid}mainKitchen: 'Sweet Potato Fries'`,'Nacho Average Vegan: Sweet Potato Fries -> Main Kitchen');

// 3. BBQ Chicken Garlic Parm Potatoes: remove Parm Potato Sauce from sauce station
rep(/sauceStation:\s*"Parm Potato Sauce",/,'sauceStation: "",','BBQ Garlic Parm: remove Parm Potato Sauce from sauce');

fs.writeFileSync(file,s);console.log(`\n${n} changes`);
