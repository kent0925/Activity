/**
 * 亞太國際大老二兄弟會 - 自動廣播與報名系統 (整合版)
 * 整合：生日廣播 + 活動/旅遊預告 + API(Registration, Telegram, Archive)
 * * 更新：2026-02-27 - 新增「時間動態判斷開放/關閉報名」功能，並與主程式整合
 */
// @OnlyCurrentDoc

function requestUrlFetchAppPermission() {
    console.log("正在請求權限...");
    UrlFetchApp.fetch("https://www.google.com");
}

// ==========================================
// 1. 設定區
// ==========================================

// --- LINE 廣播用 ---
const LINE_ACCESS_TOKEN = 'uGtM6jZ+bUr6mPyZkoon7g4mfpvyn6eMpTVE+N4M7nrp8v3aDnJxbgTOpriqBFKNnuOkVhK2T8WOlpXnncjc09IT0Ve5TJAj58/HSDB+YkbP8cO5ZbPld9hlvwPLgI95hp9F0JEk6nId9XACSa4kSgdB04t89/1O/w1cDnyilFU=';
const REGISTRATION_URL = "https://liff.line.me/2006764491-V80nOq6A";
const SHEET_NAME_BIRTHDAYS = "birthdays";

// 廣播用共用欄位索引 (對應 EventConfig 工作表欄位)
const COL_TYPE = 1;
const COL_NAME = 2;
const COL_TIME = 3;
const COL_LOCATION = 4;
const COL_ADDRESS = 5;
const COL_ORGANIZER = 6;
const COL_STATUS = 8;

// --- 報名系統 API 用 ---
const SPREADSHEET_ID = "1vXD0gGXW76Nh8MlPPF6RRmrG8Brh_CmSCExFPMeQOWI";
const SHEET_EVENTS = "EventConfig";
const SHEET_NAME_EVENTS = "EventConfig"; // 廣播與 API 共用名稱
const SHEET_ITINERARY = "ItineraryData";
const SHEET_SETTINGS = "SystemSettings";
const SHEET_REGISTRATIONS = "Responses";
const SHEET_NAME_ARCHIVE = "Responses_Archive";
const ADMIN_UIDS = [];

// --- Telegram Bot 設定 ---
const TELEGRAM_BOT_TOKEN = "8289773829:AAFeld7lrolPbH0V0IQ6YJH0zSxENPKPGXI";
const TELEGRAM_CHAT_ID = "7315351472";

const dataCache = {};

// ==========================================
// 2. 廣播系統：共用工具函式
// ==========================================

function parseEventStartDate(timeStr) {
    let eventDate = null;
    if (timeStr instanceof Date) {
        eventDate = timeStr;
    } else if (typeof timeStr === 'string' && timeStr.includes('~')) {
        eventDate = new Date(timeStr.split('~')[0].trim());
    } else {
        eventDate = new Date(timeStr);
    }
    return (eventDate && !isNaN(eventDate.getTime())) ? eventDate : null;
}

function isMonthInRange(eventDate, startMonthOffset, endMonthOffset) {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() + startMonthOffset, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + endMonthOffset + 1, 0);
    const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    return eventDay >= startDate && eventDay <= endDate;
}

function createInfoRow(icon, text) {
    return {
        "type": "box",
        "layout": "baseline",
        "spacing": "sm",
        "contents": [
            { "type": "text", "text": icon, "flex": 1, "size": "sm" },
            { "type": "text", "text": text, "wrap": true, "color": "#666666", "size": "sm", "flex": 9 }
        ]
    };
}

function buildEventFlexBubble(config) {
    return {
        "type": "bubble",
        "size": "mega",
        "header": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                { "type": "text", "text": config.label, "weight": "bold", "color": config.labelColor, "size": "sm" },
                { "type": "text", "text": config.name, "weight": "bold", "size": "xl", "margin": "md", "wrap": true }
            ],
            "backgroundColor": config.bgColor
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [{
                "type": "box",
                "layout": "vertical",
                "margin": "lg",
                "spacing": "sm",
                "contents": config.infoRows
            }]
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "spacing": "sm",
            "contents": [{
                "type": "button",
                "style": "link",
                "height": "sm",
                "action": { "type": "uri", "label": "🔗 點此報名", "uri": REGISTRATION_URL }
            }],
            "flex": 0
        }
    };
}

function buildBirthdayFlexBubble(namesString, senderDisplay) {
    return {
        "type": "bubble",
        "size": "mega",
        "styles": {
            "header": { "backgroundColor": "#0d0d0d" },
            "body": { "backgroundColor": "#171717" },
            "footer": { "backgroundColor": "#0d0d0d" }
        },
        "header": {
            "type": "box",
            "layout": "vertical",
            "paddingAll": "20px",
            "paddingBottom": "15px",
            "contents": [
                { "type": "text", "text": "✦ 亞太國際大老二兄弟會 ✦", "color": "#cfa972", "weight": "bold", "size": "sm", "align": "center" }
            ]
        },
        "hero": {
            "type": "image",
            "url": "https://kent0925.github.io/club-liff/hb.jpg",
            "size": "full",
            "aspectRatio": "700:396",
            "aspectMode": "cover"
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "paddingAll": "25px",
            "contents": [
                { "type": "text", "text": "🥂 HAPPY BIRTHDAY", "color": "#f2dbb3", "size": "xl", "weight": "bold", "align": "center", "margin": "sm" },
                { "type": "separator", "color": "#cfa972", "margin": "xxl" },
                {
                    "type": "box",
                    "layout": "vertical",
                    "margin": "xxl",
                    "spacing": "md",
                    "contents": [
                        { "type": "text", "text": "TODAY's STAR", "color": "#8a7b66", "size": "xxs", "align": "center", "weight": "bold" },
                        { "type": "text", "text": namesString, "color": "#ffffff", "size": "xxl", "weight": "bold", "align": "center", "wrap": true }
                    ]
                },
                { "type": "text", "text": "讓我們全體兄弟一同舉杯\n祝壽星生日快樂，事事順心！", "color": "#a8a8a8", "size": "sm", "align": "center", "wrap": true, "margin": "xxl", "lineSpacing": "8px" },
                { "type": "separator", "color": "#cfa972", "margin": "xxl" }
            ]
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "paddingAll": "15px",
            "contents": [
                { "type": "text", "text": senderDisplay + " 敬賀", "color": "#666666", "size": "xs", "align": "center" }
            ]
        }
    };
}

// ==========================================
// 3. 廣播系統：每日生日與預告廣播
// ==========================================
function broadcastTodayBirthdays() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME_BIRTHDAYS) || ss.getSheets()[0];
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();

    const pName = sheet.getRange("E1").getValue() || "秘書處";
    const pTitle = sheet.getRange("F1").getValue() || "";

    const now = new Date();
    const todayMonth = parseInt(Utilities.formatDate(now, "GMT+8", "M"));
    const todayDate = parseInt(Utilities.formatDate(now, "GMT+8", "d"));

    Logger.log("--- 廣播系統啟動 ---");
    Logger.log("當前系統判定日期為：" + todayMonth + "月" + todayDate + "日");

    let birthdayNames = [];

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const name = row[2];
        if (!name) continue;

        const bMonth = row[0];
        const bDate = row[1];
        const checkMonth = (bMonth instanceof Date) ? parseInt(Utilities.formatDate(bMonth, "GMT+8", "M")) : parseInt(bMonth);
        const checkDate = (bDate instanceof Date) ? parseInt(Utilities.formatDate(bDate, "GMT+8", "d")) : parseInt(bDate);

        if (checkMonth === todayMonth && checkDate === todayDate) {
            birthdayNames.push(name);
        }
    }

    if (birthdayNames.length > 0) {
        const namesString = birthdayNames.join('、');
        const senderDisplay = pTitle + " " + pName;

        Logger.log("找到壽星：" + namesString + "，準備發送訊息。");
        const birthdayFlex = buildBirthdayFlexBubble(namesString, senderDisplay);
        sendBrotherhoodFlex(birthdayFlex, senderDisplay, '【生日通告】祝 ' + namesString + ' 生日快樂！🎂');

        broadcastUpcomingTravelEvent(ss);
        broadcastUpcomingGeneralEvent(ss);
    } else {
        Logger.log("今日（" + todayMonth + "/" + todayDate + "）無壽星，不發送預告訊息。");
    }

    Logger.log("--- 今日廣播腳本結束 ---");
}

function broadcastUpcomingGeneralEvent(ss) {
    ss = ss || SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME_EVENTS);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    Logger.log("檢查活動預告：尋找次月（1個月內）的活動");

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const type = row[COL_TYPE];
        const isActive = row[COL_STATUS];

        if (isActive === 'close') continue;
        if (!type || (!type.toLowerCase().includes('general') && !type.includes('一般'))) continue;

        const eventDate = parseEventStartDate(row[COL_TIME]);
        if (!eventDate || !isMonthInRange(eventDate, 1, 1)) continue;

        const name = row[COL_NAME];
        const timeStr = row[COL_TIME];
        const location = row[COL_LOCATION] || "無";
        const address = row[COL_ADDRESS] || "無";
        const organizer = row[COL_ORGANIZER] || "無";

        Logger.log("發現符合條件的活動：" + name);

        let timeDisplay = timeStr;
        if (timeDisplay instanceof Date) {
            timeDisplay = Utilities.formatDate(timeDisplay, "GMT+8", "yyyy-MM-dd HH:mm");
        } else if (typeof timeDisplay === 'string' && timeDisplay.includes('T')) {
            timeDisplay = timeDisplay.replace('T', ' ');
        }

        const flexContents = buildEventFlexBubble({
            label: "活動預告",
            labelColor: "#1DB446",
            bgColor: "#f0fff4",
            name: name,
            infoRows: [
                createInfoRow("👤", "主辦人：" + organizer),
                createInfoRow("🕒", "時間：" + timeDisplay),
                createInfoRow("📍", "地點：" + location),
                createInfoRow("🚗", "地址：" + address)
            ]
        });

        sendBrotherhoodFlex(flexContents, "系統自動通知", '【活動預告】' + name);
    }
}

function broadcastUpcomingTravelEvent(ss) {
    ss = ss || SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME_EVENTS);
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();
    Logger.log("檢查旅遊預告：尋找次月至 5 個月內的旅遊活動");

    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const type = row[COL_TYPE];
        const isActive = row[COL_STATUS];

        if (isActive === 'close') continue;
        if (!type || (!type.toLowerCase().includes('travel') && !type.includes('旅遊'))) continue;

        const eventDate = parseEventStartDate(row[COL_TIME]);
        if (!eventDate || !isMonthInRange(eventDate, 1, 5)) continue;

        const name = row[COL_NAME];
        const timeStr = row[COL_TIME];
        const location = row[COL_LOCATION] || "無";
        const organizer = row[COL_ORGANIZER] || "無";

        Logger.log("發現符合條件的旅遊活動：" + name);

        let timeDisplay = "";
        const originalStr = typeof timeStr === 'string' ? timeStr : "";

        if (timeStr instanceof Date) {
            timeDisplay = Utilities.formatDate(timeStr, "GMT+8", "yyyy/MM/dd");
        } else if (originalStr.includes('~')) {
            const parts = originalStr.split('~');
            const start = new Date(parts[0].trim());
            const end = new Date(parts[1].trim());
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                timeDisplay = Utilities.formatDate(start, "GMT+8", "yyyy/MM/dd") + "~" + Utilities.formatDate(end, "GMT+8", "yyyy/MM/dd");
            } else {
                timeDisplay = originalStr;
            }
        } else {
            const d = new Date(originalStr);
            timeDisplay = !isNaN(d.getTime()) ? Utilities.formatDate(d, "GMT+8", "yyyy/MM/dd") : originalStr;
        }

        const flexContents = buildEventFlexBubble({
            label: "旅遊預告",
            labelColor: "#1E90FF",
            bgColor: "#e6f7ff",
            name: name,
            infoRows: [
                createInfoRow("👤", "主辦人：" + organizer),
                createInfoRow("🕒", "時間：" + timeDisplay),
                createInfoRow("📍", "地點：" + location)
            ]
        });

        sendBrotherhoodFlex(flexContents, "系統自動通知", '【旅遊預告】' + name);
    }
}

function sendBrotherhoodFlex(content, senderDisplay, altText, buttonConfig) {
    const url = 'https://api.line.me/v2/bot/message/broadcast';
    let flexContents;

    if (typeof content === 'object') {
        flexContents = content;
    } else {
        flexContents = {
            "type": "bubble",
            "styles": {
                "header": { "backgroundColor": "#1a1a1a" },
                "body": { "backgroundColor": "#ffffff" },
                "footer": { "backgroundColor": "#f8f9fa" }
            },
            "header": {
                "type": "box", "layout": "vertical",
                "contents": [{ "type": "text", "text": "◈ 亞太國際大老二兄弟會通告 ◈", "color": "#ffd700", "weight": "bold", "size": "md", "align": "center" }]
            },
            "hero": {
                "type": "image",
                "url": "https://images.unsplash.com/photo-1513151233558-d860c5398176?q=80&w=1000&auto=format&fit=crop",
                "size": "full", "aspectRatio": "20:13", "aspectMode": "cover"
            },
            "body": {
                "type": "box", "layout": "vertical",
                "contents": [{ "type": "text", "text": content, "wrap": true, "color": "#333333", "size": "md", "lineSpacing": "7px", "weight": "regular" }]
            },
            "footer": {
                "type": "box", "layout": "vertical", "spacing": "xs",
                "contents": [
                    {
                        "type": "box", "layout": "horizontal",
                        "contents": [
                            { "type": "text", "text": "━━━━", "color": "#dddddd", "size": "xxs", "flex": 2, "align": "center", "gravity": "center" },
                            { "type": "text", "text": "⚜", "color": "#ffd700", "size": "xs", "flex": 1, "align": "center" },
                            { "type": "text", "text": "━━━━", "color": "#dddddd", "size": "xxs", "flex": 2, "align": "center", "gravity": "center" }
                        ]
                    },
                    { "type": "text", "text": senderDisplay + " 敬發", "size": "sm", "color": "#444444", "align": "center", "weight": "bold", "margin": "md" }
                ]
            }
        };

        if (buttonConfig && buttonConfig.url) {
            flexContents.body.contents.push({
                "type": "button", "style": "primary", "color": "#1E90FF", "height": "sm", "margin": "md",
                "action": { "type": "uri", "label": buttonConfig.label || "查看詳情", "uri": buttonConfig.url }
            });
        }
    }

    const payload = { 'messages': [{ 'type': 'flex', 'altText': altText || '【兄弟會通告】', 'contents': flexContents }] };
    const options = {
        'method': 'post',
        'headers': { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LINE_ACCESS_TOKEN },
        'payload': JSON.stringify(payload)
    };

    try {
        const response = UrlFetchApp.fetch(url, options);
        Logger.log("LINE API 回傳結果：" + response.getContentText());
    } catch (e) {
        Logger.log("發送失敗，錯誤原因：" + e.message);
    }
}

/**
 * 請在專案觸發條件中，設定此函式為「每日定時」執行
 */
function mainDailyTrigger() {
    broadcastTodayBirthdays();
}


// ==========================================
// 4. 報名系統 API： 路由處理 (doGet / doPost)
// ==========================================

function doGet(e) {
    const params = e.parameter;
    const action = params.action;

    // 兼容原先寫法 (若傳入 type="birthdays" 等)
    if (params.type && !action) {
        return handleLegacyGet(e);
    }

    let result = {};
    try {
        switch (action) {
            case "getEvents":
                result = getEvents();
                break;
            case "getSettings":
                result = getSettings();
                break;
            case "getDetails":
                result = getDetails(params.eventId);
                break;
            case "stats":
                result = getStats(params.eventId);
                break;
            case "getMyRegistrations":
                result = getMyRegistrations(params.userId);
                break;
            case "getJackpotTop3":
                result = getJackpotTop3();
                break;
            case "getParticipationStats":
                result = getParticipationStats();
                break;
            default:
                result = { error: "Unknown action" };
        }
    } catch (err) {
        result = { error: err.toString() };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}

function handleLegacyGet(e) {
    const sheetName = e.parameter.type || "birthdays";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ error: "找不到工作表：" + sheetName }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1).map(row => {
        let obj = {};
        headers.forEach((header, i) => {
            let value = row[i];
            obj[header] = (value instanceof Date) ? Utilities.formatDate(value, "GMT+8", "yyyy-MM-dd") : value;
        });
        return obj;
    });

    return ContentService.createTextOutput(JSON.stringify(rows))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    let result = {};
    try {
        let data;
        try {
            data = JSON.parse(e.postData.contents);
        } catch (parseErr) {
            return ContentService.createTextOutput(JSON.stringify({
                error: "Invalid JSON format: " + parseErr.message
            })).setMimeType(ContentService.MimeType.JSON);
        }
        const action = data.action;
        const lock = LockService.getScriptLock();
        if (lock.tryLock(10000)) {
            try {
                // ★ Idempotency Key 防重複檢查
                const idempotencyKey = data._idempotencyKey;
                if (idempotencyKey) {
                    const cache = CacheService.getScriptCache();
                    const cacheKey = 'idem_' + idempotencyKey;
                    if (cache.get(cacheKey)) {
                        // 已處理過的請求，直接回傳成功，跳過重複寫入
                        return ContentService.createTextOutput(JSON.stringify({
                            success: true, deduplicated: true, message: "Request already processed"
                        })).setMimeType(ContentService.MimeType.JSON);
                    }
                    // 標記為已處理（TTL 5 分鐘）
                    cache.put(cacheKey, 'done', 300);
                }

                switch (action) {
                    case "register":
                        result = handleRegister(data);
                        break;
                    case "update":
                        result = handleUpdate(data);
                        break;
                    case "cancel":
                        result = handleCancel(data);
                        break;
                    case "createEvent":
                        result = handleCreateEvent(data);
                        break;
                    case "toggleStatus":
                        result = handleToggleStatus(data);
                        break;
                    case "sendListToTelegram":
                        result = handleSendListToTelegram(data);
                        break;
                    case "recordJackpot":
                        result = recordJackpot(data);
                        break;
                    default:
                        result = { error: "Unknown POST action: " + action };
                }
            } finally {
                lock.releaseLock();
            }
        } else {
            result = { error: "Server busy, please try again." };
        }
    } catch (err) {
        result = { error: "Server error: " + err.toString() };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 5. 報名系統 API： 功能實作
// ==========================================

function getSheetData(sheetName, useCache = true) {
    if (useCache && dataCache[sheetName]) {
        return dataCache[sheetName];
    }
    const sheet = getSheet(sheetName);
    if (!sheet) return [];
    const data = getDataWithHeader(sheet);
    if (useCache) {
        dataCache[sheetName] = data;
    }
    return data;
}

function getMyRegistrations(userId) {
    if (!userId) return [];
    const sheet = getSheet(SHEET_REGISTRATIONS);
    const data = getDataWithHeader(sheet);
    const archiveSheet = getSheet(SHEET_NAME_ARCHIVE);
    let allData = data;
    if (archiveSheet) {
        const archiveData = getDataWithHeader(archiveSheet);
        allData = data.concat(archiveData);
    }
    const eventIds = allData
        .filter(row => row['UserID'] === userId)
        .map(row => row['EventID']);
    return [...new Set(eventIds)];
}

function getEvents() {
    const sheet = getSheet(SHEET_EVENTS);
    const data = getDataWithHeader(sheet);
    const itinSheet = getSheet(SHEET_ITINERARY);
    const itinData = itinSheet ? getDataWithHeader(itinSheet) : [];
    const itinMap = {};

    itinData.forEach(row => {
        const eid = row['EventID'];
        if (!itinMap[eid]) {
            itinMap[eid] = {
                itinerary: [],
                pickupOpts: new Set(),
                roomOpts: new Set()
            };
        }
        if (row['Title'] || row['Description']) {
            const day = row['Day'] || '';
            const time = row['Time'] ? ` ${formatTimeDisplay(row['Time'])}` : '';
            const title = row['Title'] || '';
            const desc = row['Description'] || '';
            const map = row['MapURL'] ? ` (${row['MapURL']})` : '';
            let str = "";
            if (day) str += `${day}${time}: `;
            str += `${title}|${desc}${map}`;
            itinMap[eid].itinerary.push(str);
        }
        if (row['PickupOptions']) {
            row['PickupOptions'].toString().split(';').forEach(opt => itinMap[eid].pickupOpts.add(opt.trim()));
        }
        if (row['RoomOptions']) {
            row['RoomOptions'].toString().split(';').forEach(opt => itinMap[eid].roomOpts.add(opt.trim()));
        }
    });

    const now = new Date();

    return data
        .filter(row => {
            const val = String(row['IsActive'] || '').trim();
            return val !== '';
        })
        .map(row => {
            const eid = row['EventID'];
            const extra = itinMap[eid] || { itinerary: [], pickupOpts: new Set(), roomOpts: new Set() };

            let activeVal = String(row['IsActive'] || '').trim().toLowerCase();
            let isActive = !(activeVal === 'close' || activeVal === '關閉');

            // ★★★ 動態判斷「開放報名時間」與「截止報名時間」
            if (isActive) {
                const startTimeStr = row['開放報名時間'];
                const endTimeStr = row['截止報名時間'];

                if (startTimeStr) {
                    const startTime = new Date(startTimeStr);
                    if (!isNaN(startTime.getTime()) && now < startTime) {
                        isActive = false; // 未到開放時間
                    }
                }

                if (endTimeStr) {
                    const endTime = new Date(endTimeStr);
                    if (!isNaN(endTime.getTime()) && now > endTime) {
                        isActive = false; // 已過截止時間
                    }
                }
            }

            return {
                id: row['EventID'],
                type: row['EventType'],
                name: row['EventName'],
                organizer: row['Organizer'],
                time: formatTimeDisplay(row['Time']),
                deadline: row['Deadline'] ? new Date(row['Deadline']).toISOString() : "",
                location: row['Location'],
                address: row['Address'],
                isActive: isActive,
                creatorId: row['CreatorID'],
                sponsorshipOpts: row['SponsorshipOptions'],
                pickupOpts: Array.from(extra.pickupOpts).filter(s => s),
                roomOpts: Array.from(extra.roomOpts).filter(s => s),
                itinerary: extra.itinerary.join(';')
            };
        });
}

function getSettings() {
    const sheet = getSheet(SHEET_SETTINGS);
    const result = {
        organizers: [],
        locations: [],
        userMapping: {},
        specialRoles: {
            president: '',
            vicePresident: '',
            birthdays: {}
        }
    };
    if (!sheet) return result;

    const data = getDataWithHeader(sheet);
    const organizers = [];
    const locations = [];

    data.forEach(row => {
        if (row['Category'] === 'Organizer') {
            organizers.push(row['Name']);
        } else if (row['Category'] === 'Location') {
            locations.push({ name: row['Name'], address: row['Value'] });
        } else if (row['Category'] === 'UserMapping') {
            const key = String(row['Name'] || '').trim();
            const val = String(row['Value'] || '').trim();
            if (key) {
                result.userMapping[key] = val;
            }
        }

        const pVal = String(row['會長'] || '').trim();
        if (pVal) result.specialRoles.president = pVal;

        const vpVal = String(row['輔導會長'] || '').trim();
        if (vpVal) result.specialRoles.vicePresident = vpVal;

        for (let m = 1; m <= 12; m++) {
            const colName = `${m}月壽星`;
            const bVal = String(row[colName] || '').trim();
            if (bVal) {
                if (!result.specialRoles.birthdays[m]) result.specialRoles.birthdays[m] = [];
                result.specialRoles.birthdays[m].push(bVal);
            }
        }
    });

    result.organizers = organizers;
    result.locations = locations;
    return result;
}

function getDetails(eventId) {
    if (!eventId) return [];
    const mainData = getSheetData(SHEET_REGISTRATIONS);
    let targetRows = mainData.filter(row => row['EventID'] === eventId);
    if (targetRows.length === 0) {
        const archiveData = getSheetData(SHEET_NAME_ARCHIVE);
        if (archiveData.length > 0) {
            targetRows = archiveData.filter(row => row['EventID'] === eventId);
        }
    }
    return targetRows.map(row => {
        let guestList = [];
        try {
            if (row['GuestJson']) guestList = JSON.parse(row['GuestJson']);
        } catch (e) { }
        let sponsorList = [];
        if (row['Sponsorship'] && row['Sponsorship'] !== '無') {
            sponsorList = row['Sponsorship'].split(', ');
        }
        return {
            userId: row['UserID'],
            name: row['UserName'],
            family: parseInt(row['FamilyCount'] || 0, 10),
            guestCount: parseInt(row['GuestCount'] || 0, 10),
            guestList: guestList,
            sponsorList: sponsorList,
            room: row['RoomType'],
            pickup: row['Pickup'],
            tableCount: parseInt(row['TableCount'] || 0, 10),
            guestName: row['GuestName']
        };
    });
}

function getStats(eventId) {
    if (!eventId) return {};
    const mainData = getSheetData(SHEET_REGISTRATIONS);
    let eventRows = mainData.filter(r => r['EventID'] === eventId);
    if (eventRows.length === 0) {
        const archiveData = getSheetData(SHEET_NAME_ARCHIVE);
        if (archiveData.length > 0) {
            eventRows = archiveData.filter(r => r['EventID'] === eventId);
        }
    }
    let totalPeople = 0;
    let tableCountTotal = 0;
    let sponsorCountTotal = 0;
    let totalRoomCount = 0;
    let roomCounts = {};
    let pickupCounts = {};
    eventRows.forEach(row => {
        const self = 1;
        const family = parseInt(row['FamilyCount'] || 0, 10);
        let guests = [];
        try {
            if (row['GuestJson'] && row['GuestJson'] !== '[]') {
                guests = JSON.parse(row['GuestJson']);
            }
        } catch (e) { }
        const guestTotal = guests.length > 0 ? guests.reduce((sum, g) => sum + (parseInt(g.count, 10) || 1), 0) : parseInt(row['GuestCount'] || 0, 10);
        totalPeople += self + family + guestTotal;
        if (row['TableCount'] && parseInt(row['TableCount'], 10) > 0) {
            tableCountTotal += parseInt(row['TableCount'], 10);
        }
        if (row['Sponsorship'] && row['Sponsorship'] !== '無') {
            const items = row['Sponsorship'].split(',').filter(s => s.trim() !== '');
            sponsorCountTotal += items.length;
        }
        if (row['RoomType'] && row['RoomType'] !== '無') {
            roomCounts[row['RoomType']] = (roomCounts[row['RoomType']] || 0) + 1;
            totalRoomCount++;
        }
        if (row['Pickup'] && row['Pickup'] !== '無') {
            const pName = row['Pickup'].split('|')[0];
            pickupCounts[pName] = (pickupCounts[pName] || 0) + (1 + family);
        }
        guests.forEach(g => {
            if (g.room && g.room !== '無') {
                roomCounts[g.room] = (roomCounts[g.room] || 0) + 1;
                totalRoomCount++;
            }
            if (g.pickup && g.pickup !== '無') {
                const gpName = g.pickup.split('|')[0];
                const gCount = parseInt(g.count, 10) || 1;
                pickupCounts[gpName] = (pickupCounts[gpName] || 0) + gCount;
            }
        });
    });
    let secondaryVal = tableCountTotal > 0 ? tableCountTotal : sponsorCountTotal;
    return {
        totalPeople: totalPeople,
        secondary: secondaryVal,
        totalRooms: totalRoomCount,
        tableCount: tableCountTotal,
        roomCounts: roomCounts,
        pickupCounts: pickupCounts,
        sponsorCount: sponsorCountTotal
    };
}

// ==========================================
// 6. 報名系統 API： 寫入處理
// ==========================================

function buildRowData(data, includeEventInfo = false) {
    const guestArr = JSON.parse(data.guestList || '[]');
    const guestCount = guestArr.reduce((acc, c) => acc + parseInt(c.count, 10), 0);
    const sponsorArr = JSON.parse(data.sponsorList || '[]');
    const guestDisplay = parseGuestJsonToDisplay(data.guestList, data.eventType);

    const rowData = {
        'Timestamp': new Date(),
        'UserName': data.displayName,
        'FamilyCount': data.familyCount,
        'GuestName': guestDisplay,
        'GuestCount': guestCount,
        'Pickup': data.pickupLoc,
        'RoomType': data.roomType,
        'TableCount': data.tableCount,
        'Sponsorship': sponsorArr.join(', ') || '無',
        'GuestJson': data.guestList
    };

    if (includeEventInfo) {
        rowData['EventID'] = data.eventId;
        rowData['EventType'] = data.eventType;
        rowData['EventName'] = data.eventName;
        rowData['UserID'] = data.userId;
    }

    return rowData;
}

function handleRegister(data) {
    const sheet = getSheet(SHEET_REGISTRATIONS);
    const existingRow = findRowIndex(sheet, data.eventId, data.userId);
    if (existingRow > 0) {
        return handleUpdate(data);
    }
    const rowData = buildRowData(data, true);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = headers.map(h => rowData.hasOwnProperty(h) ? rowData[h] : '');
    sheet.appendRow(newRow);

    sendRegistrationNotification(data);

    return { success: true, message: "Registered successfully" };
}

function handleUpdate(data) {
    const sheet = getSheet(SHEET_REGISTRATIONS);
    const rowIndex = findRowIndex(sheet, data.eventId, data.userId);
    if (rowIndex === -1) {
        return { error: "Registration not found for event: " + data.eventId };
    }
    const rowData = buildRowData(data, false);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const range = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn());
    const values = range.getValues()[0];
    headers.forEach((h, i) => {
        if (rowData.hasOwnProperty(h)) {
            values[i] = rowData[h];
        }
    });
    range.setValues([values]);
    // ★ 清除快取，避免後續讀取到舊資料
    if (dataCache[SHEET_REGISTRATIONS]) delete dataCache[SHEET_REGISTRATIONS];
    return { success: true, message: "Updated successfully" };
}

function handleCancel(data) {
    const sheet = getSheet(SHEET_REGISTRATIONS);
    const rowIndex = findRowIndex(sheet, data.eventId, data.userId);
    if (rowIndex === -1) {
        return { error: "Registration not found" };
    }
    sheet.deleteRow(rowIndex);
    // ★ 清除快取
    if (dataCache[SHEET_REGISTRATIONS]) delete dataCache[SHEET_REGISTRATIONS];
    // ★ 發送取消通知至 Telegram
    sendCancelNotification(data);
    return { success: true, message: "Cancelled successfully" };
}

function handleCreateEvent(data) {
    const sheet = getSheet(SHEET_EVENTS);
    const eventId = 'evt_' + Math.floor(Date.now() / 1000);
    const rowData = {
        'EventID': eventId,
        'EventType': data.type,
        'EventName': data.name,
        'Organizer': data.organizer,
        'Time': data.time,
        'Deadline': data.deadline,
        'Location': data.location,
        'Address': data.address,
        'IsActive': '開放',
        'CreatorID': data.userId,
        'CreatorName': data.displayName,
    };
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = headers.map(h => rowData.hasOwnProperty(h) ? rowData[h] : '');
    sheet.appendRow(newRow);
    if (data.itinerary || data.pickupOpts || data.roomOpts) {
        const itinSheet = getSheet(SHEET_ITINERARY);
        if (itinSheet) {
            const itinRow = {
                'EventID': eventId,
                'Day': 'D1',
                'Title': '行程概覽',
                'Description': data.itinerary,
                'PickupOptions': data.pickupOpts,
                'RoomOptions': data.roomOpts
            };
            const iHeaders = itinSheet.getRange(1, 1, 1, itinSheet.getLastColumn()).getValues()[0];
            const iRow = iHeaders.map(h => itinRow.hasOwnProperty(h) ? itinRow[h] : '');
            itinSheet.appendRow(iRow);
        }
    }
    return { success: true, eventId: eventId };
}

function handleToggleStatus(data) {
    const sheet = getSheet(SHEET_EVENTS);
    const dataRange = sheet.getDataRange().getValues();
    const headers = dataRange[0];
    const idxId = headers.indexOf('EventID');
    const idxActive = headers.indexOf('IsActive');
    if (idxId === -1 || idxActive === -1) return { error: "Column missing" };
    for (let i = 1; i < dataRange.length; i++) {
        if (dataRange[i][idxId] == data.eventId) {
            const current = dataRange[i][idxActive];
            const newVal = (current === '開放' || current === true) ? '關閉' : '開放';
            sheet.getRange(i + 1, idxActive + 1).setValue(newVal);
            return { success: true, status: newVal };
        }
    }
    return { error: "Event not found" };
}

// ★ 快取 Spreadsheet 物件，避免同一請求中重複開啟
let _cachedSpreadsheet = null;
function getSheet(name) {
    if (!_cachedSpreadsheet) {
        _cachedSpreadsheet = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    }
    return _cachedSpreadsheet.getSheetByName(name);
}

function getDataWithHeader(sheet) {
    if (!sheet) return [];
    const raw = sheet.getDataRange().getValues();
    if (raw.length < 2) return [];
    const headers = raw[0];
    const rows = raw.slice(1);
    return rows.map(row => {
        let obj = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
    });
}

// ★ 優化：支援傳入已讀取的原始資料，避免同一請求中重複 getDataRange()
function findRowIndex(sheet, eventId, userId, cachedRawData) {
    const data = cachedRawData || sheet.getDataRange().getValues();
    const headers = data[0];
    const idxE = headers.indexOf('EventID');
    const idxU = headers.indexOf('UserID');
    if (idxE === -1 || idxU === -1) return -1;
    for (let i = 1; i < data.length; i++) {
        // ★ 使用 String() 嚴格比對，避免型別轉換問題
        if (String(data[i][idxE]) === String(eventId) && String(data[i][idxU]) === String(userId)) {
            return i + 1;
        }
    }
    return -1;
}

function formatTimeDisplay(dateObj) {
    if (!dateObj) return "";
    if (typeof dateObj === 'string') return dateObj;
    return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
}

function parseGuestJsonToDisplay(jsonStr, eventType) {
    try {
        const guests = (typeof jsonStr === 'string') ? JSON.parse(jsonStr) : jsonStr;
        if (!guests || guests.length === 0) return "無";
        return guests.map(g => {
            let str = `${g.name}(${g.count})`;
            if (eventType && (eventType.includes('travel') || eventType.includes('旅遊'))) {
                const p = g.pickup || '無';
                const r = g.room || '無';
                str += `|${p}|${r}`;
            }
            return str;
        }).join(', ');
    } catch (e) {
        return "格式錯誤";
    }
}

// ==========================================
// 7. Telegram 通知功能
// ==========================================
function sendTelegramMessage(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payload = {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML"
    };
    const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };
    try {
        const response = UrlFetchApp.fetch(url, options);
        return JSON.parse(response.getContentText());
    } catch (e) {
        return { ok: false, error: e.toString() };
    }
}

function sendRegistrationNotification(data) {
    if (dataCache[SHEET_REGISTRATIONS]) delete dataCache[SHEET_REGISTRATIONS];
    const stats = getStats(data.eventId);
    const totalPeople = stats.totalPeople || 0;
    const evtName = data.eventName || data.name || "未知活動";
    const userName = data.displayName || data.userName || "匿名";
    const message = `📝 <b>新報名通知</b>\n\n` +
        `📅 活動：${evtName}\n` +
        `👤 報名者：${userName}\n` +
        `👥 目前人數：${totalPeople} 人`;
    sendTelegramMessage(message);
}

// ★ 取消報名通知
function sendCancelNotification(data) {
    if (dataCache[SHEET_REGISTRATIONS]) delete dataCache[SHEET_REGISTRATIONS];
    const stats = getStats(data.eventId);
    const totalPeople = stats.totalPeople || 0;
    const evtName = data.eventName || data.name || "未知活動";
    const userName = data.displayName || data.userName || "匿名";
    const message = `❌ <b>取消報名通知</b>\n\n` +
        `📅 活動：${evtName}\n` +
        `👤 取消者：${userName}\n` +
        `👥 剩餘人數：${totalPeople} 人`;
    sendTelegramMessage(message);
}

function handleSendListToTelegram(data) {
    const eventId = data.eventId;
    if (!eventId) return { error: "缺少活動 ID" };
    const events = getEvents();
    const event = events.find(e => e.id === eventId);
    if (!event) return { error: "找不到活動" };
    const details = getDetails(eventId);
    const stats = getStats(eventId);

    let message = `📋 <b>${event.name}</b> 報名名單\n`;
    message += `👤 主辦人：${event.organizer || '無'}\n`;
    message += `📍 地點：${event.location || '無'}\n`;
    message += `👥 總人數：${stats.totalPeople || 0} 人\n`;
    message += `──────────────\n`;

    details.forEach((p, i) => {
        const num = (i + 1).toString().padStart(2, '0');
        const family = parseInt(p.family) || 0;
        let guestCount = 0;
        if (p.guestList && Array.isArray(p.guestList)) {
            guestCount = p.guestList.reduce((acc, g) => acc + (parseInt(g.count) || 1), 0);
        } else {
            guestCount = parseInt(p.guestCount) || 0;
        }
        const total = 1 + family + guestCount;
        message += `${num}. ${p.name}`;
        if (total > 1) message += ` *${total}`;
        message += `\n`;
    });

    const result = sendTelegramMessage(message);
    if (result.ok) {
        return { success: true, message: "名單已發送至 Telegram" };
    } else {
        return { error: "發送失敗: " + (result.description || result.error) };
    }
}

// ==========================================
// 8. 拉霸與統計功能 (新增)
// ==========================================

/** 取得拉霸大獎前三名 */
function getJackpotTop3() {
    let sheet = getSheet('JackpotRecords');

    if (!sheet) {
        // 自動建立工作表
        const ss = _cachedSpreadsheet || (SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet());
        sheet = ss.insertSheet('JackpotRecords');
        sheet.appendRow(['時間', 'UserID', '姓名', '中獎符號']);
        return [];
    }

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const stats = {};
    for (let i = 1; i < data.length; i++) {
        const name = data[i][2];
        if (!name) continue;
        stats[name] = (stats[name] || 0) + 1;
    }

    const sorted = Object.keys(stats).map(name => {
        return { name: name, count: stats[name] };
    }).sort((a, b) => b.count - a.count);

    return sorted.slice(0, 3);
}

/** 紀錄大獎結果 */
function recordJackpot(data) {
    let sheet = getSheet('JackpotRecords');

    if (!sheet) {
        const ss = _cachedSpreadsheet || (SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet());
        sheet = ss.insertSheet('JackpotRecords');
        sheet.appendRow(['時間', 'UserID', '姓名', '中獎符號']);
    }

    sheet.appendRow([
        new Date(),
        data.userId || '',
        getRealName(data.userId, data.name || '訪客'),
        data.symbol || ''
    ]);

    return { success: true };
}

/** 根據 UserMapping 取得真實姓名（優先比對 userId，再比對 displayName） */
function getRealName(userId, displayName) {
    const sheet = getSheet(SHEET_SETTINGS);
    if (!sheet) return displayName;

    const data = sheet.getDataRange().getValues();
    let matchByName = null;

    for (let i = 1; i < data.length; i++) {
        if (data[i][0] !== 'UserMapping') continue;
        const key = String(data[i][1]).trim();
        const val = String(data[i][2]).trim();

        // 優先：用 userId 精確比對
        if (userId && key === String(userId).trim()) {
            return val;
        }
        // 備用：用 displayName 比對（暫存，等迴圈結束後使用）
        if (!matchByName && displayName && key === String(displayName).trim()) {
            matchByName = val;
        }
    }
    return matchByName || displayName;
}

/** 取得成員參加頻率統計 */
function getParticipationStats() {
    const stats = {};

    // 取得 mapping 以便顯示真實姓名
    const settings = getSettings();
    const mapping = settings.userMapping || {};

    const dataSheetNames = [SHEET_REGISTRATIONS, SHEET_NAME_ARCHIVE];

    dataSheetNames.forEach(sName => {
        const sheet = getSheet(sName);
        if (!sheet) return;
        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) return;

        const headers = data[0];
        const nameIdx = headers.indexOf('UserName');
        const uidIdx = headers.indexOf('UserID');
        if (nameIdx === -1) return;

        for (let i = 1; i < data.length; i++) {
            const participant = data[i][nameIdx];
            const uid = uidIdx !== -1 ? String(data[i][uidIdx] || '').trim() : '';
            if (participant && typeof participant === 'string') {
                // 優先用 UserID 查 mapping，再用 displayName
                const realName = (uid && mapping[uid]) || mapping[participant] || participant;
                stats[realName] = (stats[realName] || 0) + 1;
            }
        }
    });

    const sorted = Object.keys(stats).map(name => {
        return { name: name, count: stats[name] };
    }).sort((a, b) => b.count - a.count);

    return sorted;
}

// ==========================================
// 9. 封存資料管理
// ==========================================
function archiveOldData() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const eventSheet = ss.getSheetByName(SHEET_NAME_EVENTS);
    const dataSheet = ss.getSheetByName(SHEET_REGISTRATIONS);
    let archiveSheet = ss.getSheetByName(SHEET_NAME_ARCHIVE);

    if (!archiveSheet) {
        archiveSheet = ss.insertSheet(SHEET_NAME_ARCHIVE);
        const headers = dataSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).getValues();
        archiveSheet.getRange(1, 1, 1, dataSheet.getLastColumn()).setValues(headers);
    }

    const events = eventSheet.getDataRange().getValues();
    const eventHeaders = events[0];
    const idxId = eventHeaders.indexOf('EventID');
    const idxActive = eventHeaders.indexOf('IsActive');

    if (idxId === -1 || idxActive === -1) {
        console.error("找不到 EventID 或 IsActive 欄位");
        return;
    }

    const archiveEventIds = new Set();
    for (let i = 1; i < events.length; i++) {
        const row = events[i];
        const eid = row[idxId];
        const activeVal = String(row[idxActive] || '').trim().toLowerCase();
        if (activeVal === '關閉' || activeVal === 'close') {
            archiveEventIds.add(String(eid));
        }
    }

    console.log("準備封存的活動 ID:", Array.from(archiveEventIds));
    if (archiveEventIds.size === 0) {
        console.log("沒有符合條件的舊資料需要封存");
        return;
    }

    const dataRange = dataSheet.getDataRange();
    const values = dataRange.getValues();
    const dataHeaders = values[0];
    const idxDataEventId = dataHeaders.indexOf('EventID');

    if (idxDataEventId === -1) {
        console.error("Responses 表找不到 EventID 欄位");
        return;
    }

    const rowsToArchive = [];
    const rowsToKeep = [dataHeaders];
    for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const rowEid = String(row[idxDataEventId]);
        if (archiveEventIds.has(rowEid)) {
            rowsToArchive.push(row);
        } else {
            rowsToKeep.push(row);
        }
    }

    if (rowsToArchive.length > 0) {
        archiveSheet.getRange(
            archiveSheet.getLastRow() + 1, 1,
            rowsToArchive.length, rowsToArchive[0].length
        ).setValues(rowsToArchive);
        console.log(`已成功搬移 ${rowsToArchive.length} 筆資料至 ${SHEET_NAME_ARCHIVE}`);

        if (rowsToKeep.length > 0) {
            dataSheet.getRange(1, 1, rowsToKeep.length, rowsToKeep[0].length).setValues(rowsToKeep);
            const remainingRows = dataSheet.getLastRow() - rowsToKeep.length;
            if (remainingRows > 0) {
                dataSheet.deleteRows(rowsToKeep.length + 1, remainingRows);
            }
        } else {
            dataSheet.clearContents();
        }
        console.log("Responses 表更新完成 (安全模式)");
    } else {
        console.log("沒有資料需要搬移");
    }
}
