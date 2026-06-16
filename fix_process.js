const fs = require('fs');
let c = fs.readFileSync('Gmail-with-gemini.gs', 'utf8');

// Remove addExampleToPromptConfig_ call
c = c.replace(/\/\/ 同步至 AI_PromptConfig 範例\s+addExampleToPromptConfig_\(email, subject, bodySnippet, manualCat, '低', '\[人工修正\]'\);\s+processed\+\+;/g, `processed++;`);

fs.writeFileSync('Gmail-with-gemini.gs', c, 'utf8');
console.log('Fixed processUncategorizedSheet');
