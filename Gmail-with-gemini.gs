// ==================== 全域設定 ====================
// 1. 指令碼屬性中的 Gemini API 金鑰名稱
const GEMINI_API_KEY_PROPERTY = 'GEMINI_API_KEY';

// 2. Gmail 搜尋篩選條件 (排除已標籤的未讀信件，防止重複判讀)
const GMAIL_SEARCH_QUERY = 'is:unread -label:"AI/工作" -label:"AI/財務帳單" -label:"AI/個人消費" -label:"AI/系統通知" -label:"AI/登入成功通知" -label:"AI/廣告行銷" -label:"AI/社群通知" -label:"AI/個人隱私" -label:"AI/Netflix" -label:"AI/未分類"';

// 3. 每次掃描的信件對話串最大數量
const MAX_THREADS_TO_SCAN = 50;

// 4. 是否預設從時間最早 (最舊) 的郵件開始整理
const PROCESS_OLDEST_FIRST = true;

// 5. 單封郵件內文擷取字數上限，避免 Token 爆炸
const EMAIL_BODY_CHAR_LIMIT = 1000;

// 5.1 各工作表名稱
const RULES_SHEET_NAME = 'AI_Rules';
const EXECUTION_LOG_SHEET_NAME = 'AI_Execution_Log';
const UNCATEGORIZED_SHEET_NAME = 'AI_Uncategorized';
const LEARNING_RULES_SHEET_NAME = 'AI_LearningRules';
const PROMPT_CONFIG_SHEET_NAME = 'AI_PromptConfig';

// 6. 獨立試算表名稱（僅用於獨立腳本首次建立時）
const STANDALONE_SPREADSHEET_NAME = 'GmailWithGemini_Rules';

// 7. 指令碼屬性中的獨立試算表 ID 名稱
const STANDALONE_SPREADSHEET_PROPERTY = 'RULES_SHEET_ID';

// 8. API 呼叫設定
const API_MAX_RETRIES = 3;
const API_RETRY_BASE_DELAY_MS = 10000;

// 8.1 批次處理設定 (v3.0)
const BATCH_SIZE = 10;         // 每批次同時處理的信件數量
const BATCH_DELAY_MS = 2000;   // 批次之間的等待毫秒數

// 8.2 自動排程間隔 (v3.0)
const TRIGGER_INTERVAL_HOURS = 1; // 自動分類觸發間隔 (小時)：1=每小時, 2=每2小時

// 8.3 每日摘要 Email 收件人（留空則寄給執行腳本的帳號本身）
const DIGEST_RECIPIENT_EMAIL = '';

// 9. AI 分類對應的 Gmail 收件匣系統分頁標籤 ID
const CATEGORY_TAB_MAPPING = {
  "工作": "CATEGORY_PERSONAL",
  "財務帳單": "CATEGORY_UPDATES",
  "個人消費": "CATEGORY_UPDATES",
  "系統通知": "CATEGORY_UPDATES",
  "登入成功通知": "CATEGORY_UPDATES",
  "廣告行銷": "CATEGORY_PROMOTIONS",
  "社群通知": "CATEGORY_SOCIAL",
  "個人隱私": "CATEGORY_PERSONAL",
  "Netflix": "CATEGORY_UPDATES",
  "未分類": "CATEGORY_PERSONAL"
};

// 10. 合法分類列表（用於 AI_Uncategorized 下拉驗證）
const VALID_CATEGORIES = ["工作","財務帳單","個人消費","系統通知","登入成功通知","廣告行銷","社群通知","個人隱私","Netflix"];
// =========================================================================

// =========================================================================
// ==================== 可單獨執行之入口函式說明 (Runnable Functions) ====================
// =========================================================================
/**
 * 1. autoOrganizeGmailWithGemini()    — 智慧郵件分類主程式（批次 AI + 自主學習）
 * 2. syncExistingLabeledThreadsToCategories() — 歷史信件收件匣分頁一鍵同步
 * 3. processUncategorizedSheet()      — 處理 AI_Uncategorized 人工審查結果
 * 4. sendDailyDigest()                — 手動觸發今日重點摘要 Email
 * 5. setupTriggers()                  — 一鍵設定全部自動觸發器
 * 6. removeTriggers()                 — 移除全部觸發器（暫停自動執行）
 * 7. checkApiKeyStatus()              — API 金鑰診斷工具
 * 8. refreshAvailableModels()         — 手動刷新 AI_PromptConfig 的可用模型清單
 */
function autoOrganizeGmailWithGemini() {
  let successCount = 0, failureCount = 0;
  let highUrgencyCount = 0, mediumUrgencyCount = 0, lowUrgencyCount = 0;
  let categoryStats = {}, minDate = null, maxDate = null;
  let runSuccess = "Y", executionError = "";
  const executionTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");

  const apiKey = PropertiesService.getScriptProperties().getProperty(GEMINI_API_KEY_PROPERTY);
  if (!apiKey) {
    Logger.log("Error: GEMINI_API_KEY is not set in script properties.");
    return;
  }

  try {
    // 1. 預載自主學習規則
    const learningRules = loadLearningRules();
    Logger.log(`Loaded ${learningRules.size} learning rule(s).`);

    // 2. 預載 Prompt 設定
    const promptConfig = buildPromptFromSheet();
    Logger.log(`Prompt loaded: ${promptConfig.categories.length} cats, ${promptConfig.examples.length} examples, model: ${promptConfig.model}`);

    // 3. 取得試算表
    let sheet;
    try { sheet = getOrCreateRulesSheet(); } catch(e) { Logger.log("Sheet init error: " + e); }

    // 4. 搜尋未讀且未分類信件
    let threads = GmailApp.search(GMAIL_SEARCH_QUERY, 0, 50);
    if (threads.length === 0) {
      Logger.log("No unread threads found.");
    } else {
      if (PROCESS_OLDEST_FIRST) threads.reverse();
      threads = threads.slice(0, MAX_THREADS_TO_SCAN);
      Logger.log(`Found ${threads.length} thread(s) to classify.`);

      // 5. 分流：學習規則命中 vs. 需要 AI 判讀
      const preClassified = [], needsAI = [];
      threads.forEach(thread => {
        try {
          const msgs = thread.getMessages();
          if (!msgs.length) return;
          const last = msgs[msgs.length - 1];
          const rawSender = last.getFrom();
          const senderEmail = extractCleanEmail(rawSender);
          const subject = last.getSubject();
          const body = last.getPlainBody().substring(0, EMAIL_BODY_CHAR_LIMIT);
          if (learningRules.has(senderEmail)) {
            preClassified.push({ thread, rawSender, senderEmail, subject, body,
              category: learningRules.get(senderEmail), urgency: "低",
              refinedContent: `[學習規則命中] ${learningRules.get(senderEmail)}` });
          } else {
            needsAI.push({ thread, rawSender, senderEmail, subject, body });
          }
        } catch(e) { failureCount++; Logger.log("Pre-process error: " + e); }
      });

      // 6. 處理學習規則命中
      preClassified.forEach(item => {
        try {
          Logger.log(`[LearningRule] ${item.senderEmail} → ${item.category}`);
          applyClassificationToThread(item.thread, item.rawSender, item.senderEmail, item.subject,
            item.category, item.urgency, item.refinedContent, sheet);
          successCount++;
          categoryStats[item.category] = (categoryStats[item.category] || 0) + 1;
          lowUrgencyCount++;
          const d = item.thread.getLastMessageDate();
          if (!minDate || d < minDate) minDate = d;
          if (!maxDate || d > maxDate) maxDate = d;
        } catch(e) { failureCount++; Logger.log("LearningRule apply error: " + e); }
      });

      // 7. 批次 AI 分類
      for (let i = 0; i < needsAI.length; i += BATCH_SIZE) {
        const batch = needsAI.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(needsAI.length / BATCH_SIZE);
        Logger.log(`[Batch ${batchNum}/${totalBatches}] ${batch.length} email(s)...`);
        if (i > 0) Utilities.sleep(BATCH_DELAY_MS);
        const emailList = batch.map(item => ({sender: item.senderEmail, subject: item.subject, body: item.body}));
        const results = callGeminiApiBatchWithRetry(apiKey, emailList, promptConfig);
        batch.forEach((item, idx) => {
          try {
            let category, urgency, refinedContent;
            if (results && results[idx] && results[idx].category && results[idx].urgency) {
              category = results[idx].category;
              urgency = results[idx].urgency;
              refinedContent = results[idx].refinedContent || "";
              successCount++;
              categoryStats[category] = (categoryStats[category] || 0) + 1;
              if (urgency === "高") highUrgencyCount++;
              else if (urgency === "中") mediumUrgencyCount++;
              else lowUrgencyCount++;
              const d = item.thread.getLastMessageDate();
              if (!minDate || d < minDate) minDate = d;
              if (!maxDate || d > maxDate) maxDate = d;
              Logger.log(`[AI] ${item.senderEmail} → ${category} (${urgency})`);
            } else {
              failureCount++;
              category = "未分類"; urgency = "低";
              refinedContent = "AI批次判讀失敗，等待人工審查";
              Logger.log(`[Fallback] ${item.senderEmail} → 未分類`);
              try { logToUncategorizedSheet(item.thread, item.senderEmail, item.rawSender, item.subject, ""); } catch(e) {}
            }
            applyClassificationToThread(item.thread, item.rawSender, item.senderEmail,
              item.subject, category, urgency, refinedContent, sheet);
          } catch(e) { failureCount++; Logger.log(`Batch[${idx}] error: ` + e); }
        });
      }
      Logger.log("Email classification done!");
    }
  } catch(error) {
    runSuccess = "N";
    executionError = error.toString();
    Logger.log("Fatal error: " + executionError);
  } finally {
    try { writeExecutionLog(executionTime, minDate, maxDate, successCount, failureCount, highUrgencyCount, mediumUrgencyCount, lowUrgencyCount, categoryStats, runSuccess, executionError); } catch(e) {}
    try { processUncategorizedSheet(); } catch(e) { Logger.log("processUncategorizedSheet error: " + e); }
  }
}

/**
 * 輔助函式：套用分類標籤、更新 Gmail 分頁、寫入 AI_Rules 日誌
 */
function applyClassificationToThread(thread, rawSender, senderEmail, subject, category, urgency, refinedContent, sheet) {
  if (category && sheet) {
    try {
      const senderName = extractSenderName(rawSender);
      const searchQuery = `from:${senderEmail}`;
      const nowString = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
      sheet.appendRow([senderEmail, senderName, category, urgency, refinedContent, searchQuery, nowString]);
    } catch(e) { Logger.log("Sheet log error: " + e); }
  }
  if (category) {
    const labelName = "AI/" + category;
    let label = GmailApp.getUserLabelByName(labelName);
    if (!label) label = GmailApp.createLabel(labelName);
    thread.addLabel(label);
    const tabLabelId = CATEGORY_TAB_MAPPING[category];
    if (tabLabelId) moveThreadToGmailCategory(thread.getId(), tabLabelId);
  }
}

/**
 * 一次性歷史信件歸類工具。
 * 掃描所有歷史已歸類標籤 (AI/*) 的信件，並將其自動同步移至對應的 Gmail 分頁中。
 * 此執行完全不需呼叫 Gemini API。
 */
function syncExistingLabeledThreadsToCategories() {
  Logger.log("Starting historical email category migration...");
  try {
    for (const category in CATEGORY_TAB_MAPPING) {
      const tabLabelId = CATEGORY_TAB_MAPPING[category];
      const labelName = "AI/" + category;
      const label = GmailApp.getUserLabelByName(labelName);
      if (!label) continue;
      
      try {
        // 擷取前 100 封信（可根據需要重複執行以消化更大信量）
        const threads = label.getThreads(0, 100);
        Logger.log(`Found ${threads.length} threads labeled with '${labelName}'. Moving to ${tabLabelId}...`);
        
        threads.forEach((thread, index) => {
          if (index > 0) {
            Utilities.sleep(150); // 防範 API 頻率過載
          }
          moveThreadToGmailCategory(thread.getId(), tabLabelId);
        });
      } catch (labelError) {
        Logger.log(`Error processing label '${labelName}': ` + labelError.toString());
      }
    }
    Logger.log("Historical email category migration completed!");
  } catch (globalError) {
    Logger.log("Fatal error during historical email category migration: " + globalError.toString());
  }
}


/**
 * 擷取乾淨的電子信箱地址 (小寫)
 * @param {string} emailString 原始信件地址字串
 * @return {string} 乾淨的信箱地址
 */
function extractCleanEmail(emailString) {
  if (!emailString) return "";
  const match = emailString.match(/<([^>]+)>/);
  if (match) {
    return match[1].trim().toLowerCase();
  }
  return emailString.trim().toLowerCase();
}

/**
 * 美化試算表排版外觀並設定緊急度條件格式化規則
 * @param {Sheet} sheet Google Sheets 工作表物件
 */
function formatSheetAesthetics(sheet) {
  // 1. 設定欄位寬度防止內容遮擋
  sheet.setColumnWidth(1, 240); // 電子信箱
  sheet.setColumnWidth(2, 160); // 寄件者名稱
  sheet.setColumnWidth(3, 110); // 類別
  sheet.setColumnWidth(4, 90);  // 緊急度
  sheet.setColumnWidth(5, 280); // AI 精煉內容
  sheet.setColumnWidth(6, 200); // Gmail 搜尋字串
  sheet.setColumnWidth(7, 160); // 更新時間
  
  // 2. 套用 A1:G1000 之交替背景色彩 (斑馬線)
  const fullRange = sheet.getRange("A1:G1000");
  fullRange.clearFormat(); // 清除舊格式
  
  // 清理現存的所有交替背景設定 (Bandings) 避免衝突
  const bandings = sheet.getBandings();
  bandings.forEach(banding => banding.remove());
  
  const banding = fullRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  banding.setHeaderRowColor('#2D3748').setFirstRowColor('#FFFFFF').setSecondRowColor('#F7FAFC');
  
  // 3. 設定標題列樣式 ( setAlternatingRowColors 會重製背景，需再將標題文字改為純白粗體)
  const headerRange = sheet.getRange(1, 1, 1, 7);
  headerRange.setFontFamily("Arial")
             .setFontSize(10)
             .setFontWeight("bold")
             .setFontColor("#FFFFFF")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");
             
  sheet.setRowHeight(1, 28); // 設定標題列高度
  
  // 4. 設定資料欄之水平與垂直對齊
  sheet.getRange("A2:A1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("B2:B1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("C2:C1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D2:D1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("E2:E1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("F2:F1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("G2:G1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  
  // 5. 設定緊急度 (D欄) 條件格式化規則 (高:紅, 中:黃, 低:綠)
  const urgencyRange = sheet.getRange("D2:D1000");
  
  const ruleHigh = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("高")
      .setBackground("#FEE2E2") // 淺紅
      .setFontColor("#991B1B") // 深紅
      .setBold(true)
      .setRanges([urgencyRange])
      .build();
      
  const ruleMedium = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("中")
      .setBackground("#FEF3C7") // 淺黃
      .setFontColor("#92400E") // 深黃
      .setBold(true)
      .setRanges([urgencyRange])
      .build();
      
  const ruleLow = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("低")
      .setBackground("#DCFCE7") // 淺綠
      .setFontColor("#166534") // 深綠
      .setRanges([urgencyRange])
      .build();
      
  sheet.setConditionalFormatRules([ruleHigh, ruleMedium, ruleLow]);
  Logger.log("Applied premium aesthetic formats and conditional rules to AI_Rules sheet.");
}

/**
 * 取得或自動建立 AI_Rules 工作表
 * @return {Sheet} Google Sheets 工作表物件
 */
function getOrCreateRulesSheet() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const properties = PropertiesService.getScriptProperties();
    let sheetId = properties.getProperty(STANDALONE_SPREADSHEET_PROPERTY);
    if (sheetId) {
      try {
        ss = SpreadsheetApp.openById(sheetId);
      } catch (e) {
        Logger.log("Failed to open spreadsheet by ID, creating a new one: " + e.toString());
      }
    }
    if (!ss) {
      ss = SpreadsheetApp.create(STANDALONE_SPREADSHEET_NAME);
      properties.setProperty(STANDALONE_SPREADSHEET_PROPERTY, ss.getId());
      Logger.log("Created a new standalone rules spreadsheet with ID: " + ss.getId());
    }
  }
  
  let sheet = ss.getSheetByName(RULES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(RULES_SHEET_NAME);
    // 初始化標題列
    sheet.appendRow(["Email", "Sender Name", "Category", "Urgency", "AI Refined Content", "Gmail Search Query", "Updated Time"]);
    sheet.setFrozenRows(1);
    formatSheetAesthetics(sheet);
    Logger.log("Created AI_Rules sheet and applied aesthetic rules.");
  } else if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    // 自我修復：若工作表內容被清空，重新寫入標題與格式化
    sheet.appendRow(["Email", "Sender Name", "Category", "Urgency", "AI Refined Content", "Gmail Search Query", "Updated Time"]);
    sheet.setFrozenRows(1);
    formatSheetAesthetics(sheet);
    Logger.log("Recovered empty AI_Rules sheet headers and applied aesthetics.");
  } else {
    // 升級舊版格式 (如果缺少 Sender Name 欄位)
    if (sheet.getLastColumn() > 0 && sheet.getRange(1, 2).getValue() !== "Sender Name") {
      sheet.insertColumnBefore(2);
      sheet.getRange(1, 2).setValue("Sender Name");
      Logger.log("Migrated AI_Rules sheet: Inserted 'Sender Name' column at index 2.");
    }
    // 升級舊版格式 (如果缺少 AI Refined Content 欄位)
    if (sheet.getLastColumn() > 0 && sheet.getRange(1, 5).getValue() !== "AI Refined Content") {
      sheet.insertColumnBefore(5);
      sheet.getRange(1, 5).setValue("AI Refined Content");
      Logger.log("Migrated AI_Rules sheet: Inserted 'AI Refined Content' column at index 5.");
    }
    // 套用易讀外觀排版樣式與條件規則
    formatSheetAesthetics(sheet);
  }
  return sheet;
}

/**
 * 擷取寄件者名稱
 * @param {string} senderString 原始寄件者欄位字串 (如 "KGI Bank <card999@kgibank.com>")
 * @return {string} 寄件者名稱
 */
function extractSenderName(senderString) {
  if (!senderString) return "";
  const match = senderString.match(/^"?([^"<]+)"?\s*</);
  if (match) {
    return match[1].trim();
  }
  const emailMatch = senderString.match(/^([^@]+)@/);
  if (emailMatch) {
    return emailMatch[1].trim();
  }
  return senderString.trim();
}

/**
 * 寫入執行統計日誌至單獨的工作表中
 */
function writeExecutionLog(timeString, minDate, maxDate, successCount, failureCount, highUrgency, mediumUrgency, lowUrgency, categoryStats, successYn, errorMsg) {
  const sheet = getOrCreateExecutionLogSheet();
  if (!sheet) return;
  
  // 1. 彙整信件收件時間區間字串
  let dateRangeStr = "N/A";
  if (minDate && maxDate) {
    const tz = Session.getScriptTimeZone();
    const minStr = Utilities.formatDate(minDate, tz, "yyyy-MM-dd HH:mm");
    const maxStr = Utilities.formatDate(maxDate, tz, "yyyy-MM-dd HH:mm");
    dateRangeStr = `${minStr} ~ ${maxStr}`;
  }
  
  // 2. 彙整分類佔比字串 (例如：工作(2), Netflix(1))
  const statsList = [];
  for (const cat in categoryStats) {
    statsList.push(`${cat}(${categoryStats[cat]})`);
  }
  const categoryBreakdown = statsList.length > 0 ? statsList.join(", ") : "None";
  
  // 3. 寫入列資料：Execution Time, Email Date Range, Success Count, Failure Count, High, Medium, Low, Category Distribution, Finished Successfully, Error Message
  sheet.appendRow([timeString, dateRangeStr, successCount, failureCount, highUrgency, mediumUrgency, lowUrgency, categoryBreakdown, successYn, errorMsg]);
  Logger.log("Successfully logged execution stats.");
}

/**
 * 取得或自動建立 AI_Execution_Log 工作表
 * @return {Sheet} Google Sheets 工作表物件
 */
function getOrCreateExecutionLogSheet() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const properties = PropertiesService.getScriptProperties();
    let sheetId = properties.getProperty(STANDALONE_SPREADSHEET_PROPERTY);
    if (sheetId) {
      try {
        ss = SpreadsheetApp.openById(sheetId);
      } catch (e) {
        Logger.log("Failed to open spreadsheet by ID: " + e.toString());
      }
    }
  }
  if (!ss) return null;
  
  let sheet = ss.getSheetByName(EXECUTION_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(EXECUTION_LOG_SHEET_NAME);
    // 初始化標題
    sheet.appendRow(["Execution Time", "Email Date Range", "Success Count", "Failure Count", "High Urgency", "Medium Urgency", "Low Urgency", "Category Distribution", "Finished Successfully", "Error Message"]);
    sheet.setFrozenRows(1);
    formatExecutionLogSheetAesthetics(sheet);
    Logger.log("Created AI_Execution_Log sheet and initialized formatting.");
  } else if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    // 自我修復：如果工作表被清空，重置標題與格式
    sheet.appendRow(["Execution Time", "Email Date Range", "Success Count", "Failure Count", "High Urgency", "Medium Urgency", "Low Urgency", "Category Distribution", "Finished Successfully", "Error Message"]);
    sheet.setFrozenRows(1);
    formatExecutionLogSheetAesthetics(sheet);
    Logger.log("Recovered empty AI_Execution_Log sheet headers.");
  }
  return sheet;
}

/**
 * 美化統計日誌工作表排版外觀並設定執行狀態條件格式化規則
 * @param {Sheet} sheet Google Sheets 工作表物件
 */
function formatExecutionLogSheetAesthetics(sheet) {
  // 1. 設定欄位寬度
  sheet.setColumnWidth(1, 140);  // Execution Time
  sheet.setColumnWidth(2, 260);  // Email Date Range
  sheet.setColumnWidth(3, 100);  // Success Count
  sheet.setColumnWidth(4, 100);  // Failure Count
  sheet.setColumnWidth(5, 90);   // High Urgency
  sheet.setColumnWidth(6, 90);   // Medium Urgency
  sheet.setColumnWidth(7, 90);   // Low Urgency
  sheet.setColumnWidth(8, 220);  // Category Distribution
  sheet.setColumnWidth(9, 160);  // Finished Successfully
  sheet.setColumnWidth(10, 260); // Error Message
  
  // 2. 套用 A1:J1000 之交替背景底色 (斑馬線)
  const fullRange = sheet.getRange("A1:J1000");
  fullRange.clearFormat(); // 清除舊格式
  
  const bandings = sheet.getBandings();
  bandings.forEach(banding => banding.remove());
  
  const banding = fullRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  banding.setHeaderRowColor('#2D3748').setFirstRowColor('#FFFFFF').setSecondRowColor('#F7FAFC');
  
  // 3. 設定標題列樣式 (純白粗體)
  const headerRange = sheet.getRange(1, 1, 1, 10);
  headerRange.setFontFamily("Arial")
             .setFontSize(10)
             .setFontWeight("bold")
             .setFontColor("#FFFFFF")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");
             
  sheet.setRowHeight(1, 28); // 設定高度
  
  // 4. 設定資料欄之水平置中與對齊方式
  sheet.getRange("A2:A1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("B2:B1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("C2:C1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D2:D1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("E2:E1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("F2:F1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("G2:G1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("H2:H1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("I2:I1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("J2:J1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  
  // 5. 設定 Finished Successfully (I欄) 條件格式化規則 (Y:綠, N:紅)
  const statusRange = sheet.getRange("I2:I1000");
  
  const ruleY = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Y")
      .setBackground("#DCFCE7") // 淺綠
      .setFontColor("#166534") // 深綠
      .setBold(true)
      .setRanges([statusRange])
      .build();
      
  const ruleN = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("N")
      .setBackground("#FEE2E2") // 淺紅
      .setFontColor("#991B1B") // 深紅
      .setBold(true)
      .setRanges([statusRange])
      .build();
      
  sheet.setConditionalFormatRules([ruleY, ruleN]);
  Logger.log("Applied premium aesthetic formats and conditional rules to AI_Execution_Log sheet.");
}

/**
 * 使用 Gmail REST API 將指定的 thread 移動到合適的 Gmail 收件匣分頁 (Category)
 * @param {string} threadId Gmail 對話串 ID
 * @param {string} tabLabelId Gmail 系統分頁標籤 ID (如 "CATEGORY_SOCIAL")
 */
function moveThreadToGmailCategory(threadId, tabLabelId) {
  if (!threadId || !tabLabelId) return;
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`;
  const token = ScriptApp.getOAuthToken();
  
  // 為了防止重複出現在多個分頁，加入該分頁，並移除其他系統分頁標籤
  const systemCategories = [
    "CATEGORY_PERSONAL",
    "CATEGORY_SOCIAL",
    "CATEGORY_PROMOTIONS",
    "CATEGORY_UPDATES",
    "CATEGORY_FORUMS"
  ];
  const removeLabelIds = systemCategories.filter(cat => cat !== tabLabelId);
  
  const payload = {
    "addLabelIds": [tabLabelId],
    "removeLabelIds": removeLabelIds
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "Authorization": "Bearer " + token
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    if (code !== 200) {
      Logger.log(`Warning: Failed to set Gmail category for thread ${threadId}. Code: ${code}, Body: ${response.getContentText()}`);
    } else {
      Logger.log(`Successfully moved thread ${threadId} to Gmail Category: ${tabLabelId}`);
    }
  } catch (e) {
    Logger.log(`Error calling Gmail API for thread ${threadId}: ` + e.toString());
  }
}


// =========================================================================
// ==================== 批次 AI 分類函式 (v3.0) ====================
// =========================================================================

/**
 * 批次 AI 分類：一次傳送最多 BATCH_SIZE 封郵件，要求 AI 依序回傳結果陣列
 * @param {string} apiKey
 * @param {Array} emailList [{sender, subject, body}, ...]
 * @param {Object} promptConfig {categories, urgencyHigh, urgencyMid, urgencyLow, examples, roleDesc, model}
 * @return {Array|null} 結果陣列 [{category, urgency, refinedContent}, ...] 或 null
 */
function callGeminiApiBatch(apiKey, emailList, promptConfig) {
  const model = (promptConfig && promptConfig.model) ? promptConfig.model : 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // 動態組裝分類規範
  const categoriesText = (promptConfig && promptConfig.categories && promptConfig.categories.length > 0)
    ? promptConfig.categories.map((c, i) => `${i+1}. 「${c.name}」：${c.desc}${c.note ? ' *注意*：' + c.note : ''}`).join('\n')
    : `1. 「工作」：專屬個人的商務溝通、求職互動信件。\n2. 「財務帳單」：銀行交易明細、電子發票、帳單繳費通知。\n3. 「個人消費」：線上購物訂單確認、出貨/送達通知。\n4. 「系統通知」：自動化系統警報、帳號啟用信、安全性驗證碼 (OTP)。\n5. 「登入成功通知」：各家銀行或網站服務發送之安全「登入成功」確認信。\n6. 「廣告行銷」：電子報、促銷廣告、折價券、產品推廣信。\n7. 「社群通知」：社群平台群發的推廣或動態摘要信。\n8. 「個人隱私」：親友的個人來信、私人旅遊訂房/機票確認信。\n9. 「Netflix」：Netflix（含 @account.netflix.com 或 netflix.com 域名）發送之所有信件。`;

  const categoryEnums = (promptConfig && promptConfig.categories && promptConfig.categories.length > 0)
    ? promptConfig.categories.map(c => c.name)
    : VALID_CATEGORIES;

  // 動態組裝 Few-Shot 範例
  const defaultExamples = `- *範例 1 (工作個人私訊)*：\n  - 寄件者：\`LinkedIn <messages-noreply@linkedin.com>\`，標題：\`王大明傳送了訊息給您\`，內文：\`嗨，想跟您聊聊...\`\n  - 判定結果：\`category: "工作"\`, \`urgency: "中"\`, \`refinedContent: "LinkedIn私訊-王大明:想聊聊履歷"\`\n- *範例 2 (個人消費訂單)*：\n  - 寄件者：\`Shopee <info@shopee.tw>\`，標題：\`訂單成立通知\`，內文：\`感謝您的消費，消費金額 NT$ 500 元...\`\n  - 判定結果：\`category: "個人消費"\`, \`urgency: "低"\`, \`refinedContent: "蝦皮購物-訂單成立-NT$500"\``;
  const examplesText = (promptConfig && promptConfig.examples && promptConfig.examples.length > 0)
    ? promptConfig.examples.map((ex, i) => `- *範例 ${i+1} (${ex.label})*：\n  - 寄件者：\`${ex.sender}\`，標題：\`${ex.subject}\`，內文：\`${ex.body}\`\n  - 判定結果：\`category: "${ex.category}"\`, \`urgency: "${ex.urgency}"\`, \`refinedContent: "${ex.refined}"\``).join('\n')
    : defaultExamples;

  const urgencyHigh = (promptConfig && promptConfig.urgencyHigh) || '需要即時關注或動作之信件。例如：驗證碼 (OTP)、登入異常安全警報、信用卡消費疑慮。';
  const urgencyMid  = (promptConfig && promptConfig.urgencyMid)  || '有時效性但無須立刻處理之信件。例如：幾天內到期的繳費帳單、工作會議預約、待辦任務。';
  const urgencyLow  = (promptConfig && promptConfig.urgencyLow)  || '單純資訊告知或不具時效性之信件。例如：廣告行銷促銷、登入成功通知、社群動態提醒。';
  const roleDesc    = (promptConfig && promptConfig.roleDesc)    || '您是一位專業的智慧郵件分類秘書。請詳細分析以下郵件的寄件者、標題與內文，並依據分類規範決定其類別與緊急度。';

  // 組裝批次郵件列表文字
  const emailsText = emailList.map((em, idx) => `[郵件 ${idx+1}]\n寄件者：${em.sender}\n標題：${em.subject}\n內文：${em.body}`).join('\n---\n');

  const promptText = `${roleDesc}

【處理步驟指引 (Chain of Thought)】
1. **識別寄件主體**：判斷寄件者是何種平台或組織。
2. **區分受眾屬性**：分析此郵件是「僅針對收件人個人的互動/通知」，或是「批次群發的非即時摘要/推廣」。
3. **匹配分類與緊急度**：依據以下規範進行分類與緊急度評估。
4. **資訊提煉**：精煉出 20 字以內之郵件大意（僅保留關鍵資訊與數據）。

【分類類別規範】
${categoriesText}

【緊急度評判規範】
- 「高」：${urgencyHigh}
- 「中」：${urgencyMid}
- 「低」：${urgencyLow}

【範例對照指引 (Few-Shot Examples)】
${examplesText}

請對以下 ${emailList.length} 封郵件依序進行分析，並以 JSON 陣列格式回傳結果（陣列中第 i 個物件對應第 i 封郵件）：
---
${emailsText}
---
請嚴格依據規定的 JSON Schema 結構輸出分析結果。`;

  const payload = {
    "contents": [{"parts": [{"text": promptText}]}],
    "generationConfig": {
      "responseMimeType": "application/json",
      "responseSchema": {
        "type": "ARRAY",
        "items": {
          "type": "OBJECT",
          "properties": {
            "category": {"type": "STRING", "enum": categoryEnums},
            "urgency":  {"type": "STRING", "enum": ["高", "中", "低"]},
            "refinedContent": {"type": "STRING"}
          },
          "required": ["category", "urgency", "refinedContent"]
        }
      }
    }
  };

  const options = {"method": "post", "contentType": "application/json", "payload": JSON.stringify(payload), "muteHttpExceptions": true};
  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const responseText = response.getContentText();
    if (code === 429) throw new Error('429 Rate Limit Exceeded: ' + responseText.substring(0, 200));
    if (code === 200) {
      const json = JSON.parse(responseText);
      if (json && json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0]) {
        const contentText = json.candidates[0].content.parts[0].text;
        try {
          const result = JSON.parse(contentText);
          if (Array.isArray(result)) return result;
          Logger.log('Batch API returned non-array result: ' + contentText.substring(0, 200));
          return null;
        } catch(e) { Logger.log('Failed to parse batch JSON: ' + e); return null; }
      }
    }
    Logger.log('Batch API error ' + code + ': ' + responseText.substring(0, 300));
    return null;
  } catch(e) {
    Logger.log('Exception in callGeminiApiBatch: ' + e);
    throw e; // re-throw for retry handler
  }
}

/**
 * 批次 AI 分類重試包裝器
 */
function callGeminiApiBatchWithRetry(apiKey, emailList, promptConfig) {
  for (let attempt = 0; attempt <= API_MAX_RETRIES; attempt++) {
    try {
      return callGeminiApiBatch(apiKey, emailList, promptConfig);
    } catch(e) {
      if (e.message && e.message.indexOf('429') !== -1 && attempt < API_MAX_RETRIES) {
        const wait = API_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        Logger.log(`Rate limit (429). Retry ${attempt+1}/${API_MAX_RETRIES} after ${wait/1000}s...`);
        Utilities.sleep(wait);
      } else if (e.message && e.message.indexOf('429') !== -1) {
        Logger.log('Rate limit: all retries exhausted.');
        return null;
      } else { throw e; }
    }
  }
  return null;
}

// =========================================================================
// ==================== AI_PromptConfig 系列函式 (v3.0) ====================
// =========================================================================

/** 取得或建立 AI_PromptConfig 工作表，並初始化預設內容 */
function getOrCreateSpreadsheet_() {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const props = PropertiesService.getScriptProperties();
    let id = props.getProperty(STANDALONE_SPREADSHEET_PROPERTY);
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch(e) {} }
    if (!ss) {
      ss = SpreadsheetApp.create(STANDALONE_SPREADSHEET_NAME);
      props.setProperty(STANDALONE_SPREADSHEET_PROPERTY, ss.getId());
    }
  }
  return ss;
}

function getOrCreatePromptConfigSheet() {
  const ss = getOrCreateSpreadsheet_();
  let sheet = ss.getSheetByName(PROMPT_CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PROMPT_CONFIG_SHEET_NAME);
    // 【區塊零：模型設定】
    sheet.getRange('A1').setValue('【區塊零：模型設定】');
    sheet.getRange('A2').setValue('目前使用模型');
    sheet.getRange('B2').setValue('gemini-2.5-flash');
    sheet.getRange('A3').setValue('上次更新模型清單');
    sheet.getRange('B3').setValue('尚未刷新，請執行 refreshAvailableModels()');
    sheet.getRange('A4').setValue('可用模型清單 (供參考)');
    sheet.getRange('B4').setValue('gemini-2.5-flash, gemini-3-flash, gemini-3.5-flash');
    // 【區塊一：角色指令】
    sheet.getRange('A6').setValue('【區塊一：角色指令】');
    sheet.getRange('A7').setValue('角色說明');
    sheet.getRange('B7').setValue('您是一位專業的智慧郵件分類秘書。請詳細分析以下郵件的寄件者、標題與內文，並依據分類規範決定其類別與緊急度。同時，請精煉該信件的關鍵核心內容。');
    sheet.getRange('A8').setValue('緊急度-高');
    sheet.getRange('B8').setValue('需要即時關注或動作之信件。例如：驗證碼 (OTP)、登入異常安全警報、信用卡消費疑慮、急需處理的工作阻礙。');
    sheet.getRange('A9').setValue('緊急度-中');
    sheet.getRange('B9').setValue('有時效性但無須立刻處理之信件。例如：幾天內到期的繳費帳單、工作會議預約、待辦任務。');
    sheet.getRange('A10').setValue('緊急度-低');
    sheet.getRange('B10').setValue('單純資訊告知或不具時效性之信件。例如：廣告行銷促銷、登入成功通知、社群動態提醒。');
    // 【區塊二：分類類別定義】
    sheet.getRange('A12').setValue('【區塊二：分類類別定義】');
    sheet.getRange('A13:D13').setValues([['類別名稱', '詳細說明', '備註/特殊規則', '啟用']]);
    const defaultCategories = [
      ['工作', '專屬個人的商務溝通、工作任務協作通知、求職互動信件（如：104人力銀行面試邀請）、社群平台個人對話（如：LinkedIn 專屬私訊/聯絡人信件）。', '必須是針對收件者個人的互動或行動信件。若為群發的職缺電子報或動態摘要，必須分類為「社群通知」或「廣告行銷」。', '✅'],
      ['財務帳單', '銀行交易明細、電子發票、帳單繳費通知、收據憑證、信用卡消費通知。', '', '✅'],
      ['個人消費', '線上購物訂單確認、出貨/送達通知、外送平台明細、線下實體店面消費發票。', '', '✅'],
      ['系統通知', '自動化系統警報、帳號啟用信、安全性驗證碼 (OTP)。', '', '✅'],
      ['登入成功通知', '各家銀行或網站服務發送之安全「登入成功」確認信。', '', '✅'],
      ['廣告行銷', '電子報、促銷廣告、折價券、產品推廣信。', '', '✅'],
      ['社群通知', '社群平台群發的推廣或動態摘要信（如：LinkedIn 職缺推薦週報、Facebook 動態摘要）。', '', '✅'],
      ['個人隱私', '親友的個人來信、私人旅遊訂房/機票確認信。', '', '✅'],
      ['Netflix', 'Netflix（含 @account.netflix.com 或 netflix.com 域名）發送之所有信件，例如：電子發票收據、帳戶安全提示、推薦觀看片單。', '', '✅']
    ];
    sheet.getRange(14, 1, defaultCategories.length, 4).setValues(defaultCategories);
    // 【區塊三：Few-Shot 範例】
    const catEndRow = 14 + defaultCategories.length;
    sheet.getRange(catEndRow + 1, 1).setValue('【區塊三：Few-Shot 範例】');
    sheet.getRange(catEndRow + 2, 1, 1, 8).setValues([['範例說明', '寄件者', '主旨關鍵字', '內文摘要', '正確分類', '正確緊急度', '精煉摘要範例', '啟用']]);
    const defaultExamples = [
      ['工作個人私訊', 'LinkedIn <messages-noreply@linkedin.com>', '傳送了訊息給您', '嗨，我看到您的履歷，想跟您聊聊...', '工作', '中', 'LinkedIn私訊-王大明:想聊聊履歷', '✅'],
      ['社群群發週報', 'LinkedIn <jobs-listings@linkedin.com>', '這些是適合您的職缺', '這週有 15 個符合您軟體工程師背景的新職缺...', '社群通知', '低', 'LinkedIn-軟體工程師職缺推薦週報', '✅'],
      ['個人消費訂單', 'Shopee <info@shopee.tw>', '訂單成立通知', '感謝您的消費，訂單編號 123456 已成立，消費金額 NT$ 500 元...', '個人消費', '低', '蝦皮購物-訂單成立-金額NT$500', '✅'],
      ['登入成功通知', 'kgi@kgibank.com.tw', '網路銀行登入成功通知', '您於 2026-06-11 12:00 成功登入網路銀行，若非本人請聯絡客服...', '登入成功通知', '低', '凱基銀行-登入成功提醒', '✅'],
      ['系統驗證碼', 'service@shopee.tw', '帳號變更驗證碼', '您的驗證碼為 987654，請於 5 分鐘內輸入完畢。', '系統通知', '高', '蝦皮購物-驗證碼:987654', '✅'],
      ['Netflix登入驗證碼', 'info@account.netflix.com', 'Netflix：您的登入碼', '您的登入碼為 123456，請在 15 分鐘內輸入...', 'Netflix', '高', 'Netflix-登入碼:123456', '✅'],
      ['Netflix同戶裝置確認', 'info@account.netflix.com', '確認信：您已確認Netflix 同戶裝置', '您的電視已設定為此帳號的同戶裝置之一...', 'Netflix', '中', 'Netflix-同戶裝置已確認', '✅']
    ];
    sheet.getRange(catEndRow + 3, 1, defaultExamples.length, 8).setValues(defaultExamples);
    // 格式化
    sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 350); sheet.setColumnWidth(3, 120);
    sheet.setColumnWidth(4, 120); sheet.setColumnWidth(5, 100); sheet.setColumnWidth(6, 80);
    sheet.setColumnWidth(7, 220); sheet.setColumnWidth(8, 60);
    sheet.getRange('A1').setFontWeight('bold').setBackground('#2D3748').setFontColor('#FFFFFF');
    sheet.getRange('A6').setFontWeight('bold').setBackground('#2D3748').setFontColor('#FFFFFF');
    sheet.getRange('A12').setFontWeight('bold').setBackground('#2D3748').setFontColor('#FFFFFF');
    sheet.getRange(catEndRow + 1, 1).setFontWeight('bold').setBackground('#2D3748').setFontColor('#FFFFFF');
    Logger.log('Created AI_PromptConfig sheet with default content.');
  }
  return sheet;
}

/**
 * 從 AI_PromptConfig 工作表讀取並組裝 Prompt 設定物件（快取用）
 * @return {Object} {categories, urgencyHigh, urgencyMid, urgencyLow, examples, roleDesc, model}
 */
function buildPromptFromSheet() {
  try {
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(1, 1, lastRow, 8).getValues();

    let roleDesc = '', urgencyHigh = '', urgencyMid = '', urgencyLow = '', model = 'gemini-2.5-flash';
    const categories = [], examples = [];
    let mode = 'zero'; // zero | one | two | three

    data.forEach((row, i) => {
      const a = String(row[0] || '').trim();
      const b = String(row[1] || '').trim();
      if (a.indexOf('區塊零') !== -1) { mode = 'zero'; return; }
      if (a.indexOf('區塊一') !== -1) { mode = 'one'; return; }
      if (a.indexOf('區塊二') !== -1) { mode = 'two'; return; }
      if (a.indexOf('區塊三') !== -1) { mode = 'three'; return; }

      if (mode === 'zero') {
        if (a === '目前使用模型' && b) model = b;
      } else if (mode === 'one') {
        if (a === '角色說明') roleDesc = b;
        if (a === '緊急度-高') urgencyHigh = b;
        if (a === '緊急度-中') urgencyMid = b;
        if (a === '緊急度-低') urgencyLow = b;
      } else if (mode === 'two') {
        // 標題列跳過（類別名稱 = 標題）
        if (a === '類別名稱' || !a) return;
        const enabled = String(row[3] || '').trim();
        if (enabled !== '❌') {
          categories.push({ name: a, desc: b, note: String(row[2] || '').trim() });
        }
      } else if (mode === 'three') {
        if (a === '範例說明' || !a) return;
        const enabled = String(row[7] || '').trim();
        if (enabled !== '❌') {
          examples.push({ label: a, sender: b, subject: String(row[2]||''), body: String(row[3]||''),
            category: String(row[4]||''), urgency: String(row[5]||''), refined: String(row[6]||'') });
        }
      }
    });
    Logger.log(`buildPromptFromSheet: model=${model}, cats=${categories.length}, examples=${examples.length}`);
    return { model, roleDesc, urgencyHigh, urgencyMid, urgencyLow, categories, examples };
  } catch(e) {
    Logger.log('buildPromptFromSheet failed, using defaults: ' + e);
    return { model: 'gemini-2.5-flash', roleDesc: '', urgencyHigh: '', urgencyMid: '', urgencyLow: '', categories: [], examples: [] };
  }
}

/**
 * 呼叫 Gemini API 取得可用模型清單，並更新 AI_PromptConfig 的下拉選單
 */
function refreshAvailableModels() {
  const apiKey = PropertiesService.getScriptProperties().getProperty(GEMINI_API_KEY_PROPERTY);
  if (!apiKey) { Logger.log('refreshAvailableModels: API key not set.'); return; }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const resp = UrlFetchApp.fetch(url, {method:'get', muteHttpExceptions:true});
    if (resp.getResponseCode() !== 200) { Logger.log('refreshAvailableModels API error: ' + resp.getResponseCode()); return; }
    const json = JSON.parse(resp.getContentText());
    const models = (json.models || []).filter(m => {
      const name = (m.name || '').toLowerCase();
      const methods = m.supportedGenerationMethods || [];
      return methods.includes('generateContent') && (name.includes('flash') || name.includes('lite'));
    }).map(m => m.name.replace('models/', ''));
    if (models.length === 0) { Logger.log('refreshAvailableModels: no suitable models found.'); return; }
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(1, 1, lastRow, 1).getValues();
    // 找到「目前使用模型」所在列
    let modelRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === '目前使用模型') { modelRow = i + 1; break; }
    }
    if (modelRow > 0) {
      // 設定下拉選單驗證
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(models, true).build();
      sheet.getRange(modelRow, 2).setDataValidation(rule);
      // 更新可用模型清單顯示欄
      let listRow = -1;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === '可用模型清單 (供參考)') { listRow = i + 1; break; }
      }
      if (listRow > 0) sheet.getRange(listRow, 2).setValue(models.join(', '));
      // 更新時間戳
      let tsRow = -1;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === '上次更新模型清單') { tsRow = i + 1; break; }
      }
      if (tsRow > 0) sheet.getRange(tsRow, 2).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
    }
    Logger.log(`refreshAvailableModels: updated ${models.length} model(s): ${models.join(', ')}`);
  } catch(e) { Logger.log('refreshAvailableModels exception: ' + e); }
}

/**
 * 從 AI_PromptConfig 讀取目前選擇的模型名稱
 * @return {string} model name (e.g. 'gemini-3.5-flash')
 */
function getSelectedModel() {
  try {
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = Math.min(sheet.getLastRow(), 10);
    const data = sheet.getRange(1, 1, lastRow, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === '目前使用模型' && data[i][1]) return String(data[i][1]).trim();
    }
  } catch(e) { Logger.log('getSelectedModel error: ' + e); }
  return 'gemini-2.5-flash';
}

// =========================================================================
// ==================== AI_Uncategorized 系列函式 (v3.0) ====================
// =========================================================================

/** 取得或建立 AI_Uncategorized 工作表 */
function getOrCreateUncategorizedSheet() {
  const ss = getOrCreateSpreadsheet_();
  let sheet = ss.getSheetByName(UNCATEGORIZED_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(UNCATEGORIZED_SHEET_NAME);
    sheet.appendRow(['Thread ID', 'Email', 'Sender Name', 'Subject', 'AI摘要', '信件日期', '人工分類', '狀態']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 220); sheet.setColumnWidth(3, 130);
    sheet.setColumnWidth(4, 280); sheet.setColumnWidth(5, 200); sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 110); sheet.setColumnWidth(8, 100);
    // 標題列格式
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#E53E3E').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    // 「人工分類」欄下拉選單（G欄 = 第7欄，從第2列起）
    const categoryValidation = SpreadsheetApp.newDataValidation().requireValueInList(VALID_CATEGORIES, true).build();
    sheet.getRange(2, 7, 500, 1).setDataValidation(categoryValidation);
    // 「狀態」欄條件格式化
    const pendingRule = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('待審查').setBackground('#FEF3C7').setFontColor('#92400E').setBold(true).setRanges([sheet.getRange('H2:H500')]).build();
    const doneRule   = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('✅ 已完成').setBackground('#DCFCE7').setFontColor('#166534').setRanges([sheet.getRange('H2:H500')]).build();
    const failRule   = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('❌ 處理失敗').setBackground('#FEE2E2').setFontColor('#991B1B').setRanges([sheet.getRange('H2:H500')]).build();
    sheet.setConditionalFormatRules([pendingRule, doneRule, failRule]);
    Logger.log('Created AI_Uncategorized sheet.');
  }
  return sheet;
}

/** 記錄 AI 分類失敗的信件到 AI_Uncategorized 工作表 */
function logToUncategorizedSheet(thread, senderEmail, rawSender, subject, refinedContent) {
  try {
    const sheet = getOrCreateUncategorizedSheet();
    // 檢查是否已記錄過（避免重複）
    const existingData = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues() : [];
    const threadId = thread.getId();
    for (let i = 0; i < existingData.length; i++) {
      if (String(existingData[i][0]) === threadId) {
        Logger.log(`Thread ${threadId} already in uncategorized sheet, skipping.`);
        return;
      }
    }
    const senderName = extractSenderName(rawSender);
    const dateStr = Utilities.formatDate(thread.getLastMessageDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    sheet.appendRow([threadId, senderEmail, senderName, subject, refinedContent || '', dateStr, '', '待審查']);
    Logger.log(`Logged uncategorized thread ${threadId} to ${UNCATEGORIZED_SHEET_NAME}.`);
  } catch(e) { Logger.log('logToUncategorizedSheet error: ' + e); }
}

/**
 * 掃描 AI_Uncategorized 工作表，自動處理已填入「人工分類」的列。
 * 自動觸發：每次 autoOrganizeGmailWithGemini() 結束後 + sendDailyDigest() 開始前。
 * 也可手動在 Apps Script 編輯器直接執行。
 */
function processUncategorizedSheet() {
  try {
    const sheet = getOrCreateUncategorizedSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) { Logger.log('No entries in AI_Uncategorized sheet.'); return; }
    const data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    let processed = 0;
    const rulesSheet = getOrCreateRulesSheet();
    data.forEach((row, i) => {
      const threadId   = String(row[0] || '').trim();
      const email      = String(row[1] || '').trim();
      const rawSender  = String(row[2] || '').trim();
      const subject    = String(row[3] || '').trim();
      const manualCat  = String(row[6] || '').trim();
      const status     = String(row[7] || '').trim();
      if (!manualCat || status === '✅ 已完成') return;
      if (!VALID_CATEGORIES.includes(manualCat)) {
        Logger.log(`Row ${i+2}: Invalid category "${manualCat}", skipping.`);
        return;
      }
      try {
        const threads = GmailApp.getThreadById(threadId);
        if (!threads) { throw new Error('Thread not found: ' + threadId); }
        
        let bodySnippet = '';
        try {
          const msgs = threads.getMessages();
          if (msgs && msgs.length > 0) {
            bodySnippet = msgs[0].getPlainBody().replace(/\s+/g, ' ').substring(0, 200);
          }
        } catch(e) {}
        
        // 移除 AI/未分類 標籤
        const oldLabel = GmailApp.getUserLabelByName('AI/未分類');
        if (oldLabel) threads.removeLabel(oldLabel);
        // 套用新標籤
        const newLabelName = 'AI/' + manualCat;
        let newLabel = GmailApp.getUserLabelByName(newLabelName);
        if (!newLabel) newLabel = GmailApp.createLabel(newLabelName);
        threads.addLabel(newLabel);
        // 移至對應 Gmail 分頁
        const tabId = CATEGORY_TAB_MAPPING[manualCat];
        if (tabId) moveThreadToGmailCategory(threadId, tabId);
        // 寫入 AI_Rules
        if (rulesSheet) {
          const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          rulesSheet.appendRow([email, rawSender, manualCat, '低', '[人工修正]', `from:${email}`, nowStr]);
        }
        // 更新狀態
        sheet.getRange(i + 2, 8).setValue('✅ 已完成');
        // 儲存學習規則
        saveToLearningRules(email, rawSender, subject, manualCat);
        // 同步至 AI_PromptConfig 範例
        addExampleToPromptConfig_(email, subject, bodySnippet, manualCat, '低', '[人工修正]');
        processed++;
        Logger.log(`processUncategorizedSheet: Row ${i+2} → ${manualCat} ✅`);
      } catch(e) {
        sheet.getRange(i + 2, 8).setValue('❌ 處理失敗');
        Logger.log(`processUncategorizedSheet: Row ${i+2} failed: ` + e);
      }
    });
    Logger.log(`processUncategorizedSheet done. Processed: ${processed} item(s).`);
  } catch(e) { Logger.log('processUncategorizedSheet exception: ' + e); }
}

/** 將人工修正結果新增為 AI_PromptConfig 的 Few-Shot 範例 */
function addExampleToPromptConfig_(email, subject, bodySnippet, category, urgency, refined) {
  try {
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(1, 1, lastRow, 1).getValues();
    let exHeaderRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).includes('區塊三')) { exHeaderRow = i + 2; break; } // +2 for header row
    }
    if (exHeaderRow < 0) return;
    // 找到第一個空列
    const exData = sheet.getRange(exHeaderRow + 1, 1, Math.max(1, lastRow - exHeaderRow), 8).getValues();
    let insertRow = lastRow + 1;
    for (let i = 0; i < exData.length; i++) {
      if (!String(exData[i][0]).trim()) { insertRow = exHeaderRow + 1 + i; break; }
    }
    sheet.getRange(insertRow, 1, 1, 8).setValues([[`人工修正-${category}`, email, subject.substring(0,30), bodySnippet, category, urgency, refined, '✅啟用']]);
    Logger.log(`Added example to AI_PromptConfig row ${insertRow}.`);
  } catch(e) { Logger.log('addExampleToPromptConfig_ error: ' + e); }
}

// =========================================================================
// ==================== AI_LearningRules 系列函式 (v3.0) ====================
// =========================================================================

/** 取得或建立 AI_LearningRules 工作表 */
function getOrCreateLearningRulesSheet() {
  const ss = getOrCreateSpreadsheet_();
  let sheet = ss.getSheetByName(LEARNING_RULES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LEARNING_RULES_SHEET_NAME);
    sheet.appendRow(['Email/Domain', 'Sender Name', 'Subject Keyword', '正確分類', '學習來源', '更新時間', '命中次數']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 220); sheet.setColumnWidth(2, 140); sheet.setColumnWidth(3, 180);
    sheet.setColumnWidth(4, 110); sheet.setColumnWidth(5, 100); sheet.setColumnWidth(6, 140);
    sheet.setColumnWidth(7, 80);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#2B6CB0').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    Logger.log('Created AI_LearningRules sheet.');
  }
  return sheet;
}

/**
 * 載入所有學習規則至記憶體 Map
 * @return {Map} senderEmail → category
 */
function loadLearningRules() {
  const map = new Map();
  try {
    const sheet = getOrCreateLearningRulesSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return map;
    const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    data.forEach(row => {
      const email = String(row[0] || '').trim().toLowerCase();
      const category = String(row[3] || '').trim();
      if (email && category && VALID_CATEGORIES.includes(category)) {
        map.set(email, category);
      }
    });
  } catch(e) { Logger.log('loadLearningRules error: ' + e); }
  return map;
}

/** 儲存或更新一條學習規則 */
function saveToLearningRules(email, senderName, subject, category) {
  try {
    const sheet = getOrCreateLearningRulesSheet();
    const lastRow = sheet.getLastRow();
    const emailLower = email.trim().toLowerCase();
    // 先查是否已有同 email 的記錄
    if (lastRow >= 2) {
      const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() === emailLower) {
          // 更新分類和時間
          const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
          sheet.getRange(i + 2, 4).setValue(category);
          sheet.getRange(i + 2, 6).setValue(nowStr);
          const hits = parseInt(data[i][6] || 0) + 1;
          sheet.getRange(i + 2, 7).setValue(hits);
          Logger.log(`saveToLearningRules: Updated ${emailLower} → ${category} (hits: ${hits})`);
          return;
        }
      }
    }
    // 新增記錄
    const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    sheet.appendRow([emailLower, senderName || '', subject ? subject.substring(0,50) : '', category, '人工修正', nowStr, 1]);
    Logger.log(`saveToLearningRules: Added ${emailLower} → ${category}`);
  } catch(e) { Logger.log('saveToLearningRules error: ' + e); }
}

// =========================================================================
// ==================== 每日摘要 Email 函式 (v3.0) ====================
// =========================================================================

/**
 * 發送今日重點信件摘要 Email。
 * 自動觸發：每日 20:00。也可手動執行。
 */
function sendDailyDigest() {
  // 先處理人工審查清單，確保摘要包含最新狀態
  try { processUncategorizedSheet(); } catch(e) { Logger.log('processUncategorizedSheet in digest: ' + e); }

  try {
    const sheet = getOrCreateRulesSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log('sendDailyDigest: No data in AI_Rules.');
      return;
    }
    const tz = Session.getScriptTimeZone();
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();

    // 篩選今日 + 高緊急度 或 工作類別
    const important = [], highUrgency = [];
    data.forEach(row => {
      const updatedTime = String(row[6] || '');
      if (!updatedTime.startsWith(today)) return;
      const category = String(row[2] || '').trim();
      const urgency  = String(row[3] || '').trim();
      const refined  = String(row[4] || '').trim();
      const email    = String(row[0] || '').trim();
      const sender   = String(row[1] || '').trim();
      if (urgency === '高') highUrgency.push({email, sender, category, urgency, refined, time: updatedTime});
      else if (category === '工作') important.push({email, sender, category, urgency, refined, time: updatedTime});
    });

    if (highUrgency.length === 0 && important.length === 0) {
      Logger.log('sendDailyDigest: No high-urgency or work emails today.');
      return;
    }

    // 組裝 HTML Email
    const formatRows = (items) => items.map(item =>
      `<tr><td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.time.split(' ')[1] || ''}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.sender || item.email}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;"><span style="background:${item.urgency==='高'?'#FEE2E2':item.urgency==='中'?'#FEF3C7':'#DCFCE7'};color:${item.urgency==='高'?'#991B1B':item.urgency==='中'?'#92400E':'#166534'};padding:2px 8px;border-radius:4px;font-size:12px;">${item.urgency}</span></td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.refined}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;"><a href="https://mail.google.com/mail/u/0/#search/from:${encodeURIComponent(item.email)}" style="color:#3182CE;">查看</a></td></tr>`
    ).join('');

    const tableHeader = `<tr style="background:#2D3748;color:#FFFFFF;"><th style="padding:10px;text-align:left;">時間</th><th style="padding:10px;text-align:left;">寄件者</th><th style="padding:10px;text-align:center;">緊急度</th><th style="padding:10px;text-align:left;">AI摘要</th><th style="padding:10px;">操作</th></tr>`;

    let htmlBody = `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#2D3748,#4A5568);padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:#FFFFFF;margin:0;font-size:20px;">📧 GmailWithGemini 每日摘要報告</h1>
    <p style="color:#A0AEC0;margin:4px 0 0;font-size:14px;">${today} — 共 ${highUrgency.length + important.length} 封重點信件</p>
  </div>
  <div style="padding:20px;background:#F7FAFC;border:1px solid #E2E8F0;">`;

    if (highUrgency.length > 0) {
      htmlBody += `<h2 style="color:#991B1B;font-size:16px;margin:0 0 12px;">🚨 高緊急度信件 (${highUrgency.length} 封)</h2>
      <table style="width:100%;border-collapse:collapse;background:#FFFFFF;border-radius:8px;overflow:hidden;margin-bottom:20px;">${tableHeader}${formatRows(highUrgency)}</table>`;
    }
    if (important.length > 0) {
      htmlBody += `<h2 style="color:#2B6CB0;font-size:16px;margin:0 0 12px;">💼 工作類信件 (${important.length} 封)</h2>
      <table style="width:100%;border-collapse:collapse;background:#FFFFFF;border-radius:8px;overflow:hidden;margin-bottom:20px;">${tableHeader}${formatRows(important)}</table>`;
    }
    htmlBody += `<p style="color:#718096;font-size:12px;margin-top:16px;">此報告由 GmailWithGemini v3.0 自動生成。如需查看完整記錄，請開啟 <a href="https://docs.google.com/spreadsheets/" style="color:#3182CE;">GmailWithGemini_Rules</a> 試算表。</p>
  </div></div>`;

    const recipient = DIGEST_RECIPIENT_EMAIL || Session.getActiveUser().getEmail();
    GmailApp.sendEmail(recipient, `[GmailWithGemini] ${today} 每日重點摘要 — ${highUrgency.length + important.length} 封重點信件`, '', {htmlBody});
    Logger.log(`sendDailyDigest: Sent to ${recipient}. High=${highUrgency.length}, Work=${important.length}`);
  } catch(e) { Logger.log('sendDailyDigest error: ' + e); }
}

// =========================================================================
// ==================== 觸發器管理與 API 診斷工具 ====================
// =========================================================================

/**
 * 一鍵設定自動觸發器（依 TRIGGER_INTERVAL_HOURS 動態建立分類觸發器 + 每日 20:00 摘要觸發器）。
 * 執行前會自動清除所有已存在的觸發器，避免重複建立。
 */
function setupTriggers() {
  removeTriggers();
  const interval = TRIGGER_INTERVAL_HOURS || 1;
  const triggerBuilder = ScriptApp.newTrigger('autoOrganizeGmailWithGemini').timeBased();
  
  if ([1, 2, 4, 6, 8, 12].includes(interval)) {
    triggerBuilder.everyHours(interval).create();
    Logger.log(`Created 1 classification trigger running every ${interval} hour(s).`);
  } else {
    // Fallback: create multiple daily triggers at specific hours, bounded by GAS limits
    const count = Math.floor(24 / interval);
    if (count > 18) {
      triggerBuilder.everyHours(1).create();
      Logger.log(`Interval too small for specific hours. Created 1 classification trigger running every 1 hour.`);
    } else {
      for (let i = 0; i < count; i++) {
        const hour = (i * interval) % 24;
        ScriptApp.newTrigger('autoOrganizeGmailWithGemini')
          .timeBased().everyDays(1).atHour(hour).nearMinute(0).create();
        Logger.log(`Created classification trigger at ${hour}:00.`);
      }
    }
  }

  // 每日 20:00 摘要觸發器
  ScriptApp.newTrigger('sendDailyDigest')
    .timeBased().everyDays(1).atHour(20).nearMinute(0).create();
  Logger.log('Created daily digest trigger at 20:00.');
  // 刷新可用模型清單
  try { refreshAvailableModels(); } catch(e) { Logger.log('refreshAvailableModels skipped: ' + e); }
  Logger.log('Setup complete!');
}

/**
 * 移除所有與 autoOrganizeGmailWithGemini 及 sendDailyDigest 相關的觸發器。
 * 可用於暫停自動執行或重置觸發器設定。
 */
function removeTriggers() {
  const targets = ['autoOrganizeGmailWithGemini', 'sendDailyDigest'];
  let removedCount = 0;
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (targets.includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
      removedCount++;
    }
  });
  Logger.log(`Removed ${removedCount} existing trigger(s).`);
}

/**
 * API 金鑰診斷工具。
 * 發送一個簡單的測試請求至 Gemini API，驗證金鑰是否有效且屬於免費專案。
 */
function checkApiKeyStatus() {
  const apiKey = PropertiesService.getScriptProperties().getProperty(GEMINI_API_KEY_PROPERTY);
  if (!apiKey) {
    Logger.log('❌ ERROR: GEMINI_API_KEY is not set in script properties.');
    Logger.log('Please go to Project Settings → Script Properties → Add GEMINI_API_KEY.');
    return;
  }
  
  Logger.log('🔑 API Key found: ' + apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4));
  Logger.log('🤖 Testing Gemini API connection (model: gemini-2.5-flash)...');
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    "contents": [{
      "parts": [{ "text": "Reply with only: OK" }]
    }],
    "generationConfig": {
      "maxOutputTokens": 10
    }
  };
  
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (code === 200) {
      Logger.log('✅ SUCCESS: API Key is valid and working!');
      Logger.log('📊 Response code: 200 OK');
      
      // 檢查回應中是否有計費相關警告
      if (responseText.indexOf('billing') !== -1 || responseText.indexOf('quota') !== -1) {
        Logger.log('⚠️ WARNING: Response mentions billing/quota. Please verify your GCP project billing status.');
      } else {
        Logger.log('💰 No billing warnings detected. Your API Key appears to be from a free-tier project.');
      }
    } else if (code === 400) {
      Logger.log('❌ ERROR (400): Invalid API key. Please check your GEMINI_API_KEY value.');
    } else if (code === 403) {
      Logger.log('❌ ERROR (403): API key does not have permission. Check API enablement in GCP Console.');
    } else if (code === 429) {
      Logger.log('⚠️ WARNING (429): Rate limit exceeded. Your API Key is valid but hitting free-tier limits.');
      Logger.log('This is normal for free-tier keys. The script has built-in auto-retry for this.');
    } else {
      Logger.log('❌ ERROR (' + code + '): ' + responseText.substring(0, 300));
    }
  } catch (e) {
    Logger.log('❌ EXCEPTION: ' + e.toString());
  }
  
  // 顯示觸發器狀態
  const triggers = ScriptApp.getProjectTriggers();
  const gmailTriggers = triggers.filter(t => t.getHandlerFunction() === 'autoOrganizeGmailWithGemini');
  Logger.log('\n⏰ Active triggers: ' + gmailTriggers.length);
  if (gmailTriggers.length > 0) {
    gmailTriggers.forEach((t, i) => {
      Logger.log(`  Trigger ${i + 1}: ${t.getEventType()} - ${t.getTriggerSource()}`);
    });
  } else {
    Logger.log('  No active triggers. Run setupTriggers() to enable automatic scheduling.');
  }
}

// =========================================================================
// 完整的變更歷史日誌請參閱專案內的 CHANGELOG.gs 檔案。


// =========================================================================
// ==================== UI 與選單互動 (v3.0+) ====================
// =========================================================================

/**
 * 建立試算表自訂選單
 */
function onOpen(e) {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🤖 Gmail AI 工具')
      .addItem('✨ AI 統整 Few-Shot 學習範例', 'consolidateFewShotExamples')
      .addToUi();
  } catch(e) {}
}

/**
 * AI 統整規則功能
 */
function consolidateFewShotExamples() {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(1, 1, lastRow, 8).getValues();
    
    // 找出區塊三的標題列
    let exHeaderRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).includes('區塊三')) { exHeaderRow = i + 2; break; }
    }
    
    if (exHeaderRow < 0) {
      ui.alert('錯誤', '找不到【區塊三：Few-Shot 學習範例區】的標題，請確認表格結構是否正確。', ui.ButtonSet.OK);
      return;
    }
    
    // 收集現有範例
    const examples = [];
    let startRow = exHeaderRow + 1;
    for (let i = exHeaderRow; i < data.length; i++) {
      const label = String(data[i][0]).trim();
      const enabled = String(data[i][7]).trim();
      if (label && enabled !== '停用') {
        examples.push({
          label: label,
          sender: String(data[i][1]).trim(),
          subject: String(data[i][2]).trim(),
          body: String(data[i][3]).trim(),
          category: String(data[i][4]).trim(),
          urgency: String(data[i][5]).trim(),
          refined: String(data[i][6]).trim()
        });
      }
    }
    
    if (examples.length < 5) {
      ui.alert('提示', `目前只有 ${examples.length} 筆啟用的範例，數量尚少，不需要使用 AI 統整。\n建議累積超過 10 筆後再使用本功能。`, ui.ButtonSet.OK);
      return;
    }
    
    const response = ui.alert('確認執行', `即將把現有的 ${examples.length} 筆範例交給 AI 進行「歸納合併與去重」，並將結果覆蓋現有範例（預計濃縮成 5~10 筆精華規則）。\n這需要花費數十秒，是否繼續？`, ui.ButtonSet.YES_NO);
    
    if (response !== ui.Button.YES) return;
    
    sheet.getRange(startRow, 1).setValue('⏳ AI 正在統整規則中，請稍候...');
    
    const apiKey = PropertiesService.getScriptProperties().getProperty(GEMINI_API_KEY_PROPERTY);
    if (!apiKey) {
      ui.alert('錯誤', '找不到 API Key，請先設定 GEMINI_API_KEY 屬性。', ui.ButtonSet.OK);
      sheet.getRange(startRow, 1).clearContent();
      return;
    }
    
    const model = getSelectedModel(); // 動態抓取 AI_PromptConfig 設定的模型
    
    const promptText = `你是一個專業的郵件分類 AI 助手。以下是用戶長期累積的 ${examples.length} 筆 Few-Shot 郵件分類學習範例。
請幫我將這些範例進行「歸納、去重複與合併同類項」。
例如：如果有多筆來自 UberEats 的訂單範例，請合併成一筆，並將主旨/內文條件稍微泛化（例如加上 "訂單" 等關鍵字）。
請保留最具代表性、覆蓋面最廣的 5~10 筆範例。
你的輸出必須是一個純 JSON 陣列，絕對不能包含 Markdown 標籤 (例如 \`\`\`json)，格式如下：
[
  {
    "label": "統整範例-...",
    "sender": "...",
    "subject": "...",
    "body": "...",
    "category": "...",
    "urgency": "...",
    "refined": "..."
  }
]

範例資料如下：
${JSON.stringify(examples, null, 2)}`;

    // 呼叫 Gemini API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      "contents": [{ "parts": [{ "text": promptText }] }],
      "generationConfig": { "temperature": 0.2 }
    };
    
    const options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify(payload),
      "muteHttpExceptions": true
    };
    
    const res = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    const resText = res.getContentText();
    
    if (code !== 200) {
      sheet.getRange(startRow, 1).clearContent();
      ui.alert('API 錯誤', `無法統整，錯誤碼：${code}\n可能是您的免費配額已耗盡，請稍後再試。`, ui.ButtonSet.OK);
      return;
    }
    
    const jsonRes = JSON.parse(resText);
    let aiOutput = "";
    if (jsonRes.candidates && jsonRes.candidates.length > 0) {
      aiOutput = jsonRes.candidates[0].content.parts[0].text;
    }
    
    if (!aiOutput) {
      sheet.getRange(startRow, 1).clearContent();
      ui.alert('解析失敗', 'AI 沒有回傳有效的內容。', ui.ButtonSet.OK);
      return;
    }
    
    aiOutput = aiOutput.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    let newExamples;
    try {
      newExamples = JSON.parse(aiOutput);
      if (!Array.isArray(newExamples)) throw new Error('Not an array');
    } catch(e) {
      sheet.getRange(startRow, 1).clearContent();
      ui.alert('JSON 解析失敗', `AI 回傳的格式不正確，無法更新。\n回傳內容：${aiOutput.substring(0, 200)}`, ui.ButtonSet.OK);
      return;
    }
    
    // 刪除舊有範例
    const numRowsToDelete = lastRow - exHeaderRow;
    if (numRowsToDelete > 0) {
      sheet.getRange(startRow, 1, numRowsToDelete, 8).clearContent();
    }
    
    // 寫入新範例
    const outputData = newExamples.map(ex => [
      ex.label || '統整範例',
      ex.sender || '',
      ex.subject || '',
      ex.body || '',
      ex.category || '',
      ex.urgency || '',
      ex.refined || '',
      '✅啟用'
    ]);
    
    sheet.getRange(startRow, 1, outputData.length, 8).setValues(outputData);
    
    ui.alert('成功', `已將 ${examples.length} 筆原始範例濃縮為 ${outputData.length} 筆精華規則！`, ui.ButtonSet.OK);
    
  } catch(e) {
    ui.alert('執行時發生未預期錯誤', String(e), ui.ButtonSet.OK);
    Logger.log('consolidateFewShotExamples exception: ' + e);
  }
}
