const fs = require('fs');
let gs = fs.readFileSync('Gmail-with-gemini.gs', 'utf8');

// Insert the tracker call
gs = gs.replace(/Logger\.log\(`\[AI\] \$\{item\.senderEmail\} → \$\{category\} \(\$\{urgency\}\)`\);/g, 
  `Logger.log(\`[AI] \${item.senderEmail} → \${category} (\${urgency})\`);
                try { updateAutoLearnTracker(item.senderEmail, category, item.rawSender); } catch(e) {}`);

// Append the v4_autolearn code at the end
const autolearnCode = fs.readFileSync('v4_autolearn.js', 'utf8');
gs += '\n\n// =========================================================================\n// ==================== AI_AutoLearnTracker (v4.0) =========================\n// =========================================================================\n\n' + autolearnCode;

fs.writeFileSync('Gmail-with-gemini.gs', gs, 'utf8');
console.log('Injected AutoLearn');
