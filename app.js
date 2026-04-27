// --- 0. 核心安全配置 ---
const SYSTEM_SALT = "TrU$t_Sca1e_8xP@qL9!mZ";

// --- 1. 安全模組：加鹽雜湊 (SHA-256) ---
async function hashData(text) {
    if (!text) return "";
    const saltedText = text + SYSTEM_SALT;
    const msgBuffer = new TextEncoder().encode(saltedText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- 2. 視圖切換管理 ---
function switchView(viewId) {
    const views = ['view-search', 'view-loading', 'view-results', 'view-report'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== viewId);
    });
}

// --- 3. 雙向評鑑標籤庫資料 (Version 2.8 完整版) ---
const TAG_LIBRARY = {
    tenant: [
        // 空間維護
        { id: "T1", text: "退租如新", impact: "good" },
        { id: "T2", text: "格局魔改", impact: "bad" },
        // 環境秩序
        { id: "T3", text: "社區隱形", impact: "good" },
        { id: "T4", text: "雜物領主", impact: "bad" },
        // 設備守護
        { id: "T5", text: "設備守護", impact: "good" },
        { id: "T6", text: "拆房專家", impact: "bad" },
        // 生活溝通
        { id: "T7", text: "溝通模範", impact: "good" },
        { id: "T8", text: "公關大師", impact: "bad" },
        // 氣味衛生
        { id: "T9", text: "雜物絕緣", impact: "good" },
        { id: "T10", text: "嗅覺入侵", impact: "bad" },
        // 金流信用 (新)
        { id: "T11", text: "準時課代表", impact: "good" },
        { id: "T12", text: "慣性拖款", impact: "bad" }
    ],
    landlord: [
        // 金流誠信
        { id: "L1", text: "押金速還", impact: "good" },
        { id: "L2", text: "押金收割", impact: "bad" },
        // 修繕效率
        { id: "L3", text: "修繕秒讀", impact: "good" },
        { id: "L4", text: "修繕拖延", impact: "bad" },
        // 隱私邊界
        { id: "L5", text: "邊界模範", impact: "good" },
        { id: "L6", text: "突擊檢查", impact: "bad" },
        // 設備品質
        { id: "L7", text: "設備齊全", impact: "good" },
        { id: "L8", text: "漲價狂魔", impact: "bad" },
        // 合約公平
        { id: "L9", text: "誠實合約", impact: "good" },
        { id: "L10", text: "合約霸凌", impact: "bad" },
        // 稅務合規 (新)
        { id: "L11", text: "稅務天使", impact: "good" },
        { id: "L12", text: "補助殺手", impact: "bad" }
    ]
};

let currentReportType = 'tenant';
let selectedTags = new Set();

// --- 4. 搜尋邏輯 ---
async function handleSearch() {
    const name = document.getElementById('in-name').value.trim();
    const area = document.getElementById('in-area').value;
    const ageRange = document.getElementById('in-age').value;
    const phone = document.getElementById('in-phone').value.trim();

    if (!name || !area) return alert("姓名與地區為必填");

    switchView('view-loading');
    const hName = await hashData(name);
    const hPhone = phone ? await hashData(phone) : "";

    // 未來將此 Payload 透過 fetch 發送到 GAS Web App URL
    console.log("🚀 [搜尋 Payload]:", { action: "search", hName, hPhone, area, ageRange });

    setTimeout(() => {
        updateResultsUI(95); // 模擬演示用，未來由 GAS 回傳結果
        switchView('view-results');
    }, 1500);
}

// --- 5. 結果渲染引擎 ---
function updateResultsUI(R) {
    const scoreVal = document.querySelector('.score-value');
    const statusTag = document.querySelector('.status-tag');
    const court = document.querySelector('.court-data');
    const user = document.querySelector('.user-data');

    let cfg = { score: 5, color: 'green', text: '👼 天使小翅膀' };
    if (R > 80) cfg = { score: 99, color: 'red', text: '🦖 哥吉拉噴火' };
    else if (R > 50) cfg = { score: 60, color: 'orange', text: '💣 冒煙的引信' };
    else if (R > 20) cfg = { score: 30, color: 'yellow', text: '🐱 溫和的小貓' };

    scoreVal.innerText = cfg.score;
    scoreVal.className = 'score-value ' + cfg.color;
    statusTag.innerText = cfg.text;
    statusTag.className = 'status-tag text-' + cfg.color;
    court.className = 'result-card court-data border-' + cfg.color;
    user.className = 'result-card user-data border-' + cfg.color;

    if (cfg.score === 99) {
        court.querySelector('h3').innerText = "遷讓房屋 (112年)";
        court.querySelector('.summary').innerText = "法院判決紀錄：積欠租金逾期未還，且有破壞房屋設備事實。";
        court.querySelector('.tag-row').innerHTML = `<span class="ui-tag" data-type="high-risk">遷讓房屋</span><span class="ui-tag" data-type="damage">拆房專家</span>`;
        user.style.display = "block";
        user.querySelector('h3').innerText = "民間回報 (113年)";
        user.querySelector('.summary').innerText = "前任房東回報：生活習慣極差，雜物佔用公共走道。";
        user.querySelector('.tag-row').innerHTML = `<span class="ui-tag" data-type="env">雜物領主</span>`;
    } else {
        court.querySelector('h3').innerText = "查無不良訴訟";
        court.querySelector('.summary').innerText = "大數據中未發現此對象有重大租賃違約紀錄。";
        court.querySelector('.tag-row').innerHTML = `<span class="ui-tag" data-type="angel">誠實房客</span>`;
        user.style.display = "none";
    }
}

// --- 6. 回報系統邏輯 ---
function setReportType(type) {
    currentReportType = type;
    selectedTags.clear();

    document.getElementById('btn-report-tenant').classList.toggle('active', type === 'tenant');
    document.getElementById('btn-report-landlord').classList.toggle('active', type === 'landlord');

    const nameLabel = type === 'tenant' ? '房客姓名' : '房東姓名';
    const ageLabel = type === 'tenant' ? '房客目測年齡' : '房東目測年齡';
    document.getElementById('lbl-name').innerHTML = `${nameLabel} <span class="required">*</span>`;
    document.getElementById('lbl-age').innerHTML = `${ageLabel} <span class="required">*</span>`;

    renderTags();
}

function renderTags() {
    const container = document.getElementById('tag-container');
    if (!container) return;
    container.innerHTML = '';

    TAG_LIBRARY[currentReportType].forEach(tag => {
        const chip = document.createElement('div');
        chip.className = 'tag-chip';
        chip.dataset.impact = tag.impact;
        const icon = tag.impact === 'good' ? '✨' : '⚠️';
        chip.innerText = `${icon} ${tag.text}`;

        chip.onclick = () => {
            if (selectedTags.has(tag.text)) {
                selectedTags.delete(tag.text);
                chip.classList.remove('selected');
            } else {
                selectedTags.add(tag.text);
                chip.classList.add('selected');
            }
        };
        container.appendChild(chip);
    });
}

async function submitReport() {
    const name = document.getElementById('report-name').value.trim();
    const age = document.getElementById('report-age').value;
    const phone = document.getElementById('report-phone').value.trim();

    if (!name || !age || phone.length !== 4) return alert("姓名、年齡、末四碼均為必填");
    if (selectedTags.size === 0) return alert("請至少選擇一個特徵標籤");

    switchView('view-loading');

    const hName = await hashData(name);
    const hPhone = await hashData(phone);

    const payload = {
        action: "report",
        type: currentReportType,
        hName: hName,
        hPhone: hPhone,
        ageRange: age,
        tags: Array.from(selectedTags),
        timestamp: new Date().toISOString()
    };

    console.log("🚀 [回報 Payload]:", payload);

    setTimeout(() => {
        alert("✅ 回報已完成加密傳輸。個資已於手機端銷毀。");
        resetApp();
    }, 1200);
}

// --- 7. 通用輔助函式 ---
function openReportView() {
    switchView('view-report');
    renderTags(); // 確保開啟時標籤已生成
}

function resetApp() {
    switchView('view-search');
    document.querySelectorAll('input').forEach(i => i.value = '');
    document.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
    document.getElementById('in-age').value = 'ALL';
    if (document.getElementById('report-age')) document.getElementById('report-age').value = '';
    selectedTags.clear();
}

// --- 8. 初始化 ---
window.onload = () => {
    // 預設渲染一次標籤
    renderTags();
};

// --- 9. 即時數據儀表板更新 ---
async function updateLiveStats() {
    try {
        // 未來正式上線時，將此 URL 替換為你的 GAS Web App URL
        // const GAS_URL = "你的_GAS_部署網址";
        // const response = await fetch(`${GAS_URL}?action=getStats`);
        // const data = await response.json();

        // 暫時模擬從後端抓取的動態行為
        const simulatedData = {
            courtCount: 5012345, // 這裡會隨著你 Sheets 增加而變動
            userCount: 1204      // 同上
        };

        // 更新 UI
        document.getElementById('stat-court-num').innerText = simulatedData.courtCount.toLocaleString();
        document.getElementById('stat-user-num').innerText = simulatedData.userCount.toLocaleString();

        console.log("📊 儀表板數據已同步更新");
    } catch (error) {
        console.error("無法更新儀表板數據:", error);
    }
}

// 修改初始化函式
window.onload = () => {
    renderTags();    // 渲染標籤
    updateLiveStats(); // 更新儀表板
};