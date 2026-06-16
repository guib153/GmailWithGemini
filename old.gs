// ==================== ?典?閮剖? ====================
// 1. ?誘蝣澆惇?找葉??Gemini API ??迂
const GEMINI_API_KEY_PROPERTY = 'GEMINI_API_KEY';

// 2. Gmail ??蝭拚璇辣 (?撌脫?蝐斤??芾?靽∩辣嚗甇ａ?銴霈)
const GMAIL_SEARCH_QUERY = 'is:unread -label:"AI/撌乩?" -label:"AI/鞎∪?撣喳" -label:"AI/?犖瘨祥" -label:"AI/蝟餌絞?" -label:"AI/?餃???" -label:"AI/撱??銵" -label:"AI/蝷曄黎?" -label:"AI/?犖?梁?" -label:"AI/Netflix" -label:"AI/?芸?憿?';

// 3. 瘥活???縑隞嗅?閰曹葡?憭扳??const MAX_THREADS_TO_SCAN = 50;

// 4. ?臬?身敺?????(??? ?隞園?憪??const PROCESS_OLDEST_FIRST = true;

// 5. ?桀??萎辣?扳??瑕?摮銝?嚗??Token ?
const EMAIL_BODY_CHAR_LIMIT = 1000;

// 5.1 ?極雿”?迂
const RULES_SHEET_NAME = 'AI_Rules';
const EXECUTION_LOG_SHEET_NAME = 'AI_Execution_Log';
const UNCATEGORIZED_SHEET_NAME = 'AI_Uncategorized';
const LEARNING_RULES_SHEET_NAME = 'AI_LearningRules';
const PROMPT_CONFIG_SHEET_NAME = 'AI_PromptConfig';

// 6. ?函?閰衣?銵典?蝔梧???潛蝡?祇?甈∪遣蝡?嚗?const STANDALONE_SPREADSHEET_NAME = 'GmailWithGemini_Rules';

// 7. ?誘蝣澆惇?找葉?蝡岫蝞” ID ?迂
const STANDALONE_SPREADSHEET_PROPERTY = 'RULES_SHEET_ID';

// 8. API ?澆閮剖?
const API_MAX_RETRIES = 3;
const API_RETRY_BASE_DELAY_MS = 10000;

// 8.1 ?寞活??閮剖? (v3.0)
const BATCH_SIZE = 10;         // 瘥甈∪?????靽∩辣?賊?
const BATCH_DELAY_MS = 2000;   // ?寞活銋???敺神蝘

// 8.2 ?芸????? (v3.0)
const TRIGGER_INTERVAL_HOURS = 1; // ?芸???閫貊?? (撠?)嚗?=瘥??? 2=瘥?撠?

// 8.3 瘥?? Email ?嗡辣鈭綽??征??蝯血銵?祉?撣唾??祈澈嚗?const DIGEST_RECIPIENT_EMAIL = '';

// 9. AI ??撠???Gmail ?嗡辣??頂蝯勗???蝐?ID
const CATEGORY_TAB_MAPPING = {
  "撌乩?": "CATEGORY_PERSONAL",
  "鞎∪?撣喳": "CATEGORY_UPDATES",
  "?犖瘨祥": "CATEGORY_UPDATES",
  "蝟餌絞?": "CATEGORY_UPDATES",
  "?餃???": "CATEGORY_UPDATES",
  "撱??銵": "CATEGORY_PROMOTIONS",
  "蝷曄黎?": "CATEGORY_SOCIAL",
  "?犖?梁?": "CATEGORY_PERSONAL",
  "Netflix": "CATEGORY_UPDATES",
  "?芸?憿?: "CATEGORY_PERSONAL"
};

// 10. ?????”嚗??AI_Uncategorized 銝?撽?嚗?const VALID_CATEGORIES = ["撌乩?","鞎∪?撣喳","?犖瘨祥","蝟餌絞?","?餃???","撱??銵","蝷曄黎?","?犖?梁?","Netflix"];
// =========================================================================

// =========================================================================
// ==================== ?臬?典銵??亙?賢?隤芣? (Runnable Functions) ====================
// =========================================================================
/**
 * 1. autoOrganizeGmailWithGemini()    ???箸?萎辣??銝餌?撘??寞活 AI + ?芯蜓摮貊?嚗? * 2. syncExistingLabeledThreadsToCategories() ??甇瑕靽∩辣?嗡辣??????萄?甇? * 3. processUncategorizedSheet()      ???? AI_Uncategorized 鈭箏極撖拇蝯?
 * 4. sendDailyDigest()                ????閫貊隞???? Email
 * 5. setupTriggers()                  ??銝?菔身摰?刻?孛?澆
 * 6. removeTriggers()                 ??蝘駁?券閫貊?剁??怠??芸??瑁?嚗? * 7. checkApiKeyStatus()              ??API ?閮箸撌亙
 * 8. refreshAvailableModels()         ?????瑟 AI_PromptConfig ??冽芋???? */
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
    // 1. ???芯蜓摮貊?閬?
    const learningRules = loadLearningRules();
    Logger.log(`Loaded ${learningRules.size} learning rule(s).`);

    // 2. ?? Prompt 閮剖?
    const promptConfig = buildPromptFromSheet();
    Logger.log(`Prompt loaded: ${promptConfig.categories.length} cats, ${promptConfig.examples.length} examples, model: ${promptConfig.model}`);

    // 3. ??閰衣?銵?    let sheet;
    try { sheet = getOrCreateRulesSheet(); } catch(e) { Logger.log("Sheet init error: " + e); }

    // 4. ???芾?銝??靽∩辣
    let threads = GmailApp.search(GMAIL_SEARCH_QUERY, 0, 50);
    if (threads.length === 0) {
      Logger.log("No unread threads found.");
    } else {
      if (PROCESS_OLDEST_FIRST) threads.reverse();
      threads = threads.slice(0, MAX_THREADS_TO_SCAN);
      Logger.log(`Found ${threads.length} thread(s) to classify.`);

      // 5. ??嚗飛蝧??銝?vs. ?閬?AI ?方?
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
              category: learningRules.get(senderEmail), urgency: "雿?,
              refinedContent: `[摮貊?閬??賭葉] ${learningRules.get(senderEmail)}` });
          } else {
            needsAI.push({ thread, rawSender, senderEmail, subject, body });
          }
        } catch(e) { failureCount++; Logger.log("Pre-process error: " + e); }
      });

      // 6. ??摮貊?閬??賭葉
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

      // 7. ?寞活 AI ??
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
              if (urgency === "擃?) highUrgencyCount++;
              else if (urgency === "銝?) mediumUrgencyCount++;
              else lowUrgencyCount++;
              const d = item.thread.getLastMessageDate();
              if (!minDate || d < minDate) minDate = d;
              if (!maxDate || d > maxDate) maxDate = d;
              Logger.log(`[AI] ${item.senderEmail} ??${category} (${urgency})`);
            } else {
              failureCount++;
              category = "?芸?憿?; urgency = "雿?;
              refinedContent = "AI?寞活?方?憭望?嚗?敺犖撌亙祟??;
              Logger.log(`[Fallback] ${item.senderEmail} ???芸?憿);
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
 * 頛?賢?嚗??典?憿?蝐扎??Gmail ???神??AI_Rules ?亥?
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
 * 銝甈⊥扳風?脖縑隞嗆飛憿極?瑯? * ????風?脣歇甇賊?璅惜 (AI/*) ?縑隞塚?銝血??嗉??甇亦宏?喳??? Gmail ??銝准? * 甇文銵??其???澆 Gemini API?? */
function syncExistingLabeledThreadsToCategories() {
  Logger.log("Starting historical email category migration...");
  try {
    for (const category in CATEGORY_TAB_MAPPING) {
      const tabLabelId = CATEGORY_TAB_MAPPING[category];
      const labelName = "AI/" + category;
      const label = GmailApp.getUserLabelByName(labelName);
      if (!label) continue;
      
      try {
        // ?瑕???100 撠縑嚗?寞??閬?銴銵誑瘨??游之靽⊿?嚗?        const threads = label.getThreads(0, 100);
        Logger.log(`Found ${threads.length} threads labeled with '${labelName}'. Moving to ${tabLabelId}...`);
        
        threads.forEach((thread, index) => {
          if (index > 0) {
            Utilities.sleep(150); // ?脩? API ?餌???
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
 * ?瑕?銋暹楊?摮縑蝞勗? (撠神)
 * @param {string} emailString ??靽∩辣?啣?摮葡
 * @return {string} 銋暹楊?縑蝞勗?
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
 * 蝢?閰衣?銵冽???閫銝西身摰??亙漲璇辣?澆????? * @param {Sheet} sheet Google Sheets 撌乩?銵函隞? */
function formatSheetAesthetics(sheet) {
  // 1. 閮剖?甈?撖砍漲?脫迫?批捆?格?
  sheet.setColumnWidth(1, 240); // ?餃?靽∠拳
  sheet.setColumnWidth(2, 160); // 撖辣??蝔?  sheet.setColumnWidth(3, 110); // 憿
  sheet.setColumnWidth(4, 90);  // 蝺亙漲
  sheet.setColumnWidth(5, 280); // AI 蝎曄??批捆
  sheet.setColumnWidth(6, 200); // Gmail ??摮葡
  sheet.setColumnWidth(7, 160); // ?湔??
  
  // 2. 憟 A1:G1000 銋漱?輯??航敶?(?收蝺?
  const fullRange = sheet.getRange("A1:G1000");
  fullRange.clearFormat(); // 皜?撘?  
  // 皜??曉????漱?輯??航身摰?(Bandings) ?踹?銵?
  const bandings = sheet.getBandings();
  bandings.forEach(banding => banding.remove());
  
  fullRange.setAlternatingRowColors(
    "#FFFFFF", // 憟銵?    "#F7FAFC", // ?嗆銵?    "#2D3748"  // 璅?銵?  );
  
  // 3. 閮剖?璅??見撘?( setAlternatingRowColors ??鋆質??荔????璅????寧蝝蝎?)
  const headerRange = sheet.getRange(1, 1, 1, 7);
  headerRange.setFontFamily("Arial")
             .setFontSize(10)
             .setFontWeight("bold")
             .setFontColor("#FFFFFF")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");
             
  sheet.setRowHeight(1, 28); // 閮剖?璅???摨?  
  // 4. 閮剖?鞈?甈?瘞游像???游?朣?  sheet.getRange("A2:A1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("B2:B1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("C2:C1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D2:D1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("E2:E1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("F2:F1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("G2:G1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  
  // 5. 閮剖?蝺亙漲 (D甈? 璇辣?澆?????(擃?蝝? 銝?暺? 雿?蝬?
  const urgencyRange = sheet.getRange("D2:D1000");
  
  const ruleHigh = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("擃?)
      .setBackground("#FEE2E2") // 瘛箇?
      .setFontColor("#991B1B") // 瘛梁?
      .bold(true)
      .setRanges([urgencyRange])
      .build();
      
  const ruleMedium = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("銝?)
      .setBackground("#FEF3C7") // 瘛粹?
      .setFontColor("#92400E") // 瘛梢?
      .bold(true)
      .setRanges([urgencyRange])
      .build();
      
  const ruleLow = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("雿?)
      .setBackground("#DCFCE7") // 瘛箇?
      .setFontColor("#166534") // 瘛梁?
      .setRanges([urgencyRange])
      .build();
      
  sheet.setConditionalFormatRules([ruleHigh, ruleMedium, ruleLow]);
  Logger.log("Applied premium aesthetic formats and conditional rules to AI_Rules sheet.");
}

/**
 * ????遣蝡?AI_Rules 撌乩?銵? * @return {Sheet} Google Sheets 撌乩?銵函隞? */
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
    // ????憿?
    sheet.appendRow(["Email", "Sender Name", "Category", "Urgency", "AI Refined Content", "Gmail Search Query", "Updated Time"]);
    sheet.setFrozenRows(1);
    formatSheetAesthetics(sheet);
    Logger.log("Created AI_Rules sheet and applied aesthetic rules.");
  } else if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    // ?芣?靽桀儔嚗撌乩?銵典摰寡◤皜征嚗??啣神?交?憿??澆???    sheet.appendRow(["Email", "Sender Name", "Category", "Urgency", "AI Refined Content", "Gmail Search Query", "Updated Time"]);
    sheet.setFrozenRows(1);
    formatSheetAesthetics(sheet);
    Logger.log("Recovered empty AI_Rules sheet headers and applied aesthetics.");
  } else {
    // ?????澆? (憒?蝻箏? Sender Name 甈?)
    if (sheet.getLastColumn() > 0 && sheet.getRange(1, 2).getValue() !== "Sender Name") {
      sheet.insertColumnBefore(2);
      sheet.getRange(1, 2).setValue("Sender Name");
      Logger.log("Migrated AI_Rules sheet: Inserted 'Sender Name' column at index 2.");
    }
    // ?????澆? (憒?蝻箏? AI Refined Content 甈?)
    if (sheet.getLastColumn() > 0 && sheet.getRange(1, 5).getValue() !== "AI Refined Content") {
      sheet.insertColumnBefore(5);
      sheet.getRange(1, 5).setValue("AI Refined Content");
      Logger.log("Migrated AI_Rules sheet: Inserted 'AI Refined Content' column at index 5.");
    }
    // 憟??憭???璅????隞嗉???    formatSheetAesthetics(sheet);
  }
  return sheet;
}

/**
 * ?瑕?撖辣??蝔? * @param {string} senderString ??撖辣??雿?銝?(憒?"KGI Bank <card999@kgibank.com>")
 * @return {string} 撖辣??蝔? */
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
 * 撖怠?瑁?蝯梯??亥??喳?函?撌乩?銵其葉
 */
function writeExecutionLog(timeString, minDate, maxDate, successCount, failureCount, highUrgency, mediumUrgency, lowUrgency, categoryStats, successYn, errorMsg) {
  const sheet = getOrCreateExecutionLogSheet();
  if (!sheet) return;
  
  // 1. 敶靽∩辣?嗡辣?????銝?  let dateRangeStr = "N/A";
  if (minDate && maxDate) {
    const tz = Session.getScriptTimeZone();
    const minStr = Utilities.formatDate(minDate, tz, "yyyy-MM-dd HH:mm");
    const maxStr = Utilities.formatDate(maxDate, tz, "yyyy-MM-dd HH:mm");
    dateRangeStr = `${minStr} ~ ${maxStr}`;
  }
  
  // 2. 敶??雿?摮葡 (靘?嚗極雿?2), Netflix(1))
  const statsList = [];
  for (const cat in categoryStats) {
    statsList.push(`${cat}(${categoryStats[cat]})`);
  }
  const categoryBreakdown = statsList.length > 0 ? statsList.join(", ") : "None";
  
  // 3. 撖怠????Execution Time, Email Date Range, Success Count, Failure Count, High, Medium, Low, Category Distribution, Finished Successfully, Error Message
  sheet.appendRow([timeString, dateRangeStr, successCount, failureCount, highUrgency, mediumUrgency, lowUrgency, categoryBreakdown, successYn, errorMsg]);
  Logger.log("Successfully logged execution stats.");
}

/**
 * ????遣蝡?AI_Execution_Log 撌乩?銵? * @return {Sheet} Google Sheets 撌乩?銵函隞? */
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
    // ????憿?    sheet.appendRow(["Execution Time", "Email Date Range", "Success Count", "Failure Count", "High Urgency", "Medium Urgency", "Low Urgency", "Category Distribution", "Finished Successfully", "Error Message"]);
    sheet.setFrozenRows(1);
    formatExecutionLogSheetAesthetics(sheet);
    Logger.log("Created AI_Execution_Log sheet and initialized formatting.");
  } else if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    // ?芣?靽桀儔嚗??極雿”鋡急?蝛綽??蔭璅??撘?    sheet.appendRow(["Execution Time", "Email Date Range", "Success Count", "Failure Count", "High Urgency", "Medium Urgency", "Low Urgency", "Category Distribution", "Finished Successfully", "Error Message"]);
    sheet.setFrozenRows(1);
    formatExecutionLogSheetAesthetics(sheet);
    Logger.log("Recovered empty AI_Execution_Log sheet headers.");
  }
  return sheet;
}

/**
 * 蝢?蝯梯??亥?撌乩?銵冽???閫銝西身摰銵???隞嗆撘?閬?
 * @param {Sheet} sheet Google Sheets 撌乩?銵函隞? */
function formatExecutionLogSheetAesthetics(sheet) {
  // 1. 閮剖?甈?撖砍漲
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
  
  // 2. 憟 A1:J1000 銋漱?輯??臬???(?收蝺?
  const fullRange = sheet.getRange("A1:J1000");
  fullRange.clearFormat(); // 皜?撘?  
  const bandings = sheet.getBandings();
  bandings.forEach(banding => banding.remove());
  
  fullRange.setAlternatingRowColors(
    "#FFFFFF", // 憟銵?    "#F7FAFC", // ?嗆銵?    "#2D3748"  // 璅?銵?  );
  
  // 3. 閮剖?璅??見撘?(蝝蝎?)
  const headerRange = sheet.getRange(1, 1, 1, 10);
  headerRange.setFontFamily("Arial")
             .setFontSize(10)
             .setFontWeight("bold")
             .setFontColor("#FFFFFF")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");
             
  sheet.setRowHeight(1, 28); // 閮剖?擃漲
  
  // 4. 閮剖?鞈?甈?瘞游像蝵桐葉??朣撘?  sheet.getRange("A2:A1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("B2:B1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("C2:C1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D2:D1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("E2:E1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("F2:F1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("G2:G1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("H2:H1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("I2:I1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("J2:J1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  
  // 5. 閮剖? Finished Successfully (I甈? 璇辣?澆?????(Y:蝬? N:蝝?
  const statusRange = sheet.getRange("I2:I1000");
  
  const ruleY = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Y")
      .setBackground("#DCFCE7") // 瘛箇?
      .setFontColor("#166534") // 瘛梁?
      .bold(true)
      .setRanges([statusRange])
      .build();
      
  const ruleN = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("N")
      .setBackground("#FEE2E2") // 瘛箇?
      .setFontColor("#991B1B") // 瘛梁?
      .bold(true)
      .setRanges([statusRange])
      .build();
      
  sheet.setConditionalFormatRules([ruleY, ruleN]);
  Logger.log("Applied premium aesthetic formats and conditional rules to AI_Execution_Log sheet.");
}

/**
 * 雿輻 Gmail REST API 撠?摰? thread 蝘餃??啣??拍? Gmail ?嗡辣?????(Category)
 * @param {string} threadId Gmail 撠店銝?ID
 * @param {string} tabLabelId Gmail 蝟餌絞??璅惜 ID (憒?"CATEGORY_SOCIAL")
 */
function moveThreadToGmailCategory(threadId, tabLabelId) {
  if (!threadId || !tabLabelId) return;
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`;
  const token = ScriptApp.getOAuthToken();
  
  // ?箔??脫迫???箇?典??????閰脣???銝衣宏?文隞頂蝯勗???蝐?  const systemCategories = [
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
// ==================== ?寞活 AI ???賢? (v3.0) ====================
// =========================================================================

/**
 * ?寞活 AI ??嚗?甈∪??憭?BATCH_SIZE 撠隞塚?閬? AI 靘??蝯????
 * @param {string} apiKey
 * @param {Array} emailList [{sender, subject, body}, ...]
 * @param {Object} promptConfig {categories, urgencyHigh, urgencyMid, urgencyLow, examples, roleDesc, model}
 * @return {Array|null} 蝯???? [{category, urgency, refinedContent}, ...] ??null
 */
function callGeminiApiBatch(apiKey, emailList, promptConfig) {
  const model = (promptConfig && promptConfig.model) ? promptConfig.model : 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // ??蝯???閬?
  const categoriesText = (promptConfig && promptConfig.categories && promptConfig.categories.length > 0)
    ? promptConfig.categories.map((c, i) => `${i+1}. ??{c.name}??${c.desc}${c.note ? ' *瘜冽?*嚗? + c.note : ''}`).join('\n')
    : `1. ?極雿?撠惇?犖???????瑚??縑隞嗚n2. ?瓷?董?柴??銵漱??蝝啜摮蟡具董?桃像鞎駁?n3. ?犖瘨祥??蝺?鞈潛閮蝣箄??鞎?????n4. ?頂蝯梢???芸??頂蝯梯郎?晞董???其縑???冽折?霅Ⅳ (OTP)?n5. ??交?????振?銵?蝬脩????潮?摰??交??Ⅱ隤縑?n6. ?誨???瑯??餃??晞??瑕誨???孵??撱?縑?n7. ?冗蝢日??蝷曄黎撟喳蝢斤?撱??????靽～n8. ?犖?梁???閬芸??犖靘縑??鈭箸?????璈巨蝣箄?靽～n9. ?etflix??Netflix嚗 @account.netflix.com ??netflix.com ??嚗????縑隞嗚;

  const categoryEnums = (promptConfig && promptConfig.categories && promptConfig.categories.length > 0)
    ? promptConfig.categories.map(c => c.name)
    : VALID_CATEGORIES;

  // ??蝯? Few-Shot 蝭?
  const defaultExamples = `- *蝭? 1 (撌乩??犖蝘?)*嚗n  - 撖辣??\`LinkedIn <messages-noreply@linkedin.com>\`嚗?憿?\`?之???閮蝯行\`嚗??\`?剁??唾??刻???..\`\n  - ?文?蝯?嚗`category: "撌乩?"\`, \`urgency: "銝?\`, \`refinedContent: "LinkedIn蝘?-?之???唾??悼甇?\`\n- *蝭? 2 (?犖瘨祥閮)*嚗n  - 撖辣??\`Shopee <info@shopee.tw>\`嚗?憿?\`閮???\`嚗??\`???函?瘨祥嚗?鞎駁?憿?NT$ 500 ??..\`\n  - ?文?蝯?嚗`category: "?犖瘨祥"\`, \`urgency: "雿?\`, \`refinedContent: "?衣鞈潛-閮??-NT$500"\``;
  const examplesText = (promptConfig && promptConfig.examples && promptConfig.examples.length > 0)
    ? promptConfig.examples.map((ex, i) => `- *蝭? ${i+1} (${ex.label})*嚗n  - 撖辣??\`${ex.sender}\`嚗?憿?\`${ex.subject}\`嚗??\`${ex.body}\`\n  - ?文?蝯?嚗`category: "${ex.category}"\`, \`urgency: "${ex.urgency}"\`, \`refinedContent: "${ex.refined}"\``).join('\n')
    : defaultExamples;

  const urgencyHigh = (promptConfig && promptConfig.urgencyHigh) || '?閬??瘜冽???銋縑隞嗚?憒?撽?蝣?(OTP)??亦撣詨??刻郎?晞縑?典瘨祥???;
  const urgencyMid  = (promptConfig && promptConfig.urgencyMid)  || '???找??⊿?蝡??銋縑隞嗚?憒?撟曉予?批??蝜唾祥撣喳?極雿?霅圈?蝝?颲虫遙??;
  const urgencyLow  = (promptConfig && promptConfig.urgencyLow)  || '?桃?鞈?????瑟??找?靽∩辣??憒?撱??銵靽??交???冗蝢文?????;
  const roleDesc    = (promptConfig && promptConfig.roleDesc)    || '?冽銝雿?璆剔??箸?萎辣??蝘??閰喟敦??隞乩??萎辣??隞嗉?憿??扳?嚗蒂靘???閬?瘙箏??園??亥?蝺亙漲??;

  // 蝯??寞活?萎辣?”??
  const emailsText = emailList.map((em, idx) => `[?萎辣 ${idx+1}]\n撖辣??${em.sender}\n璅?嚗?{em.subject}\n?扳?嚗?{em.body}`).join('\n---\n');

  const promptText = `${roleDesc}

???郊撽?撘?(Chain of Thought)??1. **霅撖辣銝駁?**嚗?瑕?隞嗉雿車撟喳??蝜?2. **????曉惇??*嚗??迨?萎辣?胯????嗡辣鈭箏犖?????????甈∠黎?潛????閬??典誨??3. **?寥??????亙漲**嚗??誑銝?蝭脰??????亙漲閰摯??4. **鞈???**嚗移? 20 摮誑?找??萎辣憭扳?嚗?靽??鞈??????
??憿??亥?蝭?${categoriesText}

???亙漲閰閬???- ????${urgencyHigh}
- ?葉??${urgencyMid}
- ????${urgencyLow}

??靘??扳?撘?(Few-Shot Examples)??${examplesText}

隢?隞乩? ${emailList.length} 撠隞嗡?摨脰???嚗蒂隞?JSON ????澆??蝯?嚗?葉蝚?i ?隞嗅??洵 i 撠隞塚?嚗?---
${emailsText}
---
隢?潔???摰? JSON Schema 蝯?頛詨??蝯??;

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
            "urgency":  {"type": "STRING", "enum": ["擃?, "銝?, "雿?]},
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
 * ?寞活 AI ???岫???? */
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
// ==================== AI_PromptConfig 蝟餃??賢? (v3.0) ====================
// =========================================================================

/** ???遣蝡?AI_PromptConfig 撌乩?銵剁?銝血?憪??身?批捆 */
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
    // ??憛嚗芋?身摰?    sheet.getRange('A1').setValue('??憛嚗芋?身摰?);
    sheet.getRange('A2').setValue('?桀?雿輻璅∪?');
    sheet.getRange('B2').setValue('gemini-2.5-flash');
    sheet.getRange('A3').setValue('銝活?湔璅∪?皜');
    sheet.getRange('B3').setValue('撠?瑟嚗??瑁? refreshAvailableModels()');
    sheet.getRange('A4').setValue('?舐璅∪?皜 (靘???');
    sheet.getRange('B4').setValue('gemini-2.5-flash, gemini-3-flash, gemini-3.5-flash');
    // ??憛?嚗??脫?隞扎?    sheet.getRange('A6').setValue('??憛?嚗??脫?隞扎?);
    sheet.getRange('A7').setValue('閫隤芣?');
    sheet.getRange('B7').setValue('?冽銝雿?璆剔??箸?萎辣??蝘??閰喟敦??隞乩??萎辣??隞嗉?憿??扳?嚗蒂靘???閬?瘙箏??園??亥?蝺亙漲????隢移?府靽∩辣???菜敹摰嫘?);
    sheet.getRange('A8').setValue('蝺亙漲-擃?);
    sheet.getRange('B8').setValue('?閬??瘜冽???銋縑隞嗚?憒?撽?蝣?(OTP)??亦撣詨??刻郎?晞縑?典瘨祥??仿????極雿蝷?);
    sheet.getRange('A9').setValue('蝺亙漲-銝?);
    sheet.getRange('B9').setValue('???找??⊿?蝡??銋縑隞嗚?憒?撟曉予?批??蝜唾祥撣喳?極雿?霅圈?蝝?颲虫遙??);
    sheet.getRange('A10').setValue('蝺亙漲-雿?);
    sheet.getRange('B10').setValue('?桃?鞈?????瑟??找?靽∩辣??憒?撱??銵靽??交???冗蝢文?????);
    // ??憛?嚗?憿??亙?蝢押?    sheet.getRange('A12').setValue('??憛?嚗?憿??亙?蝢押?);
    sheet.getRange('A13:D13').setValues([['憿?迂', '閰喟敦隤芣?', '?酉/?寞?閬?', '?']]);
    const defaultCategories = [
      ['撌乩?', '撠惇?犖?????極雿遙??雿???瑚??縑隞塚?憒?104鈭箏??銵閰阡?隢??冗蝢文像?啣犖撠店嚗?嚗inkedIn 撠惇蝘?/?舐窗鈭箔縑隞塚???, '敹??舫?撠隞嗉犖????銵?靽∩辣??箇黎?潛??瑞撩?餃??望?????嚗???憿?冗蝢日???誨???瑯?, '??],
      ['鞎∪?撣喳', '?銵漱??蝝啜摮蟡具董?桃像鞎駁???霅縑?典瘨祥???, '', '??],
      ['?犖瘨祥', '蝺?鞈潛閮蝣箄??鞎???????像?唳?蝝啜?銝祕擃??Ｘ?鞎餌蟡具?, '', '??],
      ['蝟餌絞?', '?芸??頂蝯梯郎?晞董???其縑???冽折?霅Ⅳ (OTP)??, '', '??],
      ['?餃???', '?振?銵?蝬脩????潮?摰??交??Ⅱ隤縑??, '', '??],
      ['撱??銵', '?餃??晞??瑕誨???孵??撱?縑??, '', '??],
      ['蝷曄黎?', '蝷曄黎撟喳蝢斤?撱??????靽∴?憒?LinkedIn ?瑞撩?刻?勗?acebook ????嚗?, '', '??],
      ['?犖?梁?', '閬芸??犖靘縑??鈭箸?????璈巨蝣箄?靽～?, '', '??],
      ['Netflix', 'Netflix嚗 @account.netflix.com ??netflix.com ??嚗????縑隞塚?靘?嚗摮蟡冽?董?嗅??冽?蝷箝?西????柴?, '', '??]
    ];
    sheet.getRange(14, 1, defaultCategories.length, 4).setValues(defaultCategories);
    // ??憛?嚗ew-Shot 蝭???    const catEndRow = 14 + defaultCategories.length;
    sheet.getRange(catEndRow + 1, 1).setValue('??憛?嚗ew-Shot 蝭???);
    sheet.getRange(catEndRow + 2, 1, 1, 8).setValues([['蝭?隤芣?', '撖辣??, '銝餅?摮?, '?扳???', '甇?Ⅱ??', '甇?Ⅱ蝺亙漲', '蝎曄???蝭?', '?']]);
    const defaultExamples = [
      ['撌乩??犖蝘?', 'LinkedIn <messages-noreply@linkedin.com>', '?喲?閮蝯行', '?剁????唳?悼甇瘀??唾??刻???..', '撌乩?', '銝?, 'LinkedIn蝘?-?之???唾??悼甇?, '??],
      ['蝷曄黎蝢斤?勗', 'LinkedIn <jobs-listings@linkedin.com>', '???舫??蝻?, '?望? 15 ?泵?頠?撌亦?撣怨??舐??啗蝻?..', '蝷曄黎?', '雿?, 'LinkedIn-頠?撌亦?撣怨蝻箸?阡勗', '??],
      ['?犖瘨祥閮', 'Shopee <info@shopee.tw>', '閮???', '???函?瘨祥嚗??桃楊??123456 撌脫?蝡?瘨祥?? NT$ 500 ??..', '?犖瘨祥', '雿?, '?衣鞈潛-閮??-??NT$500', '??],
      ['?餃???', 'kgi@kgibank.com.tw', '蝬脰楝?銵?交??', '?冽 2026-06-11 12:00 ???餃蝬脰楝?銵??仿??砌犖隢蝯∪恥??..', '?餃???', '雿?, '?勗?銵??餃????', '??],
      ['蝟餌絞撽?蝣?, 'service@shopee.tw', '撣唾?霈撽?蝣?, '?函?撽?蝣潛 987654嚗???5 ???扯撓?亙??Ｕ?, '蝟餌絞?', '擃?, '?衣鞈潛-撽?蝣?987654', '??],
      ['Netflix?餃撽?蝣?, 'info@account.netflix.com', 'Netflix嚗??亦Ⅳ', '?函??餃蝣潛 123456嚗???15 ???扯撓??..', 'Netflix', '擃?, 'Netflix-?餃蝣?123456', '??],
      ['Netflix?鋆蔭蝣箄?', 'info@account.netflix.com', '蝣箄?靽∴??典歇蝣箄?Netflix ?鋆蔭', '?函??餉?撌脰身摰甇文董???鋆蔭銋?...', 'Netflix', '銝?, 'Netflix-?鋆蔭撌脩Ⅱ隤?, '??]
    ];
    sheet.getRange(catEndRow + 3, 1, defaultExamples.length, 8).setValues(defaultExamples);
    // ?澆???    sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 350); sheet.setColumnWidth(3, 120);
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
 * 敺?AI_PromptConfig 撌乩?銵刻??蒂蝯? Prompt 閮剖??拐辣嚗翰?嚗? * @return {Object} {categories, urgencyHigh, urgencyMid, urgencyLow, examples, roleDesc, model}
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
      if (a.indexOf('?憛') !== -1) { mode = 'zero'; return; }
      if (a.indexOf('?憛?') !== -1) { mode = 'one'; return; }
      if (a.indexOf('?憛?') !== -1) { mode = 'two'; return; }
      if (a.indexOf('?憛?') !== -1) { mode = 'three'; return; }

      if (mode === 'zero') {
        if (a === '?桀?雿輻璅∪?' && b) model = b;
      } else if (mode === 'one') {
        if (a === '閫隤芣?') roleDesc = b;
        if (a === '蝺亙漲-擃?) urgencyHigh = b;
        if (a === '蝺亙漲-銝?) urgencyMid = b;
        if (a === '蝺亙漲-雿?) urgencyLow = b;
      } else if (mode === 'two') {
        // 璅??歲??憿?迂 = 璅?嚗?        if (a === '憿?迂' || !a) return;
        const enabled = String(row[3] || '').trim();
        if (enabled !== '??) {
          categories.push({ name: a, desc: b, note: String(row[2] || '').trim() });
        }
      } else if (mode === 'three') {
        if (a === '蝭?隤芣?' || !a) return;
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
 * ?澆 Gemini API ???舐璅∪?皜嚗蒂?湔 AI_PromptConfig ????? */
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
    // ?曉??蝙?冽芋???典?
    let modelRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === '?桀?雿輻璅∪?') { modelRow = i + 1; break; }
    }
    if (modelRow > 0) {
      // 閮剖?銝??詨撽?
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(models, true).build();
      sheet.getRange(modelRow, 2).setDataValidation(rule);
      // ?湔?舐璅∪?皜憿舐內甈?      let listRow = -1;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === '?舐璅∪?皜 (靘???') { listRow = i + 1; break; }
      }
      if (listRow > 0) sheet.getRange(listRow, 2).setValue(models.join(', '));
      // ?湔????      let tsRow = -1;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === '銝活?湔璅∪?皜') { tsRow = i + 1; break; }
      }
      if (tsRow > 0) sheet.getRange(tsRow, 2).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
    }
    Logger.log(`refreshAvailableModels: updated ${models.length} model(s): ${models.join(', ')}`);
  } catch(e) { Logger.log('refreshAvailableModels exception: ' + e); }
}

/**
 * 敺?AI_PromptConfig 霈????璅∪??迂
 * @return {string} model name (e.g. 'gemini-3.5-flash')
 */
function getSelectedModel() {
  try {
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = Math.min(sheet.getLastRow(), 10);
    const data = sheet.getRange(1, 1, lastRow, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === '?桀?雿輻璅∪?' && data[i][1]) return String(data[i][1]).trim();
    }
  } catch(e) { Logger.log('getSelectedModel error: ' + e); }
  return 'gemini-2.5-flash';
}

// =========================================================================
// ==================== AI_Uncategorized 蝟餃??賢? (v3.0) ====================
// =========================================================================

/** ???遣蝡?AI_Uncategorized 撌乩?銵?*/
function getOrCreateUncategorizedSheet() {
  const ss = getOrCreateSpreadsheet_();
  let sheet = ss.getSheetByName(UNCATEGORIZED_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(UNCATEGORIZED_SHEET_NAME);
    sheet.appendRow(['Thread ID', 'Email', 'Sender Name', 'Subject', 'AI??', '靽∩辣?交?', '鈭箏極??', '???]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 220); sheet.setColumnWidth(3, 130);
    sheet.setColumnWidth(4, 280); sheet.setColumnWidth(5, 200); sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 110); sheet.setColumnWidth(8, 100);
    // 璅??撘?    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#E53E3E').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    // ?犖撌亙?憿?銝??詨嚗甈?= 蝚?甈?敺洵2?絲嚗?    const categoryValidation = SpreadsheetApp.newDataValidation().requireValueInList(VALID_CATEGORIES, true).build();
    sheet.getRange(2, 7, 500, 1).setDataValidation(categoryValidation);
    // ????璇辣?澆???    const pendingRule = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('敺祟??).setBackground('#FEF3C7').setFontColor('#92400E').bold(true).setRanges([sheet.getRange('H2:H500')]).build();
    const doneRule   = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('??撌脣???).setBackground('#DCFCE7').setFontColor('#166534').setRanges([sheet.getRange('H2:H500')]).build();
    const failRule   = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('????憭望?').setBackground('#FEE2E2').setFontColor('#991B1B').setRanges([sheet.getRange('H2:H500')]).build();
    sheet.setConditionalFormatRules([pendingRule, doneRule, failRule]);
    Logger.log('Created AI_Uncategorized sheet.');
  }
  return sheet;
}

/** 閮? AI ??憭望??縑隞嗅 AI_Uncategorized 撌乩?銵?*/
function logToUncategorizedSheet(thread, senderEmail, rawSender, subject, refinedContent) {
  try {
    const sheet = getOrCreateUncategorizedSheet();
    // 瑼Ｘ?臬撌脰???嚗??銴?
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
    sheet.appendRow([threadId, senderEmail, senderName, subject, refinedContent || '', dateStr, '', '敺祟??]);
    Logger.log(`Logged uncategorized thread ${threadId} to ${UNCATEGORIZED_SHEET_NAME}.`);
  } catch(e) { Logger.log('logToUncategorizedSheet error: ' + e); }
}

/**
 * ?? AI_Uncategorized 撌乩?銵剁??芸???撌脣‵?乓犖撌亙?憿??? * ?芸?閫貊嚗?甈?autoOrganizeGmailWithGemini() 蝯?敺?+ sendDailyDigest() ???? * 銋????Apps Script 蝺刻摩?函?亙銵? */
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
      if (!manualCat || status === '??撌脣???) return;
      if (!VALID_CATEGORIES.includes(manualCat)) {
        Logger.log(`Row ${i+2}: Invalid category "${manualCat}", skipping.`);
        return;
      }
      try {
        const threads = GmailApp.getThreadById(threadId);
        if (!threads) { throw new Error('Thread not found: ' + threadId); }
        // 蝘駁 AI/?芸?憿?璅惜
        const oldLabel = GmailApp.getUserLabelByName('AI/?芸?憿?);
        if (oldLabel) threads.removeLabel(oldLabel);
        // 憟?唳?蝐?        const newLabelName = 'AI/' + manualCat;
        let newLabel = GmailApp.getUserLabelByName(newLabelName);
        if (!newLabel) newLabel = GmailApp.createLabel(newLabelName);
        threads.addLabel(newLabel);
        // 蝘餉撠? Gmail ??
        const tabId = CATEGORY_TAB_MAPPING[manualCat];
        if (tabId) moveThreadToGmailCategory(threadId, tabId);
        // 撖怠 AI_Rules
        if (rulesSheet) {
          const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          rulesSheet.appendRow([email, rawSender, manualCat, '雿?, '[鈭箏極靽格迤]', `from:${email}`, nowStr]);
        }
        // ?湔???        sheet.getRange(i + 2, 8).setValue('??撌脣???);
        // ?脣?摮貊?閬?
        saveToLearningRules(email, rawSender, subject, manualCat);
        // ?郊??AI_PromptConfig 蝭?
        addExampleToPromptConfig_(email, subject, manualCat, '雿?, '[鈭箏極靽格迤]');
        processed++;
        Logger.log(`processUncategorizedSheet: Row ${i+2} ??${manualCat} ?);
      } catch(e) {
        sheet.getRange(i + 2, 8).setValue('????憭望?');
        Logger.log(`processUncategorizedSheet: Row ${i+2} failed: ` + e);
      }
    });
    Logger.log(`processUncategorizedSheet done. Processed: ${processed} item(s).`);
  } catch(e) { Logger.log('processUncategorizedSheet exception: ' + e); }
}

/** 撠犖撌乩耨甇???憓 AI_PromptConfig ??Few-Shot 蝭? */
function addExampleToPromptConfig_(email, subject, category, urgency, refined) {
  try {
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(1, 1, lastRow, 1).getValues();
    let exHeaderRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).includes('?憛?')) { exHeaderRow = i + 2; break; } // +2 for header row
    }
    if (exHeaderRow < 0) return;
    // ?曉蝚砌??征??    const exData = sheet.getRange(exHeaderRow + 1, 1, Math.max(1, lastRow - exHeaderRow), 8).getValues();
    let insertRow = lastRow + 1;
    for (let i = 0; i < exData.length; i++) {
      if (!String(exData[i][0]).trim()) { insertRow = exHeaderRow + 1 + i; break; }
    }
    sheet.getRange(insertRow, 1, 1, 8).setValues([[`鈭箏極靽格迤-${category}`, email, subject.substring(0,30), '', category, urgency, refined, '??]]);
    Logger.log(`Added example to AI_PromptConfig row ${insertRow}.`);
  } catch(e) { Logger.log('addExampleToPromptConfig_ error: ' + e); }
}

// =========================================================================
// ==================== AI_LearningRules 蝟餃??賢? (v3.0) ====================
// =========================================================================

/** ???遣蝡?AI_LearningRules 撌乩?銵?*/
function getOrCreateLearningRulesSheet() {
  const ss = getOrCreateSpreadsheet_();
  let sheet = ss.getSheetByName(LEARNING_RULES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LEARNING_RULES_SHEET_NAME);
    sheet.appendRow(['Email/Domain', 'Sender Name', 'Subject Keyword', '甇?Ⅱ??', '摮貊?靘?', '?湔??', '?賭葉甈⊥']);
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
 * 頛??飛蝧??閮擃?Map
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

/** ?脣???唬?璇飛蝧???*/
function saveToLearningRules(email, senderName, subject, category) {
  try {
    const sheet = getOrCreateLearningRulesSheet();
    const lastRow = sheet.getLastRow();
    const emailLower = email.trim().toLowerCase();
    // ??臬撌脫???email ????    if (lastRow >= 2) {
      const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() === emailLower) {
          // ?湔??????          const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
          sheet.getRange(i + 2, 4).setValue(category);
          sheet.getRange(i + 2, 6).setValue(nowStr);
          const hits = parseInt(data[i][6] || 0) + 1;
          sheet.getRange(i + 2, 7).setValue(hits);
          Logger.log(`saveToLearningRules: Updated ${emailLower} ??${category} (hits: ${hits})`);
          return;
        }
      }
    }
    // ?啣?閮?
    const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    sheet.appendRow([emailLower, senderName || '', subject ? subject.substring(0,50) : '', category, '鈭箏極靽格迤', nowStr, 1]);
    Logger.log(`saveToLearningRules: Added ${emailLower} ??${category}`);
  } catch(e) { Logger.log('saveToLearningRules error: ' + e); }
}

// =========================================================================
// ==================== 瘥?? Email ?賢? (v3.0) ====================
// =========================================================================

/**
 * ?潮??仿?暺縑隞嗆?閬?Email?? * ?芸?閫貊嚗???20:00???舀??銵? */
function sendDailyDigest() {
  // ???犖撌亙祟?交??殷?蝣箔??????啁???  try { processUncategorizedSheet(); } catch(e) { Logger.log('processUncategorizedSheet in digest: ' + e); }

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

    // 蝭拚隞 + 擃??亙漲 ??撌乩?憿
    const important = [], highUrgency = [];
    data.forEach(row => {
      const updatedTime = String(row[6] || '');
      if (!updatedTime.startsWith(today)) return;
      const category = String(row[2] || '').trim();
      const urgency  = String(row[3] || '').trim();
      const refined  = String(row[4] || '').trim();
      const email    = String(row[0] || '').trim();
      const sender   = String(row[1] || '').trim();
      if (urgency === '擃?) highUrgency.push({email, sender, category, urgency, refined, time: updatedTime});
      else if (category === '撌乩?') important.push({email, sender, category, urgency, refined, time: updatedTime});
    });

    if (highUrgency.length === 0 && important.length === 0) {
      Logger.log('sendDailyDigest: No high-urgency or work emails today.');
      return;
    }

    // 蝯? HTML Email
    const formatRows = (items) => items.map(item =>
      `<tr><td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.time.split(' ')[1] || ''}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.sender || item.email}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;"><span style="background:${item.urgency==='擃??'#FEE2E2':item.urgency==='銝??'#FEF3C7':'#DCFCE7'};color:${item.urgency==='擃??'#991B1B':item.urgency==='銝??'#92400E':'#166534'};padding:2px 8px;border-radius:4px;font-size:12px;">${item.urgency}</span></td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.refined}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;"><a href="https://mail.google.com/mail/u/0/#search/from:${encodeURIComponent(item.email)}" style="color:#3182CE;">?亦?</a></td></tr>`
    ).join('');

    const tableHeader = `<tr style="background:#2D3748;color:#FFFFFF;"><th style="padding:10px;text-align:left;">??</th><th style="padding:10px;text-align:left;">撖辣??/th><th style="padding:10px;text-align:center;">蝺亙漲</th><th style="padding:10px;text-align:left;">AI??</th><th style="padding:10px;">??</th></tr>`;

    let htmlBody = `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#2D3748,#4A5568);padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:#FFFFFF;margin:0;font-size:20px;">? GmailWithGemini 瘥???勗?</h1>
    <p style="color:#A0AEC0;margin:4px 0 0;font-size:14px;">${today} ????${highUrgency.length + important.length} 撠?暺縑隞?/p>
  </div>
  <div style="padding:20px;background:#F7FAFC;border:1px solid #E2E8F0;">`;

    if (highUrgency.length > 0) {
      htmlBody += `<h2 style="color:#991B1B;font-size:16px;margin:0 0 12px;">? 擃??亙漲靽∩辣 (${highUrgency.length} 撠?</h2>
      <table style="width:100%;border-collapse:collapse;background:#FFFFFF;border-radius:8px;overflow:hidden;margin-bottom:20px;">${tableHeader}${formatRows(highUrgency)}</table>`;
    }
    if (important.length > 0) {
      htmlBody += `<h2 style="color:#2B6CB0;font-size:16px;margin:0 0 12px;">? 撌乩?憿縑隞?(${important.length} 撠?</h2>
      <table style="width:100%;border-collapse:collapse;background:#FFFFFF;border-radius:8px;overflow:hidden;margin-bottom:20px;">${tableHeader}${formatRows(important)}</table>`;
    }
    htmlBody += `<p style="color:#718096;font-size:12px;margin-top:16px;">甇文? GmailWithGemini v3.0 ?芸???????亦?摰閮?嚗??? <a href="https://docs.google.com/spreadsheets/" style="color:#3182CE;">GmailWithGemini_Rules</a> 閰衣?銵具?/p>
  </div></div>`;

    const recipient = DIGEST_RECIPIENT_EMAIL || Session.getActiveUser().getEmail();
    GmailApp.sendEmail(recipient, `[GmailWithGemini] ${today} 瘥???? ??${highUrgency.length + important.length} 撠?暺縑隞跆, '', {htmlBody});
    Logger.log(`sendDailyDigest: Sent to ${recipient}. High=${highUrgency.length}, Work=${important.length}`);
  } catch(e) { Logger.log('sendDailyDigest error: ' + e); }
}

// =========================================================================
// ==================== 閫貊?函恣?? API 閮箸撌亙 ====================
// =========================================================================

/**
 * 銝?菔身摰?孛?澆嚗? TRIGGER_INTERVAL_HOURS ??撱箇???閫貊??+ 瘥 20:00 ??閫貊?剁??? * ?瑁????芸?皜??歇摮?孛?澆嚗??銴遣蝡? */
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

  // 瘥 20:00 ??閫貊??  ScriptApp.newTrigger('sendDailyDigest')
    .timeBased().everyDays(1).atHour(20).nearMinute(0).create();
  Logger.log('Created daily digest trigger at 20:00.');
  // ?瑟?舐璅∪?皜
  try { refreshAvailableModels(); } catch(e) { Logger.log('refreshAvailableModels skipped: ' + e); }
  Logger.log('Setup complete!');
}

/**
 * 蝘駁??? autoOrganizeGmailWithGemini ??sendDailyDigest ?賊??孛?澆?? * ?舐?潭??銵??蔭閫貊?刻身摰? */
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
 * API ?閮箸撌亙?? * ?潮??陛?桃?皜祈岫隢???Gemini API嚗?霅??唳?行???撅祆?祥撠??? */
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
      
      // 瑼Ｘ??銝剜?行?閮祥?賊?霅血?
      if (responseText.indexOf('billing') !== -1 || responseText.indexOf('quota') !== -1) {
        Logger.log('?? WARNING: Response mentions billing/quota. Please verify your GCP project billing status.');
      } else {
        Logger.log('? No billing warnings detected. Your API Key appears to be from a free-tier project.');
      }
    } else if (code === 400) {
      Logger.log('??ERROR (400): Invalid API key. Please check your GEMINI_API_KEY value.');
    } else if (code === 403) {
      Logger.log('??ERROR (403): API key does not have permission. Check API enablement in GCP Console.');
    } else if (code === 429) {
      Logger.log('?? WARNING (429): Rate limit exceeded. Your API Key is valid but hitting free-tier limits.');
      Logger.log('This is normal for free-tier keys. The script has built-in auto-retry for this.');
    } else {
      Logger.log('??ERROR (' + code + '): ' + responseText.substring(0, 300));
    }
  } catch (e) {
    Logger.log('??EXCEPTION: ' + e.toString());
  }
  
  // 憿舐內閫貊?函???  const triggers = ScriptApp.getProjectTriggers();
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
// ==================== 霈甇瑕?亥???====================
// =========================================================================
/*
 摰???湔風?脫隤?雿輻?飛撌脩宏?喟蝡?獢?
 - CHANGELOG.gs嚗??渲??湔風?脫隤? - setup-guide.md嚗底蝝啗身摰?摮豢?隞?
 ?嗅??嚗2.0.0 (2026-06-14)
 銝餉?霈嚗? - ?祥?????芸???Billing ??GCP 撠? API Key
 - ?啣? callGeminiApiWithRetry() ?箸?岫璈
 - ?? API ?澆撱園嚗?000ms ?身?? - ?啣? setupTriggers() / removeTriggers() 閫貊?函恣?? - ?啣? checkApiKeyStatus() API 閮箸撌亙
*/

/* 隞乩??箏?憪蝙?冽?摮賂?撌脩宏??setup-guide.md嚗?摰甇瑕?亥?嚗歇蝘餉 CHANGELOG.gs嚗?靽?甇方酉閫???箇??砍???# ?? GmailWithGemini ?箸?萎辣?芸???撠????閰喟敦雿輻?飛

?祆?摮詨???*摰瘝?蝔?閮剛?蝬???摮貉?*閮剛???頝?隞乩?甇仿??脰?嚗?臬 5 ???批?????Gmail ?芸???????其犖嚗?
---

## ??儭?蝚砌?甇伐????函? Gemini API ? (??霅?

?亥?霈?AI 撟急霈靽∩蒂??嚗?????Google ?唾?銝撘萄?鞎餌?園?霅???API ?嚗?

1. ???汗?剁??? [Google AI Studio](https://aistudio.google.com/)??2. 雿輻?函? Google 撣唾??餃??3. 暺??恍撌虫?閫? **?et API key??* ????4. 暺? **?reate API key??*嚗?遣蝡銝???獢葉嚗??舐??獢???5. 蝟餌絞???銝脤摮葡嚗? `AIzaSy...`嚗??停?舀??**API ?**??暺? **Copy** 銴ˊ嚗蒂憒亙?靽?摰?銝?瘣拇?蝯虫?鈭箝?
---

## ? 蝚砌?甇伐?撱箇? Google Apps Script 撠?

Google Apps Script ?舫?銵挾蝔?蝣潛???鞎駁蝡臬像?堆??其??閬?鋆遙雿?擃?

1. ?? [Google Apps Script 摰雯](https://script.google.com/)??2. 暺?撌虫?閫? **?憓?獢?(New Project)??*??3. 撠?獢??啣? `GmailWithGemini`嚗??椰銝???賢?撠???臭耨?對???4. ?典椰?湧?桐葉嚗???唬?????`隞?Ⅳ.gs` (??`Code.gs`) ??獢?
   * 隢?摰??啣? `GmailWithGemini`??   * 隢?隞乩?瑼?銝剔?蝔?蝣澆??渲?鋆踝?銝西票?亥??府瑼????摰對?
     ?? **蝔?蝣潔?皞?*嚗GmailWithGemini 蝔?蝣潭?獢(file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)
5. 暺?銝??**?摮?(Save)??* ? ????
> [!IMPORTANT]
> **憒?蝺刻摩 appsscript.json 鞈?皜甈?嚗?*
> 1. 暺?撌血?詨??**??獢身摰?(Project Settings)??* ??嚗?頛芸?蝷綽???> 2. ?暸 **?蝺刻摩?其葉憿舐內 appsscript.json 鞈?皜瑼???*??> 3. ?撌血??**?楊頛臬??* ??嚗??祈??內嚗?甇斗????箔?????`appsscript.json` ??獢?> 4. 隢?隞乩?閮剖?摰閬?鞎澆 `appsscript.json` 銝血摮?
>    ?? **鞈?皜靘?**嚗appsscript.json ?蔭?辣](file:///usr/local/google/home/chenghant/Project/Appscript/appsscript.json)

---

## ?? 蝚砌?甇伐?閮剖??函? API ?嚗??典惇?改?

?箔?摰?脰風嚗??踵????唾???API ??湔撖怠蝔?蝣潔葉????閬??嗅摮撠????典惇?扼葉嚗?
1. 暺?撌血?詨??**??獢身摰?(Project Settings)??* ??嚗?頛芸?蝷綽???2. ??皛??圈??Ｘ?銝嚗??**??隞斤Ⅳ撅祆?(Script Properties)??* ?畾萸?3. 暺? **?憓?隞斤Ⅳ撅祆?(Add script property)??*嚗?   * **撅祆?(Property)** 甈?隢撓?伐?`GEMINI_API_KEY`
   * **??(Value)** 甈?隢票銝?具洵銝甇乓?鋆賜? **Gemini API ?**??4. 暺? **?摮?隞斤Ⅳ撅祆?(Save script properties)??*??
---

## ?? 蝚砍?甇伐???皜祈岫?瑁???甈?
?函洵銝甈∪銵?嚗oogle ??瘙蝣箄???嚗?虜甇?虜???券霅瑟郊撽?

1. ?撌血??**?楊頛臬??* ????2. ?其??寧??賢?銝??詨銝哨??豢? **`autoOrganizeGmailWithGemini`**??3. 暺?撌血??**?銵?(Run)??* ?塚? ????4. **擐活?瑁????箝?閬?甈?(Authorization Required)??蝒?*嚗?   * 暺? **?祟?交???(Review Permissions)??*??   * ?豢??函? Google 撣唾???   * ?恍?＊蝷箝oogle 撠撽?甇斗??函?撘?隢??椰銝?蝝啣???**?脤? (Advanced)??*??   * 暺??銝??**??敺?mailWithGemini??摰嚗?*??   * 蝟餌絞???箸迨蝔?撠????Gmail ???冽???暺? **??閮?(Allow)??*??5. ??摰?敺?蝔?靘踵????瑁???臭誑?其??寧?閬銵??迨?閬?隞嗅銝剜??霈?萎辣??蝔?撠望??芸??? Gemini ?脰???嚗蒂?冽??Gmail ?湧?甈遣蝡?`AI/撌乩?` 蝑?蝐文??嗅?憿?

---

## ??蝚砌?甇伐?閮剖?摰??芸??瑁?嚗??嚗?
摰?皜祈岫敺??典隞亥身摰?蝔?霈?Google ?脩垢隡箸??冽???畾菜???銵?隞餃?嚗祕?曄?甇???刻??

1. 暺?撌血?詨??**?孛?潭?隞?(Triggers)??* ?堆????內嚗?2. 暺??喃?閫? **?憓孛?潭?隞?(Add Trigger)??* ????3. ?脰?隞乩?閮剖?嚗?   * **?詨?閬銵??賢?**嚗autoOrganizeGmailWithGemini`
   * **?詨?閬銵??函蔡雿平**嚗銝餌垢` (Head)
   * **?詨?瘣餃?靘?**嚗??**??????(Time-driven)??*
   * **?詨????孛?潭?隞園???*嚗??**???????* ??**???????*
   * **?詨???/撠??身??**嚗?憒??**?? 10 ????* ??**??撠???*嚗??函??萎辣?捱摰?
4. 暺? **?摮?(Save)??*??
---

## ?? 蝚砍甇伐?蝞∠?????憿風?脫隤?(閰衣?銵冽風?脩??? AI 鞈?蝎曄?)

?祉頂蝯望??**100% AI ?單?隤???**???嗆?唳霈靽∩辣??蝔???亙??Gemini 2.5 Flash API ?脰??蝎暹????亥?蝺亙漲?文?嚗蒂???靽∩辣?詨???蝎曄??箔?嚗?甇亙神?交?岫蝞”?亥?銝准?
### 1. 撠?函?甇瑕?亥?閰衣?銵?* **摰孵蝬?撠?**嚗???臬? Google 閰衣?銵券?桐葉?? Google Apps Script嚗?亙閰脰岫蝞”銝?喳??? **`AI_Rules`** ?風?脫隤極雿”??* **?函?撠?**嚗???舐蝡遣蝡?穿?蝔??券?甈∪銵?嚗??芸??冽?蝡舐′蝣遣蝡?????**`GmailWithGemini_Rules`** ?岫蝞”??臭誑?? [Google ?脩垢蝖祉?](https://drive.google.com/) ??閰脫??蒂????
### 2. 閰衣?銵冽?雿牧??(?曹???雿?
1. **Email**嚗?靽∟縑蝞晞?2. **Sender Name**嚗?靽∟?蝔梧?憒?"Netflix" ??"104鈭箏??銵?嚗?3. **Category**嚗縑隞園??伐?撌乩??瓷?董?柴犖瘨祥?頂蝯梢??交???誨???瑯冗蝢日?犖?梁??etflix嚗?4. **Urgency**嚗??亙漲嚗??葉??嚗?5. **AI Refined Content**嚗?*??唳?雿?* ??AI ?芸?蝎曄???20 摮誑?找?靽∩辣?詨???嚗?憒?`?Ｚ岫?隢??Ｚ岫摰?撘萇?? ??`?衣閮-瘨祥NT$450-撌脣鞎灼嚗??函???隞嗅?臬翰???∪之??
6. **Gmail Search Query**嚗頂蝯梯??? Gmail ???誘??7. **Updated Time**嚗???撖怠甇瑕?亥?????
### 3. 憒???蝞∠??蝙??* **敹恍?撠?瑼ａ**嚗?  ?典隞仿?閰衣?銵函?蝭拚?嚗翰??望??◤ AI ?文??箝犖瘨祥???極雿??萎辣嚗蒂?? **`AI Refined Content`** 敹恍汗憭扳???* **??敹恍 Gmail 銝剔祟?訾縑隞?*嚗?  ?嗆?唾?敹恍?箄府撖辣????縑隞嗆?嚗?撠?**`Gmail Search Query`** 甈?銝剔??批捆嚗?憒?`from:promotions@netflix.com`嚗?*銴ˊ嚗蒂鞎澆 Gmail ?銝??撠?銝?*嚗?臭??萇祟?詨閰脰蝯∩犖???風?脤隞塚?

---

?? ?剖?嚗?曉撌脩???鈭????100% 蝎暹? AI ?方?嚗??質?移?敹摰嫣蒂閮??喲蝡航岫蝞”?亥???Gmail ??璈鈭箔?嚗?
=============================================================================
=============================================================================

# 霈?亥? (Changelist / Change Note)

## [1.5.0] - 2026-06-11

### 霈?? (Motivation)
- ??蝟餌絞?嗆???**100% ?單? AI ?方???憿?*嚗????祉?敹怠?璈嚗?隞仿???擃移皞漲嚗??泵????1,000 甈∪?鞎餃?恍?摨衣????撟唾﹛??- ?啣? AI 鞈?蝎曄??嚗?縑隞?20 摮??詨???嚗神?亥岫蝞”?冽甈? `AI Refined Content`??- ??渡???閬?嚗憓蝡??乓犖瘨祥???銝?蝺?鞈潛嚗蒂???極雿??乩誑蝎暹??文?犖銵?靽∩辣嚗???LinkedIn / 104 蝑黎?潮勗?餃??梧???
### 敶梢瑼? (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)
- [gmail_with_gemini_guide.md](file:///usr/local/google/home/chenghant/.gemini/jetski/brain/ff896fa6-15b8-4123-bcce-6bf208e67c49/gmail_with_gemini_guide.md)

### 閰喟敦霈 (Detailed Changes)
- **?? `autoOrganizeGmailWithGemini` 銝餅?蝔?*嚗?  - 蝘駁鈭?rulesMap 頛??撠翰?????摩嚗?箸?撠縑銝敺???Gemini 2.5 Flash API??  - 銝餉艘?葉?湔?澆 `callGeminiApi` ?脣??????亙漲??AI 蝎曄???嚗蒂銝甈⊥批神?交風?脫隤岫蝞”銝准?- **?? `callGeminiApi` API ?內閰? Schema**嚗?  - ?芸? `promptText` ?內閰摰對?撠?? (Chain of Thought) ?郊?函?撘?嚗蒂? 5 ????LinkedIn?犖瘨祥??銵??刻郎?梁? Few-shot ??蝭?撠??  - ??`promptText` ??`responseSchema` ???賊?銝哨??啣?蝚?9 ?蝡???`"Netflix"`嚗項????netflix.com ?澆銋縑隞塚?嚗蒂???湔隤芣??飛????  - ?芸??內閰?`promptText` ??Netflix ??蝭?嚗??亦?撖衣??餃蝣潘?擃??亙漲嚗??鋆蔭蝣箄?嚗葉蝺亙漲嚗ew-shot 撠??  - ?湔 `responseSchema` ?蔭嚗憓?`refinedContent` (string) 撅祆改?銝血??嗅???`required` 頛詨敹‵甈???- **?芸? Gmail 霈??璅惜?蕪瘚?**嚗?  - 敺孵?蝘駁 `thread.markRead()` 銝餅?蝔歇霈????`moveToArchive()` 撠??摩嚗誑靽?靽∩辣?霈????冽隞嗅??  - 撠??撠?隞?`GMAIL_SEARCH_QUERY` ?湔?箸??斗???`AI/...` ??璅惜嚗??銵?摰??脩????方???  - ?啣??典?霈 `PROCESS_OLDEST_FIRST`嚗蒂?其蜓瘚?銝剖??瑕?靽∩辣????脰? `.reverse()`嚗祕?暹??拚隞嗅??憿??嗚?- **?芸?璆菟?摰?蔭?**嚗?  - 撠?`MAX_THREADS_TO_SCAN` 隤踵??`30`嚗蒂撠?`API_CALL_DELAY_MS` 憓???`4000` 瘥怎?嚗敺孵??脫迫閫貊 Gemini API ?祥??`15 RPM` ?餌??嚗蒂蝣箔??格活???瑁???蝬剜???2.5 ???改?????Apps Script 6 ??頞?銝???  - 撠?`EMAIL_BODY_CHAR_LIMIT` 隤踵??`1000` 隞交?撠?Token 瘨?- **?啣?閰衣?銵刻?耨敺抵???擃?蝢?**嚗?  - ?啣? `formatSheetAesthetics` ?澆???蝵格芋蝯?撠隤極雿”?芾?甈祝??朣??收蝺漱?輯??航??  - ??`Urgency` 甈??蔭擃?銝?雿?蝝??航?????隞嗆撘?閬???  - ??`getOrCreateRulesSheet` ?折?啣?蝛箄”?潸?耨敺拇炎皜?(`getLastRow === 0`)嚗???憿????見撘閰衣?銵刻◤皜征??芸??遣嚗蒂蝣箔??典?蝝??撘??暹?銵冽頝臬?銝哨?銋?憟甇斗撘?????- **撖虫??嗡辣?????飛憿?甇瑕靽∩辣蝘餉??**嚗?  - ?啣? `CATEGORY_TAB_MAPPING` ?典?撠嚗???AI 銋之????Gmail ?嗡辣????頂蝯望?蝐歹?憒?`CATEGORY_PERSONAL`?CATEGORY_SOCIAL`?CATEGORY_PROMOTIONS`?CATEGORY_UPDATES`嚗?  - ??`autoOrganizeGmailWithGemini` 銝餉艘?葉隤輻?芾???REST API ?寞? `moveThreadToGmailCategory`嚗??唳?縑隞嗅銵???蝘颱蒂蝘駁?嗡?銵?蝟餌絞????  - ?啣?銝甈⊥扯??拍宏頧極??`syncExistingLabeledThreadsToCategories()`嚗?瘨?API 憿漲?喳撠??餅??歇??璅惜靽∩辣銝甈⊥扳飛憿甇?Ⅱ???葉??- **撖虫????瑁?蝯梯????亥? (AI_Execution_Log)**嚗?  - ?啣? `AI_Execution_Log` ?惜????憪? `getOrCreateExecutionLogSheet` ?見撘???`formatExecutionLogSheetAesthetics` 璅∠?嚗??函蔭銝剖?朣ebra 鈭斗?摨?銵?????Y嚗?嚗嚗?嚗?隞嗆撘???  - ??`autoOrganizeGmailWithGemini` 撠 `try-catch-finally` ?嗆?嚗瘥活?渡?摰??撣訾葉?瑟?嚗?摰神?亙??怠銵??縑隞嗆隞嗆????????憭望??詻?蝺亙漲蝮賡???憿?瘥?閬???甈??豢???- **?? `getOrCreateRulesSheet` 閰衣?銵典?憪??摰孵?蝝?*嚗?  - ?券?甈∪遣蝡極雿”??璅?????`AI Refined Content`嚗???Email, Sender Name, Category, Urgency 銋?嚗蜇??7 甈???  - ?啣????詨捆?批?蝝?頛荔??交炎皜砍閰衣?銵典歇摮雿洵 5 甈?憿???`AI Refined Content`嚗??函洵 5 甈??芸??銝甈蒂撖怠璅?嚗Ⅱ靽??蝝?- **?湔 `gmail_with_gemini_guide.md`**嚗?  - 靽格雿輻???批捆嚗???飛蝧翰?”???渡??憿???蝎曄?甇瑕?亥???銝西??洵 5 ?甈? `AI Refined Content` ???質?憟質???- **?游?雿輻?????湔隤?單銝餅?獢葉**嚗?  - ??`GmailWithGemini` 銝餅?獢??怠偏?啣?憭??憛酉閫??撠底蝝啁?雿輻?飛??嚗??怠?敺?API ????典惇?扯身摰?蝔孛?潭?隞嗥? 6 甇仿?嚗?摰???湔風?脫隤蝮急???嫣噶雿輻?蝺刻摩?其葉?冽??仿??- **?啣??臬?典銵??亙?賢?隤芣?閮餉圾**嚗?  - ??`GmailWithGemini` 瑼?銝餅?蝔撘?`autoOrganizeGmailWithGemini()` 銝嚗憓?撅祈牧?酉閫??閰唾膩 `autoOrganizeGmailWithGemini` ??`syncExistingLabeledThreadsToCategories` ?拙之?亙?賢??蝙?函??冽?璈??瑁??孵?嚗?雿?摮貉?雿?瑼颯?- **隤踵?臬?典銵?銝餉??賢??唾?祆??**嚗?  - 撠閮?甇瑕蝘餉?銝?萄?甇亙極??`syncExistingLabeledThreadsToCategories()` ?祉宏?喃蜓蝔? `autoOrganizeGmailWithGemini()` 甇???對?雿踹?敹??臬?典銵???撘?銝剖?單??嚗靘踹?摮貉 Apps Script 蝺刻摩?其??Ｖ葉銝??豢????銵?- **撖虫??方?憭望?靽∩辣??璅??脰風璈 (Poison Pill Defense)**嚗?  - ?典??撠?隞?`GMAIL_SEARCH_QUERY` 餈賢?? `AI/?芸?憿 璅惜嚗蒂?典??扯”銝剖遣蝡?`"?芸?憿?: "CATEGORY_PERSONAL"` ????  - ??銝餉艘??API ?航炊??嚗?孵?靽∩辣?澆 Gemini API 憭望????喟?撘?嚗???園?蝝?憿 `"?芸?憿?` 憿嚗???蝐文??刻??亥?閮?嚗器摨蝭摰縑隞園?閰血仃???湔??蝔??甇餌?憌ａ?????- **銝餉艘?撅文撥?交?try-catch ?ㄨ?芸?**嚗?  - ??`threads.forEach` 餈游??折?ㄨ鈭?撅文???`try-catch (threadError)` 蝯?嚗Ⅱ靽?????孵?靽∩辣?粹嚗?憒????憟璅惜憭望?嚗?嚗???府靽∩辣?航炊嚗蜓蝔?隞蝜潛?餈凋誨??閰脫甈∩葉?隞縑隞嗚?
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [1.4.2] - 2026-06-11

### 霈?? (Motivation)
- 靘蝙?刻?瘙??啣??函?????交?????其誑???銵?撣唾??餃????萎辣??
### 敶梢瑼? (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)
- [gmail_with_gemini_guide.md](file:///usr/local/google/home/chenghant/.gemini/jetski/brain/ff896fa6-15b8-4123-bcce-6bf208e67c49/gmail_with_gemini_guide.md)

### 閰喟敦霈 (Detailed Changes)
- ??`callGeminiApi` ??`responseSchema` 銝哨?撠?`"?餃???"` ?啣???`category` ??enum ???嚗Ⅱ靽?API 頛詨?澆????冽迨 7 ??憿?- ?湔 `gmail_with_gemini_guide.md` 隤芣??辣銝剔????”??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [1.4.1] - 2026-06-11

### 霈?? (Motivation)
- ?芸????內閰?(Prompt) ?批捆嚗???蝣箇????亥?蝺亙漲閰閬?嚗???Gemini ?芸????移皞漲?帘摰扼?
### 敶梢瑼? (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)

### 閰喟敦霈 (Detailed Changes)
- ?? `callGeminiApi` 銝剔? `promptText` 霈?批捆嚗??底蝝啁???憿??亥?蝭????亙漲閰閬???
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [1.4.0] - 2026-06-11

### 霈?? (Motivation)
- 靘蝙?刻?瘙?敺?Gmail 撖辣??雿葉?瑕?撖辣??蝔梧?銝血摮閰衣?銵函?蝚砌?甈?`Sender Name`??渲??極雿”?澆??芸??∠???嚗Ⅱ靽??鞈???
### 敶梢瑼? (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)

### 閰喟敦霈 (Detailed Changes)
- ?啣? `extractSenderName` 頛?嚗蝙??Regex ?瑕?銋暹楊撖辣??????蝙?其縑蝞勗董?????- ?? `getOrCreateRulesSheet`嚗??啣遣蝡?撌乩?銵冽?憿???`Sender Name`?蒂?冽迨???亥??撘炎?亥????摩嚗撌乩?銵典歇摮雿洵鈭?璅???`Sender Name`嚗??芸??瑁? `sheet.insertColumnBefore(2)` 銝血? B1 閮剔 `Sender Name`??- ?? `autoOrganizeGmailWithGemini` 銝餅?蝔?
  - ?湔鞈?霈?艘??鞈?甈揣撘?撠?`Category` ??`Urgency` ?喟宏銝?潘???寧霈??index 2 ??index 3嚗?  - ??AI ????摮貊?撖怠?閰衣?銵冽?嚗??`extractSenderName(rawSender)` 銝血?撖辣??蝔勗神??appendRow ?洵鈭?雿?
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [1.3.1] - 2026-06-10

### 霈?? (Motivation)
- ?箔?閫?捱?祥??API ?餌??澆撠??503 (High demand / Spikes in demand) ?餌???撩?鞎??嚗???API ?澆蝺抵?撱園璈??
### 敶梢瑼? (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)

### 閰喟敦霈 (Detailed Changes)
- ?啣??典?撣豢 `API_CALL_DELAY_MS`嚗潛 1500 瘥怎?嚗?- ??`autoOrganizeGmailWithGemini` 銝餅?蝔?剁????芸銝剛???閬??API ??瘜??典??API 銋?? `Utilities.sleep(API_CALL_DELAY_MS)` ?楨銵辣?脯?
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [1.3.0] - 2026-06-10

### 霈?? (Motivation)
- 撠?砌葉???閬蝙?刻?靘?蝯?霈嚗? API Key 撅祆批?蝔晞?撠祟?詻????嗚??訾??極雿”?迂蝑???銝行??瑼???嚗靘輯閮恣??
### 敶梢瑼? (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)

### 閰喟敦霈 (Detailed Changes)
- ?潭?獢??垢摰???典?閮剖?撣豢嚗GEMINI_API_KEY_PROPERTY`, `GMAIL_SEARCH_QUERY`, `MAX_THREADS_TO_SCAN`, `EMAIL_BODY_CHAR_LIMIT`, `RULES_SHEET_NAME`, `STANDALONE_SPREADSHEET_NAME`, `STANDALONE_SPREADSHEET_PROPERTY`嚗?- ?? `autoOrganizeGmailWithGemini` ??`getOrCreateRulesSheet`嚗???撖急香銋??詨潭?撠?撣豢??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [1.2.0] - 2026-06-10

### 霈?? (Motivation)
- 撖虫?閰衣?銵刻????扯”嚗AI_Rules` 撌乩?銵剁???AI ?芸?摮貊??脣?璈嚗?雿?API ?澆憿漲嚗蒂?芸??潸岫蝞”銝剔???Gmail ??蝭拚?誘??
### 敶梢瑼? (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)
- [appsscript.json](file:///usr/local/google/home/chenghant/Project/Appscript/appsscript.json)

### 閰喟敦霈 (Detailed Changes)
- ??`appsscript.json` ??`oauthScopes` 銝剛?銝?`spreadsheets` 甈?蝭?隞交?渲?撖怨?撱箇?閬?銵具?- 撖虫?靽∠拳銋暹楊?啣??瑕?頛? `extractCleanEmail` ?????批極雿”?????拙???`getOrCreateRulesSheet`??- ?? `autoOrganizeGmailWithGemini` 銝駁?頛荔?
  - ??????`AI_Rules` 銝西??亥??園? Map??  - 撠縑隞嗥?撖辣???嗡辣?脰?閬?瘥?嚗銝剖??湔??鞎潭?蝐歹?銝???API ?嚗?  - ?芸銝剛???嚗誑 AI ??嚗???撠縑蝞晞?憿???撠?隞?`from:email` ???神?岫蝞”??- 靽格迤 `callGeminiAPI` ?箇泵??Google 憸冽??閬?銋?`callGeminiApi` 擏陸撘??- 靽格迤蝔?閮餉圾?臬?嚗???閬耨甇?蝜???銴?
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [1.1.0] - 2026-06-10

### 霈?? (Motivation)
- 靽格迤 GmailWithGemini ?單銝?API ?澆 URL ??憭????券蝳佗?鋆雲 `appsscript.json` 甈?蝭?隞仿???憭望?嚗蒂??蝟餌絞?亥??喳?望?隞亦泵???潸?蝭?
### 敶梢瑼? (Affected Files)
- [GmailWithGemini](file:///usr/local/google/home/chenghant/Project/Appscript/GmailWithGemini/GmailWithGemini)
- [appsscript.json](file:///usr/local/google/home/chenghant/Project/Appscript/appsscript.json)

### 閰喟敦霈 (Detailed Changes)
- 撠?`callGeminiAPI` 銝剔?蝬脣?靽格迤?箸迤蝣箇? `gemini-2.5-flash` API 蝡舫???- ?? JSON 閫???摩嚗??文????雿惜蝝??脰?閫??嚗蒂雿輻 `try-catch` ?ㄨ??- 撠???`Logger.log` 蝟餌絞頛詨?亥?蝧餉陌?箄??銝衣雁??撘酉閫?蝜?銝剜???- ??`appsscript.json` ??`oauthScopes` 銝剛?銝?`gmail.modify` ??`script.external_request` 甈?蝭???
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ??

## [3.7.1] - 2026-06-10

### 霈?? (Motivation)
- ???萎辣閮??芸?閮 Task 1嚗?潮隞嗅??啣?銝餅?唳隤撓?綽?隞亙撽??????靽∩辣?批捆??
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- ??`sendEmailByRule` ?賢?銝剔? `MailApp.sendEmail` 銋?嚗??亥撓?箔縑隞嗡蜓?刻??祆???`console.log` 隤??- ?湔 `Task - Cert Team` ?? `3.7.1`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [3.7.0] - 2026-06-10

### 霈?? (Motivation)
- ??憭折?鞎潔??舀?芸?閮 Task 2嚗?瑽?`sendShippingNotification` ?賢?嚗誑?寞活霈?摮?潔蒂?舀蝭?蝺刻摩嚗ulk Paste嚗?
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- ?? `sendShippingNotification` ?誨?桐??脣??潸????寧?拍 `range.getValues()` ?寞活?脣?蝺刻摩蝭??潦?- 瑼Ｘ霈蝭??臬?閬??格?甈?嚗?甇瑕?敶梢??銝衣???- 靽格 `testEmailNotificationIntegration` 銝剔?璅⊥ Range ??Sheet ?拐辣嚗?銝?`getValues`?getNumColumns`?getNumRows` ??`getA1Notation` 璅⊥?寞?隞交?湔?瘚?皜祈岫??- ?湔 `Task - Cert Team` ?? `3.7.0`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [1.4.0] - 2026-06-10

### 霈?? (Motivation)
- ??`handleDocumentChange` 撖虫?銝西????踹????潮??
### 敶梢瑼? (Affected Files)
- [Fuchsia_status_Notification](file:///usr/local/google/home/chenghant/Project/Appscript/Fuchsia_status_Notification)

### 閰喟敦霈 (Detailed Changes)
- ??`handleDocumentChange` ?賢?銝剖???`LockService.getDocumentLock()`??- 閮剖??憭?敺?15 蝘?15000 瘥怎?嚗誑?????亙仃??銝剜迫?瑁???- 雿輻 `try-finally` 蝣箔??典銵????潛??航炊???暸???- ?湔 `Fuchsia_status_Notification` ?? `1.4.0`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [3.6.1] - 2026-06-10

### 霈?? (Motivation)
- 靽格迤 `Fuchsia_status_Notification` 銝剔?閮餉圾?隤?閮嚗誑蝚血???撘Ⅳ閮餉圾撘瑕?函?擃葉??蝟餌絞?亥??隤方??臬撥?嗅?望???閬???
### 敶梢瑼? (Affected Files)
- [Fuchsia_status_Notification](file:///usr/local/google/home/chenghant/Project/Appscript/Fuchsia_status_Notification)

### 閰喟敦霈 (Detailed Changes)
- 撠?`Fuchsia_status_Notification` 銝剜???酉閫??瑽蝜?銝剜???- 撠?`Fuchsia_status_Notification` 銝剜???擃葉?? `console.error` ??`console.log` 閮???箄??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [3.6.0] - 2026-06-10

### 霈?? (Motivation)
- ???萎辣蝬脤??瑞宏閮 Task 2嚗? Google Chat ?賊??????摮隞園嚗sendEmailByRule`嚗?銝行???? Chat Webhook 頛?賢???
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)
- [appsscript.json](file:///usr/local/google/home/chenghant/Project/Appscript/appsscript.json)

### 閰喟敦霈 (Detailed Changes)
- 蝘駁鈭?`sendChatNotificationByRule` ??`postMessageToChat` 頛?賢???- ?啣? `sendEmailByRule` ?賢?嚗?潮? `MailApp.sendEmail` ?潮靽∩辣??- ?湔 `sendShippingNotification` 銝剔??澆蝡舫?嚗 `sendChatNotificationByRule(e, rule)` ?寧 `sendEmailByRule(e, rule)`??- ??皜祈岫?賢? `testChatNotificationIntegration` ??`testEmailNotificationIntegration`嚗蒂?湔皜祈岫?亥?閮??- ?湔?單?? `3.6.0`??- ??`appsscript.json` ??`oauthScopes` 銝剜憓?`"https://www.googleapis.com/auth/send_mail"` 甈?隞交??`MailApp` ?潮摮隞嗚?
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?瑁? `testEmailNotificationIntegration()` 撽??餃??萎辣?潮?頛舀?阡?雿迤撣詻?
## [3.5.0] - 2026-06-10

### 霈?? (Motivation)
- ?? Webhook ?瑞宏閮 Task 4嚗?瑽?`testChatNotificationIntegration` 皜祈岫?賢?嚗宏??API Token 閮箸?摩嚗?箸芋??Webhook ?游?皜祈岫嚗誑撽? Webhook ???
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- 蝘駁鈭?`testChatNotificationIntegration` ?賢?銝剔??頛詨 OAuth Token 閮箸鞈???撘Ⅳ?憛?- 撠葫閰阡?憪??亥?閮靽格??"Starting Chat API Webhook notification test..."??- ?湔?單?? `3.5.0`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?瑁? `testChatNotificationIntegration()` 蝣箄?璅⊥鈭辣?賣??? Webhook ?潮??
## [3.4.1] - 2026-06-10

### 霈?? (Motivation)
- 靽格迤 `sendChatNotificationByRule` 銝剖??`postMessageToChat` ??仿隤文??貊???????亙歇銝??函? `rule.space`嚗?寧 `rule.webhookUrl`??
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- 撠?`sendChatNotificationByRule` ?賢??抒? `postMessageToChat(rule.space, message)` 靽格??`postMessageToChat(rule.webhookUrl, message)`??- ?湔?單?? `3.4.1`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [3.4.0] - 2026-06-10

### 霈?? (Motivation)
- ?? `postMessageToChat` ?賢?嚗?箔蝙??Google Chat REST API ?潮??荔?隞乩蝙?刻犖頨思遢?潮??踹?靘陷?脤?????
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- 蝘駁??雿輻 `Chat.Spaces.Messages.create` ????`postMessageToChat` 撖虫???- 雿輻 `UrlFetchApp.fetch` ??`ScriptApp.getOAuthToken()` ?撖虫? `postMessageToChat`嚗? Google Chat REST API (`https://chat.googleapis.com/v1/...`) ?潮??胯?- 憓?撠?HTTP ??隞?Ⅳ??瘀?200/201 銵函內??嚗隞”蝷箏仃??銝血?隤斤???- ?湔?單?? `3.4.0`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?瑁? `testChatNotificationIntegration()` ?脰??游?皜祈岫嚗Ⅱ隤瘝?? Google Chat ?脤?????瘜?嚗?虫??賣迤撣訾蝙??REST API ?潮??
## [鞈?皜?蔭] - 2026-06-09

### 霈?? (Motivation)
- 靽格迤甈?閮剖?嚗?????其犖嚗ot嚗澈隞賣?箔誑雿輻?犖頨思遢嚗ser-centric嚗??Google Chat 閮嚗誑蝚血??犖??瘙?
### 敶梢瑼? (Affected Files)
- [appsscript.json](file:///usr/local/google/home/chenghant/Project/Appscript/appsscript.json)

### 閰喟敦霈 (Detailed Changes)
- 撱箇??冽??Apps Script 撠?鞈?皜 `appsscript.json`??- ?蔭 `oauthScopes`嚗?蝣箄?瘙?`https://www.googleapis.com/auth/chat.messages.create` 甈?蝭?隞交隞?chatbot 甈???- ?刻?閮??桐葉??脤? Google Chat ??嚗??祉 `v1`嚗?
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- 銝銝阡蝵?`appsscript.json` ?唳??Apps Script 撠?銝哨?銝阡??唳?甈誑摰??犖頨思遢蝬???
## [3.3.0] - 2026-06-09

### 霈?? (Motivation)
- ?啣?皜祈岫?刻??拙撘誑撽? Google Chat API ?游??臬??甇?虜??
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- ?啣? `testChatNotificationIntegration()` ?賢?嚗芋?祈岫蝞”蝺刻摩鈭辣嚗???Sheet?ange 隞亙? Event ?拐辣嚗?銝血??`sendShippingNotification(e)`??- ?湔?單?? `3.3.0`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?瑁? `testChatNotificationIntegration()` ?賢?嚗Ⅱ隤?西??璅⊥銝衣??唳?摰?Chat 蝛粹???
## [3.2.2] - 2026-06-09

### 霈?? (Motivation)
- 靘???撘Ⅳ閮餉圾撘瑕?函?擃葉??蝭????典??望??葉?勗冗??閮餉圾??
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- 撠洵 4 銵?`* Google Apps Script: Multi-Sheet & Multi-Condition Notification` ????`* Google Apps Script嚗?????璇辣?蝟餌絞`??- 撠洵 5 銵?`* Google Apps Script: 憭???璇辣?芸??蝟餌絞 (銝 Row Data ??` ????`* Google Apps Script嚗?????璇辣?芸??蝟餌絞 (銝?游?鞈???`??- 撠洵 17 ??26 銵?`// B 甈?(1-based index)` ????`// B 甈?(敺?1 ??閮?)`??- 撠洵 53 銵?`// ?湔?瑁??潮?銝??? Row Data` ????`// ?湔?瑁??潮?銝????游?鞈?`??- ?湔?單?? `3.2.2`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [3.2.1] - 2026-06-09

### 霈?? (Motivation)
- ??蝔?蝣潸酉閫?誑?湔蝚血???撘Ⅳ閮餉圾撘瑕?函?擃葉??蝭?
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- 撠?`Global Configuration - ?典?閬?閮剖?` ????`?典?閮剖?`??- 撠?`// Google Chat Space` 閮餉圾????`// Google Chat 蝛粹?`??- 撠?`sendShippingNotification` ??JSDoc ?望?隤芣????箇?擃葉??`蝺刻摩?孛?潛?銝餃撘??- 撠?`sendChatNotificationByRule` ??JSDoc ?望?隤芣????箇?擃葉??`靘?閬??潮?Chat ????拙撘??- ?湔?單?? `3.2.1`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [3.2.0] - 2026-06-09

### 霈?? (Motivation)
- 靘?撖虫?閮嚗???隞園?嚗sendEmailByRule`嚗? Google Chat ?予摰日?嚗sendChatNotificationByRule`嚗?
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- ?芷?? `sendEmailByRule` ?賢???- ?啣? `sendChatNotificationByRule(e, rule)` ?賢?嚗?潭???摰?雿??潔蒂?潮?Markdown ?澆???Google Chat 閮??- ?湔 `sendShippingNotification` 銝剔??澆蝡舫?嚗 `sendEmailByRule(e, rule)` ?寧 `sendChatNotificationByRule(e, rule)`??- ?湔?單?? `3.2.0`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- 撽??函楊頛舐泵?????脣??潭?嚗?西???? `postMessageToChat` ?潮?Chat ???
## [3.1.1] - 2026-06-09

### 霈?? (Motivation)
- 靽格迤 `postMessageToChat` 銝剔?銝餅?唳隤??航炊閮嚗??嗥蝜?銝剜??寧?望?嚗誑蝚血??典?閬?嚗I ?頂蝯梯?閮撘瑕?刻????
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- 撠?`postMessageToChat` 銝剔? `console.log` ??`console.error` 閮蝧餉陌?箄??- ?湔?單?? `3.1.1`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?～?
## [3.1.0] - 2026-06-09

### 霈?? (Motivation)
- 撖虫? `postMessageToChat(space, text)` 頛?賢?隞交?湧? Google Chat API ?潮??
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- ?啣? `postMessageToChat(space, text)` ?賢?嚗蝙??`Chat.Spaces.Messages.create` ?潮??荔?銝血??仿隤方????亥?閮???- ?湔?單?? `3.1.0`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- ?游?甇方??拙撘銝餉??瘚?銝哨??誨???萎辣?銝西?嚗?
## [3.0.1] - 2026-06-09

### 霈?? (Motivation)
- 靽格迤 `NOTIFICATION_RULES` 銝剔?甈?蝝Ｗ??航炊????`targetColumn` 閮剖???`1`嚗蒂閮餉圾??B 甈?雿???Apps Script ??`range.getColumn()` ??1-based嚗 A=1, B=2嚗???`column === rule.targetColumn` ??B 甈楊頛舀?瘥?憭望???- 蝯曹?甈?蝝Ｗ??摩嚗? `targetColumn` ?寧 1-based 蝝Ｗ?嚗? `detailColumn` ??Apps Script ?? API 靽?銝?氬?
### 敶梢瑼? (Affected Files)
- [Task - Cert Team](file:///usr/local/google/home/chenghant/Project/Appscript/Task%20-%20Cert%20Team)

### 閰喟敦霈 (Detailed Changes)
- 撠?`Sample Request` 閬?銝剔? `targetColumn` 敺?`1` 靽格??`2`嚗蒂?湔閮餉圾??`// B 甈?(1-based index)`??- 撠?`Other Task Request` 閬?銝剔? `targetColumn` 敺?`1` 靽格??`2`嚗蒂?湔閮餉圾??`// B 甈?(1-based index)`??- ?湔?單?? `3.0.1`嚗??啁 `2026-06-09`??
### 敺?敺齒鈭???銵暺?(Next Steps & Technical Breakpoints)
- 撽?甇支耨甇??西甇?Ⅱ閫貊 Google Chat ?嚗??典祕?岫蝞”銝剔楊頛?B 甈蒂蝣箄??臬??嚗?*/
