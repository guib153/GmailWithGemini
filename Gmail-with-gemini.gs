// ==================== ?��?設�? ====================
// 1. ?�令碼屬?�中??Gemini API ?�鑰?�稱
const GEMINI_API_KEY_PROPERTY = 'GEMINI_API_KEY';

// 2. Gmail ?��?篩選條件 (?�除已�?籤�??��?信件，防止�?複判讀)
const GMAIL_SEARCH_QUERY = 'is:unread -label:"AI/工�?" -label:"AI/財�?帳單" -label:"AI/?�人消費" -label:"AI/系統?�知" -label:"AI/?�入?��??�知" -label:"AI/�??行銷" -label:"AI/社群?�知" -label:"AI/?�人?��?" -label:"AI/Netflix" -label:"AI/?��?�?';

// 3. 每次?��??�信件�?話串?�大數??
const MAX_THREADS_TO_SCAN = 50;

// 4. ?�否?�設從�??��???(?�?? ?�郵件�?始整??
const PROCESS_OLDEST_FIRST = true;

// 5. ?��??�件?��??��?字數上�?，避??Token ?�炸
const EMAIL_BODY_CHAR_LIMIT = 1000;

// 5.1 ?�工作表?�稱
const RULES_SHEET_NAME = 'AI_Rules';
const EXECUTION_LOG_SHEET_NAME = 'AI_Execution_Log';
const UNCATEGORIZED_SHEET_NAME = 'AI_Uncategorized';
const LEARNING_RULES_SHEET_NAME = 'AI_LearningRules';
const PROMPT_CONFIG_SHEET_NAME = 'AI_PromptConfig';

// 6. ?��?試�?表�?稱�??�用?�獨立腳?��?次建立�?�?
const STANDALONE_SPREADSHEET_NAME = 'GmailWithGemini_Rules';

// 7. ?�令碼屬?�中?�獨立試算表 ID ?�稱
const STANDALONE_SPREADSHEET_PROPERTY = 'RULES_SHEET_ID';

// 8. API ?�叫設�?
const API_MAX_RETRIES = 3;
const API_RETRY_BASE_DELAY_MS = 10000;

// 8.1 ?�次?��?設�? (v3.0)
const BATCH_SIZE = 10;         // 每批次�??��??��?信件?��?
const BATCH_DELAY_MS = 2000;   // ?�次之�??��?待毫秒數

// 8.2 ?��??��??��? (v3.0)
const TRIGGER_INTERVAL_HOURS = 1; // ?��??��?觸發?��? (小�?)�?=每�??? 2=�?小�?

// 8.3 每日?��? Email ?�件人�??�空?��?給執行腳?��?帳�??�身�?
const DIGEST_RECIPIENT_EMAIL = '';

// 9. AI ?��?對�???Gmail ?�件??��統�??��?�?ID
const CATEGORY_TAB_MAPPING = {
  "工�?": "CATEGORY_PERSONAL",
  "財�?帳單": "CATEGORY_UPDATES",
  "?�人消費": "CATEGORY_UPDATES",
  "系統?�知": "CATEGORY_UPDATES",
  "?�入?��??�知": "CATEGORY_UPDATES",
  "�??行銷": "CATEGORY_PROMOTIONS",
  "社群?�知": "CATEGORY_SOCIAL",
  "?�人?��?": "CATEGORY_PERSONAL",
  "Netflix": "CATEGORY_UPDATES",
  "?��?�?: "CATEGORY_PERSONAL"
};

// 10. ?��??��??�表（用??AI_Uncategorized 下�?驗�?�?
const VALID_CATEGORIES = ["工�?","財�?帳單","?�人消費","系統?�知","?�入?��??�知","�??行銷","社群?�知","?�人?��?","Netflix"];
// =========================================================================

// =========================================================================
// ==================== ?�單?�執行�??�口?��?說�? (Runnable Functions) ====================
// =========================================================================
/**
 * 1. autoOrganizeGmailWithGemini()    ???�慧?�件?��?主�?式�??�次 AI + ?�主學�?�?
 * 2. syncExistingLabeledThreadsToCategories() ??歷史信件?�件????��??��?�?
 * 3. processUncategorizedSheet()      ???��? AI_Uncategorized 人工審查結�?
 * 4. sendDailyDigest()                ???��?觸發今日?��??��? Email
 * 5. setupTriggers()                  ??一?�設定全?�自?�觸?�器
 * 6. removeTriggers()                 ??移除?�部觸發?��??��??��??��?�?
 * 7. checkApiKeyStatus()              ??API ?�鑰診斷工具
 * 8. refreshAvailableModels()         ???��??�新 AI_PromptConfig ?�可?�模?��???
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
    // 1. ?��??�主學�?規�?
    const learningRules = loadLearningRules();
    Logger.log(`Loaded ${learningRules.size} learning rule(s).`);

    // 2. ?��? Prompt 設�?
    const promptConfig = buildPromptFromSheet();
    Logger.log(`Prompt loaded: ${promptConfig.categories.length} cats, ${promptConfig.examples.length} examples, model: ${promptConfig.model}`);

    // 3. ?��?試�?�?
    let sheet;
    try { sheet = getOrCreateRulesSheet(); } catch(e) { Logger.log("Sheet init error: " + e); }

    // 4. ?��??��?且未?��?信件
    let threads = GmailApp.search(GMAIL_SEARCH_QUERY, 0, 50);
    if (threads.length === 0) {
      Logger.log("No unread threads found.");
    } else {
      if (PROCESS_OLDEST_FIRST) threads.reverse();
      threads = threads.slice(0, MAX_THREADS_TO_SCAN);
      Logger.log(`Found ${threads.length} thread(s) to classify.`);

      // 5. ?��?：學習�??�命�?vs. ?��?AI ?��?
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
              category: learningRules.get(senderEmail), urgency: "�?,
              refinedContent: `[學�?規�??�中] ${learningRules.get(senderEmail)}` });
          } else {
            needsAI.push({ thread, rawSender, senderEmail, subject, body });
          }
        } catch(e) { failureCount++; Logger.log("Pre-process error: " + e); }
      });

      // 6. ?��?學�?規�??�中
      preClassified.forEach(item => {
        try {
          Logger.log(`[LearningRule] ${item.senderEmail} ??${item.category}`);
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

      // 7. ?�次 AI ?��?
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
              if (urgency === "�?) highUrgencyCount++;
              else if (urgency === "�?) mediumUrgencyCount++;
              else lowUrgencyCount++;
              const d = item.thread.getLastMessageDate();
              if (!minDate || d < minDate) minDate = d;
              if (!maxDate || d > maxDate) maxDate = d;
              Logger.log(`[AI] ${item.senderEmail} ??${category} (${urgency})`);
            } else {
              failureCount++;
              category = "?��?�?; urgency = "�?;
              refinedContent = "AI?�次?��?失�?，�?待人工審??;
              Logger.log(`[Fallback] ${item.senderEmail} ???��?類`);
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
 * 輔助?��?：�??��?類�?籤、更??Gmail ?��??�寫??AI_Rules ?��?
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
 * 一次性歷?�信件歸類工?��?
 * ?��??�?�歷?�已歸�?標籤 (AI/*) ?�信件�?並�??�自?��?步移?��??��? Gmail ?��?中�?
 * 此執行�??��??�?�叫 Gemini API??
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
        // ?��???100 封信（可?��??�要�?複執行以消�??�大信�?�?
        const threads = label.getThreads(0, 100);
        Logger.log(`Found ${threads.length} threads labeled with '${labelName}'. Moving to ${tabLabelId}...`);
        
        threads.forEach((thread, index) => {
          if (index > 0) {
            Utilities.sleep(150); // ?��? API ?��??��?
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
 * ?��?乾淨?�電子信箱地?� (小寫)
 * @param {string} emailString ?��?信件?��?字串
 * @return {string} 乾淨?�信箱地?�
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
 * 美�?試�?表�??��?觀並設定�??�度條件?��??��???
 * @param {Sheet} sheet Google Sheets 工�?表物�?
 */
function formatSheetAesthetics(sheet) {
  // 1. 設�?欄�?寬度?�止?�容?��?
  sheet.setColumnWidth(1, 240); // ?��?信箱
  sheet.setColumnWidth(2, 160); // 寄件?��?�?
  sheet.setColumnWidth(3, 110); // 類別
  sheet.setColumnWidth(4, 90);  // 緊急度
  sheet.setColumnWidth(5, 280); // AI 精�??�容
  sheet.setColumnWidth(6, 200); // Gmail ?��?字串
  sheet.setColumnWidth(7, 160); // ?�新?��?
  
  // 2. 套用 A1:G1000 之交?��??�色�?(?�馬�?
  const fullRange = sheet.getRange("A1:G1000");
  fullRange.clearFormat(); // 清除?�格�?
  
  // 清�??��??��??�交?��??�設�?(Bandings) ?��?衝�?
  const bandings = sheet.getBandings();
  bandings.forEach(banding => banding.remove());
  
  const banding = fullRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  banding.setHeaderRowColor('#2D3748').setFirstRowColor('#FFFFFF').setSecondRowColor('#F7FAFC');
  
  // 3. 設�?標�??�樣�?( setAlternatingRowColors ?��?製�??��??�?��?標�??��??�為純白粗�?)
  const headerRange = sheet.getRange(1, 1, 1, 7);
  headerRange.setFontFamily("Arial")
             .setFontSize(10)
             .setFontWeight("bold")
             .setFontColor("#FFFFFF")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");
             
  sheet.setRowHeight(1, 28); // 設�?標�??��?�?
  
  // 4. 設�?資�?欄�?水平?��??��?�?
  sheet.getRange("A2:A1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("B2:B1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("C2:C1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D2:D1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("E2:E1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("F2:F1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("G2:G1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  
  // 5. 設�?緊急度 (D�? 條件?��??��???(�?�? �?�? �?�?
  const urgencyRange = sheet.getRange("D2:D1000");
  
  const ruleHigh = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("�?)
      .setBackground("#FEE2E2") // 淺�?
      .setFontColor("#991B1B") // 深�?
      .bold(true)
      .setRanges([urgencyRange])
      .build();
      
  const ruleMedium = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("�?)
      .setBackground("#FEF3C7") // 淺�?
      .setFontColor("#92400E") // 深�?
      .bold(true)
      .setRanges([urgencyRange])
      .build();
      
  const ruleLow = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("�?)
      .setBackground("#DCFCE7") // 淺�?
      .setFontColor("#166534") // 深�?
      .setRanges([urgencyRange])
      .build();
      
  sheet.setConditionalFormatRules([ruleHigh, ruleMedium, ruleLow]);
  Logger.log("Applied premium aesthetic formats and conditional rules to AI_Rules sheet.");
}

/**
 * ?��??�自?�建�?AI_Rules 工�?�?
 * @return {Sheet} Google Sheets 工�?表物�?
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
    // ?��??��?題�?
    sheet.appendRow(["Email", "Sender Name", "Category", "Urgency", "AI Refined Content", "Gmail Search Query", "Updated Time"]);
    sheet.setFrozenRows(1);
    formatSheetAesthetics(sheet);
    Logger.log("Created AI_Rules sheet and applied aesthetic rules.");
  } else if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    // ?��?修復：若工�?表內容被清空，�??�寫?��?題�??��???
    sheet.appendRow(["Email", "Sender Name", "Category", "Urgency", "AI Refined Content", "Gmail Search Query", "Updated Time"]);
    sheet.setFrozenRows(1);
    formatSheetAesthetics(sheet);
    Logger.log("Recovered empty AI_Rules sheet headers and applied aesthetics.");
  } else {
    // ?��??��??��? (如�?缺�? Sender Name 欄�?)
    if (sheet.getLastColumn() > 0 && sheet.getRange(1, 2).getValue() !== "Sender Name") {
      sheet.insertColumnBefore(2);
      sheet.getRange(1, 2).setValue("Sender Name");
      Logger.log("Migrated AI_Rules sheet: Inserted 'Sender Name' column at index 2.");
    }
    // ?��??��??��? (如�?缺�? AI Refined Content 欄�?)
    if (sheet.getLastColumn() > 0 && sheet.getRange(1, 5).getValue() !== "AI Refined Content") {
      sheet.insertColumnBefore(5);
      sheet.getRange(1, 5).setValue("AI Refined Content");
      Logger.log("Migrated AI_Rules sheet: Inserted 'AI Refined Content' column at index 5.");
    }
    // 套用?��?外�??��?�???��?件�???
    formatSheetAesthetics(sheet);
  }
  return sheet;
}

/**
 * ?��?寄件?��?�?
 * @param {string} senderString ?��?寄件?��?位�?�?(�?"KGI Bank <card999@kgibank.com>")
 * @return {string} 寄件?��?�?
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
 * 寫入?��?統�??��??�單?��?工�?表中
 */
function writeExecutionLog(timeString, minDate, maxDate, successCount, failureCount, highUrgency, mediumUrgency, lowUrgency, categoryStats, successYn, errorMsg) {
  const sheet = getOrCreateExecutionLogSheet();
  if (!sheet) return;
  
  // 1. 彙整信件?�件?��??�?��?�?
  let dateRangeStr = "N/A";
  if (minDate && maxDate) {
    const tz = Session.getScriptTimeZone();
    const minStr = Utilities.formatDate(minDate, tz, "yyyy-MM-dd HH:mm");
    const maxStr = Utilities.formatDate(maxDate, tz, "yyyy-MM-dd HH:mm");
    dateRangeStr = `${minStr} ~ ${maxStr}`;
  }
  
  // 2. 彙整?��?佔�?字串 (例�?：工�?2), Netflix(1))
  const statsList = [];
  for (const cat in categoryStats) {
    statsList.push(`${cat}(${categoryStats[cat]})`);
  }
  const categoryBreakdown = statsList.length > 0 ? statsList.join(", ") : "None";
  
  // 3. 寫入?��??��?Execution Time, Email Date Range, Success Count, Failure Count, High, Medium, Low, Category Distribution, Finished Successfully, Error Message
  sheet.appendRow([timeString, dateRangeStr, successCount, failureCount, highUrgency, mediumUrgency, lowUrgency, categoryBreakdown, successYn, errorMsg]);
  Logger.log("Successfully logged execution stats.");
}

/**
 * ?��??�自?�建�?AI_Execution_Log 工�?�?
 * @return {Sheet} Google Sheets 工�?表物�?
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
    // ?��??��?�?
    sheet.appendRow(["Execution Time", "Email Date Range", "Success Count", "Failure Count", "High Urgency", "Medium Urgency", "Low Urgency", "Category Distribution", "Finished Successfully", "Error Message"]);
    sheet.setFrozenRows(1);
    formatExecutionLogSheetAesthetics(sheet);
    Logger.log("Created AI_Execution_Log sheet and initialized formatting.");
  } else if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    // ?��?修復：�??�工作表被�?空�??�置標�??�格�?
    sheet.appendRow(["Execution Time", "Email Date Range", "Success Count", "Failure Count", "High Urgency", "Medium Urgency", "Low Urgency", "Category Distribution", "Finished Successfully", "Error Message"]);
    sheet.setFrozenRows(1);
    formatExecutionLogSheetAesthetics(sheet);
    Logger.log("Recovered empty AI_Execution_Log sheet headers.");
  }
  return sheet;
}

/**
 * 美�?統�??��?工�?表�??��?觀並設定執行�??��?件格式�?規�?
 * @param {Sheet} sheet Google Sheets 工�?表物�?
 */
function formatExecutionLogSheetAesthetics(sheet) {
  // 1. 設�?欄�?寬度
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
  
  // 2. 套用 A1:J1000 之交?��??��???(?�馬�?
  const fullRange = sheet.getRange("A1:J1000");
  fullRange.clearFormat(); // 清除?�格�?
  
  const bandings = sheet.getBandings();
  bandings.forEach(banding => banding.remove());
  
  const banding = fullRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  banding.setHeaderRowColor('#2D3748').setFirstRowColor('#FFFFFF').setSecondRowColor('#F7FAFC');
  
  // 3. 設�?標�??�樣�?(純白粗�?)
  const headerRange = sheet.getRange(1, 1, 1, 10);
  headerRange.setFontFamily("Arial")
             .setFontSize(10)
             .setFontWeight("bold")
             .setFontColor("#FFFFFF")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");
             
  sheet.setRowHeight(1, 28); // 設�?高度
  
  // 4. 設�?資�?欄�?水平置中?��?齊方�?
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
  
  // 5. 設�? Finished Successfully (I�? 條件?��??��???(Y:�? N:�?
  const statusRange = sheet.getRange("I2:I1000");
  
  const ruleY = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Y")
      .setBackground("#DCFCE7") // 淺�?
      .setFontColor("#166534") // 深�?
      .bold(true)
      .setRanges([statusRange])
      .build();
      
  const ruleN = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("N")
      .setBackground("#FEE2E2") // 淺�?
      .setFontColor("#991B1B") // 深�?
      .bold(true)
      .setRanges([statusRange])
      .build();
      
  sheet.setConditionalFormatRules([ruleY, ruleN]);
  Logger.log("Applied premium aesthetic formats and conditional rules to AI_Execution_Log sheet.");
}

/**
 * 使用 Gmail REST API 將�?定�? thread 移�??��??��? Gmail ?�件?????(Category)
 * @param {string} threadId Gmail 對話�?ID
 * @param {string} tabLabelId Gmail 系統?��?標籤 ID (�?"CATEGORY_SOCIAL")
 */
function moveThreadToGmailCategory(threadId, tabLabelId) {
  if (!threadId || !tabLabelId) return;
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`;
  const token = ScriptApp.getOAuthToken();
  
  // ?��??�止?��??�現?��??��??��??�入該�??��?並移?�其他系統�??��?�?
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
// ==================== ?�次 AI ?��??��? (v3.0) ====================
// =========================================================================

/**
 * ?�次 AI ?��?：�?次傳?��?�?BATCH_SIZE 封郵件�?要�? AI 依�??�傳結�????
 * @param {string} apiKey
 * @param {Array} emailList [{sender, subject, body}, ...]
 * @param {Object} promptConfig {categories, urgencyHigh, urgencyMid, urgencyLow, examples, roleDesc, model}
 * @return {Array|null} 結�???? [{category, urgency, refinedContent}, ...] ??null
 */
function callGeminiApiBatch(apiKey, emailList, promptConfig) {
  const model = (promptConfig && promptConfig.model) ? promptConfig.model : 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // ?��?組�??��?規�?
  const categoriesText = (promptConfig && promptConfig.categories && promptConfig.categories.length > 0)
    ? promptConfig.categories.map((c, i) => `${i+1}. ??{c.name}?��?${c.desc}${c.note ? ' *注�?*�? + c.note : ''}`).join('\n')
    : `1. ?�工作」�?專屬?�人?��??��??�、�??��??�信件。\n2. ?�財?�帳?�」�??�行交?��?細、電子發票、帳?�繳費通知?�\n3. ?�個人消費?��?線�?購物訂單確�??�出�??��??�知?�\n4. ?�系統通知?��??��??�系統警?�、帳?��??�信?��??�性�?證碼 (OTP)?�\n5. ?�登?��??�通知?��??�家?�行�?網�??��??�送�?安全?�登?��??�」確認信?�\n6. ?�廣?��??�」�??��??�、�??�廣?�、�??�券?�產?�推�?��?�\n7. ?�社群通知?��?社群平台群發?�推�???��??��?信。\n8. ?�個人?��??��?親�??�個人來信?��?人�??��???機票確�?信。\n9. ?�Netflix?��?Netflix（含 @account.netflix.com ??netflix.com ?��?）發?��??�?�信件。`;

  const categoryEnums = (promptConfig && promptConfig.categories && promptConfig.categories.length > 0)
    ? promptConfig.categories.map(c => c.name)
    : VALID_CATEGORIES;

  // ?��?組�? Few-Shot 範�?
  const defaultExamples = `- *範�? 1 (工�??�人私�?)*：\n  - 寄件?��?\`LinkedIn <messages-noreply@linkedin.com>\`，�?題�?\`?�大?�傳?��?訊息給您\`，內?��?\`?��??��??��???..\`\n  - ?��?結�?：\`category: "工�?"\`, \`urgency: "�?\`, \`refinedContent: "LinkedIn私�?-?�大???��??�履�?\`\n- *範�? 2 (?�人消費訂單)*：\n  - 寄件?��?\`Shopee <info@shopee.tw>\`，�?題�?\`訂單?��??�知\`，內?��?\`?��??��?消費，�?費�?�?NT$ 500 ??..\`\n  - ?��?結�?：\`category: "?�人消費"\`, \`urgency: "�?\`, \`refinedContent: "?�皮購物-訂單?��?-NT$500"\``;
  const examplesText = (promptConfig && promptConfig.examples && promptConfig.examples.length > 0)
    ? promptConfig.examples.map((ex, i) => `- *範�? ${i+1} (${ex.label})*：\n  - 寄件?��?\`${ex.sender}\`，�?題�?\`${ex.subject}\`，內?��?\`${ex.body}\`\n  - ?��?結�?：\`category: "${ex.category}"\`, \`urgency: "${ex.urgency}"\`, \`refinedContent: "${ex.refined}"\``).join('\n')
    : defaultExamples;

  const urgencyHigh = (promptConfig && promptConfig.urgencyHigh) || '?�要即?��?注�??��?之信件。�?如�?驗�?�?(OTP)?�登?�異常�??�警?�、信?�卡消費?�慮??;
  const urgencyMid  = (promptConfig && promptConfig.urgencyMid)  || '?��??�性�??��?立刻?��?之信件。�?如�?幾天?�到?��?繳費帳單?�工作�?議�?約、�?辦任?��?;
  const urgencyLow  = (promptConfig && promptConfig.urgencyLow)  || '?��?資�??�知?��??��??�性�?信件?��?如�?�??行銷促銷?�登?��??�通知?�社群�??��??��?;
  const roleDesc    = (promptConfig && promptConfig.roleDesc)    || '?�是一位�?業�??�慧?�件?��?秘書?��?詳細?��?以�??�件?��?件者、�?題�??��?，並依�??��?規�?決�??��??��?緊急度??;

  // 組�??�次?�件?�表?��?
  const emailsText = emailList.map((em, idx) => `[?�件 ${idx+1}]\n寄件?��?${em.sender}\n標�?�?{em.subject}\n?��?�?{em.body}`).join('\n---\n');

  const promptText = `${roleDesc}

?��??�步驟�?�?(Chain of Thought)??
1. **識別寄件主�?**：判?��?件者是何種平台?��?織�?
2. **?�?��??�屬??*：�??�此?�件?�「�??��??�件人個人?��????�知?��??�是?�批次群?��??�即?��?�??�廣?��?
3. **?��??��??��??�度**：�??�以下�?範進�??��??��??�度評估??
4. **資�??��?**：精?�出 20 字以?��??�件大�?（�?保�??�鍵資�??�數?��???

?��?類�??��?範�?
${categoriesText}

?��??�度評判規�???
- ?��??��?${urgencyHigh}
- ?�中?��?${urgencyMid}
- ?��??��?${urgencyLow}

?��?例�??��?�?(Few-Shot Examples)??
${examplesText}

請�?以�? ${emailList.length} 封郵件�?序進�??��?，並�?JSON ????��??�傳結�?（陣?�中�?i ?�物件�??�第 i 封郵件�?�?
---
${emailsText}
---
請嚴?��??��?定�? JSON Schema 結�?輸出?��?結�??�`;

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
            "urgency":  {"type": "STRING", "enum": ["�?, "�?, "�?]},
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
 * ?�次 AI ?��??�試?��???
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
// ==================== AI_PromptConfig 系�??��? (v3.0) ====================
// =========================================================================

/** ?��??�建�?AI_PromptConfig 工�?表�?並�?始�??�設?�容 */
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
    // ?��?塊零：模?�設定�?
    sheet.getRange('A1').setValue('?��?塊零：模?�設定�?);
    sheet.getRange('A2').setValue('?��?使用模�?');
    sheet.getRange('B2').setValue('gemini-2.5-flash');
    sheet.getRange('A3').setValue('上次?�新模�?清單');
    sheet.getRange('B3').setValue('尚未?�新，�??��? refreshAvailableModels()');
    sheet.getRange('A4').setValue('?�用模�?清單 (供�???');
    sheet.getRange('B4').setValue('gemini-2.5-flash, gemini-3-flash, gemini-3.5-flash');
    // ?��?塊�?：�??��?令�?
    sheet.getRange('A6').setValue('?��?塊�?：�??��?令�?);
    sheet.getRange('A7').setValue('角色說�?');
    sheet.getRange('B7').setValue('?�是一位�?業�??�慧?�件?��?秘書?��?詳細?��?以�??�件?��?件者、�?題�??��?，並依�??��?規�?決�??��??��?緊急度?��??��?請精?�該信件?��??�核心內容�?);
    sheet.getRange('A8').setValue('緊急度-�?);
    sheet.getRange('B8').setValue('?�要即?��?注�??��?之信件。�?如�?驗�?�?(OTP)?�登?�異常�??�警?�、信?�卡消費?�慮?�急�??��??�工作阻礙�?);
    sheet.getRange('A9').setValue('緊急度-�?);
    sheet.getRange('B9').setValue('?��??�性�??��?立刻?��?之信件。�?如�?幾天?�到?��?繳費帳單?�工作�?議�?約、�?辦任?��?);
    sheet.getRange('A10').setValue('緊急度-�?);
    sheet.getRange('B10').setValue('?��?資�??�知?��??��??�性�?信件?��?如�?�??行銷促銷?�登?��??�通知?�社群�??��??��?);
    // ?��?塊�?：�?類�??��?義�?
    sheet.getRange('A12').setValue('?��?塊�?：�?類�??��?義�?);
    sheet.getRange('A13:D13').setValues([['類別?�稱', '詳細說�?', '?�註/?��?規�?', '?�用']]);
    const defaultCategories = [
      ['工�?', '專屬?�人?��??��??�、工作任?��?作通知?��??��??�信件�?如�?104人�??�行面試�?請�??�社群平?�個人對話（�?：LinkedIn 專屬私�?/?�絡人信件�???, '必�??��?對收件者個人?��??��?行�?信件?�若?�群?��??�缺?��??��??��??��?，�??��?類為?�社群通知?��??�廣?��??�」�?, '??],
      ['財�?帳單', '?�行交?��?細、電子發票、帳?�繳費通知?�收?��?證、信?�卡消費?�知??, '', '??],
      ['?�人消費', '線�?購物訂單確�??�出�??��??�知?��??�平?��?細、�?下實體�??��?費發票�?, '', '??],
      ['系統?�知', '?��??�系統警?�、帳?��??�信?��??�性�?證碼 (OTP)??, '', '??],
      ['?�入?��??�知', '?�家?�行�?網�??��??�送�?安全?�登?��??�」確認信??, '', '??],
      ['�??行銷', '?��??�、�??�廣?�、�??�券?�產?�推�?��??, '', '??],
      ['社群?�知', '社群平台群發?�推�???��??��?信�?如�?LinkedIn ?�缺?�薦?�報?�Facebook ?��??��?）�?, '', '??],
      ['?�人?��?', '親�??�個人來信?��?人�??��???機票確�?信�?, '', '??],
      ['Netflix', 'Netflix（含 @account.netflix.com ??netflix.com ?��?）發?��??�?�信件�?例�?：電子發票收?�、帳?��??��?示、推?��??��??��?, '', '??]
    ];
    sheet.getRange(14, 1, defaultCategories.length, 4).setValues(defaultCategories);
    // ?��?塊�?：Few-Shot 範�???
    const catEndRow = 14 + defaultCategories.length;
    sheet.getRange(catEndRow + 1, 1).setValue('?��?塊�?：Few-Shot 範�???);
    sheet.getRange(catEndRow + 2, 1, 1, 8).setValues([['範�?說�?', '寄件??, '主旨?�鍵�?, '?��??��?', '�?��?��?', '�?��緊急度', '精�??��?範�?', '?�用']]);
    const defaultExamples = [
      ['工�??�人私�?', 'LinkedIn <messages-noreply@linkedin.com>', '?�送�?訊息給您', '?��??��??�您?�履歷�??��??��???..', '工�?', '�?, 'LinkedIn私�?-?�大???��??�履�?, '??],
      ['社群群發?�報', 'LinkedIn <jobs-listings@linkedin.com>', '?��??�適?�您?�職�?, '?�週�? 15 ?�符?�您軟�?工�?師�??��??�職�?..', '社群?�知', '�?, 'LinkedIn-軟�?工�?師職缺推?�週報', '??],
      ['?�人消費訂單', 'Shopee <info@shopee.tw>', '訂單?��??�知', '?��??��?消費，�??�編??123456 已�?立�?消費?��? NT$ 500 ??..', '?�人消費', '�?, '?�皮購物-訂單?��?-?��?NT$500', '??],
      ['?�入?��??�知', 'kgi@kgibank.com.tw', '網路?�行登?��??�通知', '?�於 2026-06-11 12:00 ?��??�入網路?�行�??��??�人請聯絡客??..', '?�入?��??�知', '�?, '?�基?��??�入?��??��?', '??],
      ['系統驗�?�?, 'service@shopee.tw', '帳�?變更驗�?�?, '?��?驗�?碼為 987654，�???5 ?��??�輸?��??��?, '系統?�知', '�?, '?�皮購物-驗�?�?987654', '??],
      ['Netflix?�入驗�?�?, 'info@account.netflix.com', 'Netflix：您?�登?�碼', '?��??�入碼為 123456，�???15 ?��??�輸??..', 'Netflix', '�?, 'Netflix-?�入�?123456', '??],
      ['Netflix?�戶裝置確�?', 'info@account.netflix.com', '確�?信�??�已確�?Netflix ?�戶裝置', '?��??��?已設定為此帳?��??�戶裝置之�?...', 'Netflix', '�?, 'Netflix-?�戶裝置已確�?, '??]
    ];
    sheet.getRange(catEndRow + 3, 1, defaultExamples.length, 8).setValues(defaultExamples);
    // ?��???
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
 * �?AI_PromptConfig 工�?表�??�並組�? Prompt 設�??�件（快?�用�?
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
      if (a.indexOf('?�塊零') !== -1) { mode = 'zero'; return; }
      if (a.indexOf('?�塊�?') !== -1) { mode = 'one'; return; }
      if (a.indexOf('?�塊�?') !== -1) { mode = 'two'; return; }
      if (a.indexOf('?�塊�?') !== -1) { mode = 'three'; return; }

      if (mode === 'zero') {
        if (a === '?��?使用模�?' && b) model = b;
      } else if (mode === 'one') {
        if (a === '角色說�?') roleDesc = b;
        if (a === '緊急度-�?) urgencyHigh = b;
        if (a === '緊急度-�?) urgencyMid = b;
        if (a === '緊急度-�?) urgencyLow = b;
      } else if (mode === 'two') {
        // 標�??�跳?��?類別?�稱 = 標�?�?
        if (a === '類別?�稱' || !a) return;
        const enabled = String(row[3] || '').trim();
        if (enabled !== '??) {
          categories.push({ name: a, desc: b, note: String(row[2] || '').trim() });
        }
      } else if (mode === 'three') {
        if (a === '範�?說�?' || !a) return;
        const enabled = String(row[7] || '').trim();
        if (enabled !== '??) {
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
 * ?�叫 Gemini API ?��??�用模�?清單，並?�新 AI_PromptConfig ?��??�選??
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
    // ?�到?�目?�使?�模?�」�??��?
    let modelRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === '?��?使用模�?') { modelRow = i + 1; break; }
    }
    if (modelRow > 0) {
      // 設�?下�??�單驗�?
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(models, true).build();
      sheet.getRange(modelRow, 2).setDataValidation(rule);
      // ?�新?�用模�?清單顯示�?
      let listRow = -1;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === '?�用模�?清單 (供�???') { listRow = i + 1; break; }
      }
      if (listRow > 0) sheet.getRange(listRow, 2).setValue(models.join(', '));
      // ?�新?��???
      let tsRow = -1;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === '上次?�新模�?清單') { tsRow = i + 1; break; }
      }
      if (tsRow > 0) sheet.getRange(tsRow, 2).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
    }
    Logger.log(`refreshAvailableModels: updated ${models.length} model(s): ${models.join(', ')}`);
  } catch(e) { Logger.log('refreshAvailableModels exception: ' + e); }
}

/**
 * �?AI_PromptConfig 讀?�目?�選?��?模�??�稱
 * @return {string} model name (e.g. 'gemini-3.5-flash')
 */
function getSelectedModel() {
  try {
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = Math.min(sheet.getLastRow(), 10);
    const data = sheet.getRange(1, 1, lastRow, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === '?��?使用模�?' && data[i][1]) return String(data[i][1]).trim();
    }
  } catch(e) { Logger.log('getSelectedModel error: ' + e); }
  return 'gemini-2.5-flash';
}

// =========================================================================
// ==================== AI_Uncategorized 系�??��? (v3.0) ====================
// =========================================================================

/** ?��??�建�?AI_Uncategorized 工�?�?*/
function getOrCreateUncategorizedSheet() {
  const ss = getOrCreateSpreadsheet_();
  let sheet = ss.getSheetByName(UNCATEGORIZED_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(UNCATEGORIZED_SHEET_NAME);
    sheet.appendRow(['Thread ID', 'Email', 'Sender Name', 'Subject', 'AI?��?', '信件?��?', '人工?��?', '?�??]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 220); sheet.setColumnWidth(3, 130);
    sheet.setColumnWidth(4, 280); sheet.setColumnWidth(5, 200); sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 110); sheet.setColumnWidth(8, 100);
    // 標�??�格�?
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#E53E3E').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    // ?�人工�?類」�?下�??�單（G�?= �?欄�?從第2?�起�?
    const categoryValidation = SpreadsheetApp.newDataValidation().requireValueInList(VALID_CATEGORIES, true).build();
    sheet.getRange(2, 7, 500, 1).setDataValidation(categoryValidation);
    // ?��??�」�?條件?��???
    const pendingRule = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('待審??).setBackground('#FEF3C7').setFontColor('#92400E').bold(true).setRanges([sheet.getRange('H2:H500')]).build();
    const doneRule   = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('??已�???).setBackground('#DCFCE7').setFontColor('#166534').setRanges([sheet.getRange('H2:H500')]).build();
    const failRule   = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('???��?失�?').setBackground('#FEE2E2').setFontColor('#991B1B').setRanges([sheet.getRange('H2:H500')]).build();
    sheet.setConditionalFormatRules([pendingRule, doneRule, failRule]);
    Logger.log('Created AI_Uncategorized sheet.');
  }
  return sheet;
}

/** 記�? AI ?��?失�??�信件到 AI_Uncategorized 工�?�?*/
function logToUncategorizedSheet(thread, senderEmail, rawSender, subject, refinedContent) {
  try {
    const sheet = getOrCreateUncategorizedSheet();
    // 檢查?�否已�??��?（避?��?複�?
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
    sheet.appendRow([threadId, senderEmail, senderName, subject, refinedContent || '', dateStr, '', '待審??]);
    Logger.log(`Logged uncategorized thread ${threadId} to ${UNCATEGORIZED_SHEET_NAME}.`);
  } catch(e) { Logger.log('logToUncategorizedSheet error: ' + e); }
}

/**
 * ?��? AI_Uncategorized 工�?表�??��??��?已填?�「人工�?類」�??��?
 * ?��?觸發：�?�?autoOrganizeGmailWithGemini() 結�?�?+ sendDailyDigest() ?��??��?
 * 也可?��???Apps Script 編輯?�直?�執行�?
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
      if (!manualCat || status === '??已�???) return;
      if (!VALID_CATEGORIES.includes(manualCat)) {
        Logger.log(`Row ${i+2}: Invalid category "${manualCat}", skipping.`);
        return;
      }
      try {
        const threads = GmailApp.getThreadById(threadId);
        if (!threads) { throw new Error('Thread not found: ' + threadId); }
        // 移除 AI/?��?�?標籤
        const oldLabel = GmailApp.getUserLabelByName('AI/?��?�?);
        if (oldLabel) threads.removeLabel(oldLabel);
        // 套用?��?�?
        const newLabelName = 'AI/' + manualCat;
        let newLabel = GmailApp.getUserLabelByName(newLabelName);
        if (!newLabel) newLabel = GmailApp.createLabel(newLabelName);
        threads.addLabel(newLabel);
        // 移至對�? Gmail ?��?
        const tabId = CATEGORY_TAB_MAPPING[manualCat];
        if (tabId) moveThreadToGmailCategory(threadId, tabId);
        // 寫入 AI_Rules
        if (rulesSheet) {
          const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          rulesSheet.appendRow([email, rawSender, manualCat, '�?, '[人工修正]', `from:${email}`, nowStr]);
        }
        // ?�新?�??
        sheet.getRange(i + 2, 8).setValue('??已�???);
        // ?��?學�?規�?
        saveToLearningRules(email, rawSender, subject, manualCat);
        // ?�步??AI_PromptConfig 範�?
        addExampleToPromptConfig_(email, subject, manualCat, '�?, '[人工修正]');
        processed++;
        Logger.log(`processUncategorizedSheet: Row ${i+2} ??${manualCat} ?�`);
      } catch(e) {
        sheet.getRange(i + 2, 8).setValue('???��?失�?');
        Logger.log(`processUncategorizedSheet: Row ${i+2} failed: ` + e);
      }
    });
    Logger.log(`processUncategorizedSheet done. Processed: ${processed} item(s).`);
  } catch(e) { Logger.log('processUncategorizedSheet exception: ' + e); }
}

/** 將人工修�???�新增為 AI_PromptConfig ??Few-Shot 範�? */
function addExampleToPromptConfig_(email, subject, category, urgency, refined) {
  try {
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(1, 1, lastRow, 1).getValues();
    let exHeaderRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).includes('?�塊�?')) { exHeaderRow = i + 2; break; } // +2 for header row
    }
    if (exHeaderRow < 0) return;
    // ?�到第�??�空??
    const exData = sheet.getRange(exHeaderRow + 1, 1, Math.max(1, lastRow - exHeaderRow), 8).getValues();
    let insertRow = lastRow + 1;
    for (let i = 0; i < exData.length; i++) {
      if (!String(exData[i][0]).trim()) { insertRow = exHeaderRow + 1 + i; break; }
    }
    sheet.getRange(insertRow, 1, 1, 8).setValues([[`人工修正-${category}`, email, subject.substring(0,30), '', category, urgency, refined, '??]]);
    Logger.log(`Added example to AI_PromptConfig row ${insertRow}.`);
  } catch(e) { Logger.log('addExampleToPromptConfig_ error: ' + e); }
}

// =========================================================================
// ==================== AI_LearningRules 系�??��? (v3.0) ====================
// =========================================================================

/** ?��??�建�?AI_LearningRules 工�?�?*/
function getOrCreateLearningRulesSheet() {
  const ss = getOrCreateSpreadsheet_();
  let sheet = ss.getSheetByName(LEARNING_RULES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LEARNING_RULES_SHEET_NAME);
    sheet.appendRow(['Email/Domain', 'Sender Name', 'Subject Keyword', '�?��?��?', '學�?來�?', '?�新?��?', '?�中次數']);
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
 * 載入?�?�學習�??�至記憶�?Map
 * @return {Map} senderEmail ??category
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

/** ?��??�更?��?條學習�???*/
function saveToLearningRules(email, senderName, subject, category) {
  try {
    const sheet = getOrCreateLearningRulesSheet();
    const lastRow = sheet.getLastRow();
    const emailLower = email.trim().toLowerCase();
    // ?�查?�否已�???email ?��???
    if (lastRow >= 2) {
      const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() === emailLower) {
          // ?�新?��??��???
          const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
          sheet.getRange(i + 2, 4).setValue(category);
          sheet.getRange(i + 2, 6).setValue(nowStr);
          const hits = parseInt(data[i][6] || 0) + 1;
          sheet.getRange(i + 2, 7).setValue(hits);
          Logger.log(`saveToLearningRules: Updated ${emailLower} ??${category} (hits: ${hits})`);
          return;
        }
      }
    }
    // ?��?記�?
    const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    sheet.appendRow([emailLower, senderName || '', subject ? subject.substring(0,50) : '', category, '人工修正', nowStr, 1]);
    Logger.log(`saveToLearningRules: Added ${emailLower} ??${category}`);
  } catch(e) { Logger.log('saveToLearningRules error: ' + e); }
}

// =========================================================================
// ==================== 每日?��? Email ?��? (v3.0) ====================
// =========================================================================

/**
 * ?�送�??��?點信件�?�?Email??
 * ?��?觸發：�???20:00?��??��??�執行�?
 */
function sendDailyDigest() {
  // ?��??�人工審?��??��?確�??��??�含?�?��???
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

    // 篩選今日 + 高�??�度 ??工�?類別
    const important = [], highUrgency = [];
    data.forEach(row => {
      const updatedTime = String(row[6] || '');
      if (!updatedTime.startsWith(today)) return;
      const category = String(row[2] || '').trim();
      const urgency  = String(row[3] || '').trim();
      const refined  = String(row[4] || '').trim();
      const email    = String(row[0] || '').trim();
      const sender   = String(row[1] || '').trim();
      if (urgency === '�?) highUrgency.push({email, sender, category, urgency, refined, time: updatedTime});
      else if (category === '工�?') important.push({email, sender, category, urgency, refined, time: updatedTime});
    });

    if (highUrgency.length === 0 && important.length === 0) {
      Logger.log('sendDailyDigest: No high-urgency or work emails today.');
      return;
    }

    // 組�? HTML Email
    const formatRows = (items) => items.map(item =>
      `<tr><td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.time.split(' ')[1] || ''}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.sender || item.email}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;"><span style="background:${item.urgency==='�??'#FEE2E2':item.urgency==='�??'#FEF3C7':'#DCFCE7'};color:${item.urgency==='�??'#991B1B':item.urgency==='�??'#92400E':'#166534'};padding:2px 8px;border-radius:4px;font-size:12px;">${item.urgency}</span></td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.refined}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;"><a href="https://mail.google.com/mail/u/0/#search/from:${encodeURIComponent(item.email)}" style="color:#3182CE;">?��?</a></td></tr>`
    ).join('');

    const tableHeader = `<tr style="background:#2D3748;color:#FFFFFF;"><th style="padding:10px;text-align:left;">?��?</th><th style="padding:10px;text-align:left;">寄件??/th><th style="padding:10px;text-align:center;">緊急度</th><th style="padding:10px;text-align:left;">AI?��?</th><th style="padding:10px;">?��?</th></tr>`;

    let htmlBody = `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#2D3748,#4A5568);padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:#FFFFFF;margin:0;font-size:20px;">?�� GmailWithGemini 每日?��??��?</h1>
    <p style="color:#A0AEC0;margin:4px 0 0;font-size:14px;">${today} ????${highUrgency.length + important.length} 封�?點信�?/p>
  </div>
  <div style="padding:20px;background:#F7FAFC;border:1px solid #E2E8F0;">`;

    if (highUrgency.length > 0) {
      htmlBody += `<h2 style="color:#991B1B;font-size:16px;margin:0 0 12px;">?�� 高�??�度信件 (${highUrgency.length} �?</h2>
      <table style="width:100%;border-collapse:collapse;background:#FFFFFF;border-radius:8px;overflow:hidden;margin-bottom:20px;">${tableHeader}${formatRows(highUrgency)}</table>`;
    }
    if (important.length > 0) {
      htmlBody += `<h2 style="color:#2B6CB0;font-size:16px;margin:0 0 12px;">?�� 工�?類信�?(${important.length} �?</h2>
      <table style="width:100%;border-collapse:collapse;background:#FFFFFF;border-radius:8px;overflow:hidden;margin-bottom:20px;">${tableHeader}${formatRows(important)}</table>`;
    }
    htmlBody += `<p style="color:#718096;font-size:12px;margin-top:16px;">此報?�由 GmailWithGemini v3.0 ?��??��??��??�?��?完整記�?，�??��? <a href="https://docs.google.com/spreadsheets/" style="color:#3182CE;">GmailWithGemini_Rules</a> 試�?表�?/p>
  </div></div>`;

    const recipient = DIGEST_RECIPIENT_EMAIL || Session.getActiveUser().getEmail();
    GmailApp.sendEmail(recipient, `[GmailWithGemini] ${today} 每日?��??��? ??${highUrgency.length + important.length} 封�?點信件`, '', {htmlBody});
    Logger.log(`sendDailyDigest: Sent to ${recipient}. High=${highUrgency.length}, Work=${important.length}`);
  } catch(e) { Logger.log('sendDailyDigest error: ' + e); }
}

// =========================================================================
// ==================== 觸發?�管?��? API 診斷工具 ====================
// =========================================================================

/**
 * 一?�設定自?�觸?�器（�? TRIGGER_INTERVAL_HOURS ?��?建�??��?觸發??+ 每日 20:00 ?��?觸發?��???
 * ?��??��??��?清除?�?�已存在?�觸?�器，避?��?複建立�?
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

  // 每日 20:00 ?��?觸發??
  ScriptApp.newTrigger('sendDailyDigest')
    .timeBased().everyDays(1).atHour(20).nearMinute(0).create();
  Logger.log('Created daily digest trigger at 20:00.');
  // ?�新?�用模�?清單
  try { refreshAvailableModels(); } catch(e) { Logger.log('refreshAvailableModels skipped: ' + e); }
  Logger.log('Setup complete!');
}

/**
 * 移除?�?��? autoOrganizeGmailWithGemini ??sendDailyDigest ?��??�觸?�器??
 * ?�用?�暫?�自?�執行�??�置觸發?�設定�?
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
 * API ?�鑰診斷工具??
 * ?�送�??�簡?��?測試請�???Gemini API，�?證�??�是?��??��?屬於?�費專�???
 */
function checkApiKeyStatus() {
  const apiKey = PropertiesService.getScriptProperties().getProperty(GEMINI_API_KEY_PROPERTY);
  if (!apiKey) {
    Logger.log('??ERROR: GEMINI_API_KEY is not set in script properties.');
    Logger.log('Please go to Project Settings ??Script Properties ??Add GEMINI_API_KEY.');
    return;
  }
  
  Logger.log('?? API Key found: ' + apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - 4));
  Logger.log('?? Testing Gemini API connection (model: gemini-2.5-flash)...');
  
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
      Logger.log('??SUCCESS: API Key is valid and working!');
      Logger.log('?? Response code: 200 OK');
      
      // 檢查?��?中是?��?計費?��?警�?
      if (responseText.indexOf('billing') !== -1 || responseText.indexOf('quota') !== -1) {
        Logger.log('?��? WARNING: Response mentions billing/quota. Please verify your GCP project billing status.');
      } else {
        Logger.log('?�� No billing warnings detected. Your API Key appears to be from a free-tier project.');
      }
    } else if (code === 400) {
      Logger.log('??ERROR (400): Invalid API key. Please check your GEMINI_API_KEY value.');
    } else if (code === 403) {
      Logger.log('??ERROR (403): API key does not have permission. Check API enablement in GCP Console.');
    } else if (code === 429) {
      Logger.log('?��? WARNING (429): Rate limit exceeded. Your API Key is valid but hitting free-tier limits.');
      Logger.log('This is normal for free-tier keys. The script has built-in auto-retry for this.');
    } else {
      Logger.log('??ERROR (' + code + '): ' + responseText.substring(0, 300));
    }
  } catch (e) {
    Logger.log('??EXCEPTION: ' + e.toString());
  }
  
  // 顯示觸發?��???
  const triggers = ScriptApp.getProjectTriggers();
  const gmailTriggers = triggers.filter(t => t.getHandlerFunction() === 'autoOrganizeGmailWithGemini');
  Logger.log('\n??Active triggers: ' + gmailTriggers.length);
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


