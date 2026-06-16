const fs = require('fs');
let c = fs.readFileSync('CHANGELOG.gs', 'utf8');

const v4_changelog = `
## [4.0.0] - 2026-06-16

### 架構大改版 (Architecture Redesign)
- **直接中斷防塞車機制**：當 API 額度耗盡 (429 錯誤) 時，系統將不再把信件丟入 \`AI_Uncategorized\` 產生大量未分類信件，而是直接中斷執行並保留為未讀，待明日額度重置後自動重新處理。
- **安全名單自動學習 (Auto-Learn Tracker)**：新增隱藏追蹤表。當 AI 成功將某寄件者連續 3 次判定為「促銷行銷」、「社群通知」、「電子報」、「系統通知」等安全類別時，將自動將其納入 \`AI_LearningRules\`。未來該寄件者將在本地直接秒殺，終身免扣 API 額度。
- **廢除 Few-Shot 統整機制**：停止將人工修正紀錄寫入 Prompt 的 Few-Shot 區塊，所有人工修正僅寫入本地學習庫。Prompt 將永遠保持極簡的 5 筆預設範例，大幅降低每次 API 呼叫的 Token 消耗，並移除了先前實作的統整選單與功能。
`;

c = c.replace(/# 變更日誌 \(Changelist \/ Change Note\)\n/g, `# 變更日誌 (Changelist / Change Note)\n` + v4_changelog);

fs.writeFileSync('CHANGELOG.gs', c, 'utf8');
console.log('Changelog updated');
