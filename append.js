
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
