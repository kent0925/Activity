/**
 * 活動報名系統後端 API (Google Apps Script)
 * 配合前端 EventRegistration_Optimized.html 使用
 * * 更新：2025-01-24 - 新增封存資料讀取支援
 * * 更新：2026-02-03 - 新增 Telegram 通知支援
 */
// @OnlyCurrentDoc

/**
 * ★★★ 首次使用請先執行此函式以取得權限 ★★★
 * 執行後會跳出權限審查視窗，請點擊「進階」->「前往 (不安全)」->「允許」
 */
function requestUrlFetchAppPermission() {
    console.log("正在請求權限...");
    UrlFetchApp.fetch("https://www.google.com");
}

// --- 設定區 ---
// 請在此填入您的試算表 ID
const SPREADSHEET_ID = "1vXD0gGXW76Nh8MlPPF6RRmrG8Brh_CmSCExFPMeQOWI";
// 試算表分頁名稱定義
const SHEET_EVENTS = "EventConfig";
const SHEET_ITINERARY = "ItineraryData";
const SHEET_SETTINGS = "SystemSettings";
const SHEET_REGISTRATIONS = "Responses";
// ★ 新增：封存工作表名稱
const SHEET_NAME_ARCHIVE = "Responses_Archive";
// 管理員名單 (可選)
const ADMIN_UIDS = [];

// --- Telegram Bot 設定 ---
const TELEGRAM_BOT_TOKEN = "8289773829:AAFeld7lrolPbH0V0IQ6YJH0zSxENPKPGXI";
const TELEGRAM_CHAT_ID = "7315351472";

// ★ 優化：簡易快取機制 (避免同一次執行中重複讀取相同資料)
const dataCache = {};
// --- 路由處理 (doGet / doPost) ---
function doGet(e) {
    const params = e.parameter;
    const action = params.action;
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
            default:
                result = { error: "Unknown action" };
        }
    } catch (err) {
        result = { error: err.toString() };
    }
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
    let result = {};
    try {
        // ★ 優化：增強錯誤處理，提供更具體的錯誤訊息
        let data;
        try {
            data = JSON.parse(e.postData.contents);
        } catch (parseErr) {
            return ContentService.createTextOutput(JSON.stringify({
                error: "Invalid JSON format: " + parseErr.message
            })).setMimeType(ContentService.MimeType.JSON);
        }
        const action = data.action;
        // 取得鎖定
        const lock = LockService.getScriptLock();
        if (lock.tryLock(10000)) {
            try {
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
// --- 功能實作 ---
// ★ 優化：輔助函數 - 讀取指定 Sheet 的資料（含快取）
function getSheetData(sheetName, useCache = true) {
    // 若啟用快取且快取中有資料，直接回傳
    if (useCache && dataCache[sheetName]) {
        return dataCache[sheetName];
    }
    const sheet = getSheet(sheetName);
    if (!sheet) return [];
    const data = getDataWithHeader(sheet);
    // 存入快取
    if (useCache) {
        dataCache[sheetName] = data;
    }
    return data;
}
function getMyRegistrations(userId) {
    if (!userId) return [];
    const sheet = getSheet(SHEET_REGISTRATIONS);
    const data = getDataWithHeader(sheet);
    // ★ 同時檢查封存表，避免已封存的活動在前端顯示為未報名
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

    return data
        // ★ 依指令確認：過濾 IsActive 為空白的資料 (不顯示)
        .filter(row => {
            const val = String(row['IsActive'] || '').trim();
            return val !== ''; // 若為空字串則回傳 false (過濾掉)
        })
        .map(row => {
            const eid = row['EventID'];
            const extra = itinMap[eid] || { itinerary: [], pickupOpts: new Set(), roomOpts: new Set() };

            // 處理 Active 狀態 (Close/關閉 顯示為不開放，但仍會顯示在列表，除非 IsActive 為空白)
            const activeVal = String(row['IsActive'] || '').trim().toLowerCase();
            const isActive = !(activeVal === 'close' || activeVal === '關閉');

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
    if (!sheet) return { organizers: [], locations: [] };
    const data = getDataWithHeader(sheet);
    const organizers = [];
    const locations = [];
    const result = { organizers: [], locations: [], userMapping: {} };
    data.forEach(row => {
        if (row['Category'] === 'Organizer') {
            organizers.push(row['Name']);
        } else if (row['Category'] === 'Location') {
            locations.push({ name: row['Name'], address: row['Value'] });
        } else if (row['Category'] === 'UserMapping') {
            // ★ 新增：使用者 ID 對應名稱 (Name: UserID, Value: DisplayName)
            // 將其加入 mapping 物件，若需回傳可在 return 物件中新增欄位
            if (!result.userMapping) result.userMapping = {};
            // 注意：這裡假設 Sheet 欄位 Name 放 UserID，Value 放 真實姓名
            result.userMapping[row['Name']] = row['Value'];
        }
    });
    // 將 organizers, locations 與 userMapping 一併回傳
    result.organizers = organizers;
    result.locations = locations;
    return result;
}
// ★ 修改：支援讀取封存資料
function getDetails(eventId) {
    if (!eventId) return [];
    // 1. 先嘗試從主表讀取
    const mainData = getSheetData(SHEET_REGISTRATIONS);
    let targetRows = mainData.filter(row => row['EventID'] === eventId);
    // 2. 如果主表找不到資料，且有封存表，則嘗試從封存表讀取
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
// ★ 修改：支援讀取封存資料
function getStats(eventId) {
    if (!eventId) return {};
    // 1. 先讀主表
    const mainData = getSheetData(SHEET_REGISTRATIONS);
    let eventRows = mainData.filter(r => r['EventID'] === eventId);
    // 2. 若主表無該活動資料，讀封存表
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
// --- 寫入處理 (保持原樣，因為寫入必定是寫入主表) ---

// ★ 優化：抽取共用函數 - 建立報名資料物件
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

    // 新增時需要額外的活動資訊
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
    // ★ 優化：使用共用函數
    const rowData = buildRowData(data, true);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const newRow = headers.map(h => rowData.hasOwnProperty(h) ? rowData[h] : '');
    sheet.appendRow(newRow);

    // ★ 發送 Telegram 報名通知
    sendRegistrationNotification(data);

    return { success: true, message: "Registered successfully" };
}
function handleUpdate(data) {
    const sheet = getSheet(SHEET_REGISTRATIONS);
    const rowIndex = findRowIndex(sheet, data.eventId, data.userId);
    if (rowIndex === -1) {
        return { error: "Registration not found for event: " + data.eventId };
    }
    // ★ 優化：使用共用函數
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
    return { success: true, message: "Updated successfully" };
}
function handleCancel(data) {
    const sheet = getSheet(SHEET_REGISTRATIONS);
    const rowIndex = findRowIndex(sheet, data.eventId, data.userId);
    if (rowIndex === -1) {
        return { error: "Registration not found" };
    }
    sheet.deleteRow(rowIndex);
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
function getSheet(name) {
    const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    return ss.getSheetByName(name);
}
function getDataWithHeader(sheet) {
    // ★ 優化：增強空值防護
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
function findRowIndex(sheet, eventId, userId) {
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const idxE = headers.indexOf('EventID');
    const idxU = headers.indexOf('UserID');
    if (idxE === -1 || idxU === -1) return -1;
    for (let i = 1; i < data.length; i++) {
        if (data[i][idxE] == eventId && data[i][idxU] == userId) {
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

// --- Telegram 功能 ---
/**
 * 發送訊息至 Telegram
 */
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
        // console.error("Telegram 發送失敗:", e);
        return { ok: false, error: e.toString() };
    }
}

/**
 * 發送報名通知
 */
function sendRegistrationNotification(data) {
    // 強制清除快取以確保取得最新統計（雖然在此流程中可能尚未被快取，但防禦性編程）
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

/**
 * 處理「發送名單至 Telegram」請求
 */
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