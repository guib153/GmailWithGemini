# ✉️ GmailWithGemini — 智慧郵件 AI 自動分類與分頁系統

`GmailWithGemini` 是一個基於 Google Apps Script (GAS) 與 Gemini 2.5 Flash API 開發的郵件智慧分類系統。它能透過強大的 AI 語意理解，全自動將未讀郵件分類、精煉摘要、套用標籤，並直接移入對應的 Gmail 收件匣分頁（如主要、社群、宣傳、最新快訊等），幫助您重獲乾淨有序的收件匣。

---

## 🚀 核心功能特性

* **100% 即時 AI 語意分析**：每封未讀信件均會直接呼叫 Gemini 2.5 Flash API，擺脫傳統規則比對的死板限制，精準判定類別與緊急度。
* **九大精準郵件類別**：支援將信件自動歸類至「工作」、「財務帳單」、「個人消費」、「系統通知」、「登入成功通知」、「廣告行銷」、「社群通知」、「個人隱私」、「Netflix」等 9 個獨立維度。
* **AI 資訊重點精煉 (`AI Refined Content`)**：由 AI 自動擷取 20 字以內之郵件核心摘要（例如 `面試邀請-面試官:張經理`），不需點開信件即可掌握大意。
* **Gmail 收件匣分頁自動歸位**：分類完成的郵件會同步移往對應的 Gmail 系統分頁（主要、社群、宣傳、最新快訊），維持收件匣的井然有序。
* **歷史信件一鍵同步工具**：內建 `syncExistingLabeledThreadsToCategories()` 免費同步工具，可在不呼叫 Gemini API（0 額度消耗）的前提下，一鍵將以往被分類的舊信件搬移至正確的分頁中。
* **工業級強健度設計 (Poison Pill & Exception Protection)**：
  * **佇列防鎖定機制**：API 判讀失敗的郵件會自動降級標記為「未分類」，避免其在後續執行中反覆重試導致排程卡死。
  * **單封異常隔離**：處理單一信件失敗時只會記錄錯誤，不會中斷整個批次排程。
  * **極限安全限制**：設有 4 秒呼叫緩衝與 30 封掃描上限，完全遵守免費版 API 的 15 RPM 頻率限制，防止 Apps Script 執行超時。
* **雲端歷史分析日誌**：每次執行時皆會自動記錄執行狀況至 `AI_Execution_Log` 與 `AI_Rules` 工作表中，並提供高質感斑馬線與緊急度條件格式化。

---

## 📂 專案結構

* `GmailWithGemini`：專案核心程式碼。包含全域設定、入口主排程、REST API 通訊、歷史同步與排版美化等模組。
* `appsscript.json`：Apps Script 專案權限宣告清單。
* `changenote.md`：版本變更日誌，遵循語意化版本管理規範。

---

## 🛠️ 安裝與部署指南

詳細的安裝與設定教學已嵌入在 `GmailWithGemini` 程式碼最末尾的說明區塊中。以下為簡要步驟：

### 1. 取得 Gemini API 金鑰
請前往 [Google AI Studio](https://aistudio.google.com/) 申請免費用戶 API 金鑰。

### 2. 建立 Google Apps Script 專案
1. 前往 [Google Apps Script](https://script.google.com/) 並建立新專案。
2. 將專案與程式碼檔案命名為 `GmailWithGemini`，複製本專案 `GmailWithGemini` 的程式碼覆蓋貼上。
3. 開啟專案設定，勾選「在編輯器中顯示 appsscript.json 資訊清單檔案」，將本專案的 `appsscript.json` 複製覆蓋貼上。

### 3. 設定 API 金鑰安全屬性
1. 進入專案設定，在「指令碼屬性」中新增：
   * **屬性 (Property)**：`GEMINI_API_KEY`
   * **值 (Value)**：貼上您申請的 Gemini API 金鑰。

### 4. 設定自動化觸發條件
1. 點擊左側「觸發條件 (時鐘圖示)」。
2. 新增觸發條件：執行函式 `autoOrganizeGmailWithGemini`，活動來源設為「時間驅動」，時間間隔可設定為「每 10 分鐘」或「每小時」。

---

## 📊 試算表日誌與管理

首次運行或手動測試執行後，系統會自動在您的雲端硬碟建立 `GmailWithGemini_Rules` 試算表（或在容器綁定的工作表下方新增分頁）：
* **`AI_Rules`**：保存每封信的 AI 判讀類別、緊急度、精煉內容，並提供 Gmail 搜尋指令 `from:email` 供快速點選複製。
* **`AI_Execution_Log`**：自動統計每次執行的時間、處理成功/失敗數、各緊急度總計、以及收件日期時間區間。

---

## 📄 開源授權

本專案採用 MIT 授權條款開源。
