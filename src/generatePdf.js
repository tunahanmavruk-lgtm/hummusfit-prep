// ============================================================
//  PDF GENERATOR — CLEAN SPREADSHEET LAYOUT
//  Matches HummusFit kitchen format exactly:
//  - Simple date + day header
//  - Clean table with meal, batches, stations
//  - No colored badges or fancy UI
//  - Fits one landscape 11x8.5 page always
//  - Works on both printer and TV display
// ============================================================

const puppeteer = require('puppeteer');

// Logo loaded from Shopify CDN — no large file needed
const LOGO_B64 = 'https://cdn.shopify.com/s/files/1/0624/7797/3879/files/hummus_fit_new_logo.PNG';

function buildHtml(prepSheet, groupNumber, dayName, eventName = null, eventMultiplier = 1.0) {
  const qrDataUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https://res.cloudinary.com/dtwtlbkqm/image/upload/hummusfit_blueprint_latest.pdf';
  // Show tomorrow's date — this sheet runs the night before the cook day
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toLocaleDateString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });

  // Filter: active meals (batches > 0 or DTA with units > 0), sorted highest to lowest
  const active = prepSheet
    .filter(m => (m.batches > 0 && !m.directToAssembly) || (m.directToAssembly && m.exactUnits > 0))
    .sort((a, b) => {
      if (a.directToAssembly && !b.directToAssembly) return 1;
      if (!a.directToAssembly && b.directToAssembly) return -1;
      return b.batches - a.batches;
    });

  // Separate overstocked items (0 batches but overstocked)
  const overstocked = prepSheet
    .filter(m => m.isOverstocked && m.batches === 0)
    .sort((a, b) => b.overstockUnits - a.overstockUnits);

  const rows = active.map((meal, idx) => {
    const batchDisplay = meal.directToAssembly
      ? `<td class="dta-units">${meal.exactUnits} units</td>`
      : `<td class="batch-num ${meal.isPriority1 ? 'high' : meal.batches >= 8 ? 'high' : ''}">${meal.batches}</td>`;

    return `
      <tr>
        <td class="meal-name ${meal.isPriority1 ? 'p1' : ''}">${meal.name}</td>
        ${batchDisplay}
        <td class="td-stove">${meal.stove || ''}</td>
        <td class="td-oven">${meal.oven || ''}</td>
        <td class="td-grill">${meal.grill || ''}</td>
        <td class="td-flatgrill">${meal.flatGrill || ''}</td>
        <td class="td-salad">${meal.saladStation || ''}</td>
        <td class="td-sauce">${meal.sauceStation || ''}</td>
        <td class="td-meats">${meal.rawMeats || ''}</td>
      </tr>
    `;
  }).join('');

  const eventBanner = eventName
    ? `<div class="event-bar">⚡ ${eventName} — Demand adjusted to ${(eventMultiplier * 100).toFixed(0)}% of normal</div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 7pt;
    color: #1a1a1a;
    background: #ffffff;
    padding: 0;
    margin: 0;
  }

  /* ── EVENT BANNER ── */
  .event-bar {
    background: #E8612C;
    color: white;
    font-size: 7pt;
    font-weight: 900;
    text-align: center;
    padding: 3px 8px;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  /* ── HEADER ── */
  .header-bar {
    background: #1C4A45;
    padding: 0;
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    min-height: 44px;
  }

  .header-left {
    background: #2BBFAA;
    padding: 6px 14px;
    display: flex;
    align-items: center;
    min-width: 140px;
  }

  .header-logo {
    height: 28px;
    width: auto;
    filter: brightness(0) invert(1);
  }

  .header-center {
    text-align: center;
    flex: 1;
    padding: 5px 10px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .header-title {
    font-size: 15pt;
    font-weight: 900;
    color: white;
    letter-spacing: 3px;
    text-transform: uppercase;
    line-height: 1;
  }

  .header-title span {
    color: #2BBFAA;
  }

  .header-sub {
    font-size: 5.5pt;
    color: rgba(255,255,255,0.6);
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin-top: 2px;
  }

  .header-right {
    background: #E8612C;
    padding: 6px 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 110px;
  }

  .header-badge {
    color: white;
    font-size: 8pt;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: center;
    line-height: 1.5;
  }

  .header-badge .group-num {
    font-size: 11pt;
    display: block;
    line-height: 1;
  }

  /* ── DIVIDER ── */
  .divider {
    height: 4px;
    background: linear-gradient(90deg, #2BBFAA 0%, #1C4A45 40%, #E8612C 100%);
  }

  /* ── TABLE WRAPPER ── */
  .table-wrap {
    padding: 5px 8px 0 8px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  col.col-meal    { width: 17%; }
  col.col-batch   { width: 5.5%; }
  col.col-station { width: 11%; }

  /* ── COLUMN HEADERS ── */
  thead tr { background: #1C4A45; }

  thead th {
    padding: 4px 5px;
    text-align: left;
    font-size: 6pt;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: white;
    border-right: 1px solid rgba(255,255,255,0.06);
  }

  thead th:last-child { border-right: none; }
  th.col-batch-h { text-align: center; }

  /* Station icon + color accent on header */
  th.col-stove     { border-left: 2px solid #2BBFAA; }
  th.col-oven      { border-left: 2px solid #26A090; }
  th.col-grill     { border-left: 2px solid #E8612C; }
  th.col-flatgrill { border-left: 2px solid #F0894A; }
  th.col-salad     { border-left: 2px solid #4CAF50; }
  th.col-sauce     { border-left: 2px solid #2E7D5E; }
  th.col-meats     { border-left: 2px solid #C0392B; }

  /* ── ROWS ── */
  tbody tr:nth-child(odd)  { background: #ffffff; }
  tbody tr:nth-child(even) { background: #F2FAFA; }

  tbody td {
    border: none;
    border-bottom: 1px solid #E2F0EE;
    border-right: 1px solid #EDF5F4;
    padding: 2.5px 5px;
    font-size: 6.8pt;
    vertical-align: middle;
    line-height: 1.3;
    word-wrap: break-word;
  }

  tbody td:last-child { border-right: none; }

  /* Station cells — left accent matching header */
  td.td-stove     { border-left: 1.5px solid #2BBFAA; }
  td.td-oven      { border-left: 1.5px solid #26A090; }
  td.td-grill     { border-left: 1.5px solid #E8612C; }
  td.td-flatgrill { border-left: 1.5px solid #F0894A; }
  td.td-salad     { border-left: 1.5px solid #4CAF50; }
  td.td-sauce     { border-left: 1.5px solid #2E7D5E; }
  td.td-meats     { border-left: 1.5px solid #C0392B; }

  .meal-name {
    font-weight: 800;
    color: #1C4A45;
    font-size: 7pt;
  }

  .meal-name.p1 { color: #E8612C; font-weight: 900; }
  .icon { font-size: 7pt; margin-right: 2px; }

  .batch-num {
    text-align: center;
    font-weight: 900;
    font-size: 10pt;
    color: #1C4A45;
  }

  .batch-num.high { color: #E8612C; }

  .dta-units {
    text-align: center;
    font-weight: 800;
    font-size: 6.5pt;
    color: #2BBFAA;
  }

  /* ── FOOTER ── */
  .overstock-section {
    margin-top: 8px;
    padding: 6px 10px;
    background: #EBF5FF;
    border-left: 4px solid #2196F3;
    border-radius: 4px;
  }
  .overstock-header {
    font-size: 8pt;
    font-weight: 900;
    color: #1565C0;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .overstock-item {
    font-size: 7pt;
    color: #1565C0;
    padding: 1px 0;
  }
  .footer {
    background: #1C4A45;
    padding: 4px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
  }

  .footer-text {
    color: rgba(255,255,255,0.5);
    font-size: 5.5pt;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
  }

  .footer-brand {
    color: #2BBFAA;
    font-size: 5.5pt;
    font-weight: 900;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }



  .qr-img {
    width: 60px;
    height: 60px;
    display: block;
  }

  .qr-text {
    display: flex;
    flex-direction: column;
  }

  .qr-title {
    font-size: 7pt;
    font-weight: 900;
    color: #1C4A45;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1.2;
  }

  .qr-sub {
    font-size: 5.5pt;
    color: #666;
    font-weight: 600;
  }

  .qr-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .qr-img {
    width: 32px;
    height: 32px;
    background: white;
    padding: 2px;
    border-radius: 3px;
  }

  .qr-label {
    color: rgba(255,255,255,0.7);
    font-size: 5pt;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    line-height: 1.3;
  }
</style>
</head>
<body>

${eventBanner}

<!-- HEADER -->
<div class="header-bar">
  <div class="header-left">
    <img src="${LOGO_B64}" class="header-logo" alt="HummusFit">
  </div>
  <div class="header-center">
    <div class="header-title">THE MASTER <span>BLUEPRINT</span></div>
    <div class="header-sub">Kitchen Prep Sheet &nbsp;·&nbsp; God Mode Engine &nbsp;·&nbsp; 6:00 AM Pull</div>
  </div>
  <div class="header-right">
    <div class="header-badge">
      <span class="group-num">GROUP ${groupNumber}</span>
      ${dayName.toUpperCase()}<br>${dateStr}
    </div>
  </div>
</div>
<div class="divider"></div>

<!-- TABLE -->
<div class="table-wrap">
<table>
  <colgroup>
    <col class="col-meal">
    <col class="col-batch">
    <col class="col-station">
    <col class="col-station">
    <col class="col-station">
    <col class="col-station">
    <col class="col-station">
    <col class="col-station">
    <col class="col-station">
  </colgroup>
  <thead>
    <tr>
      <th>Meal Name</th>
      <th class="col-batch-h">#</th>
      <th class="col-stove"><span class="icon">▲</span> Stove</th>
      <th class="col-oven"><span class="icon">◉</span> Oven</th>
      <th class="col-grill"><span class="icon">⬡</span> Grill</th>
      <th class="col-flatgrill"><span class="icon">▬</span> Flat Grill</th>
      <th class="col-salad"><span class="icon">✦</span> Salad Station</th>
      <th class="col-sauce"><span class="icon">◈</span> Sauce Station</th>
      <th class="col-meats"><span class="icon">◆</span> Raw Meats</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
</div>


</div>

</body>
</html>`;
}

async function generatePdf(prepSheet, groupNumber, dayName, eventName = null, eventMultiplier = 1.0) {
  console.log('Generating PDF...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    const html = buildHtml(prepSheet, groupNumber, dayName, eventName, eventMultiplier);

    // Use fixed viewport matching landscape letter size
    await page.setViewport({ width: 1056, height: 816 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const contentHeight = await page.evaluate(() => document.body.offsetHeight);
    const availableH = 680; // landscape letter minus margins at 96dpi
    console.log(`  ℹ️  Content height: ${contentHeight}px`);

    // Puppeteer scale must be between 0.1 and 2.0
    const rawScale = availableH / contentHeight;
    const scale = Math.min(1.0, Math.max(0.1, rawScale));
    console.log(`  ℹ️  Scale: ${(scale * 100).toFixed(0)}%`);

    const pdfBuffer = await page.pdf({
      format: 'Letter',
      landscape: true,
      printBackground: true,
      scale: scale,
      margin: { top: '0.25in', bottom: '0.25in', left: '0.25in', right: '0.25in' }
    });

    const sizeKB = pdfBuffer.length / 1024;
    console.log(`  ✓ PDF generated (${sizeKB.toFixed(1)} KB)`);
    return pdfBuffer;

  } finally {
    await browser.close();
  }
}

module.exports = { generatePdf };
