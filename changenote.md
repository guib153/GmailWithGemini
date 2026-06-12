# 變更日誌 (Changelist / Change Note)

## [1.5.0] - 2026-06-11

### 變更動機 (Motivation)
- 升級系統架構至 **100% 即時 AI 判讀與分類**（繞過原本的快取機制），以達成最高精準度，同時符合每日 1,000 次免費呼叫額度的合理成本平衡。
- 新增 AI 資訊精煉功能，擷取信件 20 字內關鍵核心摘要，寫入試算表全新欄位 `AI Refined Content`。
- 重新整理分類規則：新增獨立類別「個人消費」整合線下/線上購物，並重構「工作」類別以精準判別個人行動信件（排除 LinkedIn / 104 等群發週報電子報）。

### 影響檔案 (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)
- [gmail_with_gemini_guide.md](file:///usr/local/google/home/chenghant/.gemini/jetski/brain/ff896fa6-15b8-4123-bcce-6bf208e67c49/gmail_with_gemini_guide.md)

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
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)
- [gmail_with_gemini_guide.md](file:///usr/local/google/home/chenghant/.gemini/jetski/brain/ff896fa6-15b8-4123-bcce-6bf208e67c49/gmail_with_gemini_guide.md)

### 詳細變更 (Detailed Changes)
- 在 `callGeminiApi` 的 `responseSchema` 中，將 `"登入成功通知"` 新增至 `category` 的 enum 陣列，確保 API 輸出格式受限在此 7 個分類。
- 更新 `gmail_with_gemini_guide.md` 說明文件中的分類列表。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.4.1] - 2026-06-11

### 變更動機 (Motivation)
- 優化分類提示詞 (Prompt) 內容，增加明確的各類別與緊急度評判規則，提升 Gemini 自動分類的精準度與穩定性。

### 影響檔案 (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)

### 詳細變更 (Detailed Changes)
- 重構 `callGeminiApi` 中的 `promptText` 變數內容，補充詳細的「分類類別規範」與「緊急度評判規範」。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.4.0] - 2026-06-11

### 變更動機 (Motivation)
- 依使用者需求，從 Gmail 寄件者欄位中擷取寄件者名稱，並儲存至試算表的第二欄 `Sender Name`。支援舊版工作表格式自動無痛升級，確保無損舊資料。

### 影響檔案 (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)

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

### 影響檔案 (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)

### 詳細變更 (Detailed Changes)
- 新增全域常數 `API_CALL_DELAY_MS`（值為 1500 毫秒）。
- 在 `autoOrganizeGmailWithGemini` 主流程內部，針對未命中規則而需要呼叫 API 的情況，在呼叫 API 之前加入 `Utilities.sleep(API_CALL_DELAY_MS)` 的緩衝延遲。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.3.0] - 2026-06-10

### 變更動機 (Motivation)
- 將腳本中所有需要使用者提供的組態變數（如 API Key 屬性名稱、搜尋篩選、掃描限制、字數上限、工作表名稱等）重構並提取至檔案最開頭，方便自訂管理。

### 影響檔案 (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)

### 詳細變更 (Detailed Changes)
- 於檔案最前端宣告全域設定常數（`GEMINI_API_KEY_PROPERTY`, `GMAIL_SEARCH_QUERY`, `MAX_THREADS_TO_SCAN`, `EMAIL_BODY_CHAR_LIMIT`, `RULES_SHEET_NAME`, `STANDALONE_SPREADSHEET_NAME`, `STANDALONE_SPREADSHEET_PROPERTY`）。
- 重構 `autoOrganizeGmailWithGemini` 與 `getOrCreateRulesSheet`，將原先寫死之參數值替換為對應常數。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.2.0] - 2026-06-10

### 變更動機 (Motivation)
- 實作試算表規則對照表（`AI_Rules` 工作表）與 AI 自動學習儲存機制，降低 API 呼叫額度，並自動於試算表中生成 Gmail 搜尋篩選指令。

### 影響檔案 (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)
- [appsscript.json](file:///usr/local/google/home/chenghant/Project/Appscript/appsscript.json)

### 詳細變更 (Detailed Changes)
- 於 `appsscript.json` 的 `oauthScopes` 中補上 `spreadsheets` 權限範圍以支援讀寫與建立規則表。
- 實作信箱乾淨地址擷取輔助功能 `extractCleanEmail` 與規則對照工作表初始化輔助功能 `getOrCreateRulesSheet`。
- 重構 `autoOrganizeGmailWithGemini` 主邏輯：
  - 啟動時讀取 `AI_Rules` 並載入記憶體 Map。
  - 對信件的寄件者與收件者進行規則比對，命中則直接分類貼標籤（不消耗 API 金鑰）。
  - 未命中規則時，以 AI 分類，成功後將信箱、分類結果、搜尋指令 `from:email` 與時間寫回試算表。
- 修正 `callGeminiAPI` 為符合 Google 風格指南規範之 `callGeminiApi` 駝峰式命名。
- 修正程式註解錯字，將「重覆」修正為繁體「重複」。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.1.0] - 2026-06-10

### 變更動機 (Motivation)
- 修正 GmailWithGemini 腳本中 API 呼叫 URL 及例外處理安全防禦，補足 `appsscript.json` 權限範圍以防連線失敗，並重構系統日誌至全英文以符合開發規範。

### 影響檔案 (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)
- [appsscript.json](file:///usr/local/google/home/chenghant/Project/Appscript/appsscript.json)

### 詳細變更 (Detailed Changes)
- 將 `callGeminiAPI` 中的網址修正為正確的 `gemini-2.5-flash` API 端點。
- 重構 JSON 解析邏輯，先判定所有欄位層級再進行解析，並使用 `try-catch` 包裹。
- 將所有 `Logger.log` 系統輸出日誌翻譯為英文，並維持程式註解為繁體中文。
- 在 `appsscript.json` 的 `oauthScopes` 中補上 `gmail.modify` 和 `script.external_request` 權限範圍。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [3.7.1] - 2026-06-10

### 變更動機 (Motivation)
- 配合郵件記錄優化計畫 Task 1，在發送郵件前新增主控台日誌輸出，以利驗證與優化生成的信件內容。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 在 `sendEmailByRule` 函式中的 `MailApp.sendEmail` 之前，插入輸出信件主旨與本文的 `console.log` 語句。
- 更新 `Task - Cert Team` 版本號至 `3.7.1`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [3.7.0] - 2026-06-10

### 變更動機 (Motivation)
- 配合大量貼上支援優化計畫 Task 2，重構 `sendShippingNotification` 函式，以批次讀取儲存格值並支援範圍編輯（Bulk Paste）。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 重構 `sendShippingNotification` 取代單一儲存格處理，改為利用 `range.getValues()` 批次獲取編輯範圍的值。
- 檢查變更範圍是否包含規則目標欄位，遍歷受影響的列並發送通知。
- 修改 `testEmailNotificationIntegration` 中的模擬 Range 與 Sheet 物件，補上 `getValues`、`getNumColumns`、`getNumRows` 與 `getA1Notation` 模擬方法以支援新版通知流程測試。
- 更新 `Task - Cert Team` 版本號至 `3.7.0`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [1.4.0] - 2026-06-10

### 變更動機 (Motivation)
- 於 `handleDocumentChange` 實作並行鎖，避免重複發送通知。

### 影響檔案 (Affected Files)
- [Fuchsia_status_Notification](file:///usr/local/google/home/chenghant/Project/Appscript/Fuchsia_status_Notification)

### 詳細變更 (Detailed Changes)
- 在 `handleDocumentChange` 函式中引入 `LockService.getDocumentLock()`。
- 設定最多等待 15 秒（15000 毫秒）以取得鎖，若失敗則中止執行。
- 使用 `try-finally` 確保在執行結束或發生錯誤時釋放鎖。
- 更新 `Fuchsia_status_Notification` 版本號至 `1.4.0`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [3.6.1] - 2026-06-10

### 變更動機 (Motivation)
- 修正 `Fuchsia_status_Notification` 中的註解與日誌語言，以符合「程式碼註解強制全繁體中文，系統日誌與錯誤訊息強制全英文」的規範。

### 影響檔案 (Affected Files)
- [Fuchsia_status_Notification](file:///usr/local/google/home/chenghant/Project/Appscript/Fuchsia_status_Notification)

### 詳細變更 (Detailed Changes)
- 將 `Fuchsia_status_Notification` 中所有英文註解重構為繁體中文。
- 將 `Fuchsia_status_Notification` 中所有繁體中文的 `console.error` 與 `console.log` 訊息重構為英文。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [3.6.0] - 2026-06-10

### 變更動機 (Motivation)
- 配合郵件網關遷移計畫 Task 2，將 Google Chat 相關通知功能重構回電子郵件通知（`sendEmailByRule`），並清理相關的 Chat Webhook 輔助函式。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)
- [appsscript.json](file:///usr/local/google/home/chenghant/Project/Appscript/appsscript.json)

### 詳細變更 (Detailed Changes)
- 移除了 `sendChatNotificationByRule` 和 `postMessageToChat` 輔助函式。
- 新增 `sendEmailByRule` 函式，用於透過 `MailApp.sendEmail` 發送通知信件。
- 更新 `sendShippingNotification` 中的呼叫端點，由 `sendChatNotificationByRule(e, rule)` 改為 `sendEmailByRule(e, rule)`。
- 重構測試函式 `testChatNotificationIntegration` 為 `testEmailNotificationIntegration`，並更新測試日誌訊息。
- 更新腳本版本號至 `3.6.0`。
- 在 `appsscript.json` 的 `oauthScopes` 中新增 `"https://www.googleapis.com/auth/send_mail"` 權限以支援 `MailApp` 發送電子郵件。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 執行 `testEmailNotificationIntegration()` 驗證電子郵件發送邏輯是否運作正常。

## [3.5.0] - 2026-06-10

### 變更動機 (Motivation)
- 配合 Webhook 遷移計畫 Task 4，重構 `testChatNotificationIntegration` 測試函式，移除 API Token 診斷邏輯，改為模擬 Webhook 整合測試，以驗證 Webhook 功能。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 移除了 `testChatNotificationIntegration` 函式中獲取與輸出 OAuth Token 診斷資訊的程式碼區塊。
- 將測試開始的日誌訊息修改為 "Starting Chat API Webhook notification test..."。
- 更新腳本版本號至 `3.5.0`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 執行 `testChatNotificationIntegration()` 確認模擬事件能成功透過 Webhook 發送通知。

## [3.4.1] - 2026-06-10

### 變更動機 (Motivation)
- 修正 `sendChatNotificationByRule` 中呼叫 `postMessageToChat` 時傳入錯誤參數的問題。原先傳入已不存在的 `rule.space`，現改為 `rule.webhookUrl`。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 將 `sendChatNotificationByRule` 函式內的 `postMessageToChat(rule.space, message)` 修改為 `postMessageToChat(rule.webhookUrl, message)`。
- 更新腳本版本號至 `3.4.1`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [3.4.0] - 2026-06-10

### 變更動機 (Motivation)
- 重構 `postMessageToChat` 函式，改為使用 Google Chat REST API 發送訊息，以使用者個人身份發送，避免依賴進階服務。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 移除原先使用 `Chat.Spaces.Messages.create` 的舊版 `postMessageToChat` 實作。
- 使用 `UrlFetchApp.fetch` 與 `ScriptApp.getOAuthToken()` 重新實作 `postMessageToChat`，透過 Google Chat REST API (`https://chat.googleapis.com/v1/...`) 發送訊息。
- 增加對 HTTP 回應代碼的判斷（200/201 表示成功，其他表示失敗）並優化錯誤紀錄。
- 更新腳本版本號至 `3.4.0`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 執行 `testChatNotificationIntegration()` 進行整合測試，確認在沒有啟用 Google Chat 進階服務的情況下，是否仍能正常使用 REST API 發送通知。

## [資訊清單配置] - 2026-06-09

### 變更動機 (Motivation)
- 修正權限設定，將原本的機器人（Bot）身份改為以使用者個人身份（User-centric）發送 Google Chat 訊息，以符合個人化通知需求。

### 影響檔案 (Affected Files)
- [appsscript.json](file:///usr/local/google/home/chenghant/Project/Appscript/appsscript.json)

### 詳細變更 (Detailed Changes)
- 建立全新的 Apps Script 專案資訊清單 `appsscript.json`。
- 配置 `oauthScopes`，明確要求 `https://www.googleapis.com/auth/chat.messages.create` 權限範圍以替代 chatbot 權限。
- 在資訊清單中啟用進階 Google Chat 服務（版本為 `v1`）。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 上傳並部署 `appsscript.json` 到您的 Apps Script 專案中，並重新授權以完成個人身份綁定。

## [3.3.0] - 2026-06-09

### 變更動機 (Motivation)
- 新增測試用輔助函式以驗證 Google Chat API 整合是否運作正常。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 新增 `testChatNotificationIntegration()` 函式，模擬試算表編輯事件（包含 Sheet、Range 以及 Event 物件），並呼叫 `sendShippingNotification(e)`。
- 更新腳本版本號至 `3.3.0`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 執行 `testChatNotificationIntegration()` 函式，確認是否能成功模擬並發送通知到指定 Chat 空間。

## [3.2.2] - 2026-06-09

### 變更動機 (Motivation)
- 依據「程式碼註解強制全繁體中文」規範，重構部分英文及中英夾雜之註解。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 將第 4 行 `* Google Apps Script: Multi-Sheet & Multi-Condition Notification` 重構為 `* Google Apps Script：多分頁與多條件通知系統`。
- 將第 5 行 `* Google Apps Script: 多分頁、多條件自動化通知系統 (不含 Row Data 版)` 重構為 `* Google Apps Script：多分頁、多條件自動化通知系統 (不含整列資料版)`。
- 將第 17 及 26 行 `// B 欄 (1-based index)` 重構為 `// B 欄 (從 1 開始計算)`。
- 將第 53 行 `// 直接執行發送，不再抓取 Row Data` 重構為 `// 直接執行發送，不再抓取整列資料`。
- 更新腳本版本號至 `3.2.2`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [3.2.1] - 2026-06-09

### 變更動機 (Motivation)
- 重構程式碼註解以嚴格符合「程式碼註解強制全繁體中文」規範。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 將 `Global Configuration - 全域規則設定` 重構為 `全域設定`。
- 將 `// Google Chat Space` 註解重構為 `// Google Chat 空間`。
- 將 `sendShippingNotification` 的 JSDoc 英文說明重構為繁體中文 `編輯時觸發的主函式`。
- 將 `sendChatNotificationByRule` 的 JSDoc 英文說明重構為繁體中文 `依據規則發送 Chat 通知的輔助函式`。
- 更新腳本版本號至 `3.2.1`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [3.2.0] - 2026-06-09

### 變更動機 (Motivation)
- 依據實作計畫，將原本的郵件通知功能（`sendEmailByRule`）替換為 Google Chat 聊天室通知功能（`sendChatNotificationByRule`）。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 刪除舊的 `sendEmailByRule` 函式。
- 新增 `sendChatNotificationByRule(e, rule)` 函式，用於抓取指定欄位的值並發送 Markdown 格式的 Google Chat 訊息。
- 更新 `sendShippingNotification` 中的呼叫端點，由 `sendEmailByRule(e, rule)` 改為 `sendChatNotificationByRule(e, rule)`。
- 更新腳本版本號至 `3.2.0`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 驗證在編輯符合規則的儲存格時，是否能成功透過 `postMessageToChat` 發送 Chat 通知。

## [3.1.1] - 2026-06-09

### 變更動機 (Motivation)
- 修正 `postMessageToChat` 中的主控台日誌與錯誤訊息，將其由繁體中文改為英文，以符合全域規範（UI 與系統語言強制全英文）。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 將 `postMessageToChat` 中的 `console.log` 和 `console.error` 訊息翻譯為英文。
- 更新腳本版本號至 `3.1.1`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 無。

## [3.1.0] - 2026-06-09

### 變更動機 (Motivation)
- 實作 `postMessageToChat(space, text)` 輔助函式以支援透過 Google Chat API 發送通知。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 新增 `postMessageToChat(space, text)` 函式，使用 `Chat.Spaces.Messages.create` 發送訊息，並加入錯誤處理與日誌記錄。
- 更新腳本版本號至 `3.1.0`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 整合此輔助函式至主要通知流程中（取代或與郵件通知並行）。

## [3.0.1] - 2026-06-09

### 變更動機 (Motivation)
- 修正 `NOTIFICATION_RULES` 中的欄位索引錯誤。原先 `targetColumn` 設定為 `1`（並註解為 B 欄，但預期 Apps Script 的 `range.getColumn()` 是 1-based，即 A=1, B=2）。這導致 `column === rule.targetColumn` 在 B 欄編輯時比對失敗。
- 統一欄位索引邏輯：將 `targetColumn` 改為 1-based 索引，與 `detailColumn` 及 Apps Script 原生 API 保持一致。

### 影響檔案 (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 詳細變更 (Detailed Changes)
- 將 `Sample Request` 規則中的 `targetColumn` 從 `1` 修改為 `2`，並更新註解為 `// B 欄 (1-based index)`。
- 將 `Other Task Request` 規則中的 `targetColumn` 從 `1` 修改為 `2`，並更新註解為 `// B 欄 (1-based index)`。
- 更新腳本版本號至 `3.0.1`，日期更新為 `2026-06-09`。

### 後續待辦事項與技術斷點 (Next Steps & Technical Breakpoints)
- 驗證此修正是否能正確觸發 Google Chat 通知（需在實際試算表中編輯 B 欄並確認是否送出通知）。
