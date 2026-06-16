const fs = require('fs');

// setup-guide.md
let s = fs.readFileSync('setup-guide.md', 'utf8');
s = s.replace(/## 📊 第七步：查看分類歷史日誌[\s\S]*?## ❓ 常見問題/, `## 📊 第七步：查看分類歷史日誌
- 到 Google 雲端硬碟搜尋「GmailWithGemini_Rules」
- AI_Rules 工作表：每封信的分類記錄，包含本地免 AI 直接判定的結果。
- AI_Execution_Log 工作表：每次執行的統計與是否成功。若遇到 429 錯誤中斷，會在此記錄。
- 隱藏工作表 \`AI_AutoLearnTracker\`：系統在背景自動追蹤的寄件者，若連續 3 次無害，會自動升級至本地學習庫。

## ❓ 常見問題`);
fs.writeFileSync('setup-guide.md', s, 'utf8');

// README.md
let r = fs.readFileSync('README.md', 'utf8');
r = r.replace(/## 🌟 核心功能.*?---/s, `## 🌟 核心功能 (v4.0.0 新功能)

* **超智慧自動分類**：將未讀郵件根據內文精準分類。
* **配額耗盡防護機制 (安全中斷)**：遇到 API 免費配額耗盡 (429 Error) 時，系統不再產生海量未分類信件，而是**直接中斷執行並保留未讀**。待明日額度恢復後自動重新接手。
* **安全名單自動學習 (Auto-Learn Tracker)**：背景自動追蹤！若系統連續 3 次將某寄件者判定為「促銷行銷」、「電子報」等無害類別，即自動納入 \`AI_LearningRules\` 終身本地秒殺，大幅節省 API 額度。
* **極簡 Few-Shot 架構**：大幅瘦身 Prompt 設定表，人工修正僅寫入本地學習庫，以最少的 Token 消耗換取最高效的 AI 判讀。
* **無痛一鍵部屬**：自動建立觸發器，每天 4 次背景掃描 (每 6 小時一次)，省去手動設定的麻煩。

---`);
fs.writeFileSync('README.md', r, 'utf8');
console.log('Update Complete');
