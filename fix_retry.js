const fs = require('fs');
let c = fs.readFileSync('Gmail-with-gemini.gs', 'utf8');

c = c.replace(/Logger\.log\('Rate limit: all retries exhausted\.'\);\s*return null;/g, `Logger.log('Rate limit: all retries exhausted. Throwing error to abort execution.');
        throw new Error('QUOTA_EXHAUSTED');`);

fs.writeFileSync('Gmail-with-gemini.gs', c, 'utf8');
console.log('Fixed');
