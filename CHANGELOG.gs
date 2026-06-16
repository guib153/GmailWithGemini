// =========================================================================
// ==================== 變更歷史日誌 (Changelog) ====================
// =========================================================================
// 此檔案包含 GmailWithGemini 的完整變更歷史日誌。
// 主程式碼位於 Gmail-with-gemini.gs (或 Apps Script 中的 GmailWithGemini)。
// 設定教學請參閱 setup-guide.md。
// =========================================================================

/*
# 變更日誌 (Changelist / Change Note)

## [4.0.0] - 2026-06-16

### 架構大改版 (Architecture Redesign)
- **直接中斷防塞車機制**：當 API 額度耗盡 (429 錯誤) 時，系統將不再把信件丟入 `AI_Uncategorized` 產生大量未分類信件，而是直接中斷執行並保留為未讀，待明日額度重置後自動重新處理。
- **安全名單自動學習 (Auto-Learn Tracker)**：新增隱藏追蹤表。當 AI 成功將某寄件者連續 3 次判定為「促銷行銷」、「社群通知」、「電子報」、「系統通知」等安全類別時，將自動將其納入 `AI_LearningRules`。未來該寄件者將在本地直接秒殺，終身免扣 API 額度。
- **廢除 Few-Shot 統整機制**：停止將人工修正紀錄寫入 Prompt 的 Few-Shot 區塊，所有人工修正僅寫入本地學習庫。Prompt 將永遠保持極簡的 5 筆預設範例，大幅降低每次 API 呼叫的 Token 消耗，並移除了先前實作的統整選單與功能。

## [3.1.0] - 2026-06-16

### 新增功能 (New Features)
- **試算表專屬選單**：新增 `onOpen` 函式，在 Google 試算表上方加入「🤖 Gmail AI 工具」專屬選單。
- **AI 統整 Few-Shot 規則**：實作 `consolidateFewShotExamples` 功能。當使用者在 `AI_PromptConfig` 表格中累積過多歷史分類規則時，可點擊選單按鈕，一鍵喚醒 AI（動態讀取使用者所選模型）將上百條相似的規則歸納、去重複並合併為 5~10 條精華規則，有效控制 Prompt 長度並提升執行效率。

## [3.0.0] - 2026-06-15

### 變更動機 (Motivation)
- **支援大規模批次處理**：繞過 GmailApp 的 100 封限制，並整合 Gemini 2.5 批次推論（一次傳送 10 封），大幅提升執行效率並降低免費版 15 RPM 的限制風險。
- **導入「使用者自訂與學習雙軌制」**：不再依賴固定 Prompt，使用者可在 `AI_PromptConfig` 表格中隨時新增、調整分類與 Few-Shot 範例，並透過 `AI_LearningRules` 快取已判定過的規則，達成不呼叫 API 也能秒殺分類。
- **新增每日晚間摘要通報**：針對全天已處理與標記信件發送每日晚報 (Daily Digest) 電子郵件。

### 影響檔案 (Affected Files)
- [Gmail-with-gemini.gs]
- [CHANGELOG.gs]
- [appsscript.json]

### 詳細變更 (Detailed Changes)
- **架構升級 (v3.0 批次處理)**：
  - 導入 `callGeminiApiBatch` 取代原先的單筆處理，透過 JSON 陣列要求 Gemini 一次對 10 封信件進行結構化輸出。
  - 將 5000ms 延遲改至批次層級，批次內不再延遲。
- **自訂配置工作表 (`AI_PromptConfig`)**：
  - 在首次執行時自動建立 `AI_PromptConfig`，讓使用者直接在試算表設定 AI 分類項目、描述與 Few-Shot 範例。
  - 主程式執行前會呼叫 `buildPromptFromSheet` 動態構建分類指令。
- **自學規則快取 (`AI_LearningRules`)**：
  - 當 AI 分類完成後，除寫入日誌外，同時記錄寄件人特徵至 `AI_LearningRules`。
  - 下次執行時，若寄件者已在學習庫中，直接免 API 進行分類並發送。
- **未分類人工覆核機制 (`AI_Uncategorized`)**：
  - 將解析失敗或緊急度異常的信件移至 `AI_Uncategorized`，方便使用者進行覆核並加入學習庫。
- **每日晚間摘要 (`sendDailyDigest`)**：
  - 新增晚上八點自動執行摘要函式，收集當天已分類的數量、各類別佔比，並寄送 Email 通知。
  - `setupTriggers` 自動註冊每日 20:00 的 `sendDailyDigest` 排程。
  - `appsscript.json` 中新增 `https://www.googleapis.com/auth/script.send_mail` 權限。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [2.0.0] - 2026-06-14

### 變更動機 (Motivation)
- 免費化改造：解決因 GCP 專案已啟用 Billing（綁定信用卡）導致 Gemini API 每次呼叫均被收費的根本問題。
- 新增 API 呼叫智慧重試機制與動態延遲調整，提升免費版執行穩定性。
- 新增觸發器管理工具函式與 API 金鑰診斷工具，降低使用門檻。
- 將完整變更歷史日誌分離至獨立檔案，提升主程式碼可維護性。

### 影響檔案 (Affected Files)
- [Gmail-with-gemini.gs] — 主程式碼
- [CHANGELOG.gs] — 完整變更歷史日誌（新建）
- [setup-guide.md] — 詳細設定教學文件（新建）
- [appsscript.json] — 資訊清單權限配置（新建）

### 詳細變更 (Detailed Changes)
- **免費化改造**：
  - 根因分析：GCP 專案已啟用 Billing 導致 Gemini API 免費額度失效，所有 API 呼叫均被計費。
  - 解決方案：引導使用者透過 Google AI Studio 建立新的「未啟用 Billing」的 GCP 專案，取得免費 API Key。
  - 免費額度估算：每天 4 次觸發 × 50 封信 = 200 次/天，僅佔免費額度 1,500 次/天的 13%。
- **新增 `callGeminiApiWithRetry()` 智慧重試機制**：
  - 使用指數退避 (Exponential Backoff) 策略，自動處理 429 (Rate Limit Exceeded) 錯誤。
  - 最多重試 `API_MAX_RETRIES`（預設 3）次，退避基數為 `API_RETRY_BASE_DELAY_MS`（預設 10000ms）。
  - 重試等待時間序列：10s → 20s → 40s，有效分散請求避免持續撞牆。
- **動態 API 呼叫延遲調整**：
  - 將 `API_CALL_DELAY_MS` 從固定 `1500ms` 提升至 `5000ms`，適應免費版 10-15 RPM 限制。
  - 確保單次批次 50 封信的處理時間控制在 5 分鐘內（50 × 5s = 250s），遠低於 Apps Script 6 分鐘上限。
- **在 `callGeminiApi` 中新增 429 錯誤偵測**：
  - 當 API 回應 HTTP 429 時，主動拋出包含 `'429'` 的 Error 例外，供 `callGeminiApiWithRetry` 捕獲並觸發重試流程。
- **新增 `setupTriggers()` 一鍵觸發器設定函式**：
  - 自動建立 4 個每日定時觸發器（00:00, 06:00, 12:00, 18:00）。
  - 執行前自動呼叫 `removeTriggers()` 清除所有現有觸發器，避免重複建立。
  - 使用 `atHour()` + `nearMinute(0)` 實現精確的時間點觸發。
- **新增 `removeTriggers()` 觸發器清除函式**：
  - 遍歷所有專案觸發器，篩選並刪除所有 `autoOrganizeGmailWithGemini` 相關的觸發器。
  - 可用於暫停自動執行或重置觸發器設定。
- **新增 `checkApiKeyStatus()` API 金鑰診斷函式**：
  - 發送最小化測試請求至 Gemini API，驗證 API Key 是否有效。
  - 檢查回應中是否包含 billing/quota 相關警告，初步判斷是否為免費專案 Key。
  - 顯示目前專案中所有活動觸發器的狀態摘要。
  - 針對不同 HTTP 回應碼（200/400/403/429）提供對應的診斷訊息與解決建議。
- **將完整變更歷史日誌分離至獨立的 `CHANGELOG.gs` 檔案**：
  - 主程式碼末尾僅保留簡短的版本參考註解。
  - 完整的歷史 Changelog（約 560 行）移至本檔案。
- **新增 `setup-guide.md` 詳細設定教學文件**：
  - 涵蓋 API Key 申請、Apps Script 專案建立、API 驗證、觸發器設定等 7 大步驟。
  - 特別強調「未啟用 Billing」的關鍵要求，附帶驗證方法。
- **新增 `appsscript.json` 資訊清單配置**：
  - 完整定義所需的 6 項 OAuth 權限範圍。
  - 設定時區為 Asia/Taipei，執行環境為 V8。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.5.0] - 2026-06-11

### 變更動機 (Motivation)
- 升級系統架構至 **100% 即時 AI 判讀與分類**（繞過原本的快取機制），以達成最高精準度，同時符合每日 1,000 次免費呼叫額度的合理成本平衡。
- 新增 AI 資訊精煉功能，擷取信件 20 字內關鍵核心摘要，寫入試算表全新欄位 `AI Refined Content`。
- 重新整理分類規則：新增獨立類別「個人消費」整合線下/線上購物，並重構「工作」類別以精準判別個人行動信件（排除 LinkedIn / 104 等群發週報電子報）。

### 影響檔案 (Affected Files)
- GmailWithGemini
- gmail_with_gemini_guide.md

### 詳細變更 (Detailed Changes)
- **重構 `autoOrganizeGmailWithGemini` 主流程**：
  - 移除了 rulesMap 載入與比對快取規則的邏輯，改為每封信一律即時呼叫 Gemini 2.5 Flash API。
  - 主迴圈中直接呼叫 `callGeminiApi` 獲取分類、緊急度與 AI 精煉重點，並一次性寫入歷史日誌試算表中。
- **重構 `callGeminiApi` API 提示詞與 Schema**：
  - 優化 `promptText` 提示詞內容，導入思考鏈 (Chain of Thought) 分步推理引導，並加入 5 個關於 LinkedIn、個人消費、銀行安全警報的 Few-shot 邊界範例對照。
  - 在 `promptText` 與 `responseSchema` 分類選項中，新增第 9 個獨立類別 `"Netflix"`（涵蓋所有 netflix.com 發出之信件），並同時更新說明教學指引。
  - 優化提示詞 `promptText` 的 Netflix 邊界範例，加入真實的登入碼（高緊急度）與同戶裝置確認（中緊急度）Few-shot 對照。
  - 更新 `responseSchema` 配置，新增 `refinedContent` (string) 屬性，並將其列入 `required` 輸出必填欄位。
- **優化 Gmail 讀取與標籤過濾流程**：
  - 徹底移除 `thread.markRead()` 主流程已讀動作與 `moveToArchive()` 封存邏輯，以保持信件「未讀狀態」留在收件匣。
  - 將全域搜尋條件 `GMAIL_SEARCH_QUERY` 更新為排除所有 `AI/...` 分類標籤，從技術上完美防範重複判讀。
  - 新增全域變數 `PROCESS_OLDEST_FIRST`，並在主流程中對擷取信件陣列進行 `.reverse()`，實現最早郵件優先分類機制。
- **優化極限安全配置限制**：
  - 將 `MAX_THREADS_TO_SCAN` 調整為 `30`，並將 `API_CALL_DELAY_MS` 增加至 `4000` 毫秒，這能徹底防止觸發 Gemini API 免費版 `15 RPM` 頻率限制，並確保單次排程執行時間維持在 2.5 分鐘內，遠低於 Apps Script 6 分鐘超時上限。
  - 將 `EMAIL_BODY_CHAR_LIMIT` 調整為 `1000` 以減少 Token 消耗。
- **新增試算表自我修復與排版高級美化**：
  - 新增 `formatSheetAesthetics` 格式化配置模組，對日誌工作表自訂欄寬、對齊與斑馬線交替背景色。
  - 為 `Urgency` 欄位配置高/中/低三級背景與文字的條件格式化規則。
  - 在 `getOrCreateRulesSheet` 內部新增空表格自我修復檢測 (`getLastRow === 0`)，保障標題列與排版樣式在試算表被清空時能自動重建，並確保在升級舊版格式的現有表格路徑中，也會套用此格式美化規則。
- **實作收件匣分頁自動歸類與歷史信件移轉功能**：
  - 新增 `CATEGORY_TAB_MAPPING` 全域對照，對應 AI 九大分類至 Gmail 收件匣分頁系統標籤（如 `CATEGORY_PERSONAL`、`CATEGORY_SOCIAL`、`CATEGORY_PROMOTIONS`、`CATEGORY_UPDATES`）。
  - 在 `autoOrganizeGmailWithGemini` 主迴圈中調用自訂的 REST API 方法 `moveThreadToGmailCategory`，對新整理信件執行即時分頁搬移並移除其他衝突系統分頁。
  - 新增一次性輔助移轉工具 `syncExistingLabeledThreadsToCategories()`，不消耗 API 額度即可將過去所有已分類標籤信件一次性歸類至正確的分頁中。
- **實作排程執行統計分析日誌 (AI_Execution_Log)**：
  - 新增 `AI_Execution_Log` 頁籤與對應初始化 `getOrCreateExecutionLogSheet` 與樣式美化 `formatExecutionLogSheetAesthetics` 模組，套用置中對齊、Zebra 交替背景底色及執行成功狀態（Y：綠，N：紅）條件格式化。
  - 在 `autoOrganizeGmailWithGemini` 導入 `try-catch-finally` 架構，在每次整理完成或異常中斷時，必定寫入包含執行時間、信件收件日期區間、處理成功/失敗數、各緊急度總量與分類佔比摘要等十項欄位數據。
- **重構 `getOrCreateRulesSheet` 試算表初始化與相容升級**：
  - 在首次建立工作表時，標題列加入 `AI Refined Content`（位於 Email, Sender Name, Category, Urgency 之後，總共 7 欄）。
  - 新增舊版相容性升級邏輯：若檢測到試算表已存在但第 5 欄標題不是 `AI Refined Content`，則在第 5 欄前自動插入一欄並寫入標題，確保無痛升級。
- **更新 `gmail_with_gemini_guide.md`**：
  - 修改使用手冊內容，將「自動學習快取表」變更為「分類與重點精煉歷史日誌」，並補充第 5 個新欄位 `AI Refined Content` 的功能與好處。
- **整合使用手冊與變更日誌至腳本主檔案中**：
  - 在 `GmailWithGemini` 主檔案最末尾新增多行區塊註解，將詳細的使用教學手冊（包含取得 API 金鑰、安全屬性設定、排程觸發條件等 6 步驟）與完整的變更歷史日誌無縫整合，方便使用者在編輯器中隨時查閱。
- **新增可單獨執行之入口函式說明註解**：
  - 在 `GmailWithGemini` 檔案主流程函式 `autoOrganizeGmailWithGemini()` 上方，新增專屬說明註解，詳述 `autoOrganizeGmailWithGemini` 與 `syncExistingLabeledThreadsToCategories` 兩大入口函式的使用用途、適用時機與執行方式，降低初學者操作門檻。
- **調整可單獨執行之主要函式至腳本最頂部**：
  - 將自訂的歷史移轉一鍵同步工具 `syncExistingLabeledThreadsToCategories()` 搬移至主程式 `autoOrganizeGmailWithGemini()` 正下方，使兩個核心的可單獨執行入口程式集中在腳本最頂部，方便初學者在 Apps Script 編輯器介面中下拉選擇與點擊執行。
- **實作判讀失敗信件降級標記防護機制 (Poison Pill Defense)**：
  - 在全域搜尋條件 `GMAIL_SEARCH_QUERY` 追加排除 `AI/未分類` 標籤，並在對照表中建立 `"未分類": "CATEGORY_PERSONAL"` 配對。
  - 重構主迴圈 API 錯誤處理：當特定信件呼叫 Gemini API 失敗或回傳無效格式時，自動將其降級分類至 `"未分類"` 類別，完成標籤套用與日誌記錄，徹底防範特定信件重試失敗導致整個排程佇列卡死的飢餓問題。
- **主迴圈內層強健性 try-catch 包裹優化**：
  - 在 `threads.forEach` 迴圈內部包裹了一層全區的 `try-catch (threadError)` 結構，確保當處理某封特定信件出錯（例如讀取內文或套用標籤失敗）時，只會記錄該信件錯誤，主程式仍可繼續迭代處理該批次中的其他信件。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.4.2] - 2026-06-11

### 變更動機 (Motivation)
- 依使用者需求，新增獨立分類「登入成功通知」，用以分類銀行及帳號登入成功的通知郵件。

### 影響檔案 (Affected Files)
- GmailWithGemini
- gmail_with_gemini_guide.md

### 詳細變更 (Detailed Changes)
- 在 `callGeminiApi` 的 `responseSchema` 中，將 `"登入成功通知"` 新增至 `category` 的 enum 陣列，確保 API 輸出格式受限在此 7 個分類。
- 更新 `gmail_with_gemini_guide.md` 說明文件中的分類列表。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.4.1] - 2026-06-11

### 變更動機 (Motivation)
- 優化分類提示詞 (Prompt) 內容，增加明確的各類別與緊急度評判規則，提升 Gemini 自動分類的精準度與穩定性。

### 影響檔案 (Affected Files)
- GmailWithGemini

### 詳細變更 (Detailed Changes)
- 重構 `callGeminiApi` 中的 `promptText` 變數內容，補充詳細的「分類類別規範」與「緊急度評判規範」。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.4.0] - 2026-06-11

### 變更動機 (Motivation)
- 依使用者需求，從 Gmail 寄件者欄位中擷取寄件者名稱，並儲存至試算表的第二欄 `Sender Name`。支援舊版工作表格式自動無痛升級，確保無損舊資料。

### 影響檔案 (Affected Files)
- GmailWithGemini

### 詳細變更 (Detailed Changes)
- 新增 `extractSenderName` 輔助功能，使用 Regex 擷取乾淨寄件者姓名，備用則使用信箱帳號前半部。
- 重構 `getOrCreateRulesSheet`，將新建立之工作表標題加入 `Sender Name`。並在此處加入舊版格式檢查與升級邏輯：若工作表已存在但第二欄標題非 `Sender Name`，則自動執行 `sheet.insertColumnBefore(2)` 並將 B1 設為 `Sender Name`。
- 重構 `autoOrganizeGmailWithGemini` 主流程：
  - 更新資料讀取迴圈的資料欄索引，將 `Category` 與 `Urgency` 右移一格（分別改為讀取 index 2 與 index 3）。
  - 在 AI 分類成功學習寫回試算表時，呼叫 `extractSenderName(rawSender)` 並將寄件者名稱寫入 appendRow 的第二個欄位。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.3.1] - 2026-06-10

### 變更動機 (Motivation)
- 為了解決免費版 API 頻繁呼叫導致的 503 (High demand / Spikes in demand) 頻率限制與伺服器負荷問題，加入 API 呼叫緩衝延遲機制。

### 詳細變更 (Detailed Changes)
- 新增全域常數 `API_CALL_DELAY_MS`（值為 1500 毫秒）。
- 在 `autoOrganizeGmailWithGemini` 主流程內部，針對未命中規則而需要呼叫 API 的情況，在呼叫 API 之前加入 `Utilities.sleep(API_CALL_DELAY_MS)` 的緩衝延遲。

## [1.3.0] - 2026-06-10

### 變更動機 (Motivation)
- 將腳本中所有需要使用者提供的組態變數（如 API Key 屬性名稱、搜尋篩選、掃描限制、字數上限、工作表名稱等）重構並提取至檔案最開頭，方便自訂管理。

### 詳細變更 (Detailed Changes)
- 於檔案最前端宣告全域設定常數（`GEMINI_API_KEY_PROPERTY`, `GMAIL_SEARCH_QUERY`, `MAX_THREADS_TO_SCAN`, `EMAIL_BODY_CHAR_LIMIT`, `RULES_SHEET_NAME`, `STANDALONE_SPREADSHEET_NAME`, `STANDALONE_SPREADSHEET_PROPERTY`）。
- 重構 `autoOrganizeGmailWithGemini` 與 `getOrCreateRulesSheet`，將原先寫死之參數值替換為對應常數。

## [1.2.0] - 2026-06-10

### 變更動機 (Motivation)
- 實作試算表規則對照表（`AI_Rules` 工作表）與 AI 自動學習儲存機制，降低 API 呼叫額度，並自動於試算表中生成 Gmail 搜尋篩選指令。

### 詳細變更 (Detailed Changes)
- 於 `appsscript.json` 的 `oauthScopes` 中補上 `spreadsheets` 權限範圍以支援讀寫與建立規則表。
- 實作信箱乾淨地址擷取輔助功能 `extractCleanEmail` 與規則對照工作表初始化輔助功能 `getOrCreateRulesSheet`。
- 重構 `autoOrganizeGmailWithGemini` 主邏輯：
  - 啟動時讀取 `AI_Rules` 並載入記憶體 Map。
  - 對信件的寄件者與收件者進行規則比對，命中則直接分類貼標籤（不消耗 API 金鑰）。
  - 未命中規則時，以 AI 分類，成功後將信箱、分類結果、搜尋指令 `from:email` 與時間寫回試算表。
- 修正 `callGeminiAPI` 為符合 Google 風格指南規範之 `callGeminiApi` 駝峰式命名。

## [1.1.0] - 2026-06-10

### 變更動機 (Motivation)
- 修正 GmailWithGemini 腳本中 API 呼叫 URL 及例外處理安全防禦，補足 `appsscript.json` 權限範圍以防連線失敗，並重構系統日誌至全英文以符合開發規範。

### 詳細變更 (Detailed Changes)
- 將 `callGeminiAPI` 中的網址修正為正確的 `gemini-2.5-flash` API 端點。
- 重構 JSON 解析邏輯，先判定所有欄位層級再進行解析，並使用 `try-catch` 包裹。
- 將所有 `Logger.log` 系統輸出日誌翻譯為英文，並維持程式註解為繁體中文。
- 在 `appsscript.json` 的 `oauthScopes` 中補上 `gmail.modify` 和 `script.external_request` 權限範圍。

## [1.0.0] - 2026-06-09

### 變更動機 (Motivation)
- 初始版本建立。實作基於 Gemini 2.5 Flash 的 Gmail 郵件自動分類系統。

### 詳細變更 (Detailed Changes)
- 建立 `autoOrganizeGmailWithGemini` 主流程。
- 建立 `callGeminiApi` API 呼叫函式。
- 實作基本的 Gmail 標籤套用機制。
*/
