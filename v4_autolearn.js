const TRACKER_SHEET_NAME = 'AI_AutoLearnTracker';
const AUTO_LEARN_SAFE_CATEGORIES = ['促銷行銷', '社群通知', '電子報', '系統通知', '登入成功通知'];
const AUTO_LEARN_THRESHOLD = 3;

/** 取得或建立 AI_AutoLearnTracker 工作表 (隱藏) */
function getOrCreateAutoLearnTrackerSheet() {
  const ss = getOrCreateSpreadsheet_();
  let sheet = ss.getSheetByName(TRACKER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TRACKER_SHEET_NAME);
    sheet.appendRow(['Sender Email', 'Category', 'Count', 'Last Update']);
    sheet.setFrozenRows(1);
    sheet.hideSheet(); // 隱藏此工作表，不干擾使用者
    Logger.log('Created AI_AutoLearnTracker sheet.');
  }
  return sheet;
}

/**
 * 更新寄件者的自動學習計數。如果達到閾值，則自動加入本地學習庫。
 */
function updateAutoLearnTracker(senderEmail, category, rawSender) {
  if (!AUTO_LEARN_SAFE_CATEGORIES.includes(category)) return;
  if (!senderEmail) return;

  try {
    const sheet = getOrCreateAutoLearnTrackerSheet();
    const data = sheet.getDataRange().getValues();
    let foundRow = -1;
    let currentCount = 0;

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === senderEmail) {
        foundRow = i + 1;
        if (data[i][1] === category) {
          currentCount = Number(data[i][2]) || 0;
        } else {
          // 如果寄件者分類改變了，重置計數
          currentCount = 0; 
        }
        break;
      }
    }

    currentCount++;
    const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    if (currentCount >= AUTO_LEARN_THRESHOLD) {
      Logger.log(`Auto-Learn: ${senderEmail} reached threshold for ${category}! Saving to local rules.`);
      saveToLearningRules(senderEmail, rawSender, "", category);
      // 從 Tracker 中刪除，因為已經學會了
      if (foundRow > 0) {
        sheet.deleteRow(foundRow);
      }
    } else {
      if (foundRow > 0) {
        sheet.getRange(foundRow, 2, 1, 3).setValues([[category, currentCount, nowStr]]);
      } else {
        sheet.appendRow([senderEmail, category, currentCount, nowStr]);
      }
    }
  } catch(e) {
    Logger.log("updateAutoLearnTracker error: " + e);
  }
}
