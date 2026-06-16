const fs = require('fs');
let c = fs.readFileSync('Gmail-with-gemini.gs', 'utf8');
c = c.replace(/subject\.substring\(0,30\), '', category, urgency, refined, '✅'/g, "subject.substring(0,30), bodySnippet, category, urgency, refined, '✅啟用'");
fs.writeFileSync('Gmail-with-gemini.gs', c, 'utf8');
console.log('Fixed');
