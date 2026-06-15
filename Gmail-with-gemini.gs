// ==================== ?¨å?è¨­å? ====================
// 1. ?‡ä»¤ç¢¼å±¬?§ä¸­??Gemini API ?‘é‘°?ç¨±
const GEMINI_API_KEY_PROPERTY = 'GEMINI_API_KEY';

// 2. Gmail ?œå?ç¯©é¸æ¢ä»¶ (?’é™¤å·²æ?ç±¤ç??ªè?ä¿¡ä»¶ï¼Œé˜²æ­¢é?è¤‡åˆ¤è®€)
const GMAIL_SEARCH_QUERY = 'is:unread -label:"AI/å·¥ä?" -label:"AI/è²¡å?å¸³å–®" -label:"AI/?‹äººæ¶ˆè²»" -label:"AI/ç³»çµ±?šçŸ¥" -label:"AI/?»å…¥?å??šçŸ¥" -label:"AI/å»??è¡ŒéŠ·" -label:"AI/ç¤¾ç¾¤?šçŸ¥" -label:"AI/?‹äºº?±ç?" -label:"AI/Netflix" -label:"AI/?ªå?é¡?';

// 3. æ¯æ¬¡?ƒæ??„ä¿¡ä»¶å?è©±ä¸²?€å¤§æ•¸??
const MAX_THREADS_TO_SCAN = 50;

// 4. ?¯å¦?è¨­å¾æ??“æ???(?€?? ?„éƒµä»¶é?å§‹æ•´??
const PROCESS_OLDEST_FIRST = true;

// 5. ?®å??µä»¶?§æ??·å?å­—æ•¸ä¸Šé?ï¼Œé¿??Token ?†ç‚¸
const EMAIL_BODY_CHAR_LIMIT = 1000;

// 5.1 ?„å·¥ä½œè¡¨?ç¨±
const RULES_SHEET_NAME = 'AI_Rules';
const EXECUTION_LOG_SHEET_NAME = 'AI_Execution_Log';
const UNCATEGORIZED_SHEET_NAME = 'AI_Uncategorized';
const LEARNING_RULES_SHEET_NAME = 'AI_LearningRules';
const PROMPT_CONFIG_SHEET_NAME = 'AI_PromptConfig';

// 6. ?¨ç?è©¦ç?è¡¨å?ç¨±ï??…ç”¨?¼ç¨ç«‹è…³?¬é?æ¬¡å»ºç«‹æ?ï¼?
const STANDALONE_SPREADSHEET_NAME = 'GmailWithGemini_Rules';

// 7. ?‡ä»¤ç¢¼å±¬?§ä¸­?„ç¨ç«‹è©¦ç®—è¡¨ ID ?ç¨±
const STANDALONE_SPREADSHEET_PROPERTY = 'RULES_SHEET_ID';

// 8. API ?¼å«è¨­å?
const API_MAX_RETRIES = 3;
const API_RETRY_BASE_DELAY_MS = 10000;

// 8.1 ?¹æ¬¡?•ç?è¨­å? (v3.0)
const BATCH_SIZE = 10;         // æ¯æ‰¹æ¬¡å??‚è??†ç?ä¿¡ä»¶?¸é?
const BATCH_DELAY_MS = 2000;   // ?¹æ¬¡ä¹‹é??„ç?å¾…æ¯«ç§’æ•¸

// 8.2 ?ªå??’ç??“é? (v3.0)
const TRIGGER_INTERVAL_HOURS = 1; // ?ªå??†é?è§¸ç™¼?“é? (å°æ?)ï¼?=æ¯å??? 2=æ¯?å°æ?

// 8.3 æ¯æ—¥?˜è? Email ?¶ä»¶äººï??™ç©º?‡å?çµ¦åŸ·è¡Œè…³?¬ç?å¸³è??¬èº«ï¼?
const DIGEST_RECIPIENT_EMAIL = '';

// 9. AI ?†é?å°æ???Gmail ?¶ä»¶??³»çµ±å??æ?ç±?ID
const CATEGORY_TAB_MAPPING = {
  "å·¥ä?": "CATEGORY_PERSONAL",
  "è²¡å?å¸³å–®": "CATEGORY_UPDATES",
  "?‹äººæ¶ˆè²»": "CATEGORY_UPDATES",
  "ç³»çµ±?šçŸ¥": "CATEGORY_UPDATES",
  "?»å…¥?å??šçŸ¥": "CATEGORY_UPDATES",
  "å»??è¡ŒéŠ·": "CATEGORY_PROMOTIONS",
  "ç¤¾ç¾¤?šçŸ¥": "CATEGORY_SOCIAL",
  "?‹äºº?±ç?": "CATEGORY_PERSONAL",
  "Netflix": "CATEGORY_UPDATES",
  "?ªå?é¡?: "CATEGORY_PERSONAL"
};

// 10. ?ˆæ??†é??—è¡¨ï¼ˆç”¨??AI_Uncategorized ä¸‹æ?é©—è?ï¼?
const VALID_CATEGORIES = ["å·¥ä?","è²¡å?å¸³å–®","?‹äººæ¶ˆè²»","ç³»çµ±?šçŸ¥","?»å…¥?å??šçŸ¥","å»??è¡ŒéŠ·","ç¤¾ç¾¤?šçŸ¥","?‹äºº?±ç?","Netflix"];
// =========================================================================

// =========================================================================
// ==================== ?¯å–®?¨åŸ·è¡Œä??¥å£?½å?èªªæ? (Runnable Functions) ====================
// =========================================================================
/**
 * 1. autoOrganizeGmailWithGemini()    ???ºæ…§?µä»¶?†é?ä¸»ç?å¼ï??¹æ¬¡ AI + ?ªä¸»å­¸ç?ï¼?
 * 2. syncExistingLabeledThreadsToCategories() ??æ­·å²ä¿¡ä»¶?¶ä»¶????ä??µå?æ­?
 * 3. processUncategorizedSheet()      ???•ç? AI_Uncategorized äººå·¥å¯©æŸ¥çµæ?
 * 4. sendDailyDigest()                ???‹å?è§¸ç™¼ä»Šæ—¥?é??˜è? Email
 * 5. setupTriggers()                  ??ä¸€?µè¨­å®šå…¨?¨è‡ª?•è§¸?¼å™¨
 * 6. removeTriggers()                 ??ç§»é™¤?¨éƒ¨è§¸ç™¼?¨ï??«å??ªå??·è?ï¼?
 * 7. checkApiKeyStatus()              ??API ?‘é‘°è¨ºæ–·å·¥å…·
 * 8. refreshAvailableModels()         ???‹å??·æ–° AI_PromptConfig ?„å¯?¨æ¨¡?‹æ???
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
    // 1. ?è??ªä¸»å­¸ç?è¦å?
    const learningRules = loadLearningRules();
    Logger.log(`Loaded ${learningRules.size} learning rule(s).`);

    // 2. ?è? Prompt è¨­å?
    const promptConfig = buildPromptFromSheet();
    Logger.log(`Prompt loaded: ${promptConfig.categories.length} cats, ${promptConfig.examples.length} examples, model: ${promptConfig.model}`);

    // 3. ?–å?è©¦ç?è¡?
    let sheet;
    try { sheet = getOrCreateRulesSheet(); } catch(e) { Logger.log("Sheet init error: " + e); }

    // 4. ?œå??ªè?ä¸”æœª?†é?ä¿¡ä»¶
    let threads = GmailApp.search(GMAIL_SEARCH_QUERY, 0, 50);
    if (threads.length === 0) {
      Logger.log("No unread threads found.");
    } else {
      if (PROCESS_OLDEST_FIRST) threads.reverse();
      threads = threads.slice(0, MAX_THREADS_TO_SCAN);
      Logger.log(`Found ${threads.length} thread(s) to classify.`);

      // 5. ?†æ?ï¼šå­¸ç¿’è??‡å‘½ä¸?vs. ?€è¦?AI ?¤è?
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
              category: learningRules.get(senderEmail), urgency: "ä½?,
              refinedContent: `[å­¸ç?è¦å??½ä¸­] ${learningRules.get(senderEmail)}` });
          } else {
            needsAI.push({ thread, rawSender, senderEmail, subject, body });
          }
        } catch(e) { failureCount++; Logger.log("Pre-process error: " + e); }
      });

      // 6. ?•ç?å­¸ç?è¦å??½ä¸­
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

      // 7. ?¹æ¬¡ AI ?†é?
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
              if (urgency === "é«?) highUrgencyCount++;
              else if (urgency === "ä¸?) mediumUrgencyCount++;
              else lowUrgencyCount++;
              const d = item.thread.getLastMessageDate();
              if (!minDate || d < minDate) minDate = d;
              if (!maxDate || d > maxDate) maxDate = d;
              Logger.log(`[AI] ${item.senderEmail} ??${category} (${urgency})`);
            } else {
              failureCount++;
              category = "?ªå?é¡?; urgency = "ä½?;
              refinedContent = "AI?¹æ¬¡?¤è?å¤±æ?ï¼Œç?å¾…äººå·¥å¯©??;
              Logger.log(`[Fallback] ${item.senderEmail} ???ªå?é¡`);
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
 * è¼”åŠ©?½å?ï¼šå??¨å?é¡æ?ç±¤ã€æ›´??Gmail ?†é??å¯«??AI_Rules ?¥è?
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
 * ä¸€æ¬¡æ€§æ­·?²ä¿¡ä»¶æ­¸é¡å·¥?·ã€?
 * ?ƒæ??€?‰æ­·?²å·²æ­¸é?æ¨™ç±¤ (AI/*) ?„ä¿¡ä»¶ï?ä¸¦å??¶è‡ª?•å?æ­¥ç§»?³å??‰ç? Gmail ?†é?ä¸­ã€?
 * æ­¤åŸ·è¡Œå??¨ä??€?¼å« Gemini API??
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
        // ?·å???100 å°ä¿¡ï¼ˆå¯?¹æ??€è¦é?è¤‡åŸ·è¡Œä»¥æ¶ˆå??´å¤§ä¿¡é?ï¼?
        const threads = label.getThreads(0, 100);
        Logger.log(`Found ${threads.length} threads labeled with '${labelName}'. Moving to ${tabLabelId}...`);
        
        threads.forEach((thread, index) => {
          if (index > 0) {
            Utilities.sleep(150); // ?²ç? API ?»ç??è?
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
 * ?·å?ä¹¾æ·¨?„é›»å­ä¿¡ç®±åœ°?€ (å°å¯«)
 * @param {string} emailString ?Ÿå?ä¿¡ä»¶?°å?å­—ä¸²
 * @return {string} ä¹¾æ·¨?„ä¿¡ç®±åœ°?€
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
 * ç¾å?è©¦ç?è¡¨æ??ˆå?è§€ä¸¦è¨­å®šç??¥åº¦æ¢ä»¶?¼å??–è???
 * @param {Sheet} sheet Google Sheets å·¥ä?è¡¨ç‰©ä»?
 */
function formatSheetAesthetics(sheet) {
  // 1. è¨­å?æ¬„ä?å¯¬åº¦?²æ­¢?§å®¹?®æ?
  sheet.setColumnWidth(1, 240); // ?»å?ä¿¡ç®±
  sheet.setColumnWidth(2, 160); // å¯„ä»¶?…å?ç¨?
  sheet.setColumnWidth(3, 110); // é¡åˆ¥
  sheet.setColumnWidth(4, 90);  // ç·Šæ€¥åº¦
  sheet.setColumnWidth(5, 280); // AI ç²¾ç??§å®¹
  sheet.setColumnWidth(6, 200); // Gmail ?œå?å­—ä¸²
  sheet.setColumnWidth(7, 160); // ?´æ–°?‚é?
  
  // 2. å¥—ç”¨ A1:G1000 ä¹‹äº¤?¿è??¯è‰²å½?(?‘é¦¬ç·?
  const fullRange = sheet.getRange("A1:G1000");
  fullRange.clearFormat(); // æ¸…é™¤?Šæ ¼å¼?
  
  // æ¸…ç??¾å??„æ??‰äº¤?¿è??¯è¨­å®?(Bandings) ?¿å?è¡ç?
  const bandings = sheet.getBandings();
  bandings.forEach(banding => banding.remove());
  
  fullRange.setAlternatingRowColors(
    "#FFFFFF", // å¥‡æ•¸è¡?
    "#F7FAFC", // ?¶æ•¸è¡?
    "#2D3748"  // æ¨™é?è¡?
  );
  
  // 3. è¨­å?æ¨™é??—æ¨£å¼?( setAlternatingRowColors ?ƒé?è£½è??¯ï??€?å?æ¨™é??‡å??¹ç‚ºç´”ç™½ç²—é?)
  const headerRange = sheet.getRange(1, 1, 1, 7);
  headerRange.setFontFamily("Arial")
             .setFontSize(10)
             .setFontWeight("bold")
             .setFontColor("#FFFFFF")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");
             
  sheet.setRowHeight(1, 28); // è¨­å?æ¨™é??—é?åº?
  
  // 4. è¨­å?è³‡æ?æ¬„ä?æ°´å¹³?‡å??´å?é½?
  sheet.getRange("A2:A1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("B2:B1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("C2:C1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("D2:D1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  sheet.getRange("E2:E1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("F2:F1000").setHorizontalAlignment("left").setVerticalAlignment("middle");
  sheet.getRange("G2:G1000").setHorizontalAlignment("center").setVerticalAlignment("middle");
  
  // 5. è¨­å?ç·Šæ€¥åº¦ (Dæ¬? æ¢ä»¶?¼å??–è???(é«?ç´? ä¸?é»? ä½?ç¶?
  const urgencyRange = sheet.getRange("D2:D1000");
  
  const ruleHigh = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("é«?)
      .setBackground("#FEE2E2") // æ·ºç?
      .setFontColor("#991B1B") // æ·±ç?
      .bold(true)
      .setRanges([urgencyRange])
      .build();
      
  const ruleMedium = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("ä¸?)
      .setBackground("#FEF3C7") // æ·ºé?
      .setFontColor("#92400E") // æ·±é?
      .bold(true)
      .setRanges([urgencyRange])
      .build();
      
  const ruleLow = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("ä½?)
      .setBackground("#DCFCE7") // æ·ºç?
      .setFontColor("#166534") // æ·±ç?
      .setRanges([urgencyRange])
      .build();
      
  sheet.setConditionalFormatRules([ruleHigh, ruleMedium, ruleLow]);
  Logger.log("Applied premium aesthetic formats and conditional rules to AI_Rules sheet.");
}

/**
 * ?–å??–è‡ª?•å»ºç«?AI_Rules å·¥ä?è¡?
 * @return {Sheet} Google Sheets å·¥ä?è¡¨ç‰©ä»?
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
    // ?å??–æ?é¡Œå?
    sheet.appendRow(["Email", "Sender Name", "Category", "Urgency", "AI Refined Content", "Gmail Search Query", "Updated Time"]);
    sheet.setFrozenRows(1);
    formatSheetAesthetics(sheet);
    Logger.log("Created AI_Rules sheet and applied aesthetic rules.");
  } else if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    // ?ªæ?ä¿®å¾©ï¼šè‹¥å·¥ä?è¡¨å…§å®¹è¢«æ¸…ç©ºï¼Œé??°å¯«?¥æ?é¡Œè??¼å???
    sheet.appendRow(["Email", "Sender Name", "Category", "Urgency", "AI Refined Content", "Gmail Search Query", "Updated Time"]);
    sheet.setFrozenRows(1);
    formatSheetAesthetics(sheet);
    Logger.log("Recovered empty AI_Rules sheet headers and applied aesthetics.");
  } else {
    // ?‡ç??Šç??¼å? (å¦‚æ?ç¼ºå? Sender Name æ¬„ä?)
    if (sheet.getLastColumn() > 0 && sheet.getRange(1, 2).getValue() !== "Sender Name") {
      sheet.insertColumnBefore(2);
      sheet.getRange(1, 2).setValue("Sender Name");
      Logger.log("Migrated AI_Rules sheet: Inserted 'Sender Name' column at index 2.");
    }
    // ?‡ç??Šç??¼å? (å¦‚æ?ç¼ºå? AI Refined Content æ¬„ä?)
    if (sheet.getLastColumn() > 0 && sheet.getRange(1, 5).getValue() !== "AI Refined Content") {
      sheet.insertColumnBefore(5);
      sheet.getRange(1, 5).setValue("AI Refined Content");
      Logger.log("Migrated AI_Rules sheet: Inserted 'AI Refined Content' column at index 5.");
    }
    // å¥—ç”¨?“è?å¤–è??’ç?æ¨???‡æ?ä»¶è???
    formatSheetAesthetics(sheet);
  }
  return sheet;
}

/**
 * ?·å?å¯„ä»¶?…å?ç¨?
 * @param {string} senderString ?Ÿå?å¯„ä»¶?…æ?ä½å?ä¸?(å¦?"KGI Bank <card999@kgibank.com>")
 * @return {string} å¯„ä»¶?…å?ç¨?
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
 * å¯«å…¥?·è?çµ±è??¥è??³å–®?¨ç?å·¥ä?è¡¨ä¸­
 */
function writeExecutionLog(timeString, minDate, maxDate, successCount, failureCount, highUrgency, mediumUrgency, lowUrgency, categoryStats, successYn, errorMsg) {
  const sheet = getOrCreateExecutionLogSheet();
  if (!sheet) return;
  
  // 1. å½™æ•´ä¿¡ä»¶?¶ä»¶?‚é??€?“å?ä¸?
  let dateRangeStr = "N/A";
  if (minDate && maxDate) {
    const tz = Session.getScriptTimeZone();
    const minStr = Utilities.formatDate(minDate, tz, "yyyy-MM-dd HH:mm");
    const maxStr = Utilities.formatDate(maxDate, tz, "yyyy-MM-dd HH:mm");
    dateRangeStr = `${minStr} ~ ${maxStr}`;
  }
  
  // 2. å½™æ•´?†é?ä½”æ?å­—ä¸² (ä¾‹å?ï¼šå·¥ä½?2), Netflix(1))
  const statsList = [];
  for (const cat in categoryStats) {
    statsList.push(`${cat}(${categoryStats[cat]})`);
  }
  const categoryBreakdown = statsList.length > 0 ? statsList.join(", ") : "None";
  
  // 3. å¯«å…¥?—è??™ï?Execution Time, Email Date Range, Success Count, Failure Count, High, Medium, Low, Category Distribution, Finished Successfully, Error Message
  sheet.appendRow([timeString, dateRangeStr, successCount, failureCount, highUrgency, mediumUrgency, lowUrgency, categoryBreakdown, successYn, errorMsg]);
  Logger.log("Successfully logged execution stats.");
}

/**
 * ?–å??–è‡ª?•å»ºç«?AI_Execution_Log å·¥ä?è¡?
 * @return {Sheet} Google Sheets å·¥ä?è¡¨ç‰©ä»?
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
    // ?å??–æ?é¡?
    sheet.appendRow(["Execution Time", "Email Date Range", "Success Count", "Failure Count", "High Urgency", "Medium Urgency", "Low Urgency", "Category Distribution", "Finished Successfully", "Error Message"]);
    sheet.setFrozenRows(1);
    formatExecutionLogSheetAesthetics(sheet);
    Logger.log("Created AI_Execution_Log sheet and initialized formatting.");
  } else if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    // ?ªæ?ä¿®å¾©ï¼šå??œå·¥ä½œè¡¨è¢«æ?ç©ºï??ç½®æ¨™é??‡æ ¼å¼?
    sheet.appendRow(["Execution Time", "Email Date Range", "Success Count", "Failure Count", "High Urgency", "Medium Urgency", "Low Urgency", "Category Distribution", "Finished Successfully", "Error Message"]);
    sheet.setFrozenRows(1);
    formatExecutionLogSheetAesthetics(sheet);
    Logger.log("Recovered empty AI_Execution_Log sheet headers.");
  }
  return sheet;
}

/**
 * ç¾å?çµ±è??¥è?å·¥ä?è¡¨æ??ˆå?è§€ä¸¦è¨­å®šåŸ·è¡Œç??‹æ?ä»¶æ ¼å¼å?è¦å?
 * @param {Sheet} sheet Google Sheets å·¥ä?è¡¨ç‰©ä»?
 */
function formatExecutionLogSheetAesthetics(sheet) {
  // 1. è¨­å?æ¬„ä?å¯¬åº¦
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
  
  // 2. å¥—ç”¨ A1:J1000 ä¹‹äº¤?¿è??¯å???(?‘é¦¬ç·?
  const fullRange = sheet.getRange("A1:J1000");
  fullRange.clearFormat(); // æ¸…é™¤?Šæ ¼å¼?
  
  const bandings = sheet.getBandings();
  bandings.forEach(banding => banding.remove());
  
  fullRange.setAlternatingRowColors(
    "#FFFFFF", // å¥‡æ•¸è¡?
    "#F7FAFC", // ?¶æ•¸è¡?
    "#2D3748"  // æ¨™é?è¡?
  );
  
  // 3. è¨­å?æ¨™é??—æ¨£å¼?(ç´”ç™½ç²—é?)
  const headerRange = sheet.getRange(1, 1, 1, 10);
  headerRange.setFontFamily("Arial")
             .setFontSize(10)
             .setFontWeight("bold")
             .setFontColor("#FFFFFF")
             .setHorizontalAlignment("center")
             .setVerticalAlignment("middle");
             
  sheet.setRowHeight(1, 28); // è¨­å?é«˜åº¦
  
  // 4. è¨­å?è³‡æ?æ¬„ä?æ°´å¹³ç½®ä¸­?‡å?é½Šæ–¹å¼?
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
  
  // 5. è¨­å? Finished Successfully (Iæ¬? æ¢ä»¶?¼å??–è???(Y:ç¶? N:ç´?
  const statusRange = sheet.getRange("I2:I1000");
  
  const ruleY = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("Y")
      .setBackground("#DCFCE7") // æ·ºç?
      .setFontColor("#166534") // æ·±ç?
      .bold(true)
      .setRanges([statusRange])
      .build();
      
  const ruleN = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("N")
      .setBackground("#FEE2E2") // æ·ºç?
      .setFontColor("#991B1B") // æ·±ç?
      .bold(true)
      .setRanges([statusRange])
      .build();
      
  sheet.setConditionalFormatRules([ruleY, ruleN]);
  Logger.log("Applied premium aesthetic formats and conditional rules to AI_Execution_Log sheet.");
}

/**
 * ä½¿ç”¨ Gmail REST API å°‡æ?å®šç? thread ç§»å??°å??©ç? Gmail ?¶ä»¶?????(Category)
 * @param {string} threadId Gmail å°è©±ä¸?ID
 * @param {string} tabLabelId Gmail ç³»çµ±?†é?æ¨™ç±¤ ID (å¦?"CATEGORY_SOCIAL")
 */
function moveThreadToGmailCategory(threadId, tabLabelId) {
  if (!threadId || !tabLabelId) return;
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`;
  const token = ScriptApp.getOAuthToken();
  
  // ?ºä??²æ­¢?è??ºç¾?¨å??‹å??ï?? å…¥è©²å??ï?ä¸¦ç§»?¤å…¶ä»–ç³»çµ±å??æ?ç±?
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
// ==================== ?¹æ¬¡ AI ?†é??½å? (v3.0) ====================
// =========================================================================

/**
 * ?¹æ¬¡ AI ?†é?ï¼šä?æ¬¡å‚³?æ?å¤?BATCH_SIZE å°éƒµä»¶ï?è¦æ? AI ä¾å??å‚³çµæ????
 * @param {string} apiKey
 * @param {Array} emailList [{sender, subject, body}, ...]
 * @param {Object} promptConfig {categories, urgencyHigh, urgencyMid, urgencyLow, examples, roleDesc, model}
 * @return {Array|null} çµæ???? [{category, urgency, refinedContent}, ...] ??null
 */
function callGeminiApiBatch(apiKey, emailList, promptConfig) {
  const model = (promptConfig && promptConfig.model) ? promptConfig.model : 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // ?•æ?çµ„è??†é?è¦ç?
  const categoriesText = (promptConfig && promptConfig.categories && promptConfig.categories.length > 0)
    ? promptConfig.categories.map((c, i) => `${i+1}. ??{c.name}?ï?${c.desc}${c.note ? ' *æ³¨æ?*ï¼? + c.note : ''}`).join('\n')
    : `1. ?Œå·¥ä½œã€ï?å°ˆå±¬?‹äºº?„å??™æ??šã€æ??·ä??•ä¿¡ä»¶ã€‚\n2. ?Œè²¡?™å¸³?®ã€ï??€è¡Œäº¤?“æ?ç´°ã€é›»å­ç™¼ç¥¨ã€å¸³?®ç¹³è²»é€šçŸ¥?‚\n3. ?Œå€‹äººæ¶ˆè²»?ï?ç·šä?è³¼ç‰©è¨‚å–®ç¢ºè??å‡ºè²??é??šçŸ¥?‚\n4. ?Œç³»çµ±é€šçŸ¥?ï??ªå??–ç³»çµ±è­¦?±ã€å¸³?Ÿå??¨ä¿¡?å??¨æ€§é?è­‰ç¢¼ (OTP)?‚\n5. ?Œç™»?¥æ??Ÿé€šçŸ¥?ï??„å®¶?€è¡Œæ?ç¶²ç??å??¼é€ä?å®‰å…¨?Œç™»?¥æ??Ÿã€ç¢ºèªä¿¡?‚\n6. ?Œå»£?Šè??·ã€ï??»å??±ã€ä??·å»£?Šã€æ??¹åˆ¸?ç”¢?æ¨å»?¿¡?‚\n7. ?Œç¤¾ç¾¤é€šçŸ¥?ï?ç¤¾ç¾¤å¹³å°ç¾¤ç™¼?„æ¨å»???•æ??˜è?ä¿¡ã€‚\n8. ?Œå€‹äºº?±ç??ï?è¦ªå??„å€‹äººä¾†ä¿¡?ç?äººæ??Šè???æ©Ÿç¥¨ç¢ºè?ä¿¡ã€‚\n9. ?ŒNetflix?ï?Netflixï¼ˆå« @account.netflix.com ??netflix.com ?Ÿå?ï¼‰ç™¼?ä??€?‰ä¿¡ä»¶ã€‚`;

  const categoryEnums = (promptConfig && promptConfig.categories && promptConfig.categories.length > 0)
    ? promptConfig.categories.map(c => c.name)
    : VALID_CATEGORIES;

  // ?•æ?çµ„è? Few-Shot ç¯„ä?
  const defaultExamples = `- *ç¯„ä? 1 (å·¥ä??‹äººç§è?)*ï¼š\n  - å¯„ä»¶?…ï?\`LinkedIn <messages-noreply@linkedin.com>\`ï¼Œæ?é¡Œï?\`?‹å¤§?å‚³?ä?è¨Šæ¯çµ¦æ‚¨\`ï¼Œå…§?‡ï?\`?¨ï??³è??¨è???..\`\n  - ?¤å?çµæ?ï¼š\`category: "å·¥ä?"\`, \`urgency: "ä¸?\`, \`refinedContent: "LinkedInç§è?-?‹å¤§???³è??Šå±¥æ­?\`\n- *ç¯„ä? 2 (?‹äººæ¶ˆè²»è¨‚å–®)*ï¼š\n  - å¯„ä»¶?…ï?\`Shopee <info@shopee.tw>\`ï¼Œæ?é¡Œï?\`è¨‚å–®?ç??šçŸ¥\`ï¼Œå…§?‡ï?\`?Ÿè??¨ç?æ¶ˆè²»ï¼Œæ?è²»é?é¡?NT$ 500 ??..\`\n  - ?¤å?çµæ?ï¼š\`category: "?‹äººæ¶ˆè²»"\`, \`urgency: "ä½?\`, \`refinedContent: "?¦çš®è³¼ç‰©-è¨‚å–®?ç?-NT$500"\``;
  const examplesText = (promptConfig && promptConfig.examples && promptConfig.examples.length > 0)
    ? promptConfig.examples.map((ex, i) => `- *ç¯„ä? ${i+1} (${ex.label})*ï¼š\n  - å¯„ä»¶?…ï?\`${ex.sender}\`ï¼Œæ?é¡Œï?\`${ex.subject}\`ï¼Œå…§?‡ï?\`${ex.body}\`\n  - ?¤å?çµæ?ï¼š\`category: "${ex.category}"\`, \`urgency: "${ex.urgency}"\`, \`refinedContent: "${ex.refined}"\``).join('\n')
    : defaultExamples;

  const urgencyHigh = (promptConfig && promptConfig.urgencyHigh) || '?€è¦å³?‚é?æ³¨æ??•ä?ä¹‹ä¿¡ä»¶ã€‚ä?å¦‚ï?é©—è?ç¢?(OTP)?ç™»?¥ç•°å¸¸å??¨è­¦?±ã€ä¿¡?¨å¡æ¶ˆè²»?‘æ…®??;
  const urgencyMid  = (promptConfig && promptConfig.urgencyMid)  || '?‰æ??ˆæ€§ä??¡é?ç«‹åˆ»?•ç?ä¹‹ä¿¡ä»¶ã€‚ä?å¦‚ï?å¹¾å¤©?§åˆ°?Ÿç?ç¹³è²»å¸³å–®?å·¥ä½œæ?è­°é?ç´„ã€å?è¾¦ä»»?™ã€?;
  const urgencyLow  = (promptConfig && promptConfig.urgencyLow)  || '?®ç?è³‡è??ŠçŸ¥?–ä??·æ??ˆæ€§ä?ä¿¡ä»¶?‚ä?å¦‚ï?å»??è¡ŒéŠ·ä¿ƒéŠ·?ç™»?¥æ??Ÿé€šçŸ¥?ç¤¾ç¾¤å??‹æ??’ã€?;
  const roleDesc    = (promptConfig && promptConfig.roleDesc)    || '?¨æ˜¯ä¸€ä½å?æ¥­ç??ºæ…§?µä»¶?†é?ç§˜æ›¸?‚è?è©³ç´°?†æ?ä»¥ä??µä»¶?„å?ä»¶è€…ã€æ?é¡Œè??§æ?ï¼Œä¸¦ä¾æ??†é?è¦ç?æ±ºå??¶é??¥è?ç·Šæ€¥åº¦??;

  // çµ„è??¹æ¬¡?µä»¶?—è¡¨?‡å?
  const emailsText = emailList.map((em, idx) => `[?µä»¶ ${idx+1}]\nå¯„ä»¶?…ï?${em.sender}\næ¨™é?ï¼?{em.subject}\n?§æ?ï¼?{em.body}`).join('\n---\n');

  const promptText = `${roleDesc}

?è??†æ­¥é©Ÿæ?å¼?(Chain of Thought)??
1. **è­˜åˆ¥å¯„ä»¶ä¸»é?**ï¼šåˆ¤?·å?ä»¶è€…æ˜¯ä½•ç¨®å¹³å°?–ç?ç¹”ã€?
2. **?€?†å??¾å±¬??*ï¼šå??æ­¤?µä»¶?¯ã€Œå??å??¶ä»¶äººå€‹äºº?„ä????šçŸ¥?ï??–æ˜¯?Œæ‰¹æ¬¡ç¾¤?¼ç??å³?‚æ?è¦??¨å»£?ã€?
3. **?¹é??†é??‡ç??¥åº¦**ï¼šä??šä»¥ä¸‹è?ç¯„é€²è??†é??‡ç??¥åº¦è©•ä¼°??
4. **è³‡è??ç?**ï¼šç²¾?‰å‡º 20 å­—ä»¥?§ä??µä»¶å¤§æ?ï¼ˆå?ä¿ç??œéµè³‡è??‡æ•¸?šï???

?å?é¡é??¥è?ç¯„ã€?
${categoriesText}

?ç??¥åº¦è©•åˆ¤è¦ç???
- ?Œé??ï?${urgencyHigh}
- ?Œä¸­?ï?${urgencyMid}
- ?Œä??ï?${urgencyLow}

?ç?ä¾‹å??§æ?å¼?(Few-Shot Examples)??
${examplesText}

è«‹å?ä»¥ä? ${emailList.length} å°éƒµä»¶ä?åºé€²è??†æ?ï¼Œä¸¦ä»?JSON ????¼å??å‚³çµæ?ï¼ˆé™£?—ä¸­ç¬?i ?‹ç‰©ä»¶å??‰ç¬¬ i å°éƒµä»¶ï?ï¼?
---
${emailsText}
---
è«‹åš´?¼ä??šè?å®šç? JSON Schema çµæ?è¼¸å‡º?†æ?çµæ??‚`;

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
            "urgency":  {"type": "STRING", "enum": ["é«?, "ä¸?, "ä½?]},
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
 * ?¹æ¬¡ AI ?†é??è©¦?…è???
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
// ==================== AI_PromptConfig ç³»å??½å? (v3.0) ====================
// =========================================================================

/** ?–å??–å»ºç«?AI_PromptConfig å·¥ä?è¡¨ï?ä¸¦å?å§‹å??è¨­?§å®¹ */
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
    // ?å?å¡Šé›¶ï¼šæ¨¡?‹è¨­å®šã€?
    sheet.getRange('A1').setValue('?å?å¡Šé›¶ï¼šæ¨¡?‹è¨­å®šã€?);
    sheet.getRange('A2').setValue('?®å?ä½¿ç”¨æ¨¡å?');
    sheet.getRange('B2').setValue('gemini-2.5-flash');
    sheet.getRange('A3').setValue('ä¸Šæ¬¡?´æ–°æ¨¡å?æ¸…å–®');
    sheet.getRange('B3').setValue('å°šæœª?·æ–°ï¼Œè??·è? refreshAvailableModels()');
    sheet.getRange('A4').setValue('?¯ç”¨æ¨¡å?æ¸…å–® (ä¾›å???');
    sheet.getRange('B4').setValue('gemini-2.5-flash, gemini-3-flash, gemini-3.5-flash');
    // ?å?å¡Šä?ï¼šè??²æ?ä»¤ã€?
    sheet.getRange('A6').setValue('?å?å¡Šä?ï¼šè??²æ?ä»¤ã€?);
    sheet.getRange('A7').setValue('è§’è‰²èªªæ?');
    sheet.getRange('B7').setValue('?¨æ˜¯ä¸€ä½å?æ¥­ç??ºæ…§?µä»¶?†é?ç§˜æ›¸?‚è?è©³ç´°?†æ?ä»¥ä??µä»¶?„å?ä»¶è€…ã€æ?é¡Œè??§æ?ï¼Œä¸¦ä¾æ??†é?è¦ç?æ±ºå??¶é??¥è?ç·Šæ€¥åº¦?‚å??‚ï?è«‹ç²¾?‰è©²ä¿¡ä»¶?„é??µæ ¸å¿ƒå…§å®¹ã€?);
    sheet.getRange('A8').setValue('ç·Šæ€¥åº¦-é«?);
    sheet.getRange('B8').setValue('?€è¦å³?‚é?æ³¨æ??•ä?ä¹‹ä¿¡ä»¶ã€‚ä?å¦‚ï?é©—è?ç¢?(OTP)?ç™»?¥ç•°å¸¸å??¨è­¦?±ã€ä¿¡?¨å¡æ¶ˆè²»?‘æ…®?æ€¥é??•ç??„å·¥ä½œé˜»ç¤™ã€?);
    sheet.getRange('A9').setValue('ç·Šæ€¥åº¦-ä¸?);
    sheet.getRange('B9').setValue('?‰æ??ˆæ€§ä??¡é?ç«‹åˆ»?•ç?ä¹‹ä¿¡ä»¶ã€‚ä?å¦‚ï?å¹¾å¤©?§åˆ°?Ÿç?ç¹³è²»å¸³å–®?å·¥ä½œæ?è­°é?ç´„ã€å?è¾¦ä»»?™ã€?);
    sheet.getRange('A10').setValue('ç·Šæ€¥åº¦-ä½?);
    sheet.getRange('B10').setValue('?®ç?è³‡è??ŠçŸ¥?–ä??·æ??ˆæ€§ä?ä¿¡ä»¶?‚ä?å¦‚ï?å»??è¡ŒéŠ·ä¿ƒéŠ·?ç™»?¥æ??Ÿé€šçŸ¥?ç¤¾ç¾¤å??‹æ??’ã€?);
    // ?å?å¡Šä?ï¼šå?é¡é??¥å?ç¾©ã€?
    sheet.getRange('A12').setValue('?å?å¡Šä?ï¼šå?é¡é??¥å?ç¾©ã€?);
    sheet.getRange('A13:D13').setValues([['é¡åˆ¥?ç¨±', 'è©³ç´°èªªæ?', '?™è¨»/?¹æ?è¦å?', '?Ÿç”¨']]);
    const defaultCategories = [
      ['å·¥ä?', 'å°ˆå±¬?‹äºº?„å??™æ??šã€å·¥ä½œä»»?™å?ä½œé€šçŸ¥?æ??·ä??•ä¿¡ä»¶ï?å¦‚ï?104äººå??€è¡Œé¢è©¦é?è«‹ï??ç¤¾ç¾¤å¹³?°å€‹äººå°è©±ï¼ˆå?ï¼šLinkedIn å°ˆå±¬ç§è?/?¯çµ¡äººä¿¡ä»¶ï???, 'å¿…é??¯é?å°æ”¶ä»¶è€…å€‹äºº?„ä??•æ?è¡Œå?ä¿¡ä»¶?‚è‹¥?ºç¾¤?¼ç??·ç¼º?»å??±æ??•æ??˜è?ï¼Œå??ˆå?é¡ç‚º?Œç¤¾ç¾¤é€šçŸ¥?æ??Œå»£?Šè??·ã€ã€?, '??],
      ['è²¡å?å¸³å–®', '?€è¡Œäº¤?“æ?ç´°ã€é›»å­ç™¼ç¥¨ã€å¸³?®ç¹³è²»é€šçŸ¥?æ”¶?šæ?è­‰ã€ä¿¡?¨å¡æ¶ˆè²»?šçŸ¥??, '', '??],
      ['?‹äººæ¶ˆè²»', 'ç·šä?è³¼ç‰©è¨‚å–®ç¢ºè??å‡ºè²??é??šçŸ¥?å??å¹³?°æ?ç´°ã€ç?ä¸‹å¯¦é«”å??¢æ?è²»ç™¼ç¥¨ã€?, '', '??],
      ['ç³»çµ±?šçŸ¥', '?ªå??–ç³»çµ±è­¦?±ã€å¸³?Ÿå??¨ä¿¡?å??¨æ€§é?è­‰ç¢¼ (OTP)??, '', '??],
      ['?»å…¥?å??šçŸ¥', '?„å®¶?€è¡Œæ?ç¶²ç??å??¼é€ä?å®‰å…¨?Œç™»?¥æ??Ÿã€ç¢ºèªä¿¡??, '', '??],
      ['å»??è¡ŒéŠ·', '?»å??±ã€ä??·å»£?Šã€æ??¹åˆ¸?ç”¢?æ¨å»?¿¡??, '', '??],
      ['ç¤¾ç¾¤?šçŸ¥', 'ç¤¾ç¾¤å¹³å°ç¾¤ç™¼?„æ¨å»???•æ??˜è?ä¿¡ï?å¦‚ï?LinkedIn ?·ç¼º?¨è–¦?±å ±?Facebook ?•æ??˜è?ï¼‰ã€?, '', '??],
      ['?‹äºº?±ç?', 'è¦ªå??„å€‹äººä¾†ä¿¡?ç?äººæ??Šè???æ©Ÿç¥¨ç¢ºè?ä¿¡ã€?, '', '??],
      ['Netflix', 'Netflixï¼ˆå« @account.netflix.com ??netflix.com ?Ÿå?ï¼‰ç™¼?ä??€?‰ä¿¡ä»¶ï?ä¾‹å?ï¼šé›»å­ç™¼ç¥¨æ”¶?šã€å¸³?¶å??¨æ?ç¤ºã€æ¨?¦è??‹ç??®ã€?, '', '??]
    ];
    sheet.getRange(14, 1, defaultCategories.length, 4).setValues(defaultCategories);
    // ?å?å¡Šä?ï¼šFew-Shot ç¯„ä???
    const catEndRow = 14 + defaultCategories.length;
    sheet.getRange(catEndRow + 1, 1).setValue('?å?å¡Šä?ï¼šFew-Shot ç¯„ä???);
    sheet.getRange(catEndRow + 2, 1, 1, 8).setValues([['ç¯„ä?èªªæ?', 'å¯„ä»¶??, 'ä¸»æ—¨?œéµå­?, '?§æ??˜è?', 'æ­?¢º?†é?', 'æ­?¢ºç·Šæ€¥åº¦', 'ç²¾ç??˜è?ç¯„ä?', '?Ÿç”¨']]);
    const defaultExamples = [
      ['å·¥ä??‹äººç§è?', 'LinkedIn <messages-noreply@linkedin.com>', '?³é€ä?è¨Šæ¯çµ¦æ‚¨', '?¨ï??‘ç??°æ‚¨?„å±¥æ­·ï??³è??¨è???..', 'å·¥ä?', 'ä¸?, 'LinkedInç§è?-?‹å¤§???³è??Šå±¥æ­?, '??],
      ['ç¤¾ç¾¤ç¾¤ç™¼?±å ±', 'LinkedIn <jobs-listings@linkedin.com>', '?™ä??¯é©?ˆæ‚¨?„è·ç¼?, '?™é€±æ? 15 ?‹ç¬¦?ˆæ‚¨è»Ÿé?å·¥ç?å¸«è??¯ç??°è·ç¼?..', 'ç¤¾ç¾¤?šçŸ¥', 'ä½?, 'LinkedIn-è»Ÿé?å·¥ç?å¸«è·ç¼ºæ¨?¦é€±å ±', '??],
      ['?‹äººæ¶ˆè²»è¨‚å–®', 'Shopee <info@shopee.tw>', 'è¨‚å–®?ç??šçŸ¥', '?Ÿè??¨ç?æ¶ˆè²»ï¼Œè??®ç·¨??123456 å·²æ?ç«‹ï?æ¶ˆè²»?‘é? NT$ 500 ??..', '?‹äººæ¶ˆè²»', 'ä½?, '?¦çš®è³¼ç‰©-è¨‚å–®?ç?-?‘é?NT$500', '??],
      ['?»å…¥?å??šçŸ¥', 'kgi@kgibank.com.tw', 'ç¶²è·¯?€è¡Œç™»?¥æ??Ÿé€šçŸ¥', '?¨æ–¼ 2026-06-11 12:00 ?å??»å…¥ç¶²è·¯?€è¡Œï??¥é??¬äººè«‹è¯çµ¡å®¢??..', '?»å…¥?å??šçŸ¥', 'ä½?, '?±åŸº?€è¡??»å…¥?å??é?', '??],
      ['ç³»çµ±é©—è?ç¢?, 'service@shopee.tw', 'å¸³è?è®Šæ›´é©—è?ç¢?, '?¨ç?é©—è?ç¢¼ç‚º 987654ï¼Œè???5 ?†é??§è¼¸?¥å??¢ã€?, 'ç³»çµ±?šçŸ¥', 'é«?, '?¦çš®è³¼ç‰©-é©—è?ç¢?987654', '??],
      ['Netflix?»å…¥é©—è?ç¢?, 'info@account.netflix.com', 'Netflixï¼šæ‚¨?„ç™»?¥ç¢¼', '?¨ç??»å…¥ç¢¼ç‚º 123456ï¼Œè???15 ?†é??§è¼¸??..', 'Netflix', 'é«?, 'Netflix-?»å…¥ç¢?123456', '??],
      ['Netflix?Œæˆ¶è£ç½®ç¢ºè?', 'info@account.netflix.com', 'ç¢ºè?ä¿¡ï??¨å·²ç¢ºè?Netflix ?Œæˆ¶è£ç½®', '?¨ç??»è?å·²è¨­å®šç‚ºæ­¤å¸³?Ÿç??Œæˆ¶è£ç½®ä¹‹ä?...', 'Netflix', 'ä¸?, 'Netflix-?Œæˆ¶è£ç½®å·²ç¢ºèª?, '??]
    ];
    sheet.getRange(catEndRow + 3, 1, defaultExamples.length, 8).setValues(defaultExamples);
    // ?¼å???
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
 * å¾?AI_PromptConfig å·¥ä?è¡¨è??–ä¸¦çµ„è? Prompt è¨­å??©ä»¶ï¼ˆå¿«?–ç”¨ï¼?
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
      if (a.indexOf('?€å¡Šé›¶') !== -1) { mode = 'zero'; return; }
      if (a.indexOf('?€å¡Šä?') !== -1) { mode = 'one'; return; }
      if (a.indexOf('?€å¡Šä?') !== -1) { mode = 'two'; return; }
      if (a.indexOf('?€å¡Šä?') !== -1) { mode = 'three'; return; }

      if (mode === 'zero') {
        if (a === '?®å?ä½¿ç”¨æ¨¡å?' && b) model = b;
      } else if (mode === 'one') {
        if (a === 'è§’è‰²èªªæ?') roleDesc = b;
        if (a === 'ç·Šæ€¥åº¦-é«?) urgencyHigh = b;
        if (a === 'ç·Šæ€¥åº¦-ä¸?) urgencyMid = b;
        if (a === 'ç·Šæ€¥åº¦-ä½?) urgencyLow = b;
      } else if (mode === 'two') {
        // æ¨™é??—è·³?ï?é¡åˆ¥?ç¨± = æ¨™é?ï¼?
        if (a === 'é¡åˆ¥?ç¨±' || !a) return;
        const enabled = String(row[3] || '').trim();
        if (enabled !== '??) {
          categories.push({ name: a, desc: b, note: String(row[2] || '').trim() });
        }
      } else if (mode === 'three') {
        if (a === 'ç¯„ä?èªªæ?' || !a) return;
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
 * ?¼å« Gemini API ?–å??¯ç”¨æ¨¡å?æ¸…å–®ï¼Œä¸¦?´æ–° AI_PromptConfig ?„ä??‰é¸??
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
    // ?¾åˆ°?Œç›®?ä½¿?¨æ¨¡?‹ã€æ??¨å?
    let modelRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === '?®å?ä½¿ç”¨æ¨¡å?') { modelRow = i + 1; break; }
    }
    if (modelRow > 0) {
      // è¨­å?ä¸‹æ??¸å–®é©—è?
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(models, true).build();
      sheet.getRange(modelRow, 2).setDataValidation(rule);
      // ?´æ–°?¯ç”¨æ¨¡å?æ¸…å–®é¡¯ç¤ºæ¬?
      let listRow = -1;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === '?¯ç”¨æ¨¡å?æ¸…å–® (ä¾›å???') { listRow = i + 1; break; }
      }
      if (listRow > 0) sheet.getRange(listRow, 2).setValue(models.join(', '));
      // ?´æ–°?‚é???
      let tsRow = -1;
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === 'ä¸Šæ¬¡?´æ–°æ¨¡å?æ¸…å–®') { tsRow = i + 1; break; }
      }
      if (tsRow > 0) sheet.getRange(tsRow, 2).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'));
    }
    Logger.log(`refreshAvailableModels: updated ${models.length} model(s): ${models.join(', ')}`);
  } catch(e) { Logger.log('refreshAvailableModels exception: ' + e); }
}

/**
 * å¾?AI_PromptConfig è®€?–ç›®?é¸?‡ç?æ¨¡å??ç¨±
 * @return {string} model name (e.g. 'gemini-3.5-flash')
 */
function getSelectedModel() {
  try {
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = Math.min(sheet.getLastRow(), 10);
    const data = sheet.getRange(1, 1, lastRow, 2).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === '?®å?ä½¿ç”¨æ¨¡å?' && data[i][1]) return String(data[i][1]).trim();
    }
  } catch(e) { Logger.log('getSelectedModel error: ' + e); }
  return 'gemini-2.5-flash';
}

// =========================================================================
// ==================== AI_Uncategorized ç³»å??½å? (v3.0) ====================
// =========================================================================

/** ?–å??–å»ºç«?AI_Uncategorized å·¥ä?è¡?*/
function getOrCreateUncategorizedSheet() {
  const ss = getOrCreateSpreadsheet_();
  let sheet = ss.getSheetByName(UNCATEGORIZED_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(UNCATEGORIZED_SHEET_NAME);
    sheet.appendRow(['Thread ID', 'Email', 'Sender Name', 'Subject', 'AI?˜è?', 'ä¿¡ä»¶?¥æ?', 'äººå·¥?†é?', '?€??]);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 220); sheet.setColumnWidth(3, 130);
    sheet.setColumnWidth(4, 280); sheet.setColumnWidth(5, 200); sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 110); sheet.setColumnWidth(8, 100);
    // æ¨™é??—æ ¼å¼?
    sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#E53E3E').setFontColor('#FFFFFF').setHorizontalAlignment('center');
    // ?Œäººå·¥å?é¡ã€æ?ä¸‹æ??¸å–®ï¼ˆGæ¬?= ç¬?æ¬„ï?å¾ç¬¬2?—èµ·ï¼?
    const categoryValidation = SpreadsheetApp.newDataValidation().requireValueInList(VALID_CATEGORIES, true).build();
    sheet.getRange(2, 7, 500, 1).setDataValidation(categoryValidation);
    // ?Œç??‹ã€æ?æ¢ä»¶?¼å???
    const pendingRule = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('å¾…å¯©??).setBackground('#FEF3C7').setFontColor('#92400E').bold(true).setRanges([sheet.getRange('H2:H500')]).build();
    const doneRule   = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('??å·²å???).setBackground('#DCFCE7').setFontColor('#166534').setRanges([sheet.getRange('H2:H500')]).build();
    const failRule   = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('???•ç?å¤±æ?').setBackground('#FEE2E2').setFontColor('#991B1B').setRanges([sheet.getRange('H2:H500')]).build();
    sheet.setConditionalFormatRules([pendingRule, doneRule, failRule]);
    Logger.log('Created AI_Uncategorized sheet.');
  }
  return sheet;
}

/** è¨˜é? AI ?†é?å¤±æ??„ä¿¡ä»¶åˆ° AI_Uncategorized å·¥ä?è¡?*/
function logToUncategorizedSheet(thread, senderEmail, rawSender, subject, refinedContent) {
  try {
    const sheet = getOrCreateUncategorizedSheet();
    // æª¢æŸ¥?¯å¦å·²è??„é?ï¼ˆé¿?é?è¤‡ï?
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
    sheet.appendRow([threadId, senderEmail, senderName, subject, refinedContent || '', dateStr, '', 'å¾…å¯©??]);
    Logger.log(`Logged uncategorized thread ${threadId} to ${UNCATEGORIZED_SHEET_NAME}.`);
  } catch(e) { Logger.log('logToUncategorizedSheet error: ' + e); }
}

/**
 * ?ƒæ? AI_Uncategorized å·¥ä?è¡¨ï??ªå??•ç?å·²å¡«?¥ã€Œäººå·¥å?é¡ã€ç??—ã€?
 * ?ªå?è§¸ç™¼ï¼šæ?æ¬?autoOrganizeGmailWithGemini() çµæ?å¾?+ sendDailyDigest() ?‹å??ã€?
 * ä¹Ÿå¯?‹å???Apps Script ç·¨è¼¯?¨ç›´?¥åŸ·è¡Œã€?
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
      if (!manualCat || status === '??å·²å???) return;
      if (!VALID_CATEGORIES.includes(manualCat)) {
        Logger.log(`Row ${i+2}: Invalid category "${manualCat}", skipping.`);
        return;
      }
      try {
        const threads = GmailApp.getThreadById(threadId);
        if (!threads) { throw new Error('Thread not found: ' + threadId); }
        // ç§»é™¤ AI/?ªå?é¡?æ¨™ç±¤
        const oldLabel = GmailApp.getUserLabelByName('AI/?ªå?é¡?);
        if (oldLabel) threads.removeLabel(oldLabel);
        // å¥—ç”¨?°æ?ç±?
        const newLabelName = 'AI/' + manualCat;
        let newLabel = GmailApp.getUserLabelByName(newLabelName);
        if (!newLabel) newLabel = GmailApp.createLabel(newLabelName);
        threads.addLabel(newLabel);
        // ç§»è‡³å°æ? Gmail ?†é?
        const tabId = CATEGORY_TAB_MAPPING[manualCat];
        if (tabId) moveThreadToGmailCategory(threadId, tabId);
        // å¯«å…¥ AI_Rules
        if (rulesSheet) {
          const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
          rulesSheet.appendRow([email, rawSender, manualCat, 'ä½?, '[äººå·¥ä¿®æ­£]', `from:${email}`, nowStr]);
        }
        // ?´æ–°?€??
        sheet.getRange(i + 2, 8).setValue('??å·²å???);
        // ?²å?å­¸ç?è¦å?
        saveToLearningRules(email, rawSender, subject, manualCat);
        // ?Œæ­¥??AI_PromptConfig ç¯„ä?
        addExampleToPromptConfig_(email, subject, manualCat, 'ä½?, '[äººå·¥ä¿®æ­£]');
        processed++;
        Logger.log(`processUncategorizedSheet: Row ${i+2} ??${manualCat} ?…`);
      } catch(e) {
        sheet.getRange(i + 2, 8).setValue('???•ç?å¤±æ?');
        Logger.log(`processUncategorizedSheet: Row ${i+2} failed: ` + e);
      }
    });
    Logger.log(`processUncategorizedSheet done. Processed: ${processed} item(s).`);
  } catch(e) { Logger.log('processUncategorizedSheet exception: ' + e); }
}

/** å°‡äººå·¥ä¿®æ­???œæ–°å¢ç‚º AI_PromptConfig ??Few-Shot ç¯„ä? */
function addExampleToPromptConfig_(email, subject, category, urgency, refined) {
  try {
    const sheet = getOrCreatePromptConfigSheet();
    const lastRow = sheet.getLastRow();
    const data = sheet.getRange(1, 1, lastRow, 1).getValues();
    let exHeaderRow = -1;
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).includes('?€å¡Šä?')) { exHeaderRow = i + 2; break; } // +2 for header row
    }
    if (exHeaderRow < 0) return;
    // ?¾åˆ°ç¬¬ä??‹ç©º??
    const exData = sheet.getRange(exHeaderRow + 1, 1, Math.max(1, lastRow - exHeaderRow), 8).getValues();
    let insertRow = lastRow + 1;
    for (let i = 0; i < exData.length; i++) {
      if (!String(exData[i][0]).trim()) { insertRow = exHeaderRow + 1 + i; break; }
    }
    sheet.getRange(insertRow, 1, 1, 8).setValues([[`äººå·¥ä¿®æ­£-${category}`, email, subject.substring(0,30), '', category, urgency, refined, '??]]);
    Logger.log(`Added example to AI_PromptConfig row ${insertRow}.`);
  } catch(e) { Logger.log('addExampleToPromptConfig_ error: ' + e); }
}

// =========================================================================
// ==================== AI_LearningRules ç³»å??½å? (v3.0) ====================
// =========================================================================

/** ?–å??–å»ºç«?AI_LearningRules å·¥ä?è¡?*/
function getOrCreateLearningRulesSheet() {
  const ss = getOrCreateSpreadsheet_();
  let sheet = ss.getSheetByName(LEARNING_RULES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(LEARNING_RULES_SHEET_NAME);
    sheet.appendRow(['Email/Domain', 'Sender Name', 'Subject Keyword', 'æ­?¢º?†é?', 'å­¸ç?ä¾†æ?', '?´æ–°?‚é?', '?½ä¸­æ¬¡æ•¸']);
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
 * è¼‰å…¥?€?‰å­¸ç¿’è??‡è‡³è¨˜æ†¶é«?Map
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

/** ?²å??–æ›´?°ä?æ¢å­¸ç¿’è???*/
function saveToLearningRules(email, senderName, subject, category) {
  try {
    const sheet = getOrCreateLearningRulesSheet();
    const lastRow = sheet.getLastRow();
    const emailLower = email.trim().toLowerCase();
    // ?ˆæŸ¥?¯å¦å·²æ???email ?„è???
    if (lastRow >= 2) {
      const data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim().toLowerCase() === emailLower) {
          // ?´æ–°?†é??Œæ???
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
    // ?°å?è¨˜é?
    const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    sheet.appendRow([emailLower, senderName || '', subject ? subject.substring(0,50) : '', category, 'äººå·¥ä¿®æ­£', nowStr, 1]);
    Logger.log(`saveToLearningRules: Added ${emailLower} ??${category}`);
  } catch(e) { Logger.log('saveToLearningRules error: ' + e); }
}

// =========================================================================
// ==================== æ¯æ—¥?˜è? Email ?½å? (v3.0) ====================
// =========================================================================

/**
 * ?¼é€ä??¥é?é»ä¿¡ä»¶æ?è¦?Email??
 * ?ªå?è§¸ç™¼ï¼šæ???20:00?‚ä??¯æ??•åŸ·è¡Œã€?
 */
function sendDailyDigest() {
  // ?ˆè??†äººå·¥å¯©?¥æ??®ï?ç¢ºä??˜è??…å«?€?°ç???
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

    // ç¯©é¸ä»Šæ—¥ + é«˜ç??¥åº¦ ??å·¥ä?é¡åˆ¥
    const important = [], highUrgency = [];
    data.forEach(row => {
      const updatedTime = String(row[6] || '');
      if (!updatedTime.startsWith(today)) return;
      const category = String(row[2] || '').trim();
      const urgency  = String(row[3] || '').trim();
      const refined  = String(row[4] || '').trim();
      const email    = String(row[0] || '').trim();
      const sender   = String(row[1] || '').trim();
      if (urgency === 'é«?) highUrgency.push({email, sender, category, urgency, refined, time: updatedTime});
      else if (category === 'å·¥ä?') important.push({email, sender, category, urgency, refined, time: updatedTime});
    });

    if (highUrgency.length === 0 && important.length === 0) {
      Logger.log('sendDailyDigest: No high-urgency or work emails today.');
      return;
    }

    // çµ„è? HTML Email
    const formatRows = (items) => items.map(item =>
      `<tr><td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.time.split(' ')[1] || ''}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.sender || item.email}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;"><span style="background:${item.urgency==='é«??'#FEE2E2':item.urgency==='ä¸??'#FEF3C7':'#DCFCE7'};color:${item.urgency==='é«??'#991B1B':item.urgency==='ä¸??'#92400E':'#166534'};padding:2px 8px;border-radius:4px;font-size:12px;">${item.urgency}</span></td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;">${item.refined}</td>` +
      `<td style="padding:8px;border-bottom:1px solid #E2E8F0;"><a href="https://mail.google.com/mail/u/0/#search/from:${encodeURIComponent(item.email)}" style="color:#3182CE;">?¥ç?</a></td></tr>`
    ).join('');

    const tableHeader = `<tr style="background:#2D3748;color:#FFFFFF;"><th style="padding:10px;text-align:left;">?‚é?</th><th style="padding:10px;text-align:left;">å¯„ä»¶??/th><th style="padding:10px;text-align:center;">ç·Šæ€¥åº¦</th><th style="padding:10px;text-align:left;">AI?˜è?</th><th style="padding:10px;">?ä?</th></tr>`;

    let htmlBody = `<div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
  <div style="background:linear-gradient(135deg,#2D3748,#4A5568);padding:24px;border-radius:12px 12px 0 0;">
    <h1 style="color:#FFFFFF;margin:0;font-size:20px;">?“§ GmailWithGemini æ¯æ—¥?˜è??±å?</h1>
    <p style="color:#A0AEC0;margin:4px 0 0;font-size:14px;">${today} ????${highUrgency.length + important.length} å°é?é»ä¿¡ä»?/p>
  </div>
  <div style="padding:20px;background:#F7FAFC;border:1px solid #E2E8F0;">`;

    if (highUrgency.length > 0) {
      htmlBody += `<h2 style="color:#991B1B;font-size:16px;margin:0 0 12px;">?š¨ é«˜ç??¥åº¦ä¿¡ä»¶ (${highUrgency.length} å°?</h2>
      <table style="width:100%;border-collapse:collapse;background:#FFFFFF;border-radius:8px;overflow:hidden;margin-bottom:20px;">${tableHeader}${formatRows(highUrgency)}</table>`;
    }
    if (important.length > 0) {
      htmlBody += `<h2 style="color:#2B6CB0;font-size:16px;margin:0 0 12px;">?’¼ å·¥ä?é¡ä¿¡ä»?(${important.length} å°?</h2>
      <table style="width:100%;border-collapse:collapse;background:#FFFFFF;border-radius:8px;overflow:hidden;margin-bottom:20px;">${tableHeader}${formatRows(important)}</table>`;
    }
    htmlBody += `<p style="color:#718096;font-size:12px;margin-top:16px;">æ­¤å ±?Šç”± GmailWithGemini v3.0 ?ªå??Ÿæ??‚å??€?¥ç?å®Œæ•´è¨˜é?ï¼Œè??‹å? <a href="https://docs.google.com/spreadsheets/" style="color:#3182CE;">GmailWithGemini_Rules</a> è©¦ç?è¡¨ã€?/p>
  </div></div>`;

    const recipient = DIGEST_RECIPIENT_EMAIL || Session.getActiveUser().getEmail();
    GmailApp.sendEmail(recipient, `[GmailWithGemini] ${today} æ¯æ—¥?é??˜è? ??${highUrgency.length + important.length} å°é?é»ä¿¡ä»¶`, '', {htmlBody});
    Logger.log(`sendDailyDigest: Sent to ${recipient}. High=${highUrgency.length}, Work=${important.length}`);
  } catch(e) { Logger.log('sendDailyDigest error: ' + e); }
}

// =========================================================================
// ==================== è§¸ç™¼?¨ç®¡?†è? API è¨ºæ–·å·¥å…· ====================
// =========================================================================

/**
 * ä¸€?µè¨­å®šè‡ª?•è§¸?¼å™¨ï¼ˆä? TRIGGER_INTERVAL_HOURS ?•æ?å»ºç??†é?è§¸ç™¼??+ æ¯æ—¥ 20:00 ?˜è?è§¸ç™¼?¨ï???
 * ?·è??æ??ªå?æ¸…é™¤?€?‰å·²å­˜åœ¨?„è§¸?¼å™¨ï¼Œé¿?é?è¤‡å»ºç«‹ã€?
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

  // æ¯æ—¥ 20:00 ?˜è?è§¸ç™¼??
  ScriptApp.newTrigger('sendDailyDigest')
    .timeBased().everyDays(1).atHour(20).nearMinute(0).create();
  Logger.log('Created daily digest trigger at 20:00.');
  // ?·æ–°?¯ç”¨æ¨¡å?æ¸…å–®
  try { refreshAvailableModels(); } catch(e) { Logger.log('refreshAvailableModels skipped: ' + e); }
  Logger.log('Setup complete!');
}

/**
 * ç§»é™¤?€?‰è? autoOrganizeGmailWithGemini ??sendDailyDigest ?¸é??„è§¸?¼å™¨??
 * ?¯ç”¨?¼æš«?œè‡ª?•åŸ·è¡Œæ??ç½®è§¸ç™¼?¨è¨­å®šã€?
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
 * API ?‘é‘°è¨ºæ–·å·¥å…·??
 * ?¼é€ä??‹ç°¡?®ç?æ¸¬è©¦è«‹æ???Gemini APIï¼Œé?è­‰é??°æ˜¯?¦æ??ˆä?å±¬æ–¼?è²»å°ˆæ???
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
      
      // æª¢æŸ¥?æ?ä¸­æ˜¯?¦æ?è¨ˆè²»?¸é?è­¦å?
      if (responseText.indexOf('billing') !== -1 || responseText.indexOf('quota') !== -1) {
        Logger.log('? ï? WARNING: Response mentions billing/quota. Please verify your GCP project billing status.');
      } else {
        Logger.log('?’° No billing warnings detected. Your API Key appears to be from a free-tier project.');
      }
    } else if (code === 400) {
      Logger.log('??ERROR (400): Invalid API key. Please check your GEMINI_API_KEY value.');
    } else if (code === 403) {
      Logger.log('??ERROR (403): API key does not have permission. Check API enablement in GCP Console.');
    } else if (code === 429) {
      Logger.log('? ï? WARNING (429): Rate limit exceeded. Your API Key is valid but hitting free-tier limits.');
      Logger.log('This is normal for free-tier keys. The script has built-in auto-retry for this.');
    } else {
      Logger.log('??ERROR (' + code + '): ' + responseText.substring(0, 300));
    }
  } catch (e) {
    Logger.log('??EXCEPTION: ' + e.toString());
  }
  
  // é¡¯ç¤ºè§¸ç™¼?¨ç???
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

// å®Œæ•´çš„è®Šæ›´æ­·å²æ—¥èªŒè«‹åƒé–±å°ˆæ¡ˆå…§çš„ CHANGELOG.gs æª”æ¡ˆã€‚

