// 大老二兄弟會活動報名系統 - 主應用程式邏輯
// 從 index.html 抽出的主要 JavaScript

// ==========================================
// 1. 設定與狀態
// ==========================================

// ★ 請替換為您的 Google Apps Script 網址
const GAS_URL = "https://script.google.com/macros/s/AKfycbzTiALv2VOAvtuUgFx623KQgkvlmkkEc-bSgFQXiLqcxWpi9FvSrSxkSibjdRwO7tVn/exec";

// ★ 請替換為您的 LIFF ID
const LIFF_ID = "2008678090-aXTesgDK";

// ★ 管理員 LineID 列表（管理員遊玩無限制且不作紀錄）
const ADMIN_USER_IDS = ["U612df670c4d7d3cde0d599ab5008451f"];

// 狀態變數
let appState = {
    events: [],
    settings: { organizers: [], locations: [] },
    user: { userId: '', displayName: '訪客', pictureUrl: '' },
    currentCategory: 'all',
    currentEvent: null,
    currentStats: {},
    currentRankTab: 'attendance',
    historyStack: ['home'],
    guestList: [],
    sponsorList: [],
    isDataLoaded: false,
    myRegistrations: [],
    attendanceRankings: [],
    jackpotRankings: [],
    rankingsTimer: null,
    rankingsTimeLeft: 3
};

// ★ 防重複提交鎖 + 離線佇列常數
let _isSubmitting = false;
const OFFLINE_QUEUE_KEY = 'offlineSubmitQueue';
const OFFLINE_QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 小時過期

// --- 詳細排行榜彈窗邏輯 ---
function openRankingsModal(type, event) {
    if (event) event.stopPropagation();

    const modal = document.getElementById('rankings-modal');
    if (modal) modal.classList.remove('hidden');

    appState.currentRankTab = type || 'attendance';
    switchRankTab(appState.currentRankTab);

    // 啟動 10 秒自動關閉計時器
    startRankingsAutoClose();
}

function closeRankingsModal() {
    const modal = document.getElementById('rankings-modal');
    if (modal && !modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
        stopRankingsAutoClose();
    }
}

function startRankingsAutoClose() {
    stopRankingsAutoClose();
    appState.rankingsTimeLeft = 10;
    const timerEl = document.getElementById('rank-close-timer');
    if (timerEl) timerEl.innerText = appState.rankingsTimeLeft;

    appState.rankingsTimer = setInterval(() => {
        appState.rankingsTimeLeft--;
        if (timerEl) timerEl.innerText = appState.rankingsTimeLeft;

        if (appState.rankingsTimeLeft <= 0) {
            closeRankingsModal();
        }
    }, 1000);
}

function stopRankingsAutoClose() {
    if (appState.rankingsTimer) {
        clearInterval(appState.rankingsTimer);
        appState.rankingsTimer = null;
    }
}

function switchRankTab(type) {
    appState.currentRankTab = type;
    const tabs = {
        attendance: document.getElementById('rank-tab-attendance'),
        jackpot: document.getElementById('rank-tab-jackpot')
    };

    Object.keys(tabs).forEach(k => {
        if (!tabs[k]) return;
        if (k === type) {
            tabs[k].classList.add('text-green-600', 'border-green-600', 'bg-white');
            tabs[k].classList.remove('text-gray-400', 'border-transparent');
        } else {
            tabs[k].classList.remove('text-green-600', 'border-green-600', 'bg-white');
            tabs[k].classList.add('text-gray-400', 'border-transparent');
        }
    });

    renderDetailedRankings();
    startRankingsAutoClose();
}

function renderDetailedRankings() {
    const container = document.getElementById('rankings-list-container');
    // ★ Bug 修正：container null 保護，防止 TypeError 白屏
    if (!container) return;
    const type = appState.currentRankTab;
    const data = type === 'attendance' ? appState.attendanceRankings : appState.jackpotRankings;

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-gray-400">
                <i data-lucide="info" class="w-8 h-8 mb-2 opacity-20"></i>
                <span class="text-xs">尚無排名數據</span>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    let html = '';
    data.forEach((item, index) => {
        const rank = index + 1;
        let rankIcon = '';
        if (rank === 1) rankIcon = '<span class="ranking-medal">🥇</span>';
        else if (rank === 2) rankIcon = '<span class="ranking-medal">🥈</span>';
        else if (rank === 3) rankIcon = '<span class="ranking-medal">🥉</span>';
        else rankIcon = `<span class="rank-number">${rank}</span>`;

        const valueLabel = type === 'attendance' ? `${item.count} 次` : `${item.score} 分`;
        const valueColor = type === 'attendance' ? 'text-amber-600' : 'text-green-600';

        html += `
            <div class="ranking-item flex items-center gap-3 p-3 rounded-2xl">
                <div class="flex-shrink-0 flex items-center justify-center min-w-[32px]">
                    ${rankIcon}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-bold text-gray-800 truncate">${escapeHtml(item.name)}</div>
                </div>
                <div class="text-xs font-black ${valueColor} whitespace-nowrap bg-gray-50 px-2.5 py-1 rounded-lg">
                    ${valueLabel}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    // 刷新 Lucide 圖示
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==========================================
// 小瑪莉遊戲 (Small Mary / Fruit Machine) 邏輯
// ==========================================
let maryState = {
    points: 0,
    monthlyGift: 0,
    jackpotPool: 0,
    totalMaryScore: 0,
    currentBet: {}, // { 'cherry': 5, 'orange': 2, ... }
    isSpinning: false,
    winScore: 0,
    lastResult: null,
    doubleUpActive: false,
    doubleUpScore: 0
};

const MARY_CONFIG = [
    { id: 'apple', label: '🍎', rate: 2, color: '#ff4444' }, // 🍎 2x
    { id: 'orange', label: '🍊', rate: 5, color: '#ffaa00' }, // 🍊 5x
    { id: 'mango', label: '🥭', rate: 10, color: '#ffee00' }, // 🥭 10x
    { id: 'bell', label: '🔔', rate: 20, color: '#ffdd00' }, // 🔔 20x
    { id: 'watermelon', label: '🍉', rate: 30, color: '#44ff44' }, // 🍉 30x
    { id: 'star', label: '🌟', rate: 40, color: '#ffff44' }, // 🌟 40x
    { id: 'seven', label: '7️⃣', rate: 50, color: '#ff2222' }, // 7️⃣ 50x
    { id: 'bar', label: 'BAR', rate: 100, color: '#44aaff' }, // BAR 100x
    { id: 'lucky', label: '🍀', rate: 0, color: '#00ffaa' }  // 送燈 / 小獎
];

// 轉盤順序 (24格) 經典佈局，最大獎在上下中，次獎在左右中
const MARY_GRID = [
    'apple', 'orange', 'mango', 'bar', 'bell', 'lucky', 'watermelon',
    'apple', 'star', 'seven', 'mango', 'bell',
    'orange', 'apple', 'mango', 'bar', 'bell', 'lucky', 'watermelon',
    'apple', 'star', 'seven', 'orange', 'bell'
];

async function openSmallMary() {
    if (!appState.user.userId) return showToast("請先登入 LINE");
    document.getElementById('small-mary-modal').classList.remove('hidden');
    initMaryBoard();
    initMaryBetPanel();
    await refreshMaryData();
    adjustMaryScale();
}

function adjustMaryScale() {
    const machine = document.getElementById('mary-machine');
    const modal = document.getElementById('small-mary-modal');
    if (!machine || !modal || modal.classList.contains('hidden')) return;

    // 確保先還原變形再測量真實大小
    machine.style.transform = 'none';

    // 利用 setTimeout 讓瀏覽器先重繪，確保取得最正確的 offsetHeight
    setTimeout(() => {
        const machineH = machine.offsetHeight || 680;
        const machineW = machine.offsetWidth || 420;

        const vh = window.innerHeight;
        const vw = window.innerWidth;

        // 預留上下邊界安全區 (避開 iOS 工具列與瀏海)
        const paddingY = 60; // 上下共預留 60px
        const paddingX = 20;

        let scale = 1;
        if (vh < machineH + paddingY) scale = (vh - paddingY) / machineH;
        if (vw < machineW + paddingX) scale = Math.min(scale, (vw - paddingX) / machineW);

        machine.style.transform = `scale(${scale})`;
        machine.style.transformOrigin = 'center center';
    }, 0);
}

window.addEventListener('resize', adjustMaryScale);

function closeSmallMary() {
    if (maryState.isSpinning) return;
    document.getElementById('small-mary-modal').classList.add('hidden');
}

// openMaryHelp 定義於下方（第 2713 行），此處不重複定義

async function refreshMaryData() {
    try {
        const res = await fetch(`${GAS_URL}?action=getSmallMaryData&userId=${appState.user.userId}&name=${encodeURIComponent(appState.user.displayName)}&_=${Date.now()}`);
        const data = await res.json();
        if (data.error) return showToast(data.error);

        maryState.points = data.points;
        maryState.monthlyGift = data.monthlyGift;
        maryState.totalMaryScore = data.totalMaryScore;
        maryState.jackpotPool = data.jackpotPool;

        // ★ 管理員模式：給予無限點數
        if (ADMIN_USER_IDS.includes(appState.user.userId)) {
            maryState.points = 999999;
            maryState.monthlyGift = 999999;
        }

        updateMaryUI();
    } catch (e) { console.error(e); }
}

function maryAddBet(id) {
    if (maryState.isSpinning || maryState.doubleUpActive) return;
    const totalBet = Object.values(maryState.currentBet).reduce((a, b) => a + b, 0);
    const userTotal = maryState.points + maryState.monthlyGift;
    if (totalBet >= userTotal) return showToast("點數不足");

    maryState.currentBet[id] = (maryState.currentBet[id] || 0) + 1;
    const valEl = document.getElementById(`mary-bet-val-${id}`);
    if (valEl) valEl.innerText = maryState.currentBet[id];
    updateMaryUI();
}

function maryClearBet() {
    if (maryState.isSpinning || maryState.doubleUpActive) return;
    maryState.currentBet = {};
    MARY_CONFIG.forEach(c => {
        const el = document.getElementById(`mary-bet-val-${c.id}`);
        if (el) el.innerText = '0';
    });
    updateMaryUI();
}

// 新增：隨機押注功能
function maryRandomBet() {
    if (maryState.isSpinning || maryState.doubleUpActive) return;
    const activeOptions = MARY_CONFIG.filter(c => c.rate > 0);
    if (activeOptions.length === 0) return;

    const userTotal = maryState.points + maryState.monthlyGift;
    let currentTotalBet = Object.values(maryState.currentBet).reduce((a, b) => a + b, 0);

    // 決定要押幾個不同圖案 (2~4種)
    const numSymbols = Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < numSymbols; i++) {
        const target = activeOptions[Math.floor(Math.random() * activeOptions.length)];
        const times = Math.floor(Math.random() * 3) + 1; // 各 1~3 注

        if (currentTotalBet + times > userTotal) break;

        maryState.currentBet[target.id] = (maryState.currentBet[target.id] || 0) + times;
        currentTotalBet += times;

        const valEl = document.getElementById(`mary-bet-val-${target.id}`);
        if (valEl) valEl.innerText = maryState.currentBet[target.id];
    }
    updateMaryUI();
}


function initMaryBoard() {
    const track = [
        // 上排 (7格: 1~7)
        { c: 1, r: 1 }, { c: 2, r: 1 }, { c: 3, r: 1 }, { c: 4, r: 1 }, { c: 5, r: 1 }, { c: 6, r: 1 }, { c: 7, r: 1 },
        // 右側 (5格: 2~6)
        { c: 7, r: 2 }, { c: 7, r: 3 }, { c: 7, r: 4 }, { c: 7, r: 5 }, { c: 7, r: 6 },
        // 下排 (7格: 7~1)
        { c: 7, r: 7 }, { c: 6, r: 7 }, { c: 5, r: 7 }, { c: 4, r: 7 }, { c: 3, r: 7 }, { c: 2, r: 7 }, { c: 1, r: 7 },
        // 左側 (5格: 6~2)
        { c: 1, r: 6 }, { c: 1, r: 5 }, { c: 1, r: 4 }, { c: 1, r: 3 }, { c: 1, r: 2 }
    ]; // 共 24 格

    const grid = document.getElementById('mary-track-grid');
    if (!grid) return;
    // 移除除中心 div 外的所有元素
    [...grid.children].forEach(ch => {
        if (ch.id !== 'mary-center') ch.remove();
    });

    MARY_GRID.forEach((id, i) => {
        const conf = MARY_CONFIG.find(c => c.id === id);
        const pos = track[i];
        const cell = document.createElement('div');
        cell.id = `mary-cell-${i}`;
        cell.className = 'flex flex-col items-center justify-center transition-all duration-75 relative rounded-sm overflow-hidden border border-white/5';
        cell.style.cssText = `
            grid-column: ${pos.c}; grid-row: ${pos.r};
            background: linear-gradient(135deg, #2a1810, #1a0f0a);
        `;
        cell.innerHTML = `
            <div id="mary-cell-sym-${i}" class="text-2xl leading-none select-none">${conf.label}</div>
        `;
        grid.appendChild(cell);
    });
    maryState._trackLen = MARY_GRID.length;
}

function initMaryBetPanel() {
    const panel = document.getElementById('mary-bet-panel');
    if (!panel) return;
    panel.innerHTML = '';
    // 過濾掉 Lucky
    MARY_CONFIG.filter(c => c.rate > 0).forEach(conf => {
        const btn = document.createElement('div');
        btn.className = 'flex flex-col items-center justify-center bg-black/60 border border-[#5a3a00] rounded-md py-1 px-0.5 cursor-pointer select-none active:brightness-125 transition-all';
        btn.innerHTML = `
            <div class="text-[8px] font-black text-[#ffcc00] mb-0.5">x${conf.rate}</div>
            <div class="text-xl leading-none mb-1">${conf.label}</div>
            <div id="mary-bet-val-${conf.id}" class="w-full bg-black text-[#ff4444] font-mono text-[10px] font-black text-center border border-[#333] rounded-sm py-0.5 shadow-[inset_0_0_5px_rgba(255,0,0,0.5)]">0</div>
        `;

        // 長按跳出數字鍵盤
        let pressTimer;
        let isLongPress = false;

        const startPress = (e) => {
            if (e.cancelable) e.preventDefault();
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                openMaryKeypad(conf.id, conf.label);
            }, 500); // 500ms 觸發長按
        };

        const stopPress = (e) => {
            if (e && e.cancelable) e.preventDefault();
            if (pressTimer) clearTimeout(pressTimer);

            // 短按 (未觸發長按) 且非移出/取消事件
            if (!isLongPress && e && e.type !== 'pointerleave' && e.type !== 'pointercancel' && e.type !== 'touchcancel') {
                maryAddBet(conf.id);
            }
        };

        btn.addEventListener('pointerdown', startPress);
        btn.addEventListener('pointerup', stopPress);
        btn.addEventListener('pointerleave', stopPress);
        btn.addEventListener('pointercancel', stopPress);
        btn.addEventListener('touchend', stopPress);
        btn.addEventListener('touchcancel', stopPress);
        btn.addEventListener('contextmenu', e => e.preventDefault());
        panel.appendChild(btn);
    });
}

// ==========================================
// 數字鍵盤 (Keypad) 邏輯
// ==========================================
let maryKeypadTargetId = null;

function openMaryKeypad(id, label) {
    if (maryState.isSpinning || maryState.doubleUpActive) return;
    maryKeypadTargetId = id;

    const overlay = document.getElementById('mary-keypad-overlay');
    const title = document.getElementById('mary-keypad-title');
    const input = document.getElementById('mary-keypad-input');

    if (overlay) overlay.classList.remove('hidden');
    if (title) title.innerText = `押注: ${label}`;

    const currentVal = maryState.currentBet[id] || 0;
    if (input) {
        input.value = currentVal > 0 ? currentVal : '';
        // 若為手機原生鍵盤體驗，也可加入 input.focus()
    }
}

function maryCloseKeypad() {
    const overlay = document.getElementById('mary-keypad-overlay');
    if (overlay) overlay.classList.add('hidden');
    maryKeypadTargetId = null;
}

function maryKeypadType(num) {
    const input = document.getElementById('mary-keypad-input');
    if (input) {
        const current = input.value;
        if (current === '0' || current === '') {
            input.value = num;
        } else {
            if (current.length < 6) { // 限制輸入長度
                input.value = current + num;
            }
        }
        maryKeypadValidate();
    }
}

function maryKeypadClear() {
    const input = document.getElementById('mary-keypad-input');
    if (input) {
        input.value = '';
    }
}

function maryKeypadValidate() {
    const input = document.getElementById('mary-keypad-input');
    if (!input || !maryKeypadTargetId) return;

    let val = parseInt(input.value, 10);
    if (isNaN(val) || val < 0) return; // 容許輸入中暫時為空

    const totalBetExcludingTarget = Object.keys(maryState.currentBet).reduce((sum, key) => {
        return key === maryKeypadTargetId ? sum : sum + maryState.currentBet[key];
    }, 0);

    const userTotal = maryState.points + maryState.monthlyGift;
    const maxAvailable = userTotal - totalBetExcludingTarget;

    if (val > maxAvailable) {
        input.value = maxAvailable > 0 ? maxAvailable : 0;
        showToast("最多只能押到可用餘額上限");
    }
}

function maryKeypadMax() {
    if (!maryKeypadTargetId) return;
    const input = document.getElementById('mary-keypad-input');
    if (input) {
        const totalBetExcludingTarget = Object.keys(maryState.currentBet).reduce((sum, key) => {
            return key === maryKeypadTargetId ? sum : sum + maryState.currentBet[key];
        }, 0);
        const userTotal = maryState.points + maryState.monthlyGift;
        let maxAvailable = userTotal - totalBetExcludingTarget;
        if (maxAvailable < 0) maxAvailable = 0;

        input.value = maxAvailable;
        maryKeypadValidate();
    }
}

function maryKeypadConfirm() {
    if (!maryKeypadTargetId) {
        maryCloseKeypad();
        return;
    }

    const input = document.getElementById('mary-keypad-input');
    let val = parseInt(input.value, 10);
    if (isNaN(val) || val < 0) val = 0;

    const totalBetExcludingTarget = Object.keys(maryState.currentBet).reduce((sum, key) => {
        return key === maryKeypadTargetId ? sum : sum + maryState.currentBet[key];
    }, 0);
    const userTotal = maryState.points + maryState.monthlyGift;

    if (totalBetExcludingTarget + val > userTotal) {
        val = userTotal - totalBetExcludingTarget;
    }

    if (val > 0) {
        maryState.currentBet[maryKeypadTargetId] = val;
    } else {
        delete maryState.currentBet[maryKeypadTargetId];
    }

    const valEl = document.getElementById(`mary-bet-val-${maryKeypadTargetId}`);
    if (valEl) valEl.innerText = val;

    updateMaryUI();
    maryCloseKeypad();
}

function updateMaryUI() {
    const winEl = document.getElementById('mary-win-score');
    const pointsEl = document.getElementById('mary-my-points');
    const giftEl = document.getElementById('mary-gift-points');
    const jackpotEl = document.getElementById('mary-jackpot-pool');
    const centerNumEl = document.getElementById('mary-center-num');

    // 計算已押注總額，Credit 即時反映剩餘可用點數
    const betPoints = Object.values(maryState.currentBet).reduce((a, b) => a + b, 0);
    const total = (maryState.points + maryState.monthlyGift);
    const displayCredit = Math.max(0, total - betPoints);
    if (pointsEl) pointsEl.innerText = displayCredit.toString().padStart(4, '0');
    if (giftEl) giftEl.innerText = `贈分: ${maryState.monthlyGift}`;
    if (jackpotEl) jackpotEl.innerText = `🎰 彩金池: ${maryState.jackpotPool || 0}`;

    if (winEl) winEl.innerText = maryState.winScore.toString().padStart(4, '0');
    if (centerNumEl) centerNumEl.innerText = maryState.winScore > 0 ? maryState.winScore : '0';

    const startBtn = document.getElementById('mary-btn-start');
    if (startBtn) {
        // 旋轉中、或比大小狀態（等待玩家決定）時鎖定 START
        const noBet = Object.values(maryState.currentBet).every(v => v === 0);
        startBtn.disabled = maryState.isSpinning || maryState.doubleUpActive || (total <= 0 && noBet);
    }
}

const highlight = (idx, on, force = false) => {
    const cell = document.getElementById(`mary-cell-${idx}`);
    if (!cell) return;

    // ★ 新增：保護不死燈號
    if (!on && !force && maryState.keepLights && maryState.keepLights.includes(idx)) return;

    if (on) {
        cell.style.background = 'linear-gradient(135deg, #ffcc00, #ff8800)';
        cell.style.boxShadow = '0 0 15px #ffaa00, inset 0 0 10px rgba(255,255,255,0.5)';
        cell.style.transform = 'scale(1.1)';
        cell.style.zIndex = '10';
        cell.style.borderColor = '#fff';
    } else {
        cell.style.background = 'linear-gradient(135deg, #2a1810, #1a0f0a)';
        cell.style.boxShadow = 'none';
        cell.style.transform = 'scale(1)';
        cell.style.zIndex = '1';
        cell.style.borderColor = 'rgba(255,255,255,0.05)';
    }
};

// 記錄當前光標位置
let maryCurrentPos = 0;

async function maryStartSpin() {
    if (maryState.isSpinning || maryState.doubleUpActive) return;

    // ★ 清除前一局殘留的送燈
    if (maryState.keepLights) {
        maryState.keepLights.forEach(idx => highlight(idx, false, true)); // force clear
    }
    maryState.keepLights = [];

    const betPoints = Object.values(maryState.currentBet).reduce((a, b) => a + b, 0);
    if (betPoints <= 0) return showToast("請先選符號壓注");

    maryState.isSpinning = true;
    document.getElementById('mary-btn-start').disabled = true;
    // ★ Bug 修正：用 try/finally 確保 isSpinning 一定會被解鎖，
    //   防止網路異常或例外導致遊戲永久卡死
    try {

    // (下注面板歸零已移至遊戲結束後)

    const trackLen = MARY_GRID.length; // 24

    // ★ 動態權重開獎系統 (精準控制 25% 中獎率與 RTP，但大獎獨立)
    let isWin = false;
    const betSymbols = Object.keys(maryState.currentBet).filter(id => (maryState.currentBet[id] || 0) > 0);

    // ★ 新需求：全項目押注中小獎機率上升
    let winRate = 0.25; // 基礎 25%
    const maxOptions = MARY_CONFIG.filter(c => c.rate > 0).length; // 8項
    if (betSymbols.length >= maxOptions) {
        winRate = 0.50; // 全押時提升到 50%
    } else if (betSymbols.length >= maxOptions - 2) {
        winRate = 0.35; // 押注 6 項以上提升到 35%
    }

    // 中獎判定
    if (betSymbols.length > 0 && Math.random() < winRate) {
        isWin = true;
    }

    // ★ 使用者指定精準權重映射表 (中獎時的權重)
    const weightMap = {
        'apple': 50,  // 最容易中
        'orange': 10,
        'mango': 5,
        'bell': 4,
        'star': 3,
        'watermelon': 2,
        'seven': 0.5, // 七 (極稀有)
        'bar': 0.2  // BAR (神話級)
    };

    // ★ 新增：幸運奇蹟判定 (1.5% 機率無視風控開大獎)
    const isLuckyMiracle = Math.random() < 0.015;

    let weights = [];
    for (let i = 0; i < trackLen; i++) {
        const sym = MARY_GRID[i];
        const conf = MARY_CONFIG.find(c => c.id === sym);
        const betAmt = maryState.currentBet[sym] || 0;

        let w = weightMap[sym] || 1;

        // ★ 風控邏輯：大注判定 (單項押注 ≥ 20 點)
        if (betAmt >= 20 && !isLuckyMiracle) {
            // 非奇蹟時：除了蘋果，其餘大額投注項目的權重強制下壓
            if (sym !== 'apple') {
                w = Math.max(0.1, w / 5);
            } else {
                // 蘋果在大額押注時權重反而加倍 (引導至最小賠率獎)
                w = 200;
            }
        } else if (isLuckyMiracle) {
            // 幸運奇蹟發生時：提高大獎格權重 (驚喜感)
            if (sym === 'bar' || sym === 'seven' || sym === 'star') {
                w = w * 10;
            }
        }

        // ★ 使用者特殊要求：大獎隔離判定
        if (sym === 'bar' || sym === 'seven') {
            // 保留極稀有機率，不受 isWin 限制
            weights.push(isLuckyMiracle ? w : w * 0.5);
        } else if (isWin) {
            // 中獎：只從有押注的中小獎項中依據 weightMap 挑選
            if (betAmt > 0 && conf && conf.rate > 0) {
                // 若中獎且有押蘋果，蘋果權重加強 (保本機制)
                if (sym === 'apple') w = 200;
                weights.push(w);
            } else {
                weights.push(0);
            }
        } else {
            // 沒中獎：挑選沒押注的項目或送燈
            if (betAmt === 0) {
                if (sym === 'lucky') {
                    const betCount = betSymbols.length;
                    const maxOptions = MARY_CONFIG.filter(c => c.rate > 0).length; // 8項
                    w = (betCount >= maxOptions - 2) ? 1 : 10;
                    weights.push(w);
                } else {
                    weights.push(30);
                }
            } else {
                weights.push(0);
            }
        }
    }

    let totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) {
        // 預防萬一：所有權重都是 0 時，退回全隨機
        weights = weights.map(() => 10);
        totalWeight = weights.reduce((a, b) => a + b, 0);
    }
    // ★ 加入底限：確保大獎（BAR/7）在整體池中占比極低（< 0.5%）
    const bigPrizeCount = weights.filter((w, i) => MARY_GRID[i] === 'bar' || MARY_GRID[i] === 'seven')
        .reduce((a, b) => a + b, 0);
    const minTotal = bigPrizeCount * 200; // 大獎格佔比不超過 1/200
    if (totalWeight < minTotal) {
        const pad = minTotal - totalWeight;
        // 將差額平均補到非大獎格
        const nonBigIdxs = weights.map((w, i) => (MARY_GRID[i] !== 'bar' && MARY_GRID[i] !== 'seven') ? i : -1).filter(i => i >= 0);
        if (nonBigIdxs.length > 0) {
            const addEach = Math.ceil(pad / nonBigIdxs.length);
            nonBigIdxs.forEach(i => { weights[i] += addEach; });
            totalWeight = weights.reduce((a, b) => a + b, 0);
        }
    }

    // 抽籤決定目標
    let rand = Math.random() * totalWeight;
    let targetIdx = 0;
    for (let i = 0; i < trackLen; i++) {
        if (rand < weights[i]) {
            targetIdx = i;
            break;
        }
        rand -= weights[i];
    }

    const targetId = MARY_GRID[targetIdx];
    const targetConfig = MARY_CONFIG.find(c => c.id === targetId);

    // 獨立的旋轉動畫函數
    const doSpinAnim = async (tIdx, baseMinRounds = 2, baseDelay = 60) => {
        const startPos = maryCurrentPos;
        let stepsToTarget = (tIdx - startPos + trackLen) % trackLen;
        if (stepsToTarget === 0) stepsToTarget = trackLen;
        const totalSteps = baseMinRounds * trackLen + stepsToTarget;

        let delay = baseDelay;
        for (let step = 0; step < totalSteps; step++) {
            const pos = (startPos + step) % trackLen;
            const prevPos = (startPos + step - 1 + trackLen) % trackLen;
            highlight(prevPos, false);
            highlight(pos, true);
            maryCurrentPos = pos;

            const remaining = totalSteps - step;
            if (remaining <= 10) delay = baseDelay + (10 - remaining) * 20;
            else if (remaining <= 25) delay = baseDelay + (25 - remaining) * 5;

            await new Promise(r => setTimeout(r, delay));
        }
        highlight(maryCurrentPos, false);
        highlight(tIdx, true);
        maryCurrentPos = tIdx;
    };

    // 第 1 次旋轉
    await doSpinAnim(targetIdx, 2, 50);
    maryState.keepLights.push(targetIdx); // 保護第一個中獎格

    let winScore = (maryState.currentBet[targetId] || 0) * targetConfig.rate;
    let displayMsg = targetConfig.label;

    // ★ 雙重送燈機制 (Lucky Star)
    if (targetId === 'lucky') {
        showToast("🍀 送兩燈！");
        await new Promise(r => setTimeout(r, 600)); // 停頓一下再送

        for (let i = 0; i < 2; i++) {
            // 第 2, 3 次旋轉 (快速跑圈，1圈，稍快)
            // 為了有趣，送燈時隨機送大獎以外的圖案
            let extraTargetIdx = Math.floor(Math.random() * trackLen);
            const extraSym = MARY_GRID[extraTargetIdx];
            if (extraSym === 'bar' || extraSym === 'seven' || extraSym === 'lucky') {
                extraTargetIdx = (extraTargetIdx + 1) % trackLen; // 避開大獎死板防錯
                if (MARY_GRID[extraTargetIdx] === 'bar' || MARY_GRID[extraTargetIdx] === 'seven') {
                    extraTargetIdx = (extraTargetIdx + 1) % trackLen;
                }
            }

            await doSpinAnim(extraTargetIdx, 1, 30);
            maryState.keepLights.push(extraTargetIdx); // 保護送的燈號

            const extraTargetId = MARY_GRID[extraTargetIdx];
            const extraTargetConfig = MARY_CONFIG.find(c => c.id === extraTargetId);

            // 累加分數
            if (extraTargetId !== 'lucky') {
                let extraWin = (maryState.currentBet[extraTargetId] || 0) * extraTargetConfig.rate;
                winScore += extraWin;
            }

            // 讓多個中獎格都保持發亮
            highlight(extraTargetIdx, true);
            await new Promise(r => setTimeout(r, 400));
        }
    }

    maryState.isSpinning = false;
    maryState.winScore = winScore;

    // 中獎格閃爍
    if (winScore > 0) {
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
            const targetsToBlink = maryState.keepLights.length > 0 ? maryState.keepLights : [targetIdx];
            targetsToBlink.forEach(idx => highlight(idx, blinkCount % 2 === 0, true));
            blinkCount++;
            if (blinkCount >= 8) clearInterval(blinkInterval);
        }, 180);
    }

    // 同步後端
    try {
        const res = await apiSubmit({
            action: 'playSmallMary',
            userId: appState.user.userId,
            betPoints,
            winPoints: winScore,
            symbol: displayMsg
        });
        if (res && res.success) {
            // ★ Bug 修正：管理員模式不覆蓋本地點數（避免 999999 被後端真實值覆蓋）
            if (!ADMIN_USER_IDS.includes(appState.user?.userId)) {
                maryState.points = res.points;
                maryState.monthlyGift = res.monthlyGift;
            }
            maryState.totalMaryScore = res.totalMaryScore;
            if (res.jackpotPool !== undefined) maryState.jackpotPool = res.jackpotPool;
            updateMaryUI();
        }
    } catch (e) { console.error(e); }

    if (winScore > 0) {
        // 手機震動 (若中最大獎 BAR)
        if (targetId === 'bar' && navigator.vibrate) {
            navigator.vibrate([500, 200, 500]);
        }

        showToast(`🎊 中獎！${displayMsg} 獲得 ${winScore} 分`);
        const db = document.getElementById('mary-double-btns');
        if (db) {
            db.classList.remove('hidden');
            db.style.display = 'flex';
            const btns = db.querySelectorAll('button');
            if (btns[2]) btns[2].textContent = '領獎';
        }
        maryState.doubleUpActive = true;
        maryState.doubleUpStreak = 0; // ★ 重置過關計數

        // ★ 3 秒後未操作自動領獎
        if (maryState._autoCollectTimer) clearTimeout(maryState._autoCollectTimer);
        maryState._autoCollectTimer = setTimeout(() => {
            if (maryState.doubleUpActive && !maryState.isSpinning) {
                maryCollect();
            }
        }, 3000);
    } else {
        maryClearBet();
        maryState.winScore = 0;
        maryState.doubleUpStreak = 0;
        document.getElementById('mary-btn-start').disabled = false;
        showToast(`未中獎 — 落在 ${displayMsg}，再試一次！`);
    }
    } finally {
        // ★ Bug 修正：確保 isSpinning 一定被解鎖（try/finally 配對）
        // 注意：正常流程已在 maryState.isSpinning = false 這行設好，
        // finally 只在例外發生時起作用，雙重保險
        if (maryState.isSpinning) maryState.isSpinning = false;
    }
}

async function maryDoubleUp(choice) {
    if (!maryState.doubleUpActive || maryState.isSpinning) return;
    // 玩家有操作，清除自動領獎計時器
    if (maryState._autoCollectTimer) { clearTimeout(maryState._autoCollectTimer); maryState._autoCollectTimer = null; }

    // 鎖定按鈕防止重複按
    const dbContainer = document.getElementById('mary-double-btns');
    if (dbContainer) dbContainer.style.pointerEvents = 'none';

    // ★ 新需求：自訂各階段勝率控制
    let winProb = 0.50; // 第 1 把 (streak = 0)
    if (maryState.doubleUpStreak === 1) winProb = 0.40;      // 第 2 把
    else if (maryState.doubleUpStreak === 2) winProb = 0.30; // 第 3 把
    else if (maryState.doubleUpStreak === 3) winProb = 0.05; // 第 4 把
    else if (maryState.doubleUpStreak >= 4) winProb = 0.001; // 第 5 把 (過五關)

    let isForceWin = Math.random() < winProb;
    let num;

    if (isForceWin) {
        // 讓玩家贏：開出符合玩家猜測的數字
        if (choice === 'small') {
            num = Math.floor(Math.random() * 6) + 1; // 1-6
        } else {
            num = Math.floor(Math.random() * 6) + 8; // 8-13
        }
    } else {
        // 讓玩家輸：隨機開出莊家通殺(7)或是相反的數字
        if (Math.random() < 0.3) {
            num = 7; // 通殺
        } else {
            if (choice === 'small') {
                num = Math.floor(Math.random() * 6) + 8; // 猜小開大
            } else {
                num = Math.floor(Math.random() * 6) + 1;  // 猜大開小
            }
        }
    }

    const numEl = document.getElementById('mary-double-number');
    const numDisplay = document.getElementById('mary-double-num-display');
    if (numEl) numEl.innerText = num;
    if (numDisplay) numDisplay.classList.remove('hidden');

    const btnSmall = document.getElementById('btn-mary-small');
    const btnBig = document.getElementById('btn-mary-big');

    // ★ 修正 F5：在修改 winScore 前先保存本局金額，讓後端能正確收到輸掉/贏得的金額
    const winBeforeChange = maryState.winScore;

    let win = false;
    if (num === 7) {
        win = false; // 莊家通殺
    } else if (choice === 'small' && num <= 6) {
        win = true;
    } else if (choice === 'big' && num >= 8) {
        win = true;
    }

    if (win) {
        maryState.winScore *= 2;
        maryState.doubleUpStreak = (maryState.doubleUpStreak || 0) + 1; // 記錄連勝
        if (choice === 'big') {
            if (btnBig) btnBig.classList.add('brightness-150', 'scale-110', 'ring-4', 'ring-white');
            if (btnSmall) btnSmall.classList.add('opacity-30', 'grayscale');
        } else {
            if (btnSmall) btnSmall.classList.add('brightness-150', 'scale-110', 'ring-4', 'ring-white');
            if (btnBig) btnBig.classList.add('opacity-30', 'grayscale');
        }
    } else {
        maryState.winScore = 0;
        maryState.doubleUpStreak = 0; // 失敗歸零
        maryState.doubleUpActive = false;
        if (btnBig) btnBig.classList.add('opacity-30', 'grayscale');
        if (btnSmall) btnSmall.classList.add('opacity-30', 'grayscale');
        maryClearBet();
    }

    // 即時更新領獎按鈕的數字，避免等待動畫的 800ms 期間顯示舊數字
    const immediateDb = document.getElementById('mary-double-btns');
    if (immediateDb) {
        const immediateBtns = immediateDb.querySelectorAll('button');
        if (immediateBtns[2]) {
            if (maryState.winScore > 0) {
                immediateBtns[2].textContent = `✅ 領獎 (${maryState.winScore})`;
            } else {
                immediateBtns[2].textContent = '領獎';
            }
        }
    }

    updateMaryUI();

    // 同步至後端
    // ★ BUG 7 修正：過五關（streak >= 5）時，後續會呼叫 claimSmallMaryJackpot，
    // 其後端內部也呼叫 playSmallMary，為避免雙重計分，此處跳過 playSmallMary。
    // ★ F5 說明：使用 winBeforeChange（修改前的金額）傳後端
    //   - 贏：doubleWin = maryState.winScore（翻倍後），後端累加 MaryScore
    //   - 輸：doubleWin = -winBeforeChange（負數），後端可正確計算輸掉的金額並補彩金池
    const willTriggerJackpot = win && (maryState.doubleUpStreak >= 5);
    if (!willTriggerJackpot) {
        try {
            const res = await apiSubmit({
                action: 'playSmallMary',
                userId: appState.user.userId,
                betPoints: 0,
                isDoubleUp: true,
                doubleWin: win ? maryState.winScore : -winBeforeChange,
                symbol: win ? `大小翻倍×2` : `大小輸(開${num})`
            });
            if (res && res.success) {
                maryState.points = res.points;
                maryState.monthlyGift = res.monthlyGift;
                if (res.jackpotPool !== undefined) maryState.jackpotPool = res.jackpotPool;
            }
        } catch (e) { console.error(e); }
    }

    setTimeout(async () => {
        if (numDisplay) numDisplay.classList.add('hidden');
        const classesToRemove = ['brightness-150', 'scale-110', 'ring-4', 'ring-white', 'opacity-30', 'grayscale'];
        if (btnBig) btnBig.classList.remove(...classesToRemove);
        if (btnSmall) btnSmall.classList.remove(...classesToRemove);

        if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // 恢復點擊

        // ★ 過五關斬將彩池觸發
        if (win && maryState.doubleUpStreak >= 5) {
            maryState.doubleUpStreak = 0; // 重置
            const dbBtnsJP = document.getElementById('mary-double-btns');
            if (dbBtnsJP) { dbBtnsJP.classList.add('hidden'); dbBtnsJP.style.pointerEvents = 'auto'; }
            if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ★ 恢復 pointerEvents
            showToast("🎉 恭喜！過五關斬將，觸發彩池大獎！正在結算中...", 4000);

            try {
                const res = await apiSubmit({
                    action: 'claimSmallMaryJackpot',
                    userId: appState.user.userId,
                    name: appState.user.displayName // ★ BUG 3 修正：應為 displayName，非 name
                });
                if (res.success) {
                    // ★ 修正 F3：claimSmallMaryJackpot 後端已記帳完畢（內部呼叫 playSmallMary）
                    // 直接更新前端狀態，不再呼叫 maryCollect()（避免再次送 playSmallMary 導致彩金雙重記入）
                    maryState.winScore += res.jackpotWon; // 加上彩金用於前端動畫
                    showToast(`🎰 狂賀！獨得彩池 ${res.jackpotWon} 分！總合 ${maryState.winScore} 分！`, 5000);

                    // 直接更新後端回傳的正確點數
                    if (res.points !== undefined) maryState.points = res.points;
                    if (res.monthlyGift !== undefined) maryState.monthlyGift = res.monthlyGift;
                    if (res.totalMaryScore !== undefined) maryState.totalMaryScore = res.totalMaryScore;
                } else {
                    showToast(`⚠️ 彩池提示：${res.error || '未知的錯誤'}`, 3000);
                }
            } catch (e) {
                console.error("領取彩池失敗", e);
            }

            // 清除比大小 UI
            maryState.doubleUpActive = false;
            maryState.isSpinning = false;
            maryState.winScore = 0;
            maryClearBet();
            updateMaryUI();
            document.getElementById('mary-btn-start').disabled = false;
            return;
        }

        if (!maryState.doubleUpActive) {
            maryState.isSpinning = false;
            maryState.winScore = 0;

            // 隱藏整個雙倍區按鈕
            const dbBtnsLose = document.getElementById('mary-double-btns');
            if (dbBtnsLose) {
                dbBtnsLose.classList.add('hidden');
                dbBtnsLose.style.pointerEvents = 'auto'; // ★ 修復：恢復 pointerEvents，防止下局殘留
            }
            if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ★ 同步恢復原始參照

            updateMaryUI();
            document.getElementById('mary-btn-start').disabled = false;
        } else {
            const db = document.getElementById('mary-double-btns');
            if (db) {
                const btns = db.querySelectorAll('button');
                if (btns[2]) {
                    btns[2].textContent = `✅ 領獎 (${maryState.winScore})`;
                    btns[2].style.pointerEvents = 'auto'; // 強制領獎按鈕可點
                }
            }
        }
    }, 800); // 800ms
}

// 領獎
async function maryCollect() {
    if (maryState.isSpinning || !maryState.doubleUpActive || maryState.winScore <= 0) return;
    // 清除自動領獎計時器（若為手動觸發）
    if (maryState._autoCollectTimer) { clearTimeout(maryState._autoCollectTimer); maryState._autoCollectTimer = null; }

    maryState.doubleUpActive = false; // 立即標記，防止重複領
    const win = maryState.winScore;
    const startPoints = maryState.points;
    let targetPoints = startPoints + win;

    // 隱藏按鈕區
    const dbBtns = document.getElementById('mary-double-btns');
    if (dbBtns) {
        dbBtns.classList.add('hidden');
        dbBtns.style.display = 'none';
    }
    document.getElementById('mary-double-result').classList.add('hidden');

    // ★ 修正 F4：用旗標追蹤後端是否成功，失敗時不以前端預算覆蓋點數
    let backendOk = false;
    try {
        const res = await apiSubmit({
            action: 'playSmallMary',
            userId: appState.user.userId,
            betPoints: 0,
            winPoints: win,
            symbol: '領獎'
        });

        if (res && res.success) {
            targetPoints = res.points;
            maryState.monthlyGift = res.monthlyGift;
            backendOk = true;
        } else {
            showToast(`⚠️ 領獎同步失敗：${res?.error || '伺服器無回應'}，請重試`, 3000);
        }
    } catch (e) {
        console.error(e);
        showToast('❌ 領獎通訊異常，請稍後重試', 3000);
    }

    // 若後端失敗，還原 doubleUpActive 讓玩家可以重試領獎
    if (!backendOk) {
        maryState.doubleUpActive = true;
        maryState.winScore = win; // 還原 winScore
        if (dbBtns) {
            dbBtns.classList.remove('hidden');
            dbBtns.style.display = 'flex';
        }
        document.getElementById('mary-btn-start').disabled = false;
        return;
    }

    // ★ 分數動畫移轉：依金額動態決定步進大小
    // ≤30 → 個位數(1)；31-100 → 十位數(10)；>100 → 百位數(100)
    let stepAmount;
    if (win <= 30) {
        stepAmount = 1;
    } else if (win <= 100) {
        stepAmount = 10;
    } else {
        stepAmount = 100;
    }
    const intervalMs = 40; // 固定間隔 40ms（視覺流暢且不拖延）
    let currentWin = win;
    let currentPt = startPoints;

    const interval = setInterval(() => {
        const chunk = Math.min(stepAmount, currentWin);
        currentWin -= chunk;
        currentPt += chunk;

        maryState.winScore = currentWin;
        maryState.points = currentPt;
        updateMaryUI();

        if (currentWin <= 0) {
            clearInterval(interval);
            maryState.winScore = 0;
            maryState.points = targetPoints; // 校正回歸後端正確值
            maryState.isSpinning = false;
            maryState.doubleUpActive = false;
            maryClearBet(); // ★ 領獎後清空下注，下一局需重新押注
            updateMaryUI();
            showToast(`✅ 已領獎 ${win} 分！`);
            document.getElementById('mary-btn-start').disabled = false;
        }
    }, intervalMs);
}

// 兌換（加速開窗版）
function maryExchange() {
    if (maryState.isSpinning || maryState.doubleUpActive) return;

    const overlay = document.createElement('div');
    overlay.id = 'mary-exchange-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.95);border-radius:24px;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;';
    overlay.innerHTML = `
        <div style="font-size:16px;font-weight:900;color:#ffcc00;">💱 拉霸分 10:1 兌換</div>
        <div style="background:#111;border:1px solid #ff6600;border-radius:10px;padding:10px 16px;width:100%;text-align:center;">
            <div style="font-size:10px;color:#ff6600;margin-bottom:4px;letter-spacing:2px;">YOU HAVE</div>
            <div id="mary-exchange-slot-score" style="font-size:28px;font-weight:900;color:#fa0;font-family:monospace;" class="animate-pulse">讀取中...</div>
            <div style="font-size:10px;color:#888;">拉霸積分</div>
        </div>
        <div style="color:#ccc;font-size:11px;text-align:center;">
            最多可換 <b id="mary-exchange-max-convert" style="color:#0f0;">---</b> 點小瑪莉點數<br>
            <span style="color:#666;font-size:10px;">（10 拉霸分 → 1 小瑪莉點）</span>
        </div>
        <input id="mary-exchange-input" type="number" inputmode="numeric" pattern="[0-9]*" min="10" step="10" placeholder="等候讀取..."
            style="width:100%;background:rgba(255,255,255,0.08);border:1px solid #fa0;border-radius:10px;
            padding:10px;color:#fa0;text-align:center;font-size:18px;font-weight:900;font-family:monospace;
            outline:none;" disabled>
        <div style="font-size:10px;color:#555;">最小 10 分，請輸入 10 的倍數</div>
        <div style="display:flex;gap:10px;width:100%;">
            <button onclick="document.getElementById('mary-exchange-overlay').remove()"
                style="flex:1;padding:12px;background:rgba(255,255,255,0.1);border:none;border-radius:10px;
                color:#ccc;font-weight:700;font-size:13px;cursor:pointer;">取消</button>
            <button id="mary-exchange-btn-confirm" onclick="maryConfirmExchange()" disabled
                style="flex:2;padding:12px;background:linear-gradient(135deg,#663300,#995500);
                border:none;border-radius:10px;color:#ccc;font-weight:900;font-size:13px;cursor:not-allowed;
                box-shadow:none;transition:all 0.3s;">確認兌換</button>
        </div>
    `;
    document.getElementById('mary-machine').appendChild(overlay);

    // 背景讀取分數
    fetch(`${GAS_URL}?action=getUserSlotScore&userId=${appState.user.userId}&_=${Date.now()}`)
        .then(r => r.json())
        .then(d => {
            const slotScore = d.slotScore || 0;
            const maxConvert = Math.floor(slotScore / 10) * 10;
            const maryPoints = Math.floor(maxConvert / 10);

            const scoreEl = document.getElementById('mary-exchange-slot-score');
            const maxEl = document.getElementById('mary-exchange-max-convert');
            const inputEl = document.getElementById('mary-exchange-input');
            const btnEl = document.getElementById('mary-exchange-btn-confirm');

            if (scoreEl) {
                scoreEl.classList.remove('animate-pulse');
                scoreEl.innerText = slotScore.toLocaleString();
            }
            if (maxEl) maxEl.innerText = maryPoints.toLocaleString();
            if (inputEl) {
                inputEl.placeholder = "請輸入";
                inputEl.max = maxConvert; // ★ 修正 F1：上限改為可兌換的整數最大值
                if (maxConvert > 0) {
                    inputEl.value = maxConvert;
                    inputEl.disabled = false;
                }
            }
            if (btnEl) {
                if (maxConvert >= 10) {
                    btnEl.disabled = false;
                    btnEl.style.background = 'linear-gradient(135deg,#cc6600,#ffaa00)';
                    btnEl.style.color = '#000';
                    btnEl.style.cursor = 'pointer';
                    btnEl.style.boxShadow = '0 0 15px rgba(255,150,0,0.4)';
                } else {
                    btnEl.innerText = "分數不足";
                }
            }
        })
        .catch(e => {
            const scoreEl = document.getElementById('mary-exchange-slot-score');
            if (scoreEl) {
                scoreEl.classList.remove('animate-pulse');
                scoreEl.innerText = '讀取失敗';
                scoreEl.style.color = 'red';
            }
        });
}

function openMaryHelp() {
    const el = document.getElementById('mary-help-overlay');
    if (el) el.classList.remove('hidden');
}

async function maryConfirmExchange() {
    const input = document.getElementById('mary-exchange-input');
    const val = parseInt(input ? input.value : 0);
    if (!val || isNaN(val) || val < 10) return showToast('請輸入合法的分數（最小 10）');
    const roundedVal = Math.floor(val / 10) * 10;

    // ★ 優化：增加前端餘額判斷防呆
    const maxConvertStr = document.getElementById('mary-exchange-max-convert')?.innerText;
    const maxConvert = parseInt(maxConvertStr?.replace(/,/g, '')) || 0;
    if (roundedVal > (maxConvert * 10)) return showToast('兌換點數超過可用餘額');

    const overlay = document.getElementById('mary-exchange-overlay');
    if (overlay) {
        overlay.innerHTML = `<div class="flex flex-col items-center gap-4"><div class="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div><div class="text-amber-500 font-bold">正在處理兌換...</div></div>`;
    }

    try {
        const res = await apiSubmit({
            action: 'exchangeSlotToMary',
            userId: appState.user.userId,
            name: appState.user.displayName,
            exchangeScore: roundedVal
        });
        if (overlay) overlay.remove();
        if (res && res.success) {
            showToast(`✅ 成功兌換 ${res.addedPoints} 小瑪莉點數`);
            maryState.points += res.addedPoints;
            updateMaryUI();
        } else {
            showToast(res ? (res.error || '兌換失敗，請確認拉霸分數是否尚充足') : '伺服器無回應');
        }
    } catch (e) {
        if (overlay) overlay.remove();
        console.error(e);
        showToast('❌ 發生異常錯誤，請稍後再試');
    }
}

/** HTML 跳脫：防止使用者輸入的 XSS 攻擊 */
function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

/** 統一欄位鍵值映射表 */
const FIELD_KEYS = {
    family: ['family', 'Family', '眷屬', '眷屬人數', 'FamilyCount'],
    tableCount: ['tableCount', 'TableCount', 'Table Count', '認桌數量', '認桌'],
    room: ['room', 'RoomType', 'Room Type', '房型'],
    pickup: ['pickup', 'Pickup', '上車地點'],
    sponsor: ['sponsorList', 'sponsor', 'Sponsorship', 'Sponsor', '贊助項目', '贊助'],
    guestName: ['guestName', 'GuestName', 'Guest Name', 'guest_name', 'Guest Names', '來賓姓名', '來賓', 'Guest', 'guest', 'memo', 'Memo', '備註'],
    guestCount: ['guestCount', 'GuestCount', '來賓人數'],
};

/** 透過統一映射表取值 */
function getField(row, fieldName) {
    const keys = FIELD_KEYS[fieldName];
    return keys ? findCaseInsensitiveValue(row, keys) : undefined;
}

/** 大小寫不敏感的值查找 */
function findCaseInsensitiveValue(obj, keys) {
    if (!obj || !Array.isArray(keys)) return undefined;

    for (const key of keys) {
        if (obj.hasOwnProperty(key)) {
            return obj[key];
        }
        // 大小寫不敏感查找
        for (const objKey in obj) {
            if (objKey.toLowerCase() === key.toLowerCase()) {
                return obj[objKey];
            }
        }
    }
    return undefined;
}

/** 取得整數欄位值 (針對 FamilyCount 進行 +1 補償) */
function getIntField(row, fieldName) {
    const val = parseInt(getField(row, fieldName), 10) || 0;
    // ★ 修正：GAS 存的是「眷屬數」，前端顯示需包含本人，故 +1
    if (fieldName === 'family') return val + 1;
    return val;
}

/** 強健的人數合計計算：處理 JSON 解析與舊資料備案 (冗餘清理) */
function calculateFinalGuestCount(row, guestData) {
    const fallback = getIntField(row, 'guestCount');
    const total = guestData.reduce((acc, g) => acc + (parseInt(g.count, 10) || 0), 0);
    return total > 0 ? total : fallback;
}

/** DOM 元素快取 */
const DOM = {};
function cacheDOM() {
    DOM.statTotal = document.getElementById('stat-total');
    DOM.statSecVal = document.getElementById('stat-sec-val');
    DOM.statSecLabel = document.getElementById('stat-sec-label');
    DOM.headerTitle = document.getElementById('header-title');
    DOM.btnBack = document.getElementById('btn-back');
    DOM.btnShare = document.getElementById('btn-header-share');
    DOM.regForm = document.getElementById('regForm');
    DOM.submitBtn = document.getElementById('submit-btn');
    DOM.cancelBtn = document.getElementById('cancel-reg-btn');
    DOM.formTitle = document.getElementById('form-title');
    DOM.formAction = document.getElementById('formAction');
    DOM.userName = document.getElementById('user-name');
    DOM.userId = document.getElementById('user-id');
    DOM.userPicture = document.getElementById('user-picture');
    DOM.guestContainer = document.getElementById('guest-list-container');
    DOM.sponsorContainer = document.getElementById('sponsor-list-container');
    DOM.eventGrid = document.getElementById('event-grid-container');
    DOM.noEventsMsg = document.getElementById('no-events-msg');
    DOM.eventListLoading = document.getElementById('event-list-loading');
    DOM.managerControls = document.getElementById('manager-controls');
}

/** 批次 Lucide 圖示刷新（避免同一幀多次呼叫） */
let _iconRafId = null;
function refreshIcons() {
    if (_iconRafId) return;
    _iconRafId = requestAnimationFrame(() => {
        if (typeof lucide !== 'undefined') lucide.createIcons();
        _iconRafId = null;
    });
}

// ==========================================
// 2. INITIALIZATION (初始化)
// ==========================================
window.onload = async function () {
    cacheDOM();
    lucide.createIcons();
    populateCountOptions();
    renderAddSponsorUI();

    // 介面初始化
    // ★ Bug 修正：加入 null 保護，防止 DOM 元素不存在時 TypeError 白屏
    if (DOM.headerTitle) DOM.headerTitle.innerText = "活動與報名";
    switchView('view-home');

    // ★ 離線偵測與佇列處理
    window.addEventListener('offline', () => showToast('⚠️ 網路已斷開，報名將暫存'));
    window.addEventListener('online', () => {
        showToast('✅ 網路已恢復');
        setTimeout(() => processOfflineQueue(), 1500);
    });
    // 頁面載入時的殘留佇列檢查，移至載入畫面結束後再處理
    // (見 window.hideInitialOverlay)

    // ★ 下拉刷新 (Pull-to-Refresh)
    {
        const homeView = document.getElementById('view-home');
        let _pullStartY = 0;
        let _isPulling = false;
        let _pullIndicator = null;

        homeView.addEventListener('touchstart', (ev) => {
            if (homeView.scrollTop === 0 || window.scrollY === 0) {
                _pullStartY = ev.touches[0].clientY;
                _isPulling = true;
            }
        }, { passive: true });

        homeView.addEventListener('touchmove', (ev) => {
            if (!_isPulling) return;
            const pullDist = ev.touches[0].clientY - _pullStartY;
            if (pullDist > 60 && !_pullIndicator) {
                _pullIndicator = document.createElement('div');
                _pullIndicator.id = 'pull-refresh-indicator';
                _pullIndicator.style.cssText = 'text-align:center;padding:10px;font-size:13px;color:#06c755;font-weight:600;';
                _pullIndicator.textContent = '⎆ 釋放刷新活動列表';
                homeView.insertBefore(_pullIndicator, homeView.firstChild);
            }
        }, { passive: true });

        homeView.addEventListener('touchend', async () => {
            if (_pullIndicator) {
                _pullIndicator.textContent = '… 刷新中';
                try {
                    await fetchEvents();
                    renderEventGrid(appState.currentCategory || 'all');
                    showToast('✅ 已刷新');
                } catch (e) {
                    showToast('刷新失敗');
                }
                _pullIndicator.remove();
                _pullIndicator = null;
            }
            _isPulling = false;
        }, { passive: true });
    }

    // ★ 修改處：LIFF 初始化與強制登入邏輯
    if (LIFF_ID && LIFF_ID !== "YOUR_LIFF_ID") {
        try {
            await liff.init({ liffId: LIFF_ID });

            // 1. 檢查是否已登入
            if (!liff.isLoggedIn()) {
                // 若未登入，強制跳轉至 LINE 登入頁面
                // redirectUri 是登入後要回來的網址，通常不填會自動回到當前頁面
                liff.login();
                return; // 登入會跳轉，中斷後續執行
            } else {
                // 2. 若已登入，取得使用者資料
                const profile = await liff.getProfile();
                appState.user = {
                    userId: profile.userId,
                    displayName: profile.displayName,
                    pictureUrl: profile.pictureUrl
                };
                // 取得使用者 Email (選填，需在 Console 開權限)
                // const userEmail = liff.getDecodedIDToken().email; 
            }
        } catch (e) {
            console.error("LIFF Init failed", e);
            // 只有在 LIFF 初始化失敗(例如 ID 錯誤或環境不對)時才會維持訪客
            showToast("LINE 登入失敗，目前為訪客模式");
        }
    }

    // 更新介面顯示使用者頭像與名稱
    updateUserProfileUI();

    // 先嘗試從 LocalStorage 讀取快取以加速最初始渲染
    // ★ 優化：加入時效驗證（1 小時），防止舊資料格式不符導致渲染異常
    const CACHE_MAX_AGE = 60 * 60 * 1000; // 1 小時
    try {
        const cachedEventsRaw = localStorage.getItem('events_cache');
        if (cachedEventsRaw) {
            try {
                const parsed = JSON.parse(cachedEventsRaw);
                // 支援新版（含 ts）與舊版（純陣列）兩種格式
                if (Array.isArray(parsed)) {
                    appState.events = parsed; // 舊版快取，直接使用（首次讀取後會被新版覆蓋）
                } else if (parsed && parsed.data && (Date.now() - (parsed.ts || 0) < CACHE_MAX_AGE)) {
                    appState.events = parsed.data;
                }
            } catch (e) { /* 快取損壞，忽略 */ }
        }

        const cachedSettingsRaw = localStorage.getItem('settings_cache');
        if (cachedSettingsRaw) {
            try {
                const parsed = JSON.parse(cachedSettingsRaw);
                if (parsed && parsed.data && (Date.now() - (parsed.ts || 0) < CACHE_MAX_AGE)) {
                    appState.settings = parsed.data;
                } else if (parsed && !parsed.data && !parsed.error) {
                    appState.settings = parsed; // 舊版快取
                }
            } catch (e) { /* 快取損壞，忽略 */ }
        }

        if (appState.user && appState.user.userId) {
            const cachedRegs = localStorage.getItem('registrations_cache_' + appState.user.userId);
            if (cachedRegs) appState.myRegistrations = JSON.parse(cachedRegs);
        }
    } catch (e) {
        console.warn("載入快取失敗", e);
    }

    // ★ 建立全域的 hideInitialOverlay 函式由老虎機呼叫
    window.hideInitialOverlay = function () {
        const historyLoading = document.getElementById('history-loading');
        if (historyLoading) historyLoading.classList.add('hidden');

        const overlay = document.getElementById('initial-load-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 500);
        }

        // 畫面顯示後再處理離線佇列，避免一開始就跳 toast
        if (navigator.onLine) {
            setTimeout(() => processOfflineQueue(), 1000);
        }
    };

    const hasCache = appState.events && appState.events.length > 0;
    if (hasCache) {
        applyUserNameMapping();
        appState.isDataLoaded = true;
        appState.currentCategory = 'all';
        renderEventGrid('all');
        // 注意：這裡不主動關閉載入畫面，交給老虎機播完再關
    }

    // 背景非同步抓取最新資料 (不 await 阻塞 UI)
    Promise.all([
        fetchEvents(),
        fetchSettings(),
        fetchMyRegistrations()
    ]).then(() => {
        applyUserNameMapping();
        appState.isDataLoaded = true;
        appState.currentCategory = 'all';
        renderEventGrid('all');

        // 若沒有快取，等資料回來才算準備好。但仍然交給老虎機控制最終移除畫面的時機。
        // 如果老虎機已經跑完，這裡可以保護性關閉。
        if (!hasCache && !_slotSpinning) {
            if (window.hideInitialOverlay) window.hideInitialOverlay();
        }

    }).catch(e => console.error("背景抓取資料失敗", e));

    // ★ 優化：移除重複的 fetchParticipationStats() 呼叫（fetchAttendanceTop3 已在 DOMContentLoaded 中呼叫同一 API）
    // fetchParticipationStats(); // 已移除，避免重複請求
    fetchJackpotTop3();
};

function applyUserNameMapping() {
    const userId = appState.user.userId;
    const originalName = appState.user.displayName; // 原始 LINE 名稱
    const mapping = appState.settings.userMapping || {};

    // 優先順序：
    // 1. 檢查 UserID 是否有對應設定
    // 2. 檢查 LINE 顯示名稱是否有對應設定 (若 UserID 沒對到)
    // 3. 維持原樣

    if (userId && mapping[userId]) {
        appState.user.displayName = mapping[userId];
        updateUserProfileUI();
    } else if (originalName && mapping[originalName]) {
        appState.user.displayName = mapping[originalName];
        updateUserProfileUI();
    } else {
        // No mapping found, keep original name
    }
}

function updateUserProfileUI() {
    if (DOM.userName) DOM.userName.value = appState.user.displayName;
    if (DOM.userId) DOM.userId.value = appState.user.userId;
    if (appState.user.pictureUrl && DOM.userPicture) {
        DOM.userPicture.src = appState.user.pictureUrl;
    }
}

// ==========================================
// 3. API 處理
// ==========================================
async function fetchEvents() {
    if (!GAS_URL) {
        appState.events = [];
        return;
    }
    try {
        const res = await fetch(`${GAS_URL}?action=getEvents`);
        const data = await res.json();
        appState.events = Array.isArray(data) ? data : [];
        // ★ 優化：新版快取格式加入時間戳
        localStorage.setItem('events_cache', JSON.stringify({ data: appState.events, ts: Date.now() }));
    } catch (e) {
        console.warn("API Error (getEvents)", e);
    }
}

async function fetchSettings() {
    if (!GAS_URL) return;
    try {
        const res = await fetch(`${GAS_URL}?action=getSettings`);
        const data = await res.json();
        // ★ Bug 修正：驗證回傳值，若後端回傳錯誤物件則不覆蓋 settings
        if (data && !data.error) {
            appState.settings = data;
            localStorage.setItem('settings_cache', JSON.stringify({ data: appState.settings, ts: Date.now() }));
        }
        // 已移除下拉選單填入邏輯（改為手動輸入）
    } catch (e) {
        console.warn("API Error (getSettings)", e);
    }
}

async function fetchMyRegistrations() {
    if (!appState.user.userId || !GAS_URL) return;
    try {
        // 嘗試抓取報名紀錄
        const res = await fetch(`${GAS_URL}?action=getMyRegistrations&userId=${appState.user.userId}`);
        const data = await res.json();
        appState.myRegistrations = Array.isArray(data) ? data : [];
        localStorage.setItem('registrations_cache_' + appState.user.userId, JSON.stringify(appState.myRegistrations));
    } catch (e) {
        console.warn("Fetch Registrations Failed", e);
    }
}

// ★ 新增：出席統計圖表 (優化版：先顯後更)
async function fetchParticipationStats() {
    if (!GAS_URL) return;
    const container = document.getElementById('home-rankings-section');
    if (!container) return;

    const cacheKey = 'participation_stats_cache';
    const cachedData = localStorage.getItem(cacheKey);

    // 1. 先顯示快取數據
    if (cachedData) {
        try {
            const stats = JSON.parse(cachedData);
            container.classList.remove('hidden');
            renderParticipationChart(stats);
        } catch (e) {
            console.warn("Parse stats cache failed", e);
        }
    }

    // 2. 背景同步最新數據
    try {
        const res = await fetch(`${GAS_URL}?action=getParticipationStats&_=${Date.now()}`);
        const stats = await res.json();

        if (Array.isArray(stats) && stats.length > 0) {
            // ★ 新增：同分者用筆畫(localeCompare)排序
            stats.sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return String(a.name).localeCompare(String(b.name), 'zh-TW', { collation: 'stroke' });
            });

            // 更新快取
            localStorage.setItem(cacheKey, JSON.stringify(stats));
            container.classList.remove('hidden');
            renderParticipationChart(stats, !!cachedData); // 如果已有快取，則不重複播大動畫
        } else if (!cachedData) {
            container.classList.add('hidden');
        }
    } catch (e) {
        console.warn("Fetch participation stats failed", e);
    }
}

function renderParticipationChart(data) {
    const container = document.getElementById('home-rankings-section');
    const overlayContainer = document.getElementById('overlay-rankings-container');
    const listEl = document.getElementById('participation-top3-list');
    const overlayListEl = document.getElementById('overlay-participation-list');
    if (!listEl && !overlayListEl) return;

    if (container) container.classList.remove('hidden');
    if (overlayContainer) overlayContainer.classList.remove('opacity-0', 'translate-y-4');

    const top3 = data.slice(0, 3);
    if (top3.length === 0) return;

    const displayOrder = top3.length >= 3 ? [1, 0, 2] : (top3.length === 2 ? [0, 1] : [0]);

    let html = '';
    displayOrder.forEach(idx => {
        if (!top3[idx]) return;
        const p = top3[idx];
        const isFirst = idx === 0;
        const medal = isFirst ? '🥇' : (idx === 1 ? '🥈' : '🥉');
        const sizeClass = isFirst ? 'scale-110 -translate-y-1' : 'scale-95 opacity-80';
        const countColor = isFirst ? 'text-amber-500' : 'text-gray-400';

        const glowClass = isFirst ? 'ring-2 ring-amber-400/30 rounded-full p-2 bg-amber-500/10 shadow-[0_0_15px_rgba(251,191,36,0.2)]' : '';

        html += `
            <div class="flex flex-col items-center ${sizeClass}">
                <div class="flex flex-col items-center ${glowClass}">
                    <span class="text-xl leading-none mb-0.5">${medal}</span>
                    <span class="text-[11px] font-black text-template-name truncate max-w-template-width">${p.name}</span>
                </div>
                <span class="text-template-count-color text-[9px] font-black mt-0.5">${p.count}次</span>
            </div>
        `;
    });

    if (listEl) {
        listEl.innerHTML = html
            .replace(/text-template-name/g, 'text-white/90')
            .replace(/text-template-count-color/g, 'text-amber-400')
            .replace(/max-w-template-width/g, 'max-w-[60px]');
    }
    if (overlayListEl) {
        overlayListEl.innerHTML = html.replace(/text-template-name/g, 'text-white').replace(/text-template-count-color/g, 'text-white/80').replace(/max-w-template-width/g, 'max-w-[50px]');
    }
}

async function fetchStats(forceRefresh = false) {
    const e = appState.currentEvent;
    if (!e || !GAS_URL) return;

    if (forceRefresh) {
        DOM.statTotal.innerHTML = '<i class="animate-spin" data-lucide="loader-2"></i>';
        refreshIcons();
    }

    try {
        const res = await fetch(`${GAS_URL}?action=stats&eventId=${e.id}&_=${Date.now()}`);
        appState.currentStats = await res.json();

        animateValue(DOM.statTotal, 0, appState.currentStats.totalPeople || 0, 500);

        let secValue = 0;
        if (e.type === 'travel') {
            secValue = appState.currentStats.totalRooms || 0;
        } else if (e.type === 'banquet') {
            secValue = appState.currentStats.tableCount || 0;
        } else {
            secValue = appState.currentStats.secondary || 0;
        }

        animateValue(DOM.statSecVal, 0, secValue, 500);
    } catch (err) {
        console.warn("Fetch Stats Failed", err);
    }
}

async function fetchDetails() {
    if (!GAS_URL) return [];
    try {
        const res = await fetch(`${GAS_URL}?action=getDetails&eventId=${appState.currentEvent.id}`);
        return await res.json();
    } catch (e) { return []; }
}

async function apiSubmit(data) {
    if (!GAS_URL) return;

    // ★ 自動附加 idempotency key（防重複）
    if (!data._idempotencyKey) {
        data._idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : Date.now() + '-' + Math.random().toString(36).slice(2);
    }

    // ★ 離線偵測：直接存入佇列，不嘗試 fetch
    if (!navigator.onLine) {
        enqueueOffline(data);
        showToast('⚠️ 目前離線，資料已暫存，待網路恢復後自動送出');
        return { queued: true };
    }

    try {
        const res = await fetch(GAS_URL, {
            method: 'POST',
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(data)
        });
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (jsonErr) {
            console.error('GAS 回傳格式錯誤 (非 JSON):', text);
            return { success: false, error: '伺服器回應格式錯誤' };
        }
    } catch (err) {
        // ★ 網路錯誤時存入離線佇列
        if (err.name === 'TypeError' || err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            enqueueOffline(data);
            showToast('⚠️ 網路異常，資料已暫存，待恢復後自動送出');
            return { queued: true };
        }
        showToast('❌ 系統連線失敗');
        throw err;
    }
}

// ★ 離線佇列：存入
function enqueueOffline(data) {
    try {
        const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
        queue.push({ data: data, timestamp: Date.now() });
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.warn('離線佇列儲存失敗', e);
    }
}

// ★ 離線佇列：恢復連線時自動重送
async function processOfflineQueue() {
    let queue;
    try {
        queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    } catch (e) { return; }

    if (queue.length === 0) return;

    // 過濾掉超過 24 小時的過期項目
    const now = Date.now();
    const validQueue = queue.filter(item => (now - item.timestamp) < OFFLINE_QUEUE_MAX_AGE_MS);
    const expiredCount = queue.length - validQueue.length;

    if (validQueue.length === 0) {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
        if (expiredCount > 0) showToast(`已清除 ${expiredCount} 筆過期暫存資料`);
        return;
    }

    showToast(`📤 正在送出 ${validQueue.length} 筆暫存資料...`);

    const remaining = [];
    let successCount = 0;

    for (const item of validQueue) {
        try {
            const res = await fetch(GAS_URL, {
                method: 'POST',
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(item.data)
            });
            await res.json();
            successCount++;
        } catch (err) {
            // 送出失敗，保留在佇列中等下次重試
            remaining.push(item);
        }
    }

    if (remaining.length > 0) {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
        showToast(`✅ 已送出 ${successCount} 筆，${remaining.length} 筆待重試`);
    } else {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
        showToast(`✅ ${successCount} 筆暫存資料已全部送出！`);
    }

    // 刷新統計
    if (appState.currentEvent) {
        await fetchStats();
    }
}

// ==========================================
// 4. 核心邏輯 (報名與導航)
// ==========================================
async function enterEventDetail(eventId) {
    const event = appState.events.find(e => e.id === eventId);
    if (!event) return;

    // ★【修正點 2】一點擊就顯示 Loading Toast，提升體驗
    showToast("正在讀取活動詳情...");

    appState.currentEvent = event;
    // 立即清除統計以避免顯示舊資料
    appState.currentStats = {};
    appState.cachedDetails = null;
    DOM.statTotal.innerText = "-";
    DOM.statSecVal.innerText = "-";

    resetFormState();

    appState.historyStack.push('detail');
    switchView('view-activity-detail');
    DOM.headerTitle.innerText = event.name;

    // 3. 渲染靜態資訊 (初始)
    renderEventStaticInfo();

    // 4. 平行抓取以提升速度
    // 使用 Promise.all 同步抓取統計與檢查報名
    await Promise.all([
        fetchStats(),
        checkMyRegistration()
    ]);

    // 5. 重新渲染以更新下拉選單統計
    renderEventStaticInfo();
}

async function checkMyRegistration() {
    if (!appState.user.userId) return;

    try {
        const details = await fetchDetails();
        const myRecord = details.find(r => r.userId === appState.user.userId || r.name === appState.user.displayName);

        if (myRecord) {
            fillFormWithRecord(myRecord);
        }
    } catch (e) { console.error(e); }
}

function fillFormWithRecord(record) {
    DOM.formAction.value = 'update';

    const isOpen = isEventOpen(appState.currentEvent);
    const canModify = canModifyEvent(appState.currentEvent);
    const isToday = !isOpen && canModify; // 當天活動的特徵

    // ★ 新增：檢查黑名單
    const isBlacklisted = isCurrentUserBlacklisted();

    if (isBlacklisted) {
        // 黑名單使用者：無法修改/報名
        DOM.submitBtn.innerText = "您目前無法報名活動";
        DOM.submitBtn.className = "flex-1 bg-gray-400 text-white font-bold py-3.5 rounded-xl cursor-not-allowed flex justify-center items-center gap-2";
        DOM.submitBtn.disabled = true;
        if (DOM.cancelBtn) DOM.cancelBtn.classList.add('hidden');

        const modifyInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button:not(#btn-header-share):not(#btn-stats)');
        modifyInputs.forEach(el => el.disabled = true);

    } else if (isToday) {
        // 當天活動：唯讀模式 (不允許修改)
        DOM.submitBtn.classList.add('hidden');
        DOM.submitBtn.classList.remove('flex');
        DOM.cancelBtn.classList.add('hidden');

        // 確認所有輸入框都維持停用狀態
        const modifyInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button:not(#btn-header-share):not(#btn-stats)');
        modifyInputs.forEach(el => el.disabled = true);

    } else if (isOpen) {
        // 未來活動：正常修改
        DOM.submitBtn.innerHTML = '<span>更新資料</span><i data-lucide="refresh-cw" class="w-4 h-4"></i>';
        DOM.submitBtn.disabled = false;
        DOM.cancelBtn.classList.remove('hidden');
    } else {
        // 隔天及以後：完全結束
        DOM.submitBtn.innerText = "已報名 (活動已結束)";
        DOM.submitBtn.className = "flex-1 bg-gray-400 text-white font-bold py-3.5 rounded-xl cursor-not-allowed flex justify-center items-center gap-2";
        DOM.submitBtn.disabled = true;
        DOM.cancelBtn.classList.add('hidden');
    }

    DOM.formTitle.innerText = "編輯您的報名";

    // 使用統一欄位映射取得欄位值
    const family = getIntField(record, 'family');
    const tableCount = getIntField(record, 'tableCount');
    const room = getField(record, 'room');
    const pickup = getField(record, 'pickup');
    const guestCount = getIntField(record, 'guestCount');
    const sponsor = getField(record, 'sponsor');

    // ★ 偵測純贊助狀態（familyCount 儲存值為 -1）
    const rawFamily = findCaseInsensitiveValue(record, ['FamilyCount', 'familyCount', '眉屬人數']);
    const isSponsorOnly = (parseInt(rawFamily, 10) === -1);
    const noAttendCb = document.getElementById('no-attendance-sponsor');
    if (noAttendCb) {
        noAttendCb.checked = isSponsorOnly;
        toggleNoAttendance(noAttendCb);
    }

    // 填入欄位
    document.getElementById('family-count').value = family;
    if (tableCount) document.getElementById('table-count').value = tableCount;

    if (room && room !== '無') document.getElementById('room-type').value = room;
    if (pickup && pickup !== '無') document.getElementById('pickup-loc').value = pickup;

    // 還原來賓列表
    appState.guestList = [];
    const parsedGuests = parseGuestData(record);

    if (parsedGuests.length > 0) {
        appState.guestList = parsedGuests.map(g => ({
            ...g,
            id: g.id || ('g_' + Date.now() + Math.random().toString(36).substring(2, 7))
        }));
        renderGuestList();
    } else if (guestCount > 0) {
        for (let i = 0; i < guestCount; i++) {
            const id = 'g_' + Date.now() + Math.random().toString(36).substring(2, 7) + i;
            appState.guestList.push({ id, name: `來賓 ${i + 1}`, count: 1, pickup: '', room: '' });
        }
        renderGuestList();
    }

    restoreSponsorList(sponsor);
    refreshIcons();
    showToast("已載入您的報名資料");
}

async function handleSubmit(e) {
    e.preventDefault();
    if (_isSubmitting) return; // ★ 防重複提交鎖
    const originalContent = DOM.submitBtn.innerHTML;

    if (!validateForm()) return;
    _isSubmitting = true;

    DOM.submitBtn.disabled = true;
    DOM.submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> 處理中...';
    refreshIcons();

    // ★ 不克出席，僅贊助：familyCount 送 -1 讓後端識別
    const noAttendCb = document.getElementById('no-attendance-sponsor');
    const isSponsorOnly = noAttendCb && noAttendCb.checked;

    const formData = {
        action: DOM.formAction.value,
        eventId: appState.currentEvent.id,
        eventType: appState.currentEvent.type,
        eventName: appState.currentEvent.name,
        userId: appState.user.userId,
        pictureUrl: appState.user.pictureUrl,
        displayName: DOM.userName.value,
        familyCount: isSponsorOnly ? -1 : (parseInt(document.getElementById('family-count').value, 10) - 1),
        guestList: JSON.stringify(isSponsorOnly ? [] : appState.guestList),
        sponsorList: JSON.stringify(appState.sponsorList),
        roomType: isSponsorOnly ? '' : document.getElementById('room-type').value,
        pickupLoc: isSponsorOnly ? '' : document.getElementById('pickup-loc').value,
        tableCount: document.getElementById('table-count').value
    };

    try {
        const result = await apiSubmit(formData);
        // ★ 檢查後端回傳是否包含錯誤
        if (result && result.error) {
            showToast('⚠️ ' + result.error);
        } else if (result && result.queued) {
            // 離線佇列已處理，Toast 已在 apiSubmit 顯示
        } else {
            showToast(formData.action === 'update' ? "更新成功！" : "報名成功！");
            if (!appState.myRegistrations.includes(appState.currentEvent.id)) {
                appState.myRegistrations.push(appState.currentEvent.id);
            }
            await fetchStats();
            await checkMyRegistration();
            renderEventStaticInfo();
            // ★ 即時更新首頁卡片「已報名」標記
            renderEventGrid(appState.currentCategory || 'all');
        }
    } catch (err) {
        showToast("發生錯誤，請重試");
    } finally {
        _isSubmitting = false; // ★ 解鎖
        DOM.submitBtn.disabled = false;
        DOM.submitBtn.innerHTML = originalContent;
        refreshIcons();
    }
}

async function handleCancel() {
    if (_isSubmitting) return; // ★ 防重複提交鎖
    const confirmed = await showConfirm("確定要取消此活動的報名嗎？<br>取消後名額將會釋出。");
    if (!confirmed) return;
    _isSubmitting = true;

    DOM.cancelBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>';
    refreshIcons();

    try {
        const result = await apiSubmit({
            action: 'cancel',
            eventId: appState.currentEvent.id,
            eventName: appState.currentEvent.name,
            userId: appState.user.userId,
            displayName: appState.user.displayName
        });
        // ★ 檢查後端回傳是否包含錯誤
        if (result && result.error) {
            showToast('⚠️ ' + result.error);
        } else if (result && result.queued) {
            // 離線佇列
        } else {
            showToast("已取消報名");
            appState.myRegistrations = appState.myRegistrations.filter(id => id !== appState.currentEvent.id);
            resetFormState();
            await fetchStats();
            renderEventStaticInfo();
            // ★ 即時更新首頁卡片標記
            renderEventGrid(appState.currentCategory || 'all');
        }
    } catch (err) {
        showToast("取消失敗");
    } finally {
        _isSubmitting = false; // ★ 解鎖
        DOM.cancelBtn.innerHTML = '<i data-lucide="trash-2" class="w-5 h-5"></i>';
        refreshIcons();
    }
}

// ==========================================
// 5. UI RENDERING & HELPERS
// ==========================================
function resetFormState() {
    appState.guestList = [];
    appState.sponsorList = [];
    DOM.regForm.reset();
    DOM.guestContainer.innerHTML = '';
    DOM.sponsorContainer.innerHTML = '';

    const formInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button');
    formInputs.forEach(el => el.disabled = false);

    DOM.formAction.value = 'register';
    DOM.submitBtn.innerHTML = '<span>確認報名</span><i data-lucide="send" class="w-4 h-4"></i>';
    DOM.submitBtn.className = "flex-1 bg-gradient-to-r from-[#D4AF37] to-[#A67C00] text-[#0D131A] font-bold py-3.5 rounded-xl hover:brightness-110 transition shadow-[0_4px_15px_rgba(212,175,55,0.4)] active:scale-95 flex justify-center items-center gap-2";
    DOM.submitBtn.disabled = false;

    DOM.cancelBtn.classList.add('hidden');
    DOM.formTitle.innerText = "填寫報名資料";
    DOM.userName.value = appState.user.displayName;

    // ★ 重置「不克出席」核取方塊
    const noAttendCb = document.getElementById('no-attendance-sponsor');
    if (noAttendCb) {
        noAttendCb.checked = false;
        toggleNoAttendance(noAttendCb); // 確保欄位狀態恢復
    }
}

function renderEventStaticInfo() {
    const e = appState.currentEvent;
    // ★ 安全檢查：防止資料尚未載入時報錯
    if (!e) return;

    // 文字欄位
    document.getElementById('display-name').innerText = e.name;
    document.getElementById('display-organizer').innerText = e.organizer;
    document.getElementById('display-location').innerText = e.location;
    document.getElementById('display-address').innerText = e.address;
    document.getElementById('map-link').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}`;

    // ★ 備註欄位：有內容時顯示，空白時隱藏
    const noteSection = document.getElementById('display-note-section');
    const noteEl = document.getElementById('display-note');
    if (e.note && e.note.trim()) {
        noteEl.innerText = e.note;
        noteSection.classList.remove('hidden');
    } else {
        noteSection.classList.add('hidden');
        noteEl.innerText = '';
    }

    // 時間顯示
    const timeDiv = document.getElementById('display-time-container');
    if (e.type === 'travel' && e.time.includes('~')) {
        const [start, end] = e.time.split('~');
        // 旅遊活動使用日期專用格式
        timeDiv.innerHTML = `<div class="flex flex-col text-sm"><span class="text-green-700 font-bold">起：${formatDateOnly(start)}</span><span class="text-red-700 font-bold">止：${formatDateOnly(end)}</span></div>`;
    } else {
        timeDiv.innerText = formatDate(e.time);
    }

    // 檢查是否關閉 -> 停用表單
    const isOpen = isEventOpen(e);
    const canModify = canModifyEvent(e);
    const isToday = !isOpen && canModify; // 當天活動的特徵

    // ★ 新增：檢查黑名單
    const isBlacklisted = isCurrentUserBlacklisted();

    if (isBlacklisted) {
        // 黑名單使用者：顯示無法報名，並停用表單
        DOM.submitBtn.innerText = "您目前無法報名活動";
        DOM.submitBtn.className = "flex-1 bg-gray-400 text-white font-bold py-3.5 rounded-xl cursor-not-allowed flex justify-center items-center gap-2";
        DOM.submitBtn.disabled = true;
        if (DOM.cancelBtn) DOM.cancelBtn.classList.add('hidden');

        const formInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button:not(#btn-header-share):not(#btn-stats)');
        formInputs.forEach(el => el.disabled = true);

    } else if (!isOpen) {
        if (isToday) {
            // 合點時活動：完全唯讀
            // 隱藏提交按鈕
            DOM.submitBtn.classList.add('hidden');
            DOM.submitBtn.classList.remove('flex');
            if (DOM.cancelBtn) DOM.cancelBtn.classList.add('hidden');

            // 停用表單內所有輸入框 (保留分享與統計等獨立功能)
            const formInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button:not(#btn-header-share):not(#btn-stats)');
            formInputs.forEach(el => el.disabled = true);
        } else {
            // 隔天及以後：完全結束，停用表單內所有輸入框
            const formInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button');
            formInputs.forEach(el => el.disabled = true);

            DOM.submitBtn.innerText = "活動已結束";
            DOM.submitBtn.className = "flex-1 bg-gray-400 text-white font-bold py-3.5 rounded-xl cursor-not-allowed flex justify-center items-center gap-2";
            DOM.submitBtn.disabled = true;
        }
    }

    // 截止日期
    if (e.deadline) {
        const isExpired = new Date() > new Date(e.deadline);
        const color = isExpired ? "text-red-500 font-bold" : "text-gray-400";
        timeDiv.innerHTML += `<div class="mt-1 pt-1 border-t border-gray-100 text-xs ${color} flex items-center gap-1"><i data-lucide="hourglass" class="w-3 h-3"></i> 截止：${formatDate(e.deadline)}</div>`;

        if (isExpired && isOpen) { // 僅在活動仍開放但已過截止時間時顯示
            DOM.submitBtn.disabled = true;
            DOM.submitBtn.innerText = "報名已截止";
            DOM.submitBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
            DOM.submitBtn.classList.remove('from-[#D4AF37]', 'to-[#A67C00]', 'text-[#0D131A]');
        }
    }

    // 狀態切換按鈕 - 權限檢查
    if (appState.user.userId && e.creatorId && appState.user.userId === e.creatorId) {
        DOM.managerControls.classList.remove('hidden');
    } else {
        DOM.managerControls.classList.add('hidden');
    }

    const statusBtn = document.getElementById('btn-status-toggle');
    statusBtn.className = `text-xs px-3 py-1.5 rounded-full font-bold border transition flex items-center gap-1 ${isOpen ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'}`;
    statusBtn.innerHTML = isOpen ? '<i data-lucide="stop-circle" class="w-3 h-3"></i> 關閉活動' : '<i data-lucide="play-circle" class="w-3 h-3"></i> 開啟活動';

    // 欄位顯示狀態
    const fields = {
        travel: document.getElementById('field-travel'),
        banquet: document.getElementById('field-banquet'),
        itinerary: document.getElementById('travel-itinerary-section'),
        guestTravel: document.getElementById('guest-travel-options')
    };

    // 重置
    Object.values(fields).forEach(el => el.classList.add('hidden'));
    DOM.statSecLabel.innerText = "贊助筆數";

    if (e.type === 'travel') {
        fields.travel.classList.remove('hidden');
        fields.guestTravel.classList.remove('hidden');
        if (e.itinerary) {
            fields.itinerary.classList.remove('hidden');
            renderItinerary(e.itinerary, e.time);
        }
        DOM.statSecLabel.innerText = "已訂房數";

        // 填入選項
        populateSelect('pickup-loc', e.pickupOpts);
        populateSelect('add-guest-pickup', e.pickupOpts);
        populateRoomOptions('room-type', e.roomOpts);
        populateRoomOptions('add-guest-room', e.roomOpts);

    } else if (e.type === 'banquet') {
        fields.banquet.classList.remove('hidden');
        DOM.statSecLabel.innerText = "預訂桌數";
    }

    refreshIcons();
}

// --- 渲染列表 ---
function renderGuestList() {
    DOM.guestContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    appState.guestList.forEach((g, i) => {
        let details = [];
        if (g.count > 1) details.push(`${g.count}人`);
        if (g.pickup) details.push(escapeHtml(g.pickup));
        if (g.room) details.push(escapeHtml(g.room));
        const subtext = details.length > 0 ? `<span class="text-xs text-[#D4AF37]/60 ml-1">(${details.join(', ')})</span>` : '';

        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-[#0D131A] border border-[#D4AF37]/30 pl-3 pr-2 py-2 rounded-lg text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] animate-fade-in';
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"></div>
                <span class="font-medium text-[#EFECE5]">${escapeHtml(g.name)} ${subtext}</span>
            </div>
            <div class="flex gap-2 items-center text-[#D4AF37]/60">
                <i data-lucide="edit-2" class="w-4 h-4 hover:text-[#D4AF37] transition cursor-pointer" onclick="editGuest(${i})"></i>
                <i data-lucide="x" class="w-4 h-4 hover:text-red-400 transition cursor-pointer" onclick="removeGuest('${g.id}')"></i>
            </div>`;
        fragment.appendChild(div);
    });
    DOM.guestContainer.appendChild(fragment);
    refreshIcons();
}

function renderSponsorList() {
    DOM.sponsorContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    appState.sponsorList.forEach((s, i) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-[#0D131A] border border-[#D4AF37]/30 pl-3 pr-2 py-2 rounded-lg text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] animate-fade-in';
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <i data-lucide="gift" class="w-3.5 h-3.5 text-[#EFC958]"></i>
                <span class="font-medium text-[#EFECE5]">${escapeHtml(s)}</span>
            </div>
            <div class="flex gap-2 items-center text-[#D4AF37]/60">
                <i data-lucide="edit-2" class="w-4 h-4 hover:text-[#D4AF37] transition cursor-pointer" onclick="editSponsor(${i})"></i>
                <i data-lucide="x" class="w-4 h-4 hover:text-red-400 transition cursor-pointer" onclick="removeSponsor(${i})"></i>
            </div>`;
        fragment.appendChild(div);
    });
    DOM.sponsorContainer.appendChild(fragment);
    refreshIcons();
}

function editGuest(i) {
    const g = appState.guestList[i];
    document.getElementById('add-guest-name').value = g.name;
    document.getElementById('add-guest-count').value = g.count;
    if (g.pickup) document.getElementById('add-guest-pickup').value = g.pickup;
    if (g.room) document.getElementById('add-guest-room').value = g.room;

    // 移除當前項目以便重新加入
    appState.guestList.splice(i, 1);
    renderGuestList();
    showToast("已載入資料至輸入框，修改後請點選「加入名單」");
}

function editSponsor(i) {
    const s = appState.sponsorList[i];
    // 解析字串回填 UI 的邏輯
    // Format 1: 酒類: 5瓶
    // Format 2: 紅包: 1000元
    // Format 3: 其他: ...

    if (s.startsWith("酒類:")) {
        document.querySelector('input[name="addSponsorType"][value="alcohol"]').checked = true;
        renderAddSponsorUI();
        const content = s.substring(4); // "5瓶"
        const unit = content.includes('箱') ? '箱' : '瓶';
        const qty = parseInt(content, 10);
        document.getElementById('sp-qty').value = qty;
        document.getElementById('sp-unit').value = unit;

    } else if (s.startsWith("紅包:")) {
        document.querySelector('input[name="addSponsorType"][value="money"]').checked = true;
        renderAddSponsorUI();
        // "紅包: 1000元"
        // ★ Bug 修正：match 可能為 null，加入安全保護
        const moneyMatch = s.match(/\d+/);
        const money = moneyMatch ? parseInt(moneyMatch[0]) : 0;
        document.getElementById('sp-money').value = money;

    } else {
        // "其他: ..."
        document.querySelector('input[name="addSponsorType"][value="other"]').checked = true;
        renderAddSponsorUI();
        const content = s.substring(4);
        document.getElementById('sp-other').value = content;
    }

    appState.sponsorList.splice(i, 1);
    renderSponsorList();
    showToast("已載入資料至輸入框，修改後請點選「新增贊助」");
}

function renderEventGrid(type) {
    const container = document.getElementById('event-grid-container');
    const loading = document.getElementById('event-list-loading');

    if (!appState.isDataLoaded) {
        loading.classList.remove('hidden');
        container.innerHTML = '';
        return;
    }

    loading.classList.add('hidden');
    container.innerHTML = '';

    const filtered = appState.events.filter(e => {
        const isVisible = isEventOpen(e) || canModifyEvent(e);
        if (type === 'all') return isVisible;
        return normalizeType(e.type) === type && isVisible;
    }).sort((a, b) => {
        // ★ Bug 修正：改用 parseLocalDate，防止 yyyy/mm/dd 格式在 Safari 時區偏移
        const getTime = (t) => {
            if (!t) return 0;
            const start = t.includes('~') ? t.split('~')[0].trim() : t;
            return parseLocalDate(start).getTime() || 0;
        };
        return getTime(a.time) - getTime(b.time);
    });

    if (filtered.length === 0) {
        if (DOM.noEventsMsg) DOM.noEventsMsg.classList.remove('hidden');
    } else {
        if (DOM.noEventsMsg) DOM.noEventsMsg.classList.add('hidden');
        filtered.forEach(e => {
            const card = document.createElement('div');
            card.className = "bg-white p-4 rounded-2xl shadow-sm border border-gray-100 card-hover cursor-pointer flex items-center gap-4 relative overflow-hidden group";
            card.onclick = () => enterEventDetail(e.id);

            let icon, colorClass, bgClass;
            switch (normalizeType(e.type)) {
                case 'banquet': icon = 'utensils'; colorClass = 'text-orange-600'; bgClass = 'bg-orange-50'; break;
                case 'travel': icon = 'bus'; colorClass = 'text-blue-600'; bgClass = 'bg-blue-50'; break;
                default: icon = 'calendar'; colorClass = 'text-green-600'; bgClass = 'bg-green-50';
            }

            // 截止警告 / 已報名標籤邏輯
            let badge = '';
            // 優先顯示已報名，即使已截止
            if (appState.myRegistrations.includes(e.id)) {
                badge = '<span class="absolute top-0 right-0 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">已報名</span>';
            } else if (e.deadline && new Date() > new Date(e.deadline)) {
                badge = '<span class="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">已截止</span>';
            }

            // ★ 倒數標記：距離活動還有幾天
            // ★ Bug 修正：改用 parseLocalDate 計算，防止 Safari 時區偏移導致天數錯誤
            let countdownBadge = '';
            if (e.time) {
                const now = new Date();
                const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                let eventStart;
                if (typeof e.time === 'string' && e.time.includes('~')) {
                    eventStart = parseLocalDate(e.time.split('~')[0].trim());
                } else {
                    eventStart = parseLocalDate(e.time);
                }
                if (!isNaN(eventStart.getTime())) {
                    const eventMid = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
                    const diffDays = Math.round((eventMid - todayMid) / (1000 * 60 * 60 * 24));
                    if (diffDays === 0) {
                        countdownBadge = '<span class="inline-flex items-center gap-0.5 text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-bold">🔴 今天！</span>';
                    } else if (diffDays === 1) {
                        countdownBadge = '<span class="inline-flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">⏰ 明天</span>';
                    } else if (diffDays > 1 && diffDays <= 7) {
                        countdownBadge = `<span class="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">📆 還有 ${diffDays} 天</span>`;
                    }
                }
            }

            card.innerHTML = `
                ${badge}
                <div class="${bgClass} w-12 h-12 rounded-2xl flex items-center justify-center ${colorClass} shrink-0 group-hover:scale-110 transition-transform">
                    <i data-lucide="${icon}" class="w-6 h-6"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-gray-800 text-lg mb-1 leading-snug">${escapeHtml(e.name)}</h3>
                    <div class="text-xs text-gray-500 mb-2 break-words">主辦: ${escapeHtml(e.organizer)}</div>
                    <div class="flex items-center gap-3 text-xs text-gray-500">
                        <span class="flex items-center gap-1"><i data-lucide="clock" class="w-3 h-3"></i> ${formatDateShort(e.time)}</span>
                        <span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3 h-3"></i> ${escapeHtml(e.location)}</span>
                        ${countdownBadge}
                    </div>
                </div>
                <i data-lucide="chevron-right" class="w-5 h-5 text-gray-300"></i>
            `;
            container.appendChild(card);
        });
        refreshIcons();
    }
}

// --- 視窗與詳細資訊邏輯 ---
async function openDetailsModal(filterType = 'all') {
    if (!appState.currentEvent) return;
    const modal = document.getElementById('details-modal');
    const content = document.getElementById('modal-content');

    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('translate-y-full', 'opacity-0');
        content.classList.add('translate-y-10', 'sm:translate-y-0', 'opacity-100');
    }, 10);

    // 動態修改標題
    const titleEl = document.querySelector('#details-modal h3');
    if (filterType === 'people') {
        titleEl.innerHTML = '<i data-lucide="users" class="w-5 h-5 text-gray-600"></i> 人員名單';
    } else if (filterType === 'secondary') {
        const type = appState.currentEvent.type;
        const icon = type === 'travel' ? 'bus' : 'gift';
        const text = type === 'travel' ? '住宿與交通' : '贊助與認桌';
        titleEl.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5 text-gray-600"></i> ${text}明細`;
    } else {
        titleEl.innerHTML = '<i data-lucide="list" class="w-5 h-5 text-gray-600"></i> 詳細名單';
    }
    refreshIcons();

    // 填入摘要
    const sumDiv = document.getElementById('modal-summary');
    sumDiv.innerHTML = '';
    if (appState.currentEvent.type === 'travel') {
        const pMap = appState.currentStats.pickupCounts || {};
        const rMap = appState.currentStats.roomCounts || {};
        let html = '';
        if (Object.keys(pMap).length) html += `<div class="bg-[#1E3052] rounded p-1.5 border border-[#D4AF37]/30"><div class="font-bold mb-1 text-[#D4AF37]">📍 上車地點</div>${Object.entries(pMap).map(([k, v]) => `<span class="inline-block bg-[#162544] text-[#EFECE5] border border-[#D4AF37]/20 px-1.5 rounded text-[10px] mr-1 mb-1">${k}:${v}</span>`).join('')}</div>`;
        if (Object.keys(rMap).length) html += `<div class="bg-[#1E3052] rounded p-1.5 border border-[#D4AF37]/30"><div class="font-bold mb-1 text-[#D4AF37]">🛏 房型統計</div>${Object.entries(rMap).map(([k, v]) => `<span class="inline-block bg-[#162544] text-[#EFECE5] border border-[#D4AF37]/20 px-1.5 rounded text-[10px] mr-1 mb-1">${k}:${v}</span>`).join('')}</div>`;
        sumDiv.innerHTML = html;
    } else if (appState.currentEvent.type === 'banquet') {
        sumDiv.innerHTML = `<div class="col-span-2 bg-white rounded p-2 text-center font-bold text-red-500">總計預訂: ${appState.currentStats.tableCount} 桌</div>`;
    }

    const listContainer = document.getElementById('details-lists-container');
    const loading = document.getElementById('modal-loading');
    const empty = document.getElementById('modal-empty');

    listContainer.classList.add('hidden');
    loading.classList.remove('hidden');
    empty.classList.add('hidden');

    const data = await fetchDetails();
    appState.cachedDetails = data; // ★ 快取資料以供同步複製使用
    loading.classList.add('hidden');

    if (!data || data.length === 0) {
        empty.classList.remove('hidden');
        return;
    }

    listContainer.classList.remove('hidden');
    renderDetailLists(data);

    // ★ 根據 filterType 隱藏不需要的區塊
    const listP = document.getElementById('details-list-people');
    // ★ Bug 修正：加入 null 保護，防止 HTML 結構變動時 TypeError
    const labelP = listP ? listP.previousElementSibling : null;
    const listT = document.getElementById('details-list-travel');
    const labelT = document.getElementById('travel-separator');
    const listI = document.getElementById('details-list-items');
    const labelI = document.getElementById('details-separator');

    if (filterType === 'people') {
        if (listT) listT.classList.add('hidden');
        if (labelT) labelT.classList.add('hidden');
        if (listI) listI.classList.add('hidden');
        if (labelI) labelI.classList.add('hidden');
        if (listP) listP.classList.remove('hidden');
        if (labelP) labelP.classList.remove('hidden');
    } else if (filterType === 'secondary') {
        listP.classList.add('hidden');
        labelP.classList.add('hidden');
        const evtType = appState.currentEvent.type;
        if (evtType === 'travel') {
            if (listT) listT.classList.remove('hidden');
            if (labelT) labelT.classList.remove('hidden');
            if (listI) listI.classList.add('hidden');
            if (labelI) labelI.classList.add('hidden');
        } else {
            if (listI) listI.classList.remove('hidden');
            if (labelI) labelI.classList.remove('hidden');
            if (listT) listT.classList.add('hidden');
            if (labelT) labelT.classList.add('hidden');
        }
    }
}

// findCaseInsensitiveValue 已在上方 FIELD_KEYS 區塊定義（L1466），此處不重複定義

function renderDetailLists(data) {
    const listP = document.getElementById('details-list-people');
    const listT = document.getElementById('details-list-travel');
    const listI = document.getElementById('details-list-items');

    listP.innerHTML = ''; listT.innerHTML = ''; listI.innerHTML = '';
    document.getElementById('travel-separator').classList.add('hidden');
    listT.classList.add('hidden');
    document.getElementById('details-separator').classList.add('hidden');
    listI.classList.add('hidden');

    let hasTravel = false;
    let hasItems = false;

    const fragP = document.createDocumentFragment();
    const fragT = document.createDocumentFragment();
    const fragI = document.createDocumentFragment();

    data.forEach((row, idx) => {
        const name = findCaseInsensitiveValue(row, ['name', 'Name', '姓名', 'UserName', 'username']) || 'Unknown';
        const safeName = escapeHtml(name);
        const family = getIntField(row, 'family');

        const guestData = parseGuestData(row);
        // 冗餘處理：使用統一計算函數
        const finalGuestCount = calculateFinalGuestCount(row, guestData);

        // ★ 修正：FamilyCount 現在儲存為「眷屬數」，getIntField 已補償 +1 (本人)
        const total = family + finalGuestCount;

        let nameSuffix = '';
        if (total > 1) {
            nameSuffix = ` <span class="text-gray-600 font-bold">*${total}</span>`;
        }

        let subHtml = '';
        if (guestData.length > 0) {
            subHtml = guestData.map(g => `<div class="pl-8 text-gray-600 text-sm mt-0.5">來賓：${escapeHtml(g.name)}</div>`).join('');
        } else {
            const guestNameStr = getField(row, 'guestName');
            if (guestNameStr && guestNameStr !== '無') {
                subHtml = `<div class="pl-8 text-gray-600 text-sm mt-0.5">來賓：${escapeHtml(guestNameStr)}</div>`;
            }
        }

        const pickup = getField(row, 'pickup');
        const room = getField(row, 'room');
        const tableCount = getIntField(row, 'tableCount');
        const sponsor = getField(row, 'sponsor');

        const num = (idx + 1).toString().padStart(2, '0');

        // 取得角色標籤
        const roles = getParticipantRoles(name, appState.currentEvent);
        let tagHtml = '';
        if (roles.length > 0) {
            tagHtml = roles.map(r => `<span class="text-[12px] font-bold ml-1.5 flex items-center" style="color:${r.color};">${r.label}</span>`).join('');
        }

        const liP = document.createElement('li');
        liP.className = 'px-4 py-3 hover:bg-[#1E3052] transition';

        // ★ 小瑪莉前三名勳章（網頁名單內顯示）
        let maryMedal = '';
        let maryNameColor = '';
        if (appState.jackpotRankings && appState.jackpotRankings.length > 0) {
            const rankIndex = appState.jackpotRankings.findIndex(r => r.name === name);
            if (rankIndex === 0) { maryMedal = '🥇'; maryNameColor = 'color:#d97706;font-weight:800;'; }
            else if (rankIndex === 1) { maryMedal = '🥈'; maryNameColor = 'color:#64748b;font-weight:800;'; }
            else if (rankIndex === 2) { maryMedal = '🥉'; maryNameColor = 'color:#b45309;font-weight:800;'; }
        }

        liP.innerHTML = `
            <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <span class="text-[#B8B2A7] font-mono text-sm">${num}.</span>
                <span class="font-bold text-[#EFECE5] text-base inline-flex items-center flex-wrap" style="${maryNameColor}">${maryMedal}${safeName}${tagHtml}${nameSuffix}</span>
            </div>
            ${subHtml}`;
        fragP.appendChild(liP);

        if (appState.currentEvent.type === 'travel') {
            // 檢查主要人員
            if ((pickup && pickup !== '無') || (room && room !== '無')) {
                hasTravel = true;
                const liT = document.createElement('li');
                liT.className = 'px-4 py-2 flex justify-between items-center hover:bg-[#1E3052] text-sm';
                liT.innerHTML = `
                    <span class="font-medium text-[#EFECE5]">${safeName}</span>
                    <div class="text-right text-xs text-[#B8B2A7]">
                        ${pickup && pickup !== '無' ? `<div class="text-[#D4AF37]">${escapeHtml(pickup)}</div>` : ''}
                        ${room && room !== '無' ? `<div class="text-[#EFC958]">${escapeHtml(room)}</div>` : ''}
                    </div>`;
                fragT.appendChild(liT);
            }

            // 檢查來賓
            guestData.forEach(g => {
                if ((g.pickup && g.pickup !== '無') || (g.room && g.room !== '無')) {
                    hasTravel = true;
                    const liTG = document.createElement('li');
                    liTG.className = 'px-4 py-2 flex justify-between items-center hover:bg-[#1E3052] text-sm';
                    liTG.innerHTML = `
                        <span class="font-medium text-[#EFECE5]"><span class="text-xs text-[#B8B2A7] mr-1">賓</span>${escapeHtml(g.name)}</span>
                        <div class="text-right text-xs text-[#B8B2A7]">
                            ${g.pickup && g.pickup !== '無' ? `<div class="text-[#D4AF37]">${escapeHtml(g.pickup)}</div>` : ''}
                            ${g.room && g.room !== '無' ? `<div class="text-[#EFC958]">${escapeHtml(g.room)}</div>` : ''}
                        </div>`;
                    fragT.appendChild(liTG);
                }
            });
        }

        const items = [];
        if (tableCount > 0) items.push(`認桌 ${tableCount} 桌`);

        // 使用輔助函式解析贊助
        const spList = parseSponsorData(sponsor);
        if (spList.length > 0) {
            items.push(...spList);
        }

        if (items.length > 0) {
            hasItems = true;
            const liI = document.createElement('li');
            liI.className = 'px-4 py-3 hover:bg-[#1E3052]';
            liI.innerHTML = `
                <div class="flex justify-between items-start">
                    <span class="font-medium text-[#EFECE5] text-sm">${safeName}</span>
                    <div class="text-right flex-1 pl-4">
                        ${items.map(i => `<div class="text-xs text-[#162544] bg-[#D4AF37] font-bold inline-block px-2 py-1 rounded mb-1 ml-1">${i}</div>`).join('')}
                    </div>
                </div>`;
            fragI.appendChild(liI);
        }
    });

    listP.appendChild(fragP);
    listT.appendChild(fragT);
    listI.appendChild(fragI);

    if (hasTravel) {
        document.getElementById('travel-separator').classList.remove('hidden');
        listT.classList.remove('hidden');
    }
    if (hasItems) {
        document.getElementById('details-separator').classList.remove('hidden');
        listI.classList.remove('hidden');
    }
}

// ==========================================
// 6. UTILITY FUNCTIONS
// ==========================================

/**
 * ★ parseLocalDate — 統一時間字串解析工具（防止 UTC 時差 +8 小時 BUG）
 * 問題：'yyyy-MM-dd HH:mm' 格式字串給 new Date() 會被当成 UTC 解析，
 *          導致 GMT+8 地區時間少了 8 小時（如 18:29 變 00:00）。
 * 解決：自動辨識格式，給無時區的字串加上 +08:00 後缀再解析。
 * 輸入：字串或 Date 物件
 * 輸出：Date 物件（GMT+8 正確時間）
 */
function parseLocalDate(s) {
    if (!s) return new Date(NaN);
    if (s instanceof Date) return s;
    const str = String(s).trim();
    // 如果已包含 +時區資訊（+08:00, Z, UTC 等），直接解析
    if (/[Z+]\d{2}:?\d{2}$/.test(str) || str.endsWith('Z')) {
        return new Date(str);
    }
    // 匹配 yyyy-MM-dd HH:mm(:ss) 或 yyyy/MM/dd HH:mm(:ss)（月份/日期支援不補零）
    const match = str.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) {
        const y = match[1], mo = match[2], d = match[3];
        const h = match[4] || '00', mi = match[5] || '00', sec = match[6] || '00';
        // 加上 +08:00 確保聲明 GMT+8 解析
        // ★ Bug 修正：月日時分補零，確保 RFC 3339 格式，防止部分 Safari 解析失敗
        return new Date(`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(mi).padStart(2,'0')}:${String(sec).padStart(2,'0')}+08:00`);
    }
    return new Date(str);
}

function formatDateShort(isoStr) {
    if (!isoStr) return '';
    if (isoStr.includes('~')) {
        const start = isoStr.split('~')[0];
        const d = parseLocalDate(start);
        if (isNaN(d.getTime())) return start;
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}...`;
    }
    const d = parseLocalDate(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${week})`;
}

function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = parseLocalDate(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${week}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDateOnly(isoStr) {
    if (!isoStr) return '';
    const d = parseLocalDate(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${week})`;
}

/**
 * ★ 統一時間格式化（分享/圖片/複製共用）
 * 輸入：ISO 日期字串或 "start~end" 範圍字串
 * 輸出：格式化後的顯示字串
 */
function formatTimeForShare(timeStr) {
    if (!timeStr) return '';
    if (timeStr.includes('~')) {
        const [start, end] = timeStr.split('~');
        return `${formatDateOnly(start.trim())} ~ ${formatDateOnly(end.trim())}`;
    }
    // ★ Bug 修正：改用 parseLocalDate，防止 LINE WebView 的 new Date() 時區偏移 8 小時
    const d = parseLocalDate(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${week}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * ★ 統一判斷今天是否為活動日（分享/複製時自動顯示地圖連結共用）
 * 輸入：活動物件（含 time 欄位）
 * 輸出：Boolean
 */
function isEventDay(event) {
    if (!event || !event.time) return false;
    const today = new Date();
    const todayY = today.getFullYear();
    const todayM = (today.getMonth() + 1).toString().padStart(2, '0');
    const todayD = today.getDate().toString().padStart(2, '0');
    const todayStr = `${todayY}-${todayM}-${todayD}`;

    const t = event.time;
    if (typeof t === 'string' && t.includes('~')) {
        const [startStr, endStr] = t.split('~').map(s => s.trim());
        const startD = parseLocalDate(startStr); // ★ 改用 parseLocalDate
        const endD = parseLocalDate(endStr);     // ★ 改用 parseLocalDate
        if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
            // ★ Bug 修正：避免 toDateString() 跨瀏覽器不一致，改為直接比較年月日
            const tY = todayDate.getFullYear(), tM = todayDate.getMonth(), tD = todayDate.getDate();
            const sY = startD.getFullYear(), sM = startD.getMonth(), sD = startD.getDate();
            const eY = endD.getFullYear(), eM = endD.getMonth(), eD = endD.getDate();
            const todayNum = tY * 10000 + tM * 100 + tD;
            const startNum = sY * 10000 + sM * 100 + sD;
            const endNum = eY * 10000 + eM * 100 + eD;
            return todayNum >= startNum && todayNum <= endNum;
        }
    } else {
        const eventDate = parseLocalDate(t); // ★ 改用 parseLocalDate
        if (!isNaN(eventDate.getTime())) {
            const eStr = `${eventDate.getFullYear()}-${(eventDate.getMonth() + 1).toString().padStart(2, '0')}-${eventDate.getDate().toString().padStart(2, '0')}`;
            return todayStr === eStr;
        }
    }
    return false;
}


/**
 * 統一解析來賓資料：支援多種格式（JSON、JSON 字串或舊版字串）
 * 無論是 JSON、Array 還是 String，統一轉為標準格式 Array
 * 回傳來賓物件陣列：{ name, count, pickup, room }
 */

function parseGuestData(row) {
    let guestData = [];
    if (!row || typeof row !== 'object') return guestData;

    // 定義候選鍵值 (新增更多變化)
    const jsonKeys = ['guestList', 'guestJson', 'GuestJson', 'GuestList', 'guest_json', 'guest_list', '來賓資料JSON', '來賓資料', 'json', 'JSON', 'guests', 'Guests', 'extraData'];
    const nameKeys = ['guestName', 'GuestName', 'Guest Name', 'guest_name', 'Guest Names', 'Guest_Names', 'guestNames', 'guest_names', '來賓姓名', '來賓', 'Guest', 'guest', 'memo', 'Memo', '備註'];

    // 使用強健的輔助函式取得數值
    let guestJson = findCaseInsensitiveValue(row, jsonKeys);
    let guestNameStr = findCaseInsensitiveValue(row, nameKeys);

    // 1. 嘗試解析 JSON
    if (guestJson && guestJson !== '[]' && guestJson !== '無') {
        try {
            const parsed = (typeof guestJson === 'string') ? JSON.parse(guestJson) : guestJson;
            if (Array.isArray(parsed)) {
                guestData = parsed.map(g => {
                    // 若 g 是字串 (例如 ["Guest A", "Guest B"])
                    if (typeof g === 'string') {
                        return { name: g, count: 1, pickup: '', room: '' };
                    }
                    // 若 g 是物件
                    return {
                        // ★ 關鍵修正：增加檢查 guestName, GuestName 等欄位
                        name: g.name || g.Name || g['姓名'] || g.guestName || g.GuestName || g['來賓姓名'] || '',
                        count: parseInt(g.count || g.Count || g['人數']) || 1,
                        pickup: g.pickup || g.Pickup || '',
                        room: g.room || g.Room || ''
                    };
                }).filter(g => g.name); // 過濾掉沒有名字的項目
            }
        } catch (e) {
            // JSON 解析失敗，忽略
        }
    }

    // 2. 備援策略
    // 若 JSON 解析失敗或為空，且 guestName 為空，嘗試使用 guestJson 當作字串 (若是純字串填入 guestList 欄位的情況)
    let sourceStr = guestNameStr;
    // 只有當 guestJson 看起來不像 JSON (不以 [ 或 { 開頭) 時，才把它當作普通字串處理
    if ((!sourceStr || sourceStr === '無') && guestJson && typeof guestJson === 'string' && !guestJson.trim().startsWith('[') && !guestJson.trim().startsWith('{')) {
        sourceStr = guestJson;
    }

    if (guestData.length === 0 && sourceStr && sourceStr !== '無') {
        // 確保為字串
        sourceStr = String(sourceStr);

        // 新增換行符號支援
        const guestEntries = sourceStr.split(/[,、;\n]\s*/);
        guestEntries.forEach(g => {
            if (!g.trim()) return;
            let parts = g.split('|');
            let namePart = parts[0].trim();
            let displayName = namePart;
            let count = 1;

            // 解析 "名字(2)" 或 "名字(+2)" 這種格式
            const match = namePart.match(/(.*?)\((\+)?(\d+)\)/);
            if (match) {
                displayName = match[1].trim();
                count = parseInt(match[3]); // match[3] is the number
            }

            guestData.push({
                name: displayName,
                count: count,
                pickup: parts[1] && parts[1] !== '無' ? parts[1] : '',
                room: parts[2] && parts[2] !== '無' ? parts[2] : ''
            });
        });
    }

    return guestData;
}

/**
 * 解析贊助資料（支援各種格式）
 * 回傳贊助字串陣列
 */
function parseSponsorData(input) {
    let list = [];
    if (!input || input === '無') return list;

    // 1. 嘗試 JSON
    try {
        const json = (typeof input === 'string' && (input.startsWith('[') || input.startsWith('{')))
            ? JSON.parse(input)
            : input;
        if (Array.isArray(json)) {
            return json;
        }
    } catch (e) { /* Not JSON */ }

    // 2. 備援：分割字串
    if (typeof input === 'string') {
        const items = input.split(/[,、;]\s*/);
        items.forEach(item => {
            const clean = item.trim();
            if (clean && clean !== '無') {
                list.push(clean);
            }
        });
    }
    return list;
}

// refreshIcons 已在 script 頂部定義（批次版本）

function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');

    if (viewId === 'view-home') {
        DOM.btnBack.classList.add('hidden');
        DOM.btnShare.classList.remove('hidden');
        appState.historyStack = ['home'];
    } else if (viewId === 'view-activity-detail') {
        DOM.btnBack.classList.remove('hidden');
        DOM.btnShare.classList.remove('hidden');
    } else {
        DOM.btnBack.classList.remove('hidden');
        DOM.btnShare.classList.add('hidden');
    }
    window.scrollTo(0, 0);
}

function handleBackNav() {
    const current = appState.historyStack.pop();
    const prev = appState.historyStack[appState.historyStack.length - 1];

    if (!prev || prev === 'home' || prev === 'list') {
        DOM.headerTitle.innerText = "活動與報名";
        switchView('view-home');
        appState.historyStack = ['home'];
        appState.currentEvent = null;
        renderEventGrid(appState.currentCategory);
    }
}

function toggleHistoryView() {
    const container = document.getElementById('history-list');
    const isHidden = container.classList.contains('hidden');
    const btnText = document.getElementById('history-btn-text');
    // 修正：改為控制活動列表區塊而非已刪除的 active-categories
    const activeEventSection = document.getElementById('active-event-section');
    const createBtn = document.getElementById('btn-create-event');

    if (isHidden) {
        // 切換到歷史模式
        if (activeEventSection) activeEventSection.classList.add('hidden');
        if (createBtn) createBtn.classList.add('hidden');
        container.classList.remove('hidden');
        btnText.innerText = "返回首頁";

        // 渲染歷史列表
        const list = document.getElementById('history-items');
        list.innerHTML = '';
        // 篩選已結束的活動（隔天才進歷史）
        const history = appState.events.filter(e => !canModifyEvent(e));

        if (history.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">無歷史紀錄</div>';
        } else {
            // 效能優化：使用 DocumentFragment 取代 innerHTML 累加
            const fragment = document.createDocumentFragment();
            history.forEach(e => {
                const div = document.createElement('div');
                div.className = "bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center cursor-pointer hover:bg-gray-50";
                div.onclick = () => openHistoryImage(e.id);
                div.innerHTML = `
                    <div>
                        <h4 class="font-bold text-gray-700">${e.name}</h4>
                        <div class="text-xs text-gray-500 mt-0.5">主辦：${e.organizer || '未指定'}</div>
                        <div class="text-xs text-gray-400 mt-1">${formatDateShort(e.time)}</div>
                    </div>
                    <span class="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">已結束</span>`;
                fragment.appendChild(div);
            });
            list.appendChild(fragment);
        }
    } else {
        // 切換回首頁模式
        if (activeEventSection) activeEventSection.classList.remove('hidden');
        if (createBtn) createBtn.classList.remove('hidden');
        container.classList.add('hidden');
        btnText.innerText = "查看歷史活動";
    }
}

// --- 歷史活動點擊直接產生圖片 ---
async function openHistoryImage(eventId) {
    const event = appState.events.find(e => e.id === eventId);
    if (!event) return;

    appState.currentEvent = event;
    appState.cachedDetails = null;
    appState.currentStats = {};

    showToast('正在產生歷史圖卡...');

    try {
        // 抓取報名資料（使用與 fetchDetails 相同的 API）
        const detailRes = await fetch(`${GAS_URL}?action=getDetails&eventId=${encodeURIComponent(eventId)}`);
        appState.cachedDetails = await detailRes.json();

        // 抓取統計資料（使用與 fetchStats 相同的 API）
        const statsRes = await fetch(`${GAS_URL}?action=stats&eventId=${encodeURIComponent(eventId)}&_=${Date.now()}`);
        appState.currentStats = await statsRes.json();
    } catch (err) {
        console.error('抓取歷史報名資料失敗:', err);
    }

    const e = appState.currentEvent;
    const data = appState.cachedDetails || [];

    try {
        // 產生圖卡 HTML（與 shareAsImage 相同邏輯）
        const card = document.createElement('div');
        card.style.cssText = 'position:fixed;left:-9999px;top:0;width:420px;padding:32px;background:linear-gradient(180deg,#f0fdf4 0%,#ffffff 100%);font-family:"Segoe UI","Noto Sans TC",sans-serif;color:#1f2937;z-index:-1;';

        let html = '';
        html += '<div style="background:linear-gradient(135deg,#06c755 0%,#059669 100%);color:white;padding:20px 24px;border-radius:16px;margin-bottom:20px;">';
        html += `<div style="font-size:22px;font-weight:800;">📅 ${escapeHtml(e.name)}</div>`;
        html += '<div style="font-size:12px;margin-top:6px;opacity:0.8;">已結束</div>';
        html += '</div>';

        // 活動資訊區
        html += '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
        if (e.organizer) html += `<div style="font-size:14px;margin-bottom:8px;">👤 主辦人：${escapeHtml(e.organizer)}</div>`;
        // ★ 使用共用工具函式格式化時間
        const timeDisplay = formatTimeForShare(e.time);
        if (timeDisplay) html += `<div style="font-size:14px;margin-bottom:8px;">🕒 時間：${escapeHtml(timeDisplay)}</div>`;
        if (e.location) html += `<div style="font-size:14px;margin-bottom:8px;">📍 地點：${escapeHtml(e.location)}</div>`;
        if (e.address) html += `<div style="font-size:14px;margin-bottom:8px;">🚗 地址：${escapeHtml(e.address)}</div>`;
        html += '</div>';

        // 名單區
        if (data.length > 0) {
            html += '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
            html += '<div style="font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #06c755;">👥 報名名單</div>';
            let count = 0;
            data.forEach(p => {
                count++;
                const family = getIntField(p, 'family');
                const guestData = parseGuestData(p);
                // 冗餘處理：使用統一計算函數
                const finalGuestCount = calculateFinalGuestCount(p, guestData);

                // ★ 修正：FamilyCount 現在儲存為「眷屬數」，getIntField 已補償 +1 (本人)
                const total = family + finalGuestCount;
                const num = count.toString().padStart(2, '0');
                const status = p.status || p.note || '';
                let prefix = status ? status : '';
                const roles = getParticipantRoles(p.name, e);
                let tagHtml = '';
                if (roles.length > 0) {
                    tagHtml = roles.map(r => `<span style="color:${r.color};font-size:12px;font-weight:bold;margin-left:6px;display:inline-flex;align-items:center;">${r.label}</span>`).join('');
                }
                // ★ 新增：檢查是否為小瑪莉前三名
                let nameColor = 'inherit';
                let maryMedal = '';
                if (appState.jackpotRankings && appState.jackpotRankings.length > 0) {
                    const rankIndex = appState.jackpotRankings.findIndex(r => r.name === p.name);
                    if (rankIndex === 0) { nameColor = '#f59e0b'; maryMedal = '🥇'; }      // 金
                    else if (rankIndex === 1) { nameColor = '#64748b'; maryMedal = '🥈'; } // 銀
                    else if (rankIndex === 2) { nameColor = '#b45309'; maryMedal = '🥉'; } // 銅
                }

                html += `<div style="font-size:14px;padding:4px 0;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;">`;
                html += `<span style="color:#06c755;font-weight:700;margin-right:4px;">${num}.</span> <span style="display:inline-flex;align-items:center;color:${nameColor};font-weight:${nameColor !== 'inherit' ? '800' : 'normal'};">${maryMedal}${escapeHtml(prefix)}${escapeHtml(p.name)}${tagHtml}</span>`;
                if (total > 1) html += `<span style="color:#f59e0b;font-weight:600;margin-left:6px;">×${total}</span>`;
                html += '</div>';
                if (guestData.length > 0) {
                    const guestParts = guestData.map(g => g.count > 1 ? `${g.name}×${g.count}` : g.name);
                    html += `<div style="font-size:12px;color:#6b7280;padding:2px 0 4px 20px;">來賓：${guestParts.join('、')}</div>`;
                } else {
                    const guestNameStr = getField(p, 'guestName');
                    if (guestNameStr && guestNameStr !== '無') {
                        html += `<div style="font-size:12px;color:#6b7280;padding:2px 0 4px 20px;">來賓：${guestNameStr}</div>`;
                    }
                }

                // 上車/房型
                {
                    let travelLines = [];
                    if (p.pickup && p.pickup !== '無') travelLines.push(`車: ${p.pickup}`);
                    if (p.room && p.room !== '無') travelLines.push(`房: ${p.room}`);
                    if (guestData.length > 0) {
                        guestData.forEach(g => {
                            let extras = [];
                            if (g.pickup && g.pickup !== '無') extras.push(g.pickup);
                            if (g.room && g.room !== '無') extras.push(g.room);
                            if (extras.length > 0) travelLines.push(`[賓]${g.name}: ${extras.join('/')}`);
                        });
                    }
                    if (travelLines.length > 0) {
                        html += `<div style="font-size:12px;color:#7c3aed;padding:2px 0 4px 20px;">${travelLines.join('、')}</div>`;
                    }
                }
            });
            html += '</div>';
        }

        // 贊助/認桌彙總區（獨立區塊）
        if (data.length > 0) {
            let sponsorHtml = '';
            data.forEach(p => {
                let moneyParts = [];
                const tc = getIntField(p, 'tableCount');
                if (tc > 0) moneyParts.push(`認桌 ${tc}桌`);
                const sponsorRaw = getField(p, 'sponsor');
                const sponsorList = parseSponsorData(sponsorRaw);
                sponsorList.forEach(s => moneyParts.push(s));
                if (moneyParts.length > 0) {
                    sponsorHtml += `<div style="font-size:13px;padding:6px 0;border-bottom:1px solid #f3f4f6;padding-left:16px;">🎁 <span style="font-weight:600;">${p.name}</span> ━ ${moneyParts.join('、')}</div>`;
                }
            });
            if (sponsorHtml) {
                html += '<div style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
                html += '<div style="font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #f59e0b;color:#d97706;">💰 贊助 / 認桌資訊</div>';
                html += sponsorHtml;
                html += '</div>';
            }
        }

        // 統計區
        html += '<div style="text-align:center;font-size:14px;font-weight:700;color:#374151;padding:8px 0;">';
        html += `共 ${appState.currentStats.totalPeople || 0} 人報名`;
        html += '</div>';
        html += '<div style="text-align:center;font-size:11px;color:#9ca3af;margin-top:8px;">大老二兄弟會 活動報名系統</div>';

        card.innerHTML = html;
        document.body.appendChild(card);

        const canvas = await html2canvas(card, {
            scale: 2, useCORS: true, backgroundColor: null,
            width: card.scrollWidth, height: card.scrollHeight
        });
        document.body.removeChild(card);

        // 產生圖片 URL
        const imgUrl = canvas.toDataURL('image/png');

        // 建立全螢幕彈窗顯示圖片
        const overlay = document.createElement('div');
        overlay.id = 'history-image-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;animation:fadeIn 0.3s ease;';
        overlay.innerHTML = `
            <div style="max-width:420px;width:100%;max-height:75vh;overflow-y:auto;border-radius:16px;box-shadow:0 25px 50px rgba(0,0,0,0.5);">
                <img src="${imgUrl}" style="width:100%;display:block;border-radius:16px;" alt="歷史活動圖卡">
            </div>
            <div style="display:flex;gap:12px;margin-top:20px;">
                <button onclick="saveHistoryImage()" style="background:#06c755;color:white;padding:12px 28px;border-radius:12px;font-weight:700;font-size:15px;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(6,199,85,0.4);">📥 存入相片</button>
                <button onclick="closeHistoryImage()" style="background:rgba(255,255,255,0.15);color:white;padding:12px 28px;border-radius:12px;font-weight:700;font-size:15px;border:1px solid rgba(255,255,255,0.3);cursor:pointer;backdrop-filter:blur(8px);">✕ 關閉</button>
            </div>
        `;
        document.body.appendChild(overlay);

    } catch (err) {
        console.error('歷史圖卡產生失敗', err);
        showToast('產生歷史圖卡失敗：' + err.message);
    }
}

function closeHistoryImage() {
    const overlay = document.getElementById('history-image-overlay');
    if (overlay) overlay.remove();
}

function saveHistoryImage() {
    const overlay = document.getElementById('history-image-overlay');
    if (!overlay) return;
    const img = overlay.querySelector('img');
    if (!img) return;
    const link = document.createElement('a');
    link.download = `${appState.currentEvent.name}_歷史紀錄.png`;
    link.href = img.src;
    link.click();
    showToast('圖片已下載！');
}

// ★ Bug 修正：Toast 計時器變數，防止多次呼叫時前一個計時器未清除導致提前消失
let _toastTimer = null;
function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    document.getElementById('toast-msg').innerText = msg;
    toast.classList.remove('opacity-0', 'pointer-events-none', 'top-6');
    toast.classList.add('top-20', 'opacity-100');

    // ★ 清除前一個計時器，確保每次都從頭計 2.5 秒
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        toast.classList.remove('top-20', 'opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none', 'top-6');
        _toastTimer = null;
    }, 2500);
}

function showConfirm(msg) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-msg').innerHTML = msg;
        modal.classList.remove('hidden');

        const cleanup = () => {
            modal.classList.add('hidden');
            document.getElementById('confirm-yes').onclick = null;
            document.getElementById('confirm-no').onclick = null;
        };

        document.getElementById('confirm-yes').onclick = () => { cleanup(); resolve(true); };
        document.getElementById('confirm-no').onclick = () => { cleanup(); resolve(false); };
    });
}

function closeDetailsModal() {
    const content = document.getElementById('modal-content');
    content.classList.remove('translate-y-10', 'sm:translate-y-0', 'opacity-100');
    content.classList.add('translate-y-full', 'opacity-0');
    setTimeout(() => document.getElementById('details-modal').classList.add('hidden'), 300);
}

// --- Sponsor Functions ---
function renderAddSponsorUI() {
    const type = document.querySelector('input[name="addSponsorType"]:checked').value;
    const area = document.getElementById('sponsor-input-area');
    if (type === 'alcohol') {
        area.innerHTML = `
            <input id="sp-qty" type="number" class="w-20 border border-[#D4AF37]/30 bg-[#0D131A] text-[#EFECE5] rounded-lg px-3 py-2 text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] focus:ring-1 focus:ring-[#D4AF37] outline-none" placeholder="數量" min="1">
            <select id="sp-unit" class="border border-[#D4AF37]/30 bg-[#0D131A] text-[#EFECE5] rounded-lg px-2 py-2 text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] focus:ring-1 focus:ring-[#D4AF37] outline-none">
                <option value="瓶">瓶</option>
                <option value="箱">箱</option>
            </select>`;
    } else if (type === 'money') {
        area.innerHTML = `<input id="sp-money" type="number" class="w-full border border-[#D4AF37]/30 bg-[#0D131A] text-[#EFECE5] rounded-lg px-3 py-2 text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] focus:ring-1 focus:ring-[#D4AF37] outline-none" placeholder="金額 (100為單位)" min="100" step="100">`;
    } else {
        area.innerHTML = `<input id="sp-other" type="text" class="w-full border border-[#D4AF37]/30 bg-[#0D131A] text-[#EFECE5] rounded-lg px-3 py-2 text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] focus:ring-1 focus:ring-[#D4AF37] outline-none" placeholder="贊助內容">`;
    }
}

function addSponsor() {
    const type = document.querySelector('input[name="addSponsorType"]:checked').value;
    let res = '';

    if (type === 'alcohol') {
        const qty = document.getElementById('sp-qty').value;
        const unit = document.getElementById('sp-unit').value;
        if (!qty || parseInt(qty) <= 0) return showToast("請輸入有效數量");
        res = `酒類: ${qty}${unit}`;
    } else if (type === 'money') {
        const val = document.getElementById('sp-money').value;
        const num = parseInt(val, 10);
        if (!num || num <= 0) return showToast("金額不能為負數或零");
        if (num % 100 !== 0) return showToast("金額須為 100 的倍數");
        res = `紅包: ${num}元`;
    } else {
        const val = document.getElementById('sp-other').value.trim();
        if (!val) return showToast("請輸入內容");
        res = `其他: ${val}`;
    }
    appState.sponsorList.push(res);
    renderSponsorList();
}

function removeSponsor(i) { appState.sponsorList.splice(i, 1); renderSponsorList(); }



// --- Helpers for Select Population ---
function populateSelect(id, items) {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value; // Preserve value
    el.innerHTML = '<option value="">請選擇...</option>';
    if (items) items.forEach(i => {
        const v = i.includes('|') ? i.split('|')[0] : i; // Handle "Label|Url" format
        // Ensure text does not contain URL if it is Name|Url
        const text = i.includes('|') ? i.split('|')[0] : v;
        el.add(new Option(text, v));
    });
    el.value = val;
}

function populateRoomOptions(id, opts) {
    const el = document.getElementById(id);
    const currentVal = el.value; // Preserve value
    el.innerHTML = '<option value="">請選擇...</option>';
    if (!opts) return;

    opts.forEach(opt => {
        let name = opt;
        let limit = null;
        // Parse "Double:10"
        if (opt.includes(':')) {
            const parts = opt.split(':');
            name = parts[0];
            limit = parts[1];
        }

        // Get Current Stats
        const current = (appState.currentStats.roomCounts && appState.currentStats.roomCounts[name]) || 0;

        let label = name;
        if (limit) {
            label += ` (已訂:${current}/${limit})`;
        } else {
            label += ` (已訂:${current})`;
        }
        el.add(new Option(label, name));
    });
    el.value = currentVal;
}

function populateCountOptions() {
    const f = document.getElementById('family-count');
    const g = document.getElementById('add-guest-count');

    // 人數(含眷屬)：顯示 1~10 人，值為 1~10（總人數含本人）
    // handleSubmit 會 -1 轉為眷屬數再送出
    // 預設 1 人 (值 1)
    f.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
        f.add(new Option(`${i} 人`, i));
    }

    // 來賓人數：顯示 1~10 人，值為 1~10
    g.innerHTML = '';
    for (let i = 1; i <= 10; i++) {
        g.add(new Option(`${i} 人`, i));
    }
}
// onLocationChange 已移除：引用的 'new-location-select' 元素不存在
function updatePickupMap() {
    const val = document.getElementById('pickup-loc').value;
    const btn = document.getElementById('pickup-map-btn');
    // Enhanced check for "Name|Url" format
    const opt = appState.currentEvent.pickupOpts?.find(o => o.startsWith(val) || (o.includes('|') && o.split('|')[0] === val));

    if (opt && opt.includes('|')) {
        btn.classList.remove('hidden');
        btn.href = opt.split('|')[1];
    } else {
        btn.classList.add('hidden');
    }
}
function toggleCreateFields() {
    const type = document.getElementById('new-type').value;
    const isTravel = type === 'travel';
    document.getElementById('new-field-time-single').classList.toggle('hidden', isTravel);
    document.getElementById('new-field-time-range').classList.toggle('hidden', !isTravel);
    document.getElementById('new-field-itinerary').classList.toggle('hidden', !isTravel);
    document.getElementById('travel-notice')?.classList.toggle('hidden', !isTravel);
}

function renderItinerary(str, timeStr) {
    const container = document.getElementById('itinerary-accordion-content');
    if (!container) return;

    container.innerHTML = '';
    if (!str) return;

    // 準備日期計算
    let startDate = null;
    if (timeStr) {
        const startRaw = timeStr.includes('~') ? timeStr.split('~')[0] : timeStr;
        const d = parseLocalDate(startRaw); // ★ 改用 parseLocalDate 避免日程日期偬差
        if (!isNaN(d.getTime())) {
            startDate = d;
        }
    }

    // 1. 解析與分組
    const rawParts = str.split(/;|；/);
    const groupedDays = new Map();

    let currentDayNum = 1;

    rawParts.forEach((part, index) => {
        if (!part.trim()) return;

        // 偵測 D1, Day 1 標籤
        let dayNum = currentDayNum;
        const match = part.match(/^(D(\d+)|Day\s*(\d+)|第\s*(\d+)\s*天)(\s*[:：])?/i);

        if (match) {
            const numStr = match[2] || match[3] || match[4];
            if (numStr) {
                dayNum = parseInt(numStr);
                currentDayNum = dayNum;
            }
        }

        if (!groupedDays.has(dayNum)) {
            groupedDays.set(dayNum, { rawTexts: [] });
        }

        // 清除 D1: 前綴
        let cleanPart = part;
        if (match) {
            cleanPart = part.substring(match[0].length).trim();
        }

        groupedDays.get(dayNum).rawTexts.push(cleanPart);
    });

    // 建立手風琴外框
    const wrapper = document.createElement('div');
    wrapper.className = "border border-[#D4AF37]/30 rounded-2xl overflow-hidden bg-[#0D131A] shadow-[0_4px_15px_rgba(0,0,0,0.3)]";

    // 2. 渲染 HTML
    const sortedDayNums = Array.from(groupedDays.keys()).sort((a, b) => a - b);

    sortedDayNums.forEach((dayNum, idx) => {
        const group = groupedDays.get(dayNum);

        // 計算日期標籤 (顯示在綠色小框框)
        let dayLabel = `D${dayNum}`; // 預設顯示 D1, D2
        if (startDate) {
            const currentDay = new Date(startDate);
            currentDay.setDate(startDate.getDate() + (dayNum - 1));
            const m = currentDay.getMonth() + 1;
            const d = currentDay.getDate();
            const w = ['日', '一', '二', '三', '四', '五', '六'][currentDay.getDay()];
            dayLabel = `${m}/${d} (${w})`;
        }

        // ★ 修改點：主標題直接設定為 "第 X 天行程"
        const accordionMainTitle = `第 ${dayNum} 天行程`;

        let allContentHtml = '<div class="space-y-4 relative pl-2 pt-2 pb-2">';
        allContentHtml += '<div class="absolute left-[5px] top-4 bottom-2 w-0.5 bg-[#D4AF37]/20"></div>';

        group.rawTexts.forEach(text => {
            if (!text.trim()) return;

            // --- 資料解析區塊 ---
            let itemTitle = text;
            let itemDesc = '';
            let itemUrl = '';

            // 1. 如果有用 | 分隔，先切開
            if (text.includes('|')) {
                const parts = text.split('|');
                itemTitle = parts[0].trim();
                itemDesc = parts.slice(1).join('|').trim();

                // 檢查最後一個欄位是否為 URL
                if (parts.length >= 3) {
                    const lastPart = parts[parts.length - 1].trim();
                    if (lastPart.startsWith('http')) {
                        itemUrl = lastPart;
                        itemDesc = parts.slice(1, parts.length - 1).join('|').trim();
                    }
                }
            }

            // 2. 智慧提取 URL
            const urlRegex = /([（\(【\[\{])?(https?:\/\/[^\s\)]+)([）\)】\]\}])?/;
            if (!itemUrl && itemDesc && urlRegex.test(itemDesc)) {
                const match = itemDesc.match(urlRegex);
                itemUrl = match[2];
                itemDesc = itemDesc.replace(match[0], '').trim();
            }
            if (!itemUrl && itemTitle && urlRegex.test(itemTitle)) {
                const match = itemTitle.match(urlRegex);
                itemUrl = match[2];
                itemTitle = itemTitle.replace(match[0], '').trim();
            }

            // 3. 清理殘留符號
            itemTitle = itemTitle.replace(/^[：:\s]+/, '').replace(/\(\s*\)$/, '').trim();

            // 4. 處理標題內的日期
            itemTitle = itemTitle.replace(/\d{4}[-/](\d{1,2})[-/](\d{1,2})/, '$1/$2').replace(/\b0(\d):\b/g, '$1:');

            // 5. 提取時間 (HH:mm)
            let timeDisplay = '';
            const timeMatch = itemTitle.match(/(?:[\d\/\-\.]+\s+)?(\d{1,2}:\d{2})(?::\d{2})?\s*(.*)/);
            if (timeMatch) {
                let rawTime = timeMatch[1];
                if (rawTime.startsWith('0')) rawTime = rawTime.substring(1);
                timeDisplay = rawTime;
                itemTitle = timeMatch[2].replace(/^[：:\s]+/, '');
            }

            // --- HTML 生成區塊 ---
            const mapIconHtml = itemUrl ?
                `<a href="${itemUrl}" target="_blank" class="inline-flex items-center justify-center w-6 h-6 bg-[#1E3052] text-[#D4AF37] rounded-full hover:bg-[#162544] border border-[#D4AF37]/30 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)] transition ml-2 shrink-0 self-center" title="導航" onclick="event.stopPropagation()">
                    <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
                 </a>` : '';

            if (timeDisplay) {
                allContentHtml += `
                    <div class="relative flex gap-3 items-start pl-4 group/item">
                        <div class="absolute left-0 top-1.5 w-3 h-3 bg-[#0D131A] border-[3px] border-[#D4AF37] rounded-full z-10 shadow-[0_0_8px_rgba(212,175,55,0.5)]"></div>
                        <div class="font-mono font-bold text-[#EFC958] shrink-0 pt-0.5 w-[42px] text-right mr-1">${timeDisplay}</div>
                        <div class="flex-1 min-w-0 pt-0.5">
                            <div class="flex items-center flex-wrap">
                                <span class="text-[#EFECE5] font-bold leading-tight">${itemTitle}</span>
                                ${mapIconHtml}
                            </div>
                            ${itemDesc ? `<p class="text-xs text-[#D4AF37]/70 mt-1 leading-relaxed">${itemDesc}</p>` : ''}
                        </div>
                    </div>`;
            } else {
                allContentHtml += `
                    <div class="relative flex gap-3 items-start pl-4">
                        <div class="absolute left-1 top-2.5 w-1.5 h-1.5 bg-[#D4AF37]/50 rounded-full z-10"></div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center flex-wrap">
                                <span class="text-[#EFECE5]/90 font-medium leading-tight">${itemTitle}</span>
                                ${mapIconHtml}
                            </div>
                            ${itemDesc ? `<p class="text-xs text-[#D4AF37]/70 mt-1 leading-relaxed">${itemDesc}</p>` : ''}
                        </div>
                    </div>`;
            }
        });
        allContentHtml += '</div>';

        // 手風琴 Header
        const isOpen = idx === 0;

        const details = document.createElement('details');
        details.setAttribute('name', 'itinerary-group');
        details.className = "group border-b border-[#D4AF37]/20 last:border-0 transition-all itinerary-group";
        if (isOpen) details.setAttribute('open', '');

        const summary = document.createElement('summary');
        summary.className = "flex justify-between items-center p-4 cursor-pointer select-none bg-[#162544]/30 hover:bg-[#162544]/60 transition list-none relative";

        summary.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <span class="bg-gradient-to-r from-[#D4AF37] to-[#A67C00] text-[#0D131A] text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap shadow-sm">${dayLabel}</span>
                <span class="font-bold text-[#EFECE5] text-base truncate">${accordionMainTitle}</span>
            </div>
            <div class="w-6 h-6 flex items-center justify-center rounded-full border border-[#D4AF37]/30 bg-[#0D131A] text-[#D4AF37] font-bold shrink-0 ml-2 shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)]">
                <span class="icon-plus">+</span>
                <span class="icon-minus">−</span>
            </div>
        `;

        const contentDiv = document.createElement('div');
        contentDiv.className = "px-4 pb-4 pt-0 bg-[#0D131A]/80 text-sm text-[#EFECE5]/80 leading-relaxed space-y-2 group-content";
        contentDiv.innerHTML = allContentHtml;

        details.appendChild(summary);
        details.appendChild(contentDiv);
        wrapper.appendChild(details);
    });

    container.appendChild(wrapper);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// --- 分類切換函式 ---
function switchCategory(type) {
    appState.currentCategory = type;
    // 移除所有 Tab 的 active 樣式
    document.querySelectorAll('.filter-tab').forEach(btn => btn.classList.remove('active'));
    // 加上當前 Tab 的 active 樣式
    const tab = document.getElementById(`tab-${type}`);
    if (tab) tab.classList.add('active');

    renderEventGrid(type);
}

function showCreateView() {
    appState.historyStack.push('create');
    switchView('view-create');
    DOM.headerTitle.innerText = "建立新活動";

    document.getElementById('new-name').value = '';
    document.getElementById('new-time-single').value = '';
    const dateStart = document.getElementById('new-date-start');
    const dateEnd = document.getElementById('new-date-end');
    if (dateStart) dateStart.value = '';
    if (dateEnd) dateEnd.value = '';

    document.getElementById('new-location').value = '';
    document.getElementById('new-address').value = '';
    document.getElementById('new-deadline').value = '';
    document.getElementById('new-itinerary').value = '';
    document.getElementById('new-organizer').value = appState.user.displayName;

    toggleCreateFields();
}

// --- Create Event (Real Submit) ---
async function handleCreateEvent(e) {
    e.preventDefault();
    if (_isSubmitting) return; // ★ 防重複提交鎖
    const btn = document.getElementById('create-btn');
    const originalBtnHTML = btn.innerHTML; // 保存原始按鈕內容

    // 1. 鎖定按鈕避免重複點擊
    _isSubmitting = true;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> 建立中...';
    refreshIcons();

    // 2. 收集表單資料
    const type = document.getElementById('new-type').value;
    let timeVal = '';

    // 根據類型處理時間格式
    if (type === 'travel') {
        const start = document.getElementById('new-date-start').value;
        const end = document.getElementById('new-date-end').value;
        if (!start || !end) {
            showToast("旅遊活動請填寫出發與回程日期");
            btn.disabled = false; btn.innerHTML = originalBtnHTML; return;
        }
        timeVal = `${start}~${end}`;
    } else {
        timeVal = document.getElementById('new-time-single').value;
        if (!timeVal) {
            showToast("請填寫活動時間");
            btn.disabled = false; btn.innerHTML = originalBtnHTML; return;
        }
    }

    // 3. 準備傳送的資料物件
    const payload = {
        action: 'createEvent', // 告訴 GAS 這是「建立活動」的請求
        userId: appState.user.userId, // 記錄是誰建立的
        type: type,
        name: document.getElementById('new-name').value,
        organizer: document.getElementById('new-organizer').value,
        location: document.getElementById('new-location').value,
        address: document.getElementById('new-address').value,
        deadline: document.getElementById('new-deadline').value,
        time: timeVal,
        itinerary: document.getElementById('new-itinerary').value // 旅遊行程
    };

    try {
        // 4. 發送至後端
        const result = await apiSubmit(payload);

        // ★ 檢查後端回傳是否包含錯誤
        if (result && result.error) {
            showToast('⚠️ ' + result.error);
        } else if (result && result.queued) {
            showToast('⚠️ 目前離線，建立請求已暫存');
        } else {
            showToast("活動建立成功！");

            // 5. 重新讀取活動列表並回到首頁
            await fetchEvents();
            appState.historyStack = ['home'];
            handleBackNav();
        }
    } catch (err) {
        console.error(err);
        showToast("建立失敗，請檢查網路或稍後再試");
    } finally {
        // 6. 復原按鈕狀態
        _isSubmitting = false; // ★ 解鎖
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
        refreshIcons();
    }
}

// --- Status Toggle (修復版：真正傳送資料給 GAS) ---
async function toggleEventStatus() {
    const btn = document.getElementById('btn-status-toggle');
    const originalHTML = btn.innerHTML; // 記住原本按鈕長怎樣

    // 1. 顯示讀取動畫
    btn.disabled = true;
    btn.innerHTML = '<i class="animate-spin" data-lucide="loader-2"></i> 處理中';
    refreshIcons();

    // 2. 判斷目前狀態並決定新狀態
    // 目前是開放 -> 要改成 close
    // 目前是關閉 -> 要改成 open
    const currentStatus = isEventOpen(appState.currentEvent);
    const newStatus = currentStatus ? "close" : "open";

    try {
        // 3. 發送請求給 GAS
        await apiSubmit({
            action: 'toggleStatus',
            eventId: appState.currentEvent.id,
            userId: appState.user.userId, // 用於驗證是否為主辦人
            status: newStatus
        });

        // 4. 更新本地資料與畫面
        // ★ 修正：與後端 handleToggleStatus 回傳的狀態值統一（'開放'/'關閉'）
        appState.currentEvent.isActive = newStatus === "open" ? '開放' : '關閉';
        renderEventStaticInfo();
        showToast(newStatus === "open" ? "活動已重新開放" : "活動已關閉");

    } catch (err) {
        console.error(err);
        showToast("狀態更新失敗，請檢查網路");
    } finally {
        // 5. 恢復按鈕
        btn.disabled = false;
        // renderEventStaticInfo 會自動更新按鈕文字，所以這裡不需要還原 originalHTML
    }
}

// Utils
/** 判斷目前登入使用者是否在黑名單中 */
function isCurrentUserBlacklisted() {
    if (!appState.settings || !appState.settings.blacklist) return false;
    if (!appState.user) return false;
    const bl = appState.settings.blacklist;
    return !!(bl[appState.user.userId] || bl[appState.user.displayName]);
}

function isEventOpen(e) {
    if (!e) return false;
    // 1. 檢查活動狀態
    const statusOpen = e.isActive === true || e.isActive === '開放' || e.isActive === 'open';
    if (!statusOpen) return false;

    // 2. 檢查活動日期 - 當天仍顯示在報名區（隔天才移到歷史）
    if (!e.time) return true;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ★ 改用 parseLocalDate，防止 LINE WebView 的 new Date("yyyy-MM-dd HH:mm") 解析偏移
    const timeStr = e.time.includes('~') ? e.time.split('~')[0].trim() : e.time;
    const eventDate = parseLocalDate(timeStr);

    // 如果事件日期無效，允許顯示
    if (isNaN(eventDate.getTime())) return true;

    eventDate.setHours(0, 0, 0, 0);

    // 明天之後的活動才移到歷史區（當天仍留在報名區）
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return eventDate.getTime() >= tomorrow.getTime();
}

// 新增：檢查是否可以修改（當天仍可修改）
function canModifyEvent(e) {
    if (!e) return false;
    if (!e.time) return true;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ★ 改用 parseLocalDate，防止 LINE WebView 的 new Date("yyyy-MM-dd HH:mm") 解析偏移
    const timeStr = e.time.includes('~') ? e.time.split('~')[0].trim() : e.time;
    const eventDate = parseLocalDate(timeStr);

    if (isNaN(eventDate.getTime())) return true;

    eventDate.setHours(0, 0, 0, 0);

    // 當天及未來活動都可修改（隔天才進歷史）
    return eventDate.getTime() >= today.getTime();
}
function normalizeType(t) {
    t = t.toLowerCase();
    if (t.includes('一般')) return 'general';
    if (t.includes('餐會')) return 'banquet';
    if (t.includes('旅遊')) return 'travel';
    return t;
}

// --- Role Helper ---
// ★ 新增：統一取得特殊身分屬性 (會長/輔導會長/爐主/壽星)
function getParticipantRoles(pName, event) {
    if (!pName) return [];
    const cleanName = pName.trim();
    const roles = [];
    const special = (appState.settings && appState.settings.specialRoles) ? appState.settings.specialRoles : {};

    if (special.president && cleanName === special.president) {
        roles.push({ type: 'president', label: '👑 會長', textLabel: '[👑會長]', color: '#d97706' });
    }

    if (special.vicePresident && cleanName === special.vicePresident) {
        roles.push({ type: 'vicePresident', label: '👸 輔導會長', textLabel: '[👸輔導會長]', color: '#9333ea' });
    }

    if (event && event.organizer) {
        const organizers = event.organizer.split(/[、,，\s]+/).map(o => o.trim()).filter(Boolean);
        if (organizers.includes(cleanName)) {
            roles.push({ type: 'host', label: '🍻 爐主', textLabel: '[🍻爐主]', color: '#ea580c' });
        }
    }

    if (event && event.time) {
        let month = null;
        let timeStr = event.time;
        if (timeStr.includes('~')) timeStr = timeStr.split('~')[0];
        const d = parseLocalDate(timeStr); // ★ 改用 parseLocalDate 避免 UTC 偵差
        if (!isNaN(d.getTime())) {
            month = d.getMonth() + 1;
        }

        if (month && special.birthdays && special.birthdays[month]) {
            if (special.birthdays[month].includes(cleanName)) {
                roles.push({ type: 'birthday', label: `🎂 ${month}月壽星`, textLabel: `[🎂${month}月壽星]`, color: '#db2777' });
            }
        }
    }

    return roles;
}

// --- Share Modal Logic ---

async function openShareModal(mode) {
    const e = appState.currentEvent;
    if (!mode) {
        mode = e ? 'single' : 'all';
    }

    const tabsContainer = document.getElementById('share-tabs-container');
    if (tabsContainer) {
        if (!e) {
            tabsContainer.classList.add('hidden');
            mode = 'all';
        } else {
            tabsContainer.classList.remove('hidden');
        }
    }

    if (e) {
        const s = appState.currentStats;
        // ★ 修正：若無快取資料，先嘗試抓取
        if (!appState.cachedDetails || appState.cachedDetails.length === 0) {
            showToast("正在讀取名單...");
            const details = await fetchDetails();
            appState.cachedDetails = details;

            if (!appState.cachedDetails || appState.cachedDetails.length === 0) {
                // 雖然無名單，但活動資訊仍可分享，故不阻擋，僅提示
            } else {
                showToast("名單讀取完成");
            }
        }

        // 重置 checkbox 狀態
        document.getElementById('share-opt-sponsor').checked = true;
        document.getElementById('share-opt-travel').checked = true;

        // 判斷是否顯示「贊助/認桌」選項
        const hasTable = s.tableCount && s.tableCount > 0;
        const detailsHasSponsor = (appState.cachedDetails || []).some(p => {
            const tc = getIntField(p, 'tableCount');
            const spRaw = getField(p, 'sponsor');
            const spList = parseSponsorData(spRaw);
            return tc > 0 || spList.length > 0;
        });
        const hasSponsor = hasTable || detailsHasSponsor || (e.type !== 'travel' && s.secondary > 0);

        const sponsorEl = document.getElementById('opt-container-sponsor');
        if (sponsorEl) {
            if (hasSponsor) {
                sponsorEl.classList.remove('hidden');
            } else {
                sponsorEl.classList.add('hidden');
            }
        }

        // 判斷是否顯示「上車/房型」選項
        const isTravel = e.type === 'travel';
        const travelEl = document.getElementById('opt-container-travel');
        if (travelEl) {
            if (isTravel) {
                travelEl.classList.remove('hidden');
            } else {
                travelEl.classList.add('hidden');
            }
        }

        // 確保隱藏無選項提示
        const noOptsEl = document.getElementById('share-no-opts');
        if (noOptsEl) noOptsEl.classList.add('hidden');

        // 重置選項預設狀態
        const mapCheckbox = document.getElementById('share-opt-map');
        const namesCheckbox = document.getElementById('share-opt-names');
        const linkCheckbox = document.getElementById('share-opt-link');
        if (mapCheckbox) mapCheckbox.checked = false;
        if (namesCheckbox) namesCheckbox.checked = false;
        if (linkCheckbox) linkCheckbox.checked = true;
    }

    document.getElementById('share-modal').classList.remove('hidden');
    switchShareTab(mode);
}

function switchShareTab(tab) {
    const tabSingle = document.getElementById('share-tab-single');
    const tabAll = document.getElementById('share-tab-all');
    const contentSingle = document.getElementById('share-single-content');
    const contentAll = document.getElementById('share-all-content');

    if (!tabSingle || !tabAll || !contentSingle || !contentAll) return;

    if (tab === 'single') {
        tabSingle.classList.add('text-green-600', 'bg-white', 'shadow-sm');
        tabSingle.classList.remove('text-gray-400');
        tabAll.classList.remove('text-green-600', 'bg-white', 'shadow-sm');
        tabAll.classList.add('text-gray-400');

        contentSingle.classList.remove('hidden');
        contentAll.classList.add('hidden');
    } else {
        tabAll.classList.add('text-green-600', 'bg-white', 'shadow-sm');
        tabAll.classList.remove('text-gray-400');
        tabSingle.classList.remove('text-green-600', 'bg-white', 'shadow-sm');
        tabSingle.classList.add('text-gray-400');

        contentSingle.classList.add('hidden');
        contentAll.classList.remove('hidden');

        // 渲染所有舉辦中活動清單
        renderShareAllEventsList();
    }
    refreshIcons();
}

function renderShareAllEventsList() {
    const container = document.getElementById('share-all-events-list');
    if (!container) return;

    const activeEvents = appState.events.filter(e => isEventOpen(e));
    if (activeEvents.length === 0) {
        container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">目前無舉辦中活動</div>';
        return;
    }

    container.innerHTML = '';
    activeEvents.forEach(e => {
        const item = document.createElement('div');
        item.className = "flex items-center gap-3 p-2.5 bg-gray-50/10 rounded-xl border border-white/5";
        item.innerHTML = `
            <div class="flex-1 min-w-0">
                <div class="font-medium text-[#EFECE5] truncate">${escapeHtml(e.name)}</div>
                <div class="text-xs text-[#D4AF37]/80 truncate">${formatTimeForShare(e.time) || '無時間'}</div>
            </div>
            <i data-lucide="check-circle-2" class="w-4 h-4 text-[#D4AF37]"></i>
        `;
        container.appendChild(item);
    });
    if (window.lucide) window.lucide.createIcons();
}
function canvasToFile(canvas, filename) {
    return new Promise(resolve => {
        canvas.toBlob(blob => {
            resolve(new File([blob], filename, { type: 'image/png' }));
        }, 'image/png');
    });
}

function generateSingleShareText(e, data, stats, options) {
    let text = `📅 【大老二兄弟會】近期舉辦中活動 👥\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    
    text += `1️⃣ ${e.name}\n`;
    if (e.organizer) {
        text += `   👤 主辦人：${e.organizer}\n`;
    }
    text += `   🕒 時間：${formatTimeForShare(e.time) || '無時間'}\n`;
    if (e.location) {
        text += `   📍 地點：${e.location}\n`;
    }

    let sponsorHtml = '';
    if (data && data.length > 0) {
        data.forEach(p => {
            let moneyParts = [];
            const tc = getIntField(p, 'tableCount');
            if (tc > 0) moneyParts.push(`認桌 ${tc}桌`);
            const sponsorRaw = getField(p, 'sponsor');
            const sponsorList = parseSponsorData(sponsorRaw);
            sponsorList.forEach(s => moneyParts.push(s));
            
            if (moneyParts.length > 0) {
                sponsorHtml += `      🎁 ${p.name} ━ ${moneyParts.join('、')}\n`;
            }
        });
    }
    if (sponsorHtml) {
        text += `   💰 贊助 / 認桌資訊\n${sponsorHtml}`;
    }

    const total = stats.totalPeople || stats.total || 0;
    if (total > 0) {
        text += `   📊 統計：共 ${total} 人報名\n`;
    }
    
    if (options && options.includeMap && e.mapLink) {
        text += `   🗺️ 地圖：${e.mapLink}\n`;
    }
    
    text += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    if (!options || options.includeLink !== false) {
        text += `🔗 統一報名連結👇：\nhttps://liff.line.me/2008678090-aXTesgDK\n`;
    }
    return text;
}

async function generateAllShareText(eventDataList) {
    let text = `📅 【大老二兄弟會】近期舉辦中活動 👥\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    
    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

    eventDataList.forEach(({ event: e, data, stats }, index) => {
        const numEmoji = numberEmojis[index] || `${index+1}.`;
        text += `${numEmoji} ${e.name}\n`;
        
        if (e.organizer) {
            text += `   👤 主辦人：${e.organizer}\n`;
        }
        text += `   🕒 時間：${formatTimeForShare(e.time) || '無時間'}\n`;
        if (e.location) {
            text += `   📍 地點：${e.location}\n`;
        }

        let sponsorHtml = '';
        if (data && data.length > 0) {
            data.forEach(p => {
                let moneyParts = [];
                const tc = getIntField(p, 'tableCount');
                if (tc > 0) moneyParts.push(`認桌 ${tc}桌`);
                const sponsorRaw = getField(p, 'sponsor');
                const sponsorList = parseSponsorData(sponsorRaw);
                sponsorList.forEach(s => moneyParts.push(s));
                
                if (moneyParts.length > 0) {
                    sponsorHtml += `      🎁 ${p.name} ━ ${moneyParts.join('、')}\n`;
                }
            });
        }
        if (sponsorHtml) {
            text += `   💰 贊助 / 認桌資訊\n${sponsorHtml}`;
        }

        const total = stats.totalPeople || stats.total || 0;
        if (total > 0) {
            text += `   📊 統計：共 ${total} 人報名\n`;
        }
        text += `\n`;
    });
    
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🔗 統一報名連結👇：\nhttps://liff.line.me/2008678090-aXTesgDK\n`;
    return text;
}

function fallbackShareSingle(file, text, eventName) {
    showToast("瀏覽器不支援原生分享，請手動儲存圖片");
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = `${eventName}_名單.png`;
    a.click();
    URL.revokeObjectURL(a.href);
    navigator.clipboard.writeText(text).then(() => {
        setTimeout(() => showToast("已複製活動資訊文字"), 1000);
    });
}

function fallbackShareAll(files, text) {
    showToast(`不支援一次分享多張圖片，將分批下載圖片`);
    files.forEach((file, idx) => {
        setTimeout(() => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(file);
            a.download = file.name;
            a.click();
            URL.revokeObjectURL(a.href);
        }, idx * 500);
    });
    navigator.clipboard.writeText(text).then(() => {
        setTimeout(() => showToast("已複製活動資訊文字"), files.length * 500 + 500);
    });
}

async function executeShare(mode) {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (mode === 'single') {
        const e = appState.currentEvent;
        if (!e) return;
        
        const btn = document.getElementById('btn-share-single');
        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> 產生中...';
        if (window.lucide) window.lucide.createIcons();
        
        try {
            const data = appState.cachedDetails || [];
            const stats = appState.currentStats || {};
            
            // 1. 生成 Canvas 與圖片檔案
            const canvas = await generateEventCanvas(e, data, stats);
            const file = await canvasToFile(canvas, `${e.name}_名單.png`);
            
            // 2. 生成排版文字
            const includeMap = document.getElementById('share-opt-map')?.checked || false;
            const includeLink = document.getElementById('share-opt-link')?.checked !== false;
            const shareText = generateSingleShareText(e, data, stats, { includeMap, includeLink });
            
            // 3. 關閉彈窗
            document.getElementById('share-modal').classList.add('hidden');
            
            // 4. 執行分享
            if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        text: shareText
                    });
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        fallbackShareSingle(file, shareText, e.name);
                    }
                }
            } else {
                fallbackShareSingle(file, shareText, e.name);
            }
        } catch (err) {
            console.error(err);
            showToast("分享產生失敗，請重試");
        } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            if (window.lucide) window.lucide.createIcons();
        }
        
    } else if (mode === 'all') {
        const selectedEvents = appState.events.filter(e => isEventOpen(e));
        if (selectedEvents.length === 0) {
            showToast("⚠️ 目前沒有舉辦中的活動");
            return;
        }
        
        const btn = document.getElementById('btn-share-all');
        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> 產生中...';
        if (window.lucide) window.lucide.createIcons();
        
        try {
            
            // 1. 並行拉取所有活動的資料
            const eventDataPromises = selectedEvents.map(async (e) => {
                let data = [];
                let stats = {};
                if (appState.currentEvent && e.id === appState.currentEvent.id) {
                    data = appState.cachedDetails || [];
                    stats = appState.currentStats || {};
                } else {
                    [data, stats] = await Promise.all([
                        fetchDetailsForEvent(e.id),
                        fetchStatsForEvent(e.id)
                    ]);
                }
                return { event: e, data, stats };
            });
            const eventDataList = await Promise.all(eventDataPromises);

            // 2. 並行產生所有圖片與 Canvas
            const filePromises = eventDataList.map(async ({ event: e, data, stats }) => {
                const canvas = await generateEventCanvas(e, data, stats);
                return canvasToFile(canvas, `${e.name}_名單.png`);
            });
            const files = await Promise.all(filePromises);
            
            // 3. 生成多活動彙整排版文字 (傳入已獲取的資料)
            const shareText = await generateAllShareText(eventDataList);
            
            // 3. 關閉彈窗
            document.getElementById('share-modal').classList.add('hidden');
            
            // 4. 執行分享
            if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: files })) {
                try {
                    await navigator.share({
                        files: files,
                        text: shareText
                    });
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        fallbackShareAll(files, shareText);
                    }
                }
            } else {
                fallbackShareAll(files, shareText);
            }
        } catch (err) {
            console.error(err);
            showToast("分享產生失敗，請重試");
        } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            if (window.lucide) window.lucide.createIcons();
        }
    }
}

// 舊按鈕 (名單視窗下方) 呼叫此函式：統一呼叫 openShareModal 以提供選項
function copyDetailsToClipboard() {
    openShareModal();
}

// 輔助獲取非當前活動之名單及統計資料的 API
async function fetchDetailsForEvent(eventId) {
    if (!GAS_URL || !eventId) return [];
    try {
        const res = await fetch(`${GAS_URL}?action=getDetails&eventId=${eventId}`);
        return await res.json();
    } catch (e) { return []; }
}

async function fetchStatsForEvent(eventId) {
    if (!GAS_URL || !eventId) return {};
    try {
        const res = await fetch(`${GAS_URL}?action=stats&eventId=${eventId}&_=${Date.now()}`);
        return await res.json();
    } catch (e) { return {}; }
}

// 依據活動名稱自動判斷合適的 Emoji
function getEventEmoji(eventName) {
    if (!eventName) return '📅';
    if (eventName.includes('家庭日')) return '📸';
    if (eventName.includes('小型餐會')) return '🍽️';
    if (eventName.includes('餐會') || eventName.includes('聚餐')) return '🍾';
    return '📅';
}

// 通用活動圖片 Canvas 生成邏輯 (高貴質感深色版)
async function generateEventCanvas(e, data, stats) {
    const includeSponsor = false; // 名單內不顯示贊助，改由下方獨立區塊顯示
    const includeTravel = true;
    const includeMap = false;     // 圖片不含地圖連結
    const includeNames = true;    // 圖片固定包含詳細名單
    const includeLink = false;    // 圖片不含報名連結

    // --- 1. 動態產生分享卡片 HTML ---
    // --- 1. 動態產生分享卡片 HTML ---
    const card = document.createElement('div');
    card.style.cssText = 'position:fixed;left:-9999px;top:0;width:440px;z-index:-1;';

    const iconEmoji = e.icon || getEventEmoji(e.name);
    
    let html = `
    <style>
      /* ==================== 基礎與排版設定 ==================== */
      .app-container {
        padding: 3rem 2.5rem; display: flex; flex-direction: column; align-items: center; box-sizing: border-box;
        /* 高質感木紋底圖 */
        background: url('images/wood-bg.jpg') repeat;
        background-size: cover;
        font-family: "PingFang TC", "Helvetica Neue", sans-serif; color: #EAD7BA;
      }
      .main-frame {
        width: 100%;
        /* 確保 html2canvas 支援的深藍皮革疊加法 */
        background: linear-gradient(rgba(20, 30, 48, 0.5), rgba(20, 30, 48, 0.5)), url('images/leather-bg.jpg') repeat;
        background-size: auto, 350px;
        border-radius: 12px;
        /* 移除實體邊框，改用陰影加深立體感 */
        box-shadow: inset 0 0 30px rgba(0,0,0,0.9);
        padding: 1.5rem;
        position: relative;
        z-index: 1;
      }
      .main-frame::before {
        content: ""; position: absolute; inset: -14px; border-radius: 18px; z-index: -1;
        /* 全新生成的香檳金屬框底圖 */
        background: url('images/champagne-gold-border.png') no-repeat center center;
        background-size: 100% 100%;
        box-shadow: inset 0 0 4px rgba(255,255,255,0.6), 0 10px 25px rgba(0,0,0,0.9);
      }
      .main-frame::after {
        content: ""; position: absolute; inset: -4px; border-radius: 14px; z-index: -1;
        border: 2px solid #0d131c; /* 內層細黑線增加層次 */
      }
      /* 螺絲釘 (純 CSS 3D 繪製，無去背問題) */
      .rivet {
        position: absolute; width: 16px; height: 16px; background: radial-gradient(circle, #e2cfb3 0%, #7c5c3b 100%);
        border-radius: 50%; box-shadow: inset -1px -1px 3px rgba(0,0,0,0.6), 1px 1px 3px rgba(0,0,0,0.8);
        border: 1px solid #332414; z-index: 10;
      }
      .rivet::after { content: ''; position: absolute; top: 50%; left: 15%; right: 15%; height: 1.5px; background: rgba(0,0,0,0.5); transform: translateY(-50%) rotate(45deg); }
      .rivet.tl { top: -3px; left: -3px; }
      .rivet.tr { top: -3px; right: -3px; }
      .rivet.bl { bottom: -3px; left: -3px; }
      .rivet.br { bottom: -3px; right: -3px; }
      
      /* ==================== 內部區塊通用 ==================== */
      .inner-box {
        background-color: rgba(26, 36, 54, 0.6);
        border: 2px solid transparent;
        border-radius: 8px;
        box-shadow: inset 0 2px 10px rgba(0,0,0,0.5), 0 4px 6px rgba(0,0,0,0.3);
        margin-bottom: 1.25rem;
        position: relative;
        z-index: 1;
      }
      /* 內部區塊漸層金屬框線 */
      .inner-box::before {
        content: ""; position: absolute; inset: -2px; border-radius: 10px; z-index: -1;
        background: url('images/champagne-gold-border.png') no-repeat center center;
        background-size: 100% 100%;
      }
      
      /* 圖片 Icon 共用樣式 */
      img.custom-icon { width: 1.5em; height: 1.5em; object-fit: contain; vertical-align: middle; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.8)); }
      img.header-icon-img { width: 3rem; height: 3rem; object-fit: contain; filter: drop-shadow(0 4px 5px rgba(0,0,0,0.8)); margin-right: 0.5rem; }

      /* ==================== 頂部標題區塊 ==================== */
      .header-card {
        padding: 1.25rem; display: flex; align-items: center; justify-content: center; gap: 0.75rem;
        background: linear-gradient(180deg, rgba(42,56,82,1) 0%, rgba(26,36,54,1) 100%);
        border-radius: 8px;
      }
      .header-icon { font-size: 2.5rem; line-height: 1; flex-shrink: 0; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.6)); padding-bottom: 4px; margin-right: 0.5rem; }
      .header-title {
        font-size: 1.25rem; font-weight: bold; letter-spacing: 0.05em; margin: 0;
        color: #F3E5AB; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
        white-space: normal; word-break: keep-all; flex: 1; line-height: 1.4;
      }

      /* ==================== 資訊區塊 ==================== */
      .info-card {
        padding: 1.25rem;
        background: linear-gradient(180deg, rgba(34,46,68,1) 0%, rgba(20,28,42,1) 100%);
        border-radius: 8px;
      }
      .info-list { list-style: none; padding: 0; margin: 0; font-size: 0.9rem; }
      .info-list li { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.85rem; }
      .info-list li:last-child { margin-bottom: 0; }
      .info-list .icon { font-size: 1.25rem; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.8)); }
      .info-list .text { color: #EAD7BA; line-height: 1.5; padding-top: 0.125rem; font-weight: 500; letter-spacing: 0.05em; }
      
      .note-box { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(212,175,122,0.3); }
      .note-box p { margin: 0; font-size: 0.85rem; color: #B0A08A; line-height: 1.5; }
      .note-title { color: #D4AF7A; font-weight: bold; }

      /* ==================== 名單區塊 ==================== */
      .list-card {
        padding: 1.25rem;
        border-radius: 8px;
        /* 棋盤格背景 */
        background-color: rgba(26,36,54,1);
        background-image: 
          linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.03) 75%, rgba(255,255,255,0.03)),
          linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.03) 75%, rgba(255,255,255,0.03));
        background-size: 40px 40px;
        background-position: 0 0, 20px 20px;
      }
      .list-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(212,175,122,0.5); }
      .list-header .icon { font-size: 1.35rem; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.8)); }
      .list-header h2 { font-size: 1.15rem; font-weight: bold; color: #D4AF7A; letter-spacing: 0.1em; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
      
      .list-item { padding-bottom: 0.65rem; margin-bottom: 0.65rem; border-bottom: 1px dashed rgba(212,175,122,0.2); }
      .list-item:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
      .item-title { display: flex; align-items: center; font-weight: bold; margin-bottom: 0.15rem; flex-wrap: wrap; font-size: 1.1rem; }
      .item-title .name { margin-right: 0.5rem; color: #F3E5AB; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
      .item-title .count { 
        color: #EAD7BA; font-size: 0.85rem; margin-left: 0.5rem; 
        font-weight: bold; font-family: monospace;
      }
      .item-detail { font-size: 0.85rem; color: #A89580; margin-left: 2rem; padding-top: 0.2rem; line-height: 1.4; }
      
      /* ==================== 獨立標籤配色 ==================== */
      .tag { 
        font-size: 0.95rem; font-weight: bold; margin-left: 0.5rem; display: inline-flex; align-items: center; 
        letter-spacing: 0.05em; text-shadow: 0 1px 2px rgba(0,0,0,0.8); 
      }
      .tag-orange { color: #F97316; } 
      .tag-pink { color: #EC4899; }   
      .tag-purple { color: #D8B4FE; } 
      .tag-gold { color: #EAB308; }   

      /* ==================== 贊助區塊 ==================== */
      .sponsor-card {
        padding: 1.25rem;
        background: linear-gradient(180deg, rgba(34,46,68,1) 0%, rgba(20,28,42,1) 100%);
        border-radius: 8px; margin-bottom: 0;
      }

      /* ==================== 底部總計 ==================== */
      .footer-wrapper { width: 100%; text-align: center; margin-top: 1rem; position: relative; z-index: 10; }
      .total-count { 
        color: #D4AF7A; font-weight: bold; font-size: 1.2rem; letter-spacing: 0.15em; 
        margin-bottom: 0.5rem; text-shadow: 0 2px 4px rgba(0,0,0,0.9); 
      }
      .copyright { color: #A89580; font-size: 0.8rem; letter-spacing: 0.1em; }
    </style>
    
    <div class="app-container">
      <div class="main-frame">
        <div class="rivet tl"></div>
        <div class="rivet tr"></div>
        <div class="rivet bl"></div>
        <div class="rivet br"></div>
        
        <div class="inner-box">
          <div class="header-card">
            <div class="header-icon">${iconEmoji}</div>
            <h1 class="header-title">${escapeHtml(e.name)}</h1>
          </div>
        </div>
        
        <div class="inner-box">
          <div class="info-card">
            <ul class="info-list">`;
            
    if (e.organizer) html += `<li><span class="icon">👤</span><div class="text">主辦人：${escapeHtml(e.organizer)}</div></li>`;
    const timeDisplay = formatTimeForShare(e.time);
    if (timeDisplay) html += `<li><span class="icon">🕒</span><div class="text">時間：${escapeHtml(timeDisplay)}</div></li>`;
    if (e.location)  html += `<li><span class="icon">📍</span><div class="text">地點：${escapeHtml(e.location)}</div></li>`;
    if (e.address)   html += `<li><span class="icon">🚗</span><div class="text">地址：${escapeHtml(e.address)}</div></li>`;
    
    html += `</ul>`;
    
    if (e.note) {
        html += `<div class="note-box"><p><span class="note-title">💡 備註：</span>${escapeHtml(e.note).replace(/\n/g, '<br>')}</p></div>`;
    }
    html += `</div></div>`;

    // 名單區
    if (includeNames && data.length > 0) {
        html += `<div class="inner-box">
                   <div class="list-card">
                     <div class="list-header"><span class="icon" style="margin-right:0.5rem;">👥</span><h2>報名名單</h2></div>`;
        let count = 0;
        data.forEach(p => {
            const family = getIntField(p, 'family');
            const guestData = parseGuestData(p);
            const finalGuestCount = calculateFinalGuestCount(p, guestData);
            const total = family + finalGuestCount;
            if (total === 0) return;

            count++;
            const num = count.toString().padStart(2, '0');
            const status = p.status || p.note || '';
            let prefix = status ? status : '';

            const roles = getParticipantRoles(p.name, e);
            let tagHtml = '';
            if (roles.length > 0) {
                tagHtml = roles.map(r => {
                    let tagClass = 'tag-orange'; 
                    let iconHtml = '';
                    let pureText = r.label.replace(/[👑👸🍻🎂]/g, '').trim();
                    
                    if(r.label.includes('會長') && !r.label.includes('輔導')) { tagClass = 'tag-gold'; iconHtml = '<span style="margin-right:4px;">👑</span>'; }
                    else if(r.label.includes('輔導會長')) { tagClass = 'tag-purple'; iconHtml = '<span style="margin-right:4px;">👸</span>'; }
                    else if(r.label.includes('壽星')) { tagClass = 'tag-pink'; iconHtml = '<span style="margin-right:4px;">🎂</span>'; }
                    else if(r.label.includes('爐主')) { tagClass = 'tag-orange'; iconHtml = '<span style="margin-right:4px;">🍻</span>'; }
                    
                    return `<span class="tag ${tagClass}">${iconHtml}${pureText}</span>`;
                }).join('');
            }

            let nameColor = '#F3E5AB';
            let maryMedal = '';
            if (appState.jackpotRankings && appState.jackpotRankings.length > 0) {
                const rankIndex = appState.jackpotRankings.findIndex(r => r.name === p.name);
                if (rankIndex === 0) { nameColor = '#EAB308'; maryMedal = '<span style="margin-right:4px;">🥇</span>'; }
                else if (rankIndex === 1) { nameColor = '#e2e8f0'; maryMedal = '<span style="margin-right:4px;">🥈</span>'; } 
                else if (rankIndex === 2) { nameColor = '#b45309'; maryMedal = '<span style="margin-right:4px;">🥉</span>'; }
            }

            html += `<div class="list-item">
                       <div class="item-title">
                         <span style="color:#A88B60;margin-right:0.5rem;font-family:monospace;font-size:1.1rem;">${num}.</span>
                         <span class="name" style="color:${nameColor};">${maryMedal}${escapeHtml(prefix)}${escapeHtml(p.name)}</span>
                         ${tagHtml}
                         ${total > 1 ? `<span class="count">×${total}</span>` : ''}
                       </div>`;

            // 來賓
            if (guestData.length > 0) {
                const guestParts = guestData.map(g => g.count > 1 ? `${g.name}×${g.count}` : g.name);
                html += `<div class="item-detail">↳ 來賓：${guestParts.join('、')}</div>`;
            } else {
                const guestNameStr = getField(p, 'guestName');
                if (guestNameStr && guestNameStr !== '無') {
                    html += `<div class="item-detail">↳ 來賓：${guestNameStr}</div>`;
                }
            }

            // 上車/房型
            if (includeTravel) {
                let travelLines = [];
                if (p.pickup && p.pickup !== '無') travelLines.push(`車: ${p.pickup}`);
                if (p.room && p.room !== '無') travelLines.push(`房: ${p.room}`);
                if (guestData.length > 0) {
                    guestData.forEach(g => {
                        let extras = [];
                        if (g.pickup && g.pickup !== '無') extras.push(g.pickup);
                        if (g.room && g.room !== '無') extras.push(g.room);
                        if (extras.length > 0) travelLines.push(`[賓]${g.name}: ${extras.join('/')}`);
                    });
                }
                if (travelLines.length > 0) {
                    html += `<div class="item-detail" style="color:#A88B60;">${travelLines.join('、')}</div>`;
                }
            }
            html += `</div>`;
        });
        html += `</div></div>`;
    }

    // 贊助/認桌彙總區
    if (data.length > 0) {
        let sponsorHtml = '';
        data.forEach(p => {
            const family = getIntField(p, 'family');
            const guestData = parseGuestData(p);
            const finalGuestCount = calculateFinalGuestCount(p, guestData);
            const total = family + finalGuestCount;

            let moneyParts = [];
            const tc = getIntField(p, 'tableCount');
            if (tc > 0) moneyParts.push(`認桌 ${tc}桌`);
            const sponsorRaw = getField(p, 'sponsor');
            const sponsorList = parseSponsorData(sponsorRaw);
            sponsorList.forEach(s => moneyParts.push(s));
            
            if (moneyParts.length > 0) {
                const label = (total === 0) ? '<span style="font-size:0.8rem;color:#EAB308;margin-left:0.5rem;opacity:0.8;">(純贊助)</span>' : '';
                sponsorHtml += `<div class="list-item" style="border-bottom:1px dashed rgba(212,175,122,0.2);display:flex;align-items:center;gap:0.75rem;padding:0.75rem 0.5rem;">
                                  <span class="icon" style="font-size:1.25rem;">🎁</span> 
                                  <span class="name" style="color:#F3E5AB;font-weight:bold;text-shadow: 0 1px 2px rgba(0,0,0,0.8);">${p.name}</span>${label} 
                                  <span style="color:#A88B60;">—</span> 
                                  <span style="color:#EAD7BA;font-size:0.95rem;">${moneyParts.join('、')}</span>
                                </div>`;
            }
        });
        if (sponsorHtml) {
            html += `<div class="inner-box" style="margin-bottom:0;">
                       <div class="sponsor-card">
                         <div class="list-header"><span class="icon" style="margin-right:0.5rem;">💰</span><h2>贊助 / 認桌資訊</h2></div>
                         ${sponsorHtml}
                       </div>
                     </div>`;
        }
    }

    // 底部統計區
    html += `
      </div>
      <!-- 底部統計區 -->
      <div class="footer-wrapper">
        <div class="total-count">共 ${stats.totalPeople || 0} 人報名</div>
        <div class="copyright">大老二兄弟會 活動報名系統</div>
      </div>
    </div>`;

    card.innerHTML = html;
    document.body.appendChild(card);

    // 等待所有圖片載入完成，確保 html2canvas 能截取到畫面
    const imgs = card.querySelectorAll('img');
    const loadPromises = Array.from(imgs).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
        });
    });
    await Promise.all(loadPromises);
    // 稍微延遲讓瀏覽器渲染背景圖
    await new Promise(r => setTimeout(r, 600));

    // --- 2. 使用 html2canvas 截取卡片 ---
    const canvas = await html2canvas(card, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#3b2518',
        width: card.scrollWidth,
        height: card.scrollHeight
    });

    // 移除暫時卡片
    document.body.removeChild(card);
    return canvas;
}






function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) { window.requestAnimationFrame(step); }
    };
    window.requestAnimationFrame(step);
}

function validateForm() {
    if (!DOM.userName || !DOM.userName.value.trim()) {
        showToast('請填寫姓名');
        return false;
    }

    // ★ 純贊助者：跳過旅遊欄位驗證
    const noAttendCb = document.getElementById('no-attendance-sponsor');
    const isSponsorOnly = noAttendCb && noAttendCb.checked;

    // ★ 旅遊活動：上車地點與房型需求為必選（純贊助者豁免）
    if (!isSponsorOnly && appState.currentEvent && appState.currentEvent.type === 'travel') {
        const pickupEl = document.getElementById('pickup-loc');
        const roomEl = document.getElementById('room-type');

        if (pickupEl && !pickupEl.value) {
            showToast('⚠️ 請選擇上車地點');
            scrollToAndHighlight(pickupEl);
            return false;
        }
        if (roomEl && !roomEl.value) {
            showToast('⚠️ 請選擇房型需求');
            scrollToAndHighlight(roomEl);
            return false;
        }
    }

    // ★ 純贊助者：至少需要有贊助項目或認桌
    if (isSponsorOnly) {
        const tc = parseInt(document.getElementById('table-count').value, 10) || 0;
        if (appState.sponsorList.length === 0 && tc === 0) {
            showToast('⚠️ 僅贊助模式下，請至少新增一筆贊助或認桌');
            return false;
        }
    }

    // ★ 防呆：檢查是否已有來賓資料缺少必填項目（針對舊資料）
    if (!isSponsorOnly && appState.currentEvent && appState.currentEvent.type === 'travel') {
        const invalidGuest = appState.guestList.find(g => !g.pickup || !g.room);
        if (invalidGuest) {
            showToast(`⚠️ 來賓「${invalidGuest.name}」缺少上車地點或房型，請先移除後重新加入`);
            return false;
        }
    }

    // ★ 防呆：檢查來賓欄位是否有填寫但未點擊加入
    const addGuestNameEl = document.getElementById('add-guest-name');
    const addGuestPickupEl = document.getElementById('add-guest-pickup');
    const addGuestRoomEl = document.getElementById('add-guest-room');
    const guestTravelVisible = document.getElementById('guest-travel-options') &&
                               !document.getElementById('guest-travel-options').classList.contains('hidden');
    
    if (!isSponsorOnly) {
        const hasUnaddedName = addGuestNameEl && addGuestNameEl.value.trim() !== '';
        const hasUnaddedTravel = guestTravelVisible && (
            (addGuestPickupEl && addGuestPickupEl.value !== '') ||
            (addGuestRoomEl && addGuestRoomEl.value !== '')
        );
        if (hasUnaddedName || hasUnaddedTravel) {
            showToast('⚠️ 您有填寫來賓資料但尚未點選「加入名單」，請先加入或清空欄位');
            scrollToAndHighlight(addGuestNameEl || addGuestPickupEl);
            return false;
        }
    }

    return true;
}

// ★ 不克出席，僅贊助 — 切換邏輯
function toggleNoAttendance(checkbox) {
    const isChecked = checkbox.checked;
    const familySelect = document.getElementById('family-count');
    const guestSection = document.getElementById('guest-section');
    const travelField = document.getElementById('field-travel');

    if (isChecked) {
        // 禁用人數（鎖定為最小值）
        if (familySelect) {
            familySelect.value = familySelect.options[0]?.value || '1';
            familySelect.disabled = true;
        }
        // 隱藏來賓區塊
        if (guestSection) guestSection.classList.add('hidden');
        // 隱藏旅遊欄位
        if (travelField) travelField.classList.add('hidden');
    } else {
        // 恢復人數選擇
        if (familySelect) familySelect.disabled = false;
        // 恢復來賓區塊
        if (guestSection) guestSection.classList.remove('hidden');
        // 恢復旅遊欄位（若為旅遊活動）
        if (travelField && appState.currentEvent && appState.currentEvent.type === 'travel') {
            travelField.classList.remove('hidden');
        }
    }
}

// ★ 捲動至指定欄位並加上紅色高亮閃爍效果
function scrollToAndHighlight(el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-red-500', 'border-red-500');
    el.focus();
    setTimeout(() => {
        el.classList.remove('ring-2', 'ring-red-500', 'border-red-500');
    }, 2500);
}

function addGuest() {
    const name = document.getElementById('add-guest-name').value.trim();
    const count = parseInt(document.getElementById('add-guest-count').value);
    if (!name) return showToast("請輸入來賓姓名");

    const pickup = document.getElementById('add-guest-pickup').value;
    const room = document.getElementById('add-guest-room').value;

    // 旅遊活動時，上車地點與房型為必選
    if (appState.currentEvent && appState.currentEvent.type === 'travel') {
        if (!pickup) return showToast("請選擇來賓的上車地點");
        if (!room) return showToast("請選擇來賓的房型");
    }

    // 產生簡易暫時 ID
    const id = 'g_' + Date.now() + Math.random().toString(36).substring(2, 7);

    appState.guestList.push({ id, name, count, pickup, room });

    // ★ 清空所有輸入欄，避免殘留資料
    document.getElementById('add-guest-name').value = '';
    const pickupEl = document.getElementById('add-guest-pickup');
    const roomEl = document.getElementById('add-guest-room');
    if (pickupEl) pickupEl.value = '';
    if (roomEl) roomEl.value = '';

    showToast(`✅ 來賓「${name}」已加入名單`);
    renderGuestList();
}
function removeGuest(id) {
    appState.guestList = appState.guestList.filter(g => g.id !== id);
    renderGuestList();
}

function restoreSponsorList(str) {
    appState.sponsorList = parseSponsorData(str);
    renderSponsorList();
}

function ensureManualCopyModalExists() {
    if (document.getElementById('manual-copy-modal')) return;
    // 建立視窗容器
    const div = document.createElement('div');
    // 直接使用 insertAdjacentHTML 插入 body 以避免外層包裝問題
    const html = `
<div id="manual-copy-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm hidden text-left" style="backdrop-filter: blur(4px);">
<div class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transform transition-all flex flex-col max-h-[80vh]">
<div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
    <h3 class="font-bold text-gray-800 flex items-center gap-2">
        <i data-lucide="clipboard-copy" class="w-5 h-5 text-gray-600"></i>
        複製名單
    </h3>
    <button onclick="document.getElementById('manual-copy-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition">
        <i data-lucide="x" class="w-5 h-5"></i>
    </button>
</div>
<div class="p-5 space-y-4 overflow-y-auto flex-1">
    <div class="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm flex items-start gap-2">
        <i data-lucide="info" class="w-4 h-4 mt-0.5 shrink-0"></i>
        <div class="leading-relaxed">若自動複製失敗，請點選「點擊複製」按鈕，或長按下方文字框全選複製。</div>
    </div>
    <!-- iOS 修正：移除 readonly，使用 inputmode="none" 與 contenteditable -->
    <textarea id="manual-copy-area" 
        class="w-full h-48 border border-gray-200 rounded-xl p-3 text-sm font-mono bg-gray-50 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none text-gray-700" 
        inputmode="none"
        onclick="this.select(); this.setSelectionRange(0, 99999);"></textarea>
</div>
<div class="p-4 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0">
     <button onclick="document.getElementById('manual-copy-modal').classList.add('hidden')" class="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition">關閉</button>
     <button onclick="retryCopy()" class="flex-1 py-3 rounded-xl font-bold text-[#0D131A] bg-gradient-to-r from-[#D4AF37] to-[#A67C00] shadow-[0_4px_15px_rgba(212,175,55,0.4)] active:scale-95 transition flex justify-center items-center gap-2">
        <i data-lucide="copy" class="w-4 h-4"></i> 點擊複製
     </button>
</div>
</div>
</div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    refreshIcons();
}

function retryCopy() {
    const area = document.getElementById('manual-copy-area');
    const text = area.value;
    // 優先嘗試非同步 API（現應處於使用者操作觸發之情境）
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("已複製名單到剪貼簿");
            document.getElementById('manual-copy-modal').classList.add('hidden');
        }).catch(err => {
            console.error('Retry Async failed', err);
            fallbackCopyManual();
        });
    } else {
        fallbackCopyManual();
    }
}

function fallbackCopyManual() {
    const area = document.getElementById('manual-copy-area');
    area.focus();
    area.select();
    // iOS 修正
    area.setSelectionRange(0, 99999);
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast("已複製名單到剪貼簿");
            document.getElementById('manual-copy-modal').classList.add('hidden');
        } else {
            showToast("複製失敗，請手動長按全選複製");
        }
    } catch (e) {
        showToast("複製失敗，請手動複製");
    }
}

function copyTextToClipboard(text) {
    const manualFallback = () => openManualCopyModal(text);

    // 1. 第一備案：Textarea（部分手機瀏覽器支援同步執行）
    const fallbackCopy = (txt) => {
        const textArea = document.createElement("textarea");
        textArea.value = txt;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px"; // 避免視覺閃爍
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                if (navigator.vibrate) navigator.vibrate(50);
                showToast("名單已複製！");
            } else {
                throw new Error("execCommand failed");
            }
        } catch (err) {
            console.warn("Textarea fallback failed, opening manual modal", err);
            manualFallback();
        }
        document.body.removeChild(textArea);
    };

    const directCopy = (txt) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(txt).then(() => {
                if (navigator.vibrate) navigator.vibrate(50);
                showToast("名單已複製！");
            }).catch((err) => {
                console.warn("Clipboard API failed", err);
                fallbackCopy(txt);
            });
        } else {
            fallbackCopy(txt);
        }
    };

    const tryLiffOrCopy = () => {
        if (typeof liff !== 'undefined' && liff.isApiAvailable('shareTargetPicker')) {
            liff.shareTargetPicker([{ type: "text", text: text }])
                .then((res) => {
                    if (!res) directCopy(text);
                })
                .catch(() => directCopy(text));
        } else {
            directCopy(text);
        }
    };

    // 判斷是否為手機裝置
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // 若為手機，優先嘗試使用系統原生分享 API (支援傳送至 LINE、MMS 等)
    if (isMobile && navigator.share) {
        const e = appState.currentEvent;
        navigator.share({
            title: e ? e.name : '活動分享',
            text: text
        }).then(() => {
            console.log('分享成功');
        }).catch((err) => {
            // 若使用者主動取消分享，會回傳 AbortError，此時不須執行複製
            if (err.name !== 'AbortError') {
                console.warn("原生分享發生錯誤，改為複製文字", err);
                tryLiffOrCopy();
            }
        });
    } else {
        // 電腦版或不支援原生分享的裝置，則單純複製文字
        tryLiffOrCopy();
    }
}

// 為了程式碼整潔，將開啟手動視窗的邏輯獨立出來 (請將此函式加在 copyTextToClipboard 下方)
function openManualCopyModal(text) {
    ensureManualCopyModalExists();
    const area = document.getElementById('manual-copy-area');
    // 確保元素存在再賦值
    if (area) {
        area.value = text;
        // 針對 iOS Safari 的特殊處理，防止鍵盤彈出但能選取
        area.contentEditable = true;
        area.readOnly = false;
    }

    const modal = document.getElementById('manual-copy-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }

    refreshIcons();

    // 嘗試選取文字，方便使用者直接複製
    if (area) {
        setTimeout(() => {
            area.select();
            area.setSelectionRange(0, 99999); // 針對行動裝置
        }, 100);
    }
}

// --- Tutorial Modal Logic ---
function openTutorialModal() {
    const modal = document.getElementById('tutorial-modal');
    const content = document.getElementById('tutorial-modal-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('translate-y-full', 'opacity-0');
        content.classList.add('translate-y-10', 'sm:translate-y-0', 'opacity-100');
    }, 10);
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function closeTutorialModal() {
    const modal = document.getElementById('tutorial-modal');
    const content = document.getElementById('tutorial-modal-content');
    if (!modal || !content) return;

    content.classList.remove('translate-y-10', 'sm:translate-y-0', 'opacity-100');
    content.classList.add('translate-y-full', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}