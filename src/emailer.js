// ============================================================
//  EMAIL MODULE — Resend API
//  Replaced nodemailer SMTP (blocked by Railway) with Resend.
//  Sending domain: updates.myhummusfit.com
// ============================================================

const https = require('https');

async function sendEmail(pdfBuffer, groupNumber, dayName) {
  const apiKey     = process.env.RESEND_API_KEY;
  const fromEmail  = 'kitchen@updates.myhummusfit.com';
  const toEmail    = process.env.EMAIL_TO || 'hummusfit@gmail.com,tony@myhummusfit.com';

  if (!apiKey) throw new Error('RESEND_API_KEY environment variable is not set.');

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });

  const subject = `🔥 Master Blueprint — Group ${groupNumber} | ${dayName} ${today}`;

  const textBody = [
    `Good morning! 🌅`,
    ``,
    `Your 6:00 AM prep sheet for today (Group ${groupNumber} — ${dayName}) is attached.`,
    ``,
    `God Mode Formula:`,
    `  • Daily Rate   = Sales ÷ Sales Window Days`,
    `  • Burn-Off     = Daily Rate × Burn-Off Days`,
    `  • Working Inv  = Current Inventory − Burn-Off`,
    `  • Carry Target = Daily Rate × Carry Days × 1.10 (lean buffer)`,
    `  • Deficit      = Carry Target − Working Inventory`,
    `  • Batches      = ⌈Deficit ÷ Yield⌉ (ceiling, min 2 if >0)`,
    ``,
    `RED items = Priority 1 (working inventory hit zero — fire these first).`,
    ``,
    `Print it, pin it, cook great food. 💪`,
    ``,
    `— HummusFit Kitchen Automation`
  ].join('\n');

  // Convert PDF buffer to base64
  const pdfBase64 = pdfBuffer.toString('base64');
  const filename  = `HummusFit_Blueprint_${dayName}_Group${groupNumber}.pdf`;

  // Build recipients array (support comma-separated EMAIL_TO)
  const toAddresses = toEmail.split(',').map(e => e.trim()).filter(Boolean);

  const payload = JSON.stringify({
    from:        fromEmail,
    to:          toAddresses,
    subject,
    text:        textBody,
    attachments: [
      {
        filename,
        content: pdfBase64
      }
    ]
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.resend.com',
      path:     '/emails',
      method:   'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`  ✓ Email sent via Resend to: ${toAddresses.join(', ')}`);
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Resend API error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { sendEmail };
