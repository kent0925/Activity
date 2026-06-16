// 憭扯��??�??�暑?訫𥼚?滨頂蝯?- 銝餅??函?撘誯?頛?
// 敺?index.html ?賢枂?�蜓閬?JavaScript

// ==========================================
// 1. 閮剖??�???
// ==========================================

// ??隢𧢲𤜯?𤤿�?函? Google Apps Script 蝬脣?
const GAS_URL = "https://script.google.com/macros/s/AKfycbzTiALv2VOAvtuUgFx623KQgkvlmkkEc-bSgFQXiLqcxWpi9FvSrSxkSibjdRwO7tVn/exec";

// ??隢𧢲𤜯?𤤿�?函? LIFF ID
const LIFF_ID = "2008678090-aXTesgDK";

// ??蝞∠???LineID ?𡑒”嚗�恣?�摱?羓焵?⊿??嗡?銝滢?蝝�?�?
const ADMIN_USER_IDS = ["U612df670c4d7d3cde0d599ab5008451f"];

// ?�?贝???
let appState = {
    events: [],
    settings: { organizers: [], locations: [] },
    user: { userId: '', displayName: '閮芸恥', pictureUrl: '' },
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

// ???脤?銴�?鈭日? + ?Ｙ?雿�?撣豢彍
let _isSubmitting = false;
const OFFLINE_QUEUE_KEY = 'offlineSubmitQueue';
const OFFLINE_QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 撠𤩺??擧?

// --- 閰喟敦?坿?璁𨅯?蝒烾?頛?---
function openRankingsModal(type, event) {
    if (event) event.stopPropagation();

    const modal = document.getElementById('rankings-modal');
    if (modal) modal.classList.remove('hidden');

    appState.currentRankTab = type || 'attendance';
    switchRankTab(appState.currentRankTab);

    // ?笔? 10 蝘坿䌊?閖??㕑??�膥
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
    const type = appState.currentRankTab;
    const data = type === 'attendance' ? appState.attendanceRankings : appState.jackpotRankings;

    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-20 text-gray-400">
                <i data-lucide="info" class="w-8 h-8 mb-2 opacity-20"></i>
                <span class="text-xs">撠𡁶�?鍦??豢?</span>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    let html = '';
    data.forEach((item, index) => {
        const rank = index + 1;
        let rankIcon = '';
        if (rank === 1) rankIcon = '<span class="ranking-medal">??</span>';
        else if (rank === 2) rankIcon = '<span class="ranking-medal">??</span>';
        else if (rank === 3) rankIcon = '<span class="ranking-medal">??</span>';
        else rankIcon = `<span class="rank-number">${rank}</span>`;

        const valueLabel = type === 'attendance' ? `${item.count} 甈︶ : `${item.score} ?�;
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
    // ?瑟鰵 Lucide ?𣇉內
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==========================================
// 撠讐麐?厰???(Small Mary / Fruit Machine) ?讛摩
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
    { id: 'apple', label: '??', rate: 2, color: '#ff4444' }, // ?? 2x
    { id: 'orange', label: '??', rate: 5, color: '#ffaa00' }, // ?? 5x
    { id: 'mango', label: '?平', rate: 10, color: '#ffee00' }, // ?平 10x
    { id: 'bell', label: '??', rate: 20, color: '#ffdd00' }, // ?? 20x
    { id: 'watermelon', label: '??', rate: 30, color: '#44ff44' }, // ?? 30x
    { id: 'star', label: '??', rate: 40, color: '#ffff44' }, // ?? 40x
    { id: 'seven', label: '7儭謿�', rate: 50, color: '#ff2222' }, // 7儭謿� 50x
    { id: 'bar', label: 'BAR', rate: 100, color: '#44aaff' }, // BAR 100x
    { id: 'lucky', label: '??', rate: 0, color: '#00ffaa' }  // ?�? / 撠讐?
];

// 頧厩𥿢?�? (24?? 蝬枏�雿�?嚗峕?憭抒??其?銝衤葉嚗峕活?𤾸銁撌血𢰧銝?
const MARY_GRID = [
    'apple', 'orange', 'mango', 'bar', 'bell', 'lucky', 'watermelon',
    'apple', 'star', 'seven', 'mango', 'bell',
    'orange', 'apple', 'mango', 'bar', 'bell', 'lucky', 'watermelon',
    'apple', 'star', 'seven', 'orange', 'bell'
];

async function openSmallMary() {
    if (!appState.user.userId) return showToast("隢见??餃� LINE");
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

    // 蝣箔??�??蠘?敶Ｗ?皜祇??笔祕憭批?
    machine.style.transform = 'none';

    // ?拍鍂 setTimeout 霈梶�讛汗?典??滨鼓嚗𣬚Ⅱ靽嘥?敺埈?甇?Ⅱ??offsetHeight
    setTimeout(() => {
        const machineH = machine.offsetHeight || 680;
        const machineW = machine.offsetWidth || 420;

        const vh = window.innerHeight;
        const vw = window.innerWidth;

        // ?鞟?銝𠹺??羓?摰匧�?� (?輸? iOS 撌亙�?𡑒??𤩺絲)
        const paddingY = 60; // 銝𠹺??梢???60px
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

// openMaryHelp 摰𡁶儔?潔??對?蝚?2713 銵䕘?嚗峕迨?蓥??滩?摰𡁶儔

async function refreshMaryData() {
    try {
        const res = await fetch(`${GAS_URL}?action=getSmallMaryData&userId=${appState.user.userId}&name=${encodeURIComponent(appState.user.displayName)}&_=${Date.now()}`);
        const data = await res.json();
        if (data.error) return showToast(data.error);

        maryState.points = data.points;
        maryState.monthlyGift = data.monthlyGift;
        maryState.totalMaryScore = data.totalMaryScore;
        maryState.jackpotPool = data.jackpotPool;

        // ??蝞∠??⊥芋撘𧶏?蝯虫??⊿?暺墧彍
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
    if (totalBet >= userTotal) return showToast("暺墧彍銝滩雲");

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

// ?啣?嚗𡁻辶璈�𢩦瘜典???
function maryRandomBet() {
    if (maryState.isSpinning || maryState.doubleUpActive) return;
    const activeOptions = MARY_CONFIG.filter(c => c.rate > 0);
    if (activeOptions.length === 0) return;

    const userTotal = maryState.points + maryState.monthlyGift;
    let currentTotalBet = Object.values(maryState.currentBet).reduce((a, b) => a + b, 0);

    // 瘙箏?閬�𢩦撟曉�衤??�?獢?(2~4蝔?
    const numSymbols = Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < numSymbols; i++) {
        const target = activeOptions[Math.floor(Math.random() * activeOptions.length)];
        const times = Math.floor(Math.random() * 3) + 1; // ??1~3 瘜?

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
        // 銝𦠜? (7?? 1~7)
        { c: 1, r: 1 }, { c: 2, r: 1 }, { c: 3, r: 1 }, { c: 4, r: 1 }, { c: 5, r: 1 }, { c: 6, r: 1 }, { c: 7, r: 1 },
        // ?喳� (5?? 2~6)
        { c: 7, r: 2 }, { c: 7, r: 3 }, { c: 7, r: 4 }, { c: 7, r: 5 }, { c: 7, r: 6 },
        // 銝𧢲? (7?? 7~1)
        { c: 7, r: 7 }, { c: 6, r: 7 }, { c: 5, r: 7 }, { c: 4, r: 7 }, { c: 3, r: 7 }, { c: 2, r: 7 }, { c: 1, r: 7 },
        // 撌血� (5?? 6~2)
        { c: 1, r: 6 }, { c: 1, r: 5 }, { c: 1, r: 4 }, { c: 1, r: 3 }, { c: 1, r: 2 }
    ]; // ??24 ??

    const grid = document.getElementById('mary-track-grid');
    if (!grid) return;
    // 蝘駁膄?支葉敹?div 憭𣇉??�?匧?蝝?
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
    // ?擧蕪??Lucky
    MARY_CONFIG.filter(c => c.rate > 0).forEach(conf => {
        const btn = document.createElement('div');
        btn.className = 'flex flex-col items-center justify-center bg-black/60 border border-[#5a3a00] rounded-md py-1 px-0.5 cursor-pointer select-none active:brightness-125 transition-all';
        btn.innerHTML = `
            <div class="text-[8px] font-black text-[#ffcc00] mb-0.5">x${conf.rate}</div>
            <div class="text-xl leading-none mb-1">${conf.label}</div>
            <div id="mary-bet-val-${conf.id}" class="w-full bg-black text-[#ff4444] font-mono text-[10px] font-black text-center border border-[#333] rounded-sm py-0.5 shadow-[inset_0_0_5px_rgba(255,0,0,0.5)]">0</div>
        `;

        // ?瑟?頝喳枂?詨??萇𥿢
        let pressTimer;
        let isLongPress = false;

        const startPress = (e) => {
            if (e.cancelable) e.preventDefault();
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                openMaryKeypad(conf.id, conf.label);
            }, 500); // 500ms 閫貊䔄?瑟?
        };

        const stopPress = (e) => {
            if (e && e.cancelable) e.preventDefault();
            if (pressTimer) clearTimeout(pressTimer);

            // ?剜? (?芾孛?潮𩑈?? 銝娪?蝘餃枂/?𡝗?鈭衤辣
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
// ?詨??萇𥿢 (Keypad) ?讛摩
// ==========================================
let maryKeypadTargetId = null;

function openMaryKeypad(id, label) {
    if (maryState.isSpinning || maryState.doubleUpActive) return;
    maryKeypadTargetId = id;

    const overlay = document.getElementById('mary-keypad-overlay');
    const title = document.getElementById('mary-keypad-title');
    const input = document.getElementById('mary-keypad-input');

    if (overlay) overlay.classList.remove('hidden');
    if (title) title.innerText = `?潭釣: ${label}`;

    const currentVal = maryState.currentBet[id] || 0;
    if (input) {
        input.value = currentVal > 0 ? currentVal : '';
        // ?亦�?𧢲??毺??萇𥿢擃娪?嚗䔶??臬???input.focus()
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
            if (current.length < 6) { // ?𣂼�頛詨�?瑕漲
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
    if (isNaN(val) || val < 0) return; // 摰寡迂頛詨�銝剜麱?��蝛?

    const totalBetExcludingTarget = Object.keys(maryState.currentBet).reduce((sum, key) => {
        return key === maryKeypadTargetId ? sum : sum + maryState.currentBet[key];
    }, 0);

    const userTotal = maryState.points + maryState.monthlyGift;
    const maxAvailable = userTotal - totalBetExcludingTarget;

    if (val > maxAvailable) {
        input.value = maxAvailable > 0 ? maxAvailable : 0;
        showToast("?�憭𡁜蘨?賣𢩦?啣虾?券?憿滢???);
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

    // 閮�?撌脫𢩦瘜函蜇憿㵪?Credit ?單??齿??拚??舐鍂暺墧彍
    const betPoints = Object.values(maryState.currentBet).reduce((a, b) => a + b, 0);
    const total = (maryState.points + maryState.monthlyGift);
    const displayCredit = Math.max(0, total - betPoints);
    if (pointsEl) pointsEl.innerText = displayCredit.toString().padStart(4, '0');
    if (giftEl) giftEl.innerText = `韐�?: ${maryState.monthlyGift}`;
    if (jackpotEl) jackpotEl.innerText = `?緵 敶拚?瘙? ${maryState.jackpotPool || 0}`;

    if (winEl) winEl.innerText = maryState.winScore.toString().padStart(4, '0');
    if (centerNumEl) centerNumEl.innerText = maryState.winScore > 0 ? maryState.winScore : '0';

    const startBtn = document.getElementById('mary-btn-start');
    if (startBtn) {
        // ?贝?銝准��?瘥𥪜之撠讐??页?蝑匧??拙振瘙箏?嚗㗇??硋? START
        const noBet = Object.values(maryState.currentBet).every(v => v === 0);
        startBtn.disabled = maryState.isSpinning || maryState.doubleUpActive || (total <= 0 && noBet);
    }
}

const highlight = (idx, on, force = false) => {
    const cell = document.getElementById(`mary-cell-${idx}`);
    if (!cell) return;

    // ???啣?嚗帋?霅瑚?甇餌???
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

// 閮㗛??嗅??㗇?雿滨蔭
let maryCurrentPos = 0;

async function maryStartSpin() {
    if (maryState.isSpinning || maryState.doubleUpActive) return;

    // ??皜�膄?滢?撅�畾条??���?
    if (maryState.keepLights) {
        maryState.keepLights.forEach(idx => highlight(idx, false, true)); // force clear
    }
    maryState.keepLights = [];

    const betPoints = Object.values(maryState.currentBet).reduce((a, b) => a + b, 0);
    if (betPoints <= 0) return showToast("隢见??貊泵?笔?瘜?);

    maryState.isSpinning = true;
    document.getElementById('mary-btn-start').disabled = true;

    // (銝𧢲釣?Ｘ踎甇賊妟撌脩宏?喲??脩??笔?)

    const trackLen = MARY_GRID.length; // 24

    // ???閙?甈𢠃??讠?蝟餌絞 (蝎暹??批� 25% 銝剔??�? RTP嚗䔶?憭抒??函?)
    let isWin = false;
    const betSymbols = Object.keys(maryState.currentBet).filter(id => (maryState.currentBet[id] || 0) > 0);

    // ???圈?瘙�??券??格𢩦瘜其葉撠讐?璈毺?銝𠰴?
    let winRate = 0.25; // ?箇? 25%
    const maxOptions = MARY_CONFIG.filter(c => c.rate > 0).length; // 8??
    if (betSymbols.length >= maxOptions) {
        winRate = 0.50; // ?冽𢩦?�??�� 50%
    } else if (betSymbols.length >= maxOptions - 2) {
        winRate = 0.35; // ?潭釣 6 ?�誑銝𦠜??�� 35%
    }

    // 銝剔??文?
    if (betSymbols.length > 0 && Math.random() < winRate) {
        isWin = true;
    }

    // ??雿輻鍂?�?摰𡁶移皞𡝗??齿?撠�” (銝剔??�?甈𢠃?)
    const weightMap = {
        'apple': 50,  // ?�摰寞?銝?
        'orange': 10,
        'mango': 5,
        'bell': 4,
        'star': 3,
        'watermelon': 2,
        'seven': 0.5, // 銝?(璆萇???
        'bar': 0.2  // BAR (蟡噼店蝝?
    };

    // ???啣?嚗𡁜兢?见?頩笔ế摰?(1.5% 璈毺??∟?憸冽綉?见之??
    const isLuckyMiracle = Math.random() < 0.015;

    let weights = [];
    for (let i = 0; i < trackLen; i++) {
        const sym = MARY_GRID[i];
        const conf = MARY_CONFIG.find(c => c.id === sym);
        const betAmt = maryState.currentBet[sym] || 0;

        let w = weightMap[sym] || 1;

        // ??憸冽綉?讛摩嚗𡁜之瘜典ế摰?(?桅??潭釣 ??20 暺?
        if (betAmt >= 20 && !isLuckyMiracle) {
            // ?𧼮?頩�?嚗𡁻膄鈭�??頣??園?憭折??閙釣?�𤌍?�??滚撥?嗡?憯?
            if (sym !== 'apple') {
                w = Math.max(0.1, w / 5);
            } else {
                // ?𧢲??典之憿齿𢩦瘜冽?甈𢠃??滩��???(撘訫??單?撠讛??�?)
                w = 200;
            }
        } else if (isLuckyMiracle) {
            // 撟賊?憟�??潛??�??鞾?憭抒??潭???(撽𡁜???
            if (sym === 'bar' || sym === 'seven' || sym === 'star') {
                w = w * 10;
            }
        }

        // ??雿輻鍂?�鸌畾𡃏?瘙�?憭抒??娪𣪧?文?
        if (sym === 'bar' || sym === 'seven') {
            // 靽萘?璆萇??㗇??�?銝滚? isWin ?𣂼�
            weights.push(isLuckyMiracle ? w : w * 0.5);
        } else if (isWin) {
            // 銝剔?嚗𡁜蘨敺墧??潭釣?�葉撠讐??�葉靘脲? weightMap ?煾�
            if (betAmt > 0 && conf && conf.rate > 0) {
                // ?乩葉?𦒘??㗇𢩦?𧢲?嚗諹??𨀣??滚?撘?(靽脲𧋦璈笔�)
                if (sym === 'apple') w = 200;
                weights.push(w);
            } else {
                weights.push(0);
            }
        } else {
            // 瘝雴葉?𠬍??煾�瘝埝𢩦瘜函??�𤌍?㚚��?
            if (betAmt === 0) {
                if (sym === 'lucky') {
                    const betCount = betSymbols.length;
                    const maxOptions = MARY_CONFIG.filter(c => c.rate > 0).length; // 8??
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
        // ?鞾俈?砌?嚗𡁏??㗇??漤�??0 ?�??�?𧼮�?冽?
        weights = weights.map(() => 10);
        totalWeight = weights.reduce((a, b) => a + b, 0);
    }
    // ???惩�摨閖?嚗𡁶Ⅱ靽嘥之?𠬍?BAR/7嚗匧銁?湧?瘙牐葉?䭾?璆萎?嚗? 0.5%嚗?
    const bigPrizeCount = weights.filter((w, i) => MARY_GRID[i] === 'bar' || MARY_GRID[i] === 'seven')
        .reduce((a, b) => a + b, 0);
    const minTotal = bigPrizeCount * 200; // 憭抒??潔?瘥𥪯?頞�? 1/200
    if (totalWeight < minTotal) {
        const pad = minTotal - totalWeight;
        // 撠�榆憿滚像?�??圈?憭抒???
        const nonBigIdxs = weights.map((w, i) => (MARY_GRID[i] !== 'bar' && MARY_GRID[i] !== 'seven') ? i : -1).filter(i => i >= 0);
        if (nonBigIdxs.length > 0) {
            const addEach = Math.ceil(pad / nonBigIdxs.length);
            nonBigIdxs.forEach(i => { weights[i] += addEach; });
            totalWeight = weights.reduce((a, b) => a + b, 0);
        }
    }

    // ?賜惜瘙箏??格?
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

    // ?函??�?頧匧??怠遆??
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

    // 蝚?1 甈⊥?頧?
    await doSpinAnim(targetIdx, 2, 50);
    maryState.keepLights.push(targetIdx); // 靽肽風蝚砌??衤葉?擧聢

    let winScore = (maryState.currentBet[targetId] || 0) * targetConfig.rate;
    let displayMsg = targetConfig.label;

    // ???䠷??�?璈笔� (Lucky Star)
    if (targetId === 'lucky') {
        showToast("?? ?��?�?");
        await new Promise(r => setTimeout(r, 600)); // ?𣈯?銝�銝见???

        for (let i = 0; i < 2; i++) {
            // 蝚?2, 3 甈⊥?頧?(敹恍�蠘??�?1?�?蝔滚翰)
            // ?箔??㕑閎嚗屸��??�辶璈罸��之?𦒘誑憭𣇉??𡝗?
            let extraTargetIdx = Math.floor(Math.random() * trackLen);
            const extraSym = MARY_GRID[extraTargetIdx];
            if (extraSym === 'bar' || extraSym === 'seven' || extraSym === 'lucky') {
                extraTargetIdx = (extraTargetIdx + 1) % trackLen; // ?輸?憭抒?甇餅踎?脤𥲤
                if (MARY_GRID[extraTargetIdx] === 'bar' || MARY_GRID[extraTargetIdx] === 'seven') {
                    extraTargetIdx = (extraTargetIdx + 1) % trackLen;
                }
            }

            await doSpinAnim(extraTargetIdx, 1, 30);
            maryState.keepLights.push(extraTargetIdx); // 靽肽風?�??�?

            const extraTargetId = MARY_GRID[extraTargetIdx];
            const extraTargetConfig = MARY_CONFIG.find(c => c.id === extraTargetId);

            // 蝝臬??�彍
            if (extraTargetId !== 'lucky') {
                let extraWin = (maryState.currentBet[extraTargetId] || 0) * extraTargetConfig.rate;
                winScore += extraWin;
            }

            // 霈枏??衤葉?擧聢?賭??�䔄鈭?
            highlight(extraTargetIdx, true);
            await new Promise(r => setTimeout(r, 400));
        }
    }

    maryState.isSpinning = false;
    maryState.winScore = winScore;

    // 銝剔??潮???
    if (winScore > 0) {
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
            const targetsToBlink = maryState.keepLights.length > 0 ? maryState.keepLights : [targetIdx];
            targetsToBlink.forEach(idx => highlight(idx, blinkCount % 2 === 0, true));
            blinkCount++;
            if (blinkCount >= 8) clearInterval(blinkInterval);
        }, 180);
    }

    // ?峕郊敺𣬚垢
    try {
        const res = await apiSubmit({
            action: 'playSmallMary',
            userId: appState.user.userId,
            betPoints,
            winPoints: winScore,
            symbol: displayMsg
        });
        if (res.success) {
            maryState.points = res.points;
            maryState.monthlyGift = res.monthlyGift;
            maryState.totalMaryScore = res.totalMaryScore;
            if (res.jackpotPool !== undefined) maryState.jackpotPool = res.jackpotPool;
            updateMaryUI();
        }
    } catch (e) { console.error(e); }

    if (winScore > 0) {
        // ?𧢲??�? (?乩葉?�憭抒? BAR)
        if (targetId === 'bar' && navigator.vibrate) {
            navigator.vibrate([500, 200, 500]);
        }

        showToast(`?? 銝剔?嚗?{displayMsg} ?脣? ${winScore} ?�);
        const db = document.getElementById('mary-double-btns');
        if (db) {
            db.classList.remove('hidden');
            db.style.display = 'flex';
            const btns = db.querySelectorAll('button');
            if (btns[2]) btns[2].textContent = '?条?';
        }
        maryState.doubleUpActive = true;
        maryState.doubleUpStreak = 0; // ???滨蔭?𡡞?閮�彍

        // ??3 蝘鍦??芣?雿𡏭䌊?閖???
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
        showToast(`?芯葉?????賢銁 ${displayMsg}嚗�?閰虫?甈∴?`);
    }
}

async function maryDoubleUp(choice) {
    if (!maryState.doubleUpActive || maryState.isSpinning) return;
    // ?拙振?㗇?雿頣?皜�膄?芸??条?閮�???
    if (maryState._autoCollectTimer) { clearTimeout(maryState._autoCollectTimer); maryState._autoCollectTimer = null; }

    // ?硋??厰??脫迫?滩???
    const dbContainer = document.getElementById('mary-double-btns');
    if (dbContainer) dbContainer.style.pointerEvents = 'none';

    // ???圈?瘙�??芾??�?畾萄??�綉??
    let winProb = 0.50; // 蝚?1 ??(streak = 0)
    if (maryState.doubleUpStreak === 1) winProb = 0.40;      // 蝚?2 ??
    else if (maryState.doubleUpStreak === 2) winProb = 0.30; // 蝚?3 ??
    else if (maryState.doubleUpStreak === 3) winProb = 0.05; // 蝚?4 ??
    else if (maryState.doubleUpStreak >= 4) winProb = 0.001; // 蝚?5 ??(?𦒘???

    let isForceWin = Math.random() < winProb;
    let num;

    if (isForceWin) {
        // 霈梶焵摰嗉?嚗𡁻??箇泵?�焵摰嗥?皜祉??詨?
        if (choice === 'small') {
            num = Math.floor(Math.random() * 6) + 1; // 1-6
        } else {
            num = Math.floor(Math.random() * 6) + 8; // 8-13
        }
    } else {
        // 霈梶焵摰嗉撓嚗𡁻辶璈罸??箄?摰園�𡁏捏(7)?𡝗糓?詨??�彍摮?
        if (Math.random() < 0.3) {
            num = 7; // ?𡁏捏
        } else {
            if (choice === 'small') {
                num = Math.floor(Math.random() * 6) + 8; // ?𨅯??见之
            } else {
                num = Math.floor(Math.random() * 6) + 1;  // ?𨅯之?见?
            }
        }
    }

    const numEl = document.getElementById('mary-double-number');
    const numDisplay = document.getElementById('mary-double-num-display');
    if (numEl) numEl.innerText = num;
    if (numDisplay) numDisplay.classList.remove('hidden');

    const btnSmall = document.getElementById('btn-mary-small');
    const btnBig = document.getElementById('btn-mary-big');

    // ??靽格迤 F5嚗𡁜銁靽格㺿 winScore ?滚?靽嘥??砍??煾?嚗諹?敺𣬚垢?賣迤蝣箸𤣰?啗撓??韐誩??�?憿?
    const winBeforeChange = maryState.winScore;

    let win = false;
    if (num === 7) {
        win = false; // ?𠰴振?𡁏捏
    } else if (choice === 'small' && num <= 6) {
        win = true;
    } else if (choice === 'big' && num >= 8) {
        win = true;
    }

    if (win) {
        maryState.winScore *= 2;
        maryState.doubleUpStreak = (maryState.doubleUpStreak || 0) + 1; // 閮㗛????
        if (choice === 'big') {
            if (btnBig) btnBig.classList.add('brightness-150', 'scale-110', 'ring-4', 'ring-white');
            if (btnSmall) btnSmall.classList.add('opacity-30', 'grayscale');
        } else {
            if (btnSmall) btnSmall.classList.add('brightness-150', 'scale-110', 'ring-4', 'ring-white');
            if (btnBig) btnBig.classList.add('opacity-30', 'grayscale');
        }
    } else {
        maryState.winScore = 0;
        maryState.doubleUpStreak = 0; // 憭望?甇賊妟
        maryState.doubleUpActive = false;
        if (btnBig) btnBig.classList.add('opacity-30', 'grayscale');
        if (btnSmall) btnSmall.classList.add('opacity-30', 'grayscale');
        maryClearBet();
    }

    // ?單??湔鰵?条??厰??�彍摮梹??踹?蝑匧??閧𧞄??800ms ?罸?憿舐內?𦠜彍摮?
    const immediateDb = document.getElementById('mary-double-btns');
    if (immediateDb) {
        const immediateBtns = immediateDb.querySelectorAll('button');
        if (immediateBtns[2]) {
            if (maryState.winScore > 0) {
                immediateBtns[2].textContent = `???条? (${maryState.winScore})`;
            } else {
                immediateBtns[2].textContent = '?条?';
            }
        }
    }

    updateMaryUI();

    // ?峕郊?喳?蝡?
    // ??BUG 7 靽格迤嚗𡁻?鈭娪?嚗ìtreak >= 5嚗㗇?嚗�?蝥峕??澆㙈 claimSmallMaryJackpot嚗?
    // ?嗅?蝡臬�?其??澆㙈 playSmallMary嚗𣬚�?踹??䠷?閮�?嚗峕迨?閗歲??playSmallMary??
    // ??F5 隤芣?嚗帋蝙??winBeforeChange嚗�耨?孵??�?憿㵪??喳?蝡?
    //   - 韐𧶏?doubleWin = maryState.winScore嚗�蕃?滚?嚗㚁?敺𣬚垢蝝臬? MaryScore
    //   - 頛賂?doubleWin = -winBeforeChange嚗�??賂?嚗�?蝡臬虾甇?Ⅱ閮�?頛豢??�?憿滢蒂鋆𨅯蔗?烐?
    const willTriggerJackpot = win && (maryState.doubleUpStreak >= 5);
    if (!willTriggerJackpot) {
        try {
            const res = await apiSubmit({
                action: 'playSmallMary',
                userId: appState.user.userId,
                betPoints: 0,
                isDoubleUp: true,
                doubleWin: win ? maryState.winScore : -winBeforeChange,
                symbol: win ? `憭批?蝧餃�㮼?` : `憭批?頛???{num})`
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

        if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ?Ｗ儔暺墧?

        // ???𦒘??𨀣愇撠�蔗瘙㰘孛??
        if (win && maryState.doubleUpStreak >= 5) {
            maryState.doubleUpStreak = 0; // ?滨蔭
            const dbBtnsJP = document.getElementById('mary-double-btns');
            if (dbBtnsJP) { dbBtnsJP.classList.add('hidden'); dbBtnsJP.style.pointerEvents = 'auto'; }
            if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ???Ｗ儔 pointerEvents
            showToast("?? ?剖?嚗�?鈭娪??砍?嚗諹孛?澆蔗瘙惩之?𠬍?甇?銁蝯鞟?銝?..", 4000);

            try {
                const res = await apiSubmit({
                    action: 'claimSmallMaryJackpot',
                    userId: appState.user.userId,
                    name: appState.user.displayName // ??BUG 3 靽格迤嚗𡁏???displayName嚗屸? name
                });
                if (res.success) {
                    // ??靽格迤 F3嚗䬙laimSmallMaryJackpot 敺𣬚垢撌脰?撣喳??ｇ??折�?澆㙈 playSmallMary嚗?
                    // ?湔𦻖?湔鰵?滨垢?�?页?銝滚??澆㙈 maryCollect()嚗��?滚?甈⊿�?playSmallMary 撠舘稲敶拚??䠷?閮睃�嚗?
                    maryState.winScore += res.jackpotWon; // ?牐?敶拚??冽䲰?滨垢?閧𧞄
                    showToast(`?緵 ?�?嚗�崕敺堒蔗瘙?${res.jackpotWon} ?�?蝮賢? ${maryState.winScore} ?�?`, 5000);

                    // ?湔𦻖?湔鰵敺𣬚垢?𧼮�?�迤蝣粹???
                    if (res.points !== undefined) maryState.points = res.points;
                    if (res.monthlyGift !== undefined) maryState.monthlyGift = res.monthlyGift;
                    if (res.totalMaryScore !== undefined) maryState.totalMaryScore = res.totalMaryScore;
                } else {
                    showToast(`?𩤃? 敶拇??鞟內嚗?{res.error || '?芰䰻?�𥲤隤?}`, 3000);
                }
            } catch (e) {
                console.error("?睃?敶拇?憭望?", e);
            }

            // 皜�膄瘥𥪜之撠?UI
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

            // ?梯??游�钅??滚??厰?
            const dbBtnsLose = document.getElementById('mary-double-btns');
            if (dbBtnsLose) {
                dbBtnsLose.classList.add('hidden');
                dbBtnsLose.style.pointerEvents = 'auto'; // ??靽桀儔嚗𡁏�敺?pointerEvents嚗屸俈甇Ｖ?撅�畾条?
            }
            if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ???峕郊?Ｗ儔?笔??��

            updateMaryUI();
            document.getElementById('mary-btn-start').disabled = false;
        } else {
            const db = document.getElementById('mary-double-btns');
            if (db) {
                const btns = db.querySelectorAll('button');
                if (btns[2]) {
                    btns[2].textContent = `???条? (${maryState.winScore})`;
                    btns[2].style.pointerEvents = 'auto'; // 撘瑕�?条??厰??舫?
                }
            }
        }
    }, 800); // 800ms
}

// ?条?
async function maryCollect() {
    if (maryState.isSpinning || !maryState.doubleUpActive || maryState.winScore <= 0) return;
    // 皜�膄?芸??条?閮�??剁??亦�?见?閫貊䔄嚗?
    if (maryState._autoCollectTimer) { clearTimeout(maryState._autoCollectTimer); maryState._autoCollectTimer = null; }

    maryState.doubleUpActive = false; // 蝡见朖璅躰?嚗屸俈甇ａ?銴�?
    const win = maryState.winScore;
    const startPoints = maryState.points;
    let targetPoints = startPoints + win;

    // ?梯??厰??�
    const dbBtns = document.getElementById('mary-double-btns');
    if (dbBtns) {
        dbBtns.classList.add('hidden');
        dbBtns.style.display = 'none';
    }
    document.getElementById('mary-double-result').classList.add('hidden');

    // ??靽格迤 F4嚗𡁶鍂?埈?餈質馱敺𣬚垢?臬炏?𣂼?嚗�仃?埈?銝滢誑?滨垢?鞟?閬�?暺墧彍
    let backendOk = false;
    try {
        const res = await apiSubmit({
            action: 'playSmallMary',
            userId: appState.user.userId,
            betPoints: 0,
            winPoints: win,
            symbol: '?条?'
        });

        if (res && res.success) {
            targetPoints = res.points;
            maryState.monthlyGift = res.monthlyGift;
            backendOk = true;
        } else {
            showToast(`?𩤃? ?条??峕郊憭望?嚗?{res?.error || '隡箸??函�?墧?'}嚗諹??滩岫`, 3000);
        }
    } catch (e) {
        console.error(e);
        showToast('???条??朞??啣虜嚗諹?蝔滚??滩岫', 3000);
    }

    // ?亙?蝡臬仃?梹??�? doubleUpActive 霈梶焵摰嗅虾隞仿?閰阡???
    if (!backendOk) {
        maryState.doubleUpActive = true;
        maryState.winScore = win; // ?�? winScore
        if (dbBtns) {
            dbBtns.classList.remove('hidden');
            dbBtns.style.display = 'flex';
        }
        document.getElementById('mary-btn-start').disabled = false;
        return;
    }

    // ???�彍?閧𧞄蝘餉?嚗帋??煾??閙?瘙箏?甇仿�脣之撠?
    // ??0 ???衤???1)嚗?1-100 ???�???10)嚗?100 ???曆???100)
    let stepAmount;
    if (win <= 30) {
        stepAmount = 1;
    } else if (win <= 100) {
        stepAmount = 10;
    } else {
        stepAmount = 100;
    }
    const intervalMs = 40; // ?箏??㯄? 40ms嚗�?閬箸??Ｖ?銝齿?撱塚?
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
            maryState.points = targetPoints; // ?⊥迤?墧飛敺𣬚垢甇?Ⅱ??
            maryState.isSpinning = false;
            maryState.doubleUpActive = false;
            maryClearBet(); // ???条?敺峕?蝛箔?瘜剁?銝衤?撅�?�?齿鰵?潭釣
            updateMaryUI();
            showToast(`??撌脤???${win} ?�?`);
            document.getElementById('mary-btn-start').disabled = false;
        }
    }, intervalMs);
}

// ?峕?嚗�??罸?蝒㛖?嚗?
function maryExchange() {
    if (maryState.isSpinning || maryState.doubleUpActive) return;

    const overlay = document.createElement('div');
    overlay.id = 'mary-exchange-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.95);border-radius:24px;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;';
    overlay.innerHTML = `
        <div style="font-size:16px;font-weight:900;color:#ffcc00;">?兝 ?厰𤨪??10:1 ?峕?</div>
        <div style="background:#111;border:1px solid #ff6600;border-radius:10px;padding:10px 16px;width:100%;text-align:center;">
            <div style="font-size:10px;color:#ff6600;margin-bottom:4px;letter-spacing:2px;">YOU HAVE</div>
            <div id="mary-exchange-slot-score" style="font-size:28px;font-weight:900;color:#fa0;font-family:monospace;" class="animate-pulse">霈�?碶葉...</div>
            <div style="font-size:10px;color:#888;">?厰𤨪蝛滚?</div>
        </div>
        <div style="color:#ccc;font-size:11px;text-align:center;">
            ?�憭𡁜虾??<b id="mary-exchange-max-convert" style="color:#0f0;">---</b> 暺𧼮??芾?暺墧彍<br>
            <span style="color:#666;font-size:10px;">嚗?0 ?厰𤨪????1 撠讐麐?厰?嚗?/span>
        </div>
        <input id="mary-exchange-input" type="number" inputmode="numeric" pattern="[0-9]*" min="10" step="10" placeholder="蝑匧�躰???.."
            style="width:100%;background:rgba(255,255,255,0.08);border:1px solid #fa0;border-radius:10px;
            padding:10px;color:#fa0;text-align:center;font-size:18px;font-weight:900;font-family:monospace;
            outline:none;" disabled>
        <div style="font-size:10px;color:#555;">?�撠?10 ?�?隢贝撓??10 ?��齿彍</div>
        <div style="display:flex;gap:10px;width:100%;">
            <button onclick="document.getElementById('mary-exchange-overlay').remove()"
                style="flex:1;padding:12px;background:rgba(255,255,255,0.1);border:none;border-radius:10px;
                color:#ccc;font-weight:700;font-size:13px;cursor:pointer;">?𡝗?</button>
            <button id="mary-exchange-btn-confirm" onclick="maryConfirmExchange()" disabled
                style="flex:2;padding:12px;background:linear-gradient(135deg,#663300,#995500);
                border:none;border-radius:10px;color:#ccc;font-weight:900;font-size:13px;cursor:not-allowed;
                box-shadow:none;transition:all 0.3s;">蝣箄??峕?</button>
        </div>
    `;
    document.getElementById('mary-machine').appendChild(overlay);

    // ?峕艶霈�?硋???
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
                inputEl.placeholder = "隢贝撓??;
                inputEl.max = maxConvert; // ??靽格迤 F1嚗帋??鞉㺿?箏虾?峕??�㟲?豢?憭批�?
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
                    btnEl.innerText = "?�彍銝滩雲";
                }
            }
        })
        .catch(e => {
            const scoreEl = document.getElementById('mary-exchange-slot-score');
            if (scoreEl) {
                scoreEl.classList.remove('animate-pulse');
                scoreEl.innerText = '霈�?硋仃??;
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
    if (!val || isNaN(val) || val < 10) return showToast('隢贝撓?亙?瘜閧??�彍嚗�?撠?10嚗?);
    const roundedVal = Math.floor(val / 10) * 10;

    // ???芸?嚗𡁜??惩?蝡舫?憿滚ế?琿俈??
    const maxConvertStr = document.getElementById('mary-exchange-max-convert')?.innerText;
    const maxConvert = parseInt(maxConvertStr?.replace(/,/g, '')) || 0;
    if (roundedVal > (maxConvert * 10)) return showToast('?峕?暺墧彍頞�??舐鍂擗㗛?');

    const overlay = document.getElementById('mary-exchange-overlay');
    if (overlay) {
        overlay.innerHTML = `<div class="flex flex-col items-center gap-4"><div class="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div><div class="text-amber-500 font-bold">甇?銁?閧??峕?...</div></div>`;
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
            showToast(`???𣂼??峕? ${res.addedPoints} 撠讐麐?厰??節);
            maryState.points += res.addedPoints;
            updateMaryUI();
        } else {
            showToast(res ? (res.error || '?峕?憭望?嚗諹?蝣箄??厰𤨪?�彍?臬炏撠𡁜?頞?) : '隡箸??函�?墧?');
        }
    } catch (e) {
        if (overlay) overlay.remove();
        console.error(e);
        showToast('???潛??啣虜?航炊嚗諹?蝔滚??滩岫');
    }
}

/** HTML 頝唾�嚗𡁻俈甇Ｖ蝙?刻��撓?亦? XSS ?餅? */
function escapeHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

/** 蝯曹?甈�??萄�潭?撠�” */
const FIELD_KEYS = {
    family: ['family', 'Family', '?瑕惇', '?瑕惇鈭箸彍', 'FamilyCount'],
    tableCount: ['tableCount', 'TableCount', 'Table Count', '隤齿??賊?', '隤齿?'],
    room: ['room', 'RoomType', 'Room Type', '?踹?'],
    pickup: ['pickup', 'Pickup', '銝𡃏??圈?'],
    sponsor: ['sponsorList', 'sponsor', 'Sponsorship', 'Sponsor', '韐𠰴𨭌?�𤌍', '韐𠰴𨭌'],
    guestName: ['guestName', 'GuestName', 'Guest Name', 'guest_name', 'Guest Names', '靘�?憪枏?', '靘�?', 'Guest', 'guest', 'memo', 'Memo', '?躰酉'],
    guestCount: ['guestCount', 'GuestCount', '靘�?鈭箸彍'],
};

/** ?誯?蝯曹??惩?銵典???*/
function getField(row, fieldName) {
    const keys = FIELD_KEYS[fieldName];
    return keys ? findCaseInsensitiveValue(row, keys) : undefined;
}

/** 憭批?撖思??𤩺??��潭䰻??*/
function findCaseInsensitiveValue(obj, keys) {
    if (!obj || !Array.isArray(keys)) return undefined;

    for (const key of keys) {
        if (obj.hasOwnProperty(key)) {
            return obj[key];
        }
        // 憭批?撖思??𤩺??交𪄳
        for (const objKey in obj) {
            if (objKey.toLowerCase() === key.toLowerCase()) {
                return obj[objKey];
            }
        }
    }
    return undefined;
}

/** ?硋??湔彍甈�???(?嘥? FamilyCount ?脰? +1 鋆𨅯?) */
function getIntField(row, fieldName) {
    const val = parseInt(getField(row, fieldName), 10) || 0;
    // ??靽格迤嚗鎭AS 摮条??胯�𣬚溸撅祆彍?㵪??滨垢憿舐內?�?�鉄?砌犖嚗峕? +1
    if (fieldName === 'family') return val + 1;
    return val;
}

/** 撘瑕�?�犖?詨?閮�?蝞梹??閧? JSON 閫???�?鞈�??蹱? (?烾?皜�?) */
function calculateFinalGuestCount(row, guestData) {
    const fallback = getIntField(row, 'guestCount');
    const total = guestData.reduce((acc, g) => acc + (parseInt(g.count, 10) || 0), 0);
    return total > 0 ? total : fallback;
}

/** DOM ?�?敹怠? */
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

/** ?寞活 Lucide ?𣇉內?瑟鰵嚗��?滚?銝�撟�憭𡁏活?澆㙈嚗?*/
let _iconRafId = null;
function refreshIcons() {
    if (_iconRafId) return;
    _iconRafId = requestAnimationFrame(() => {
        if (typeof lucide !== 'undefined') lucide.createIcons();
        _iconRafId = null;
    });
}

// ==========================================
// 2. INITIALIZATION (?嘥???
// ==========================================
window.onload = async function () {
    cacheDOM();
    lucide.createIcons();
    populateCountOptions();
    renderAddSponsorUI();

    // 隞钅𢒰?嘥???
    DOM.headerTitle.innerText = "瘣餃??�𥼚??;
    switchView('view-home');

    // ???Ｙ??菜葫?�??𡑒???
    window.addEventListener('offline', () => showToast('?𩤃? 蝬脰楝撌脫𪃾?页??勗?撠�麱摮?));
    window.addEventListener('online', () => {
        showToast('??蝬脰楝撌脫�敺?);
        setTimeout(() => processOfflineQueue(), 1500);
    });
    // ?�𢒰頛匧�?�?畾条?雿�?瑼Ｘ䰻嚗𣬚宏?唾??亦𧞄?Ｙ??笔??滩???
    // (閬?window.hideInitialOverlay)

    // ??銝𧢲??瑟鰵 (Pull-to-Refresh)
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
                _pullIndicator.textContent = '???𧢲𦆮?瑟鰵瘣餃??𡑒”';
                homeView.insertBefore(_pullIndicator, homeView.firstChild);
            }
        }, { passive: true });

        homeView.addEventListener('touchend', async () => {
            if (_pullIndicator) {
                _pullIndicator.textContent = '???瑟鰵銝?;
                try {
                    await fetchEvents();
                    renderEventGrid(appState.currentCategory || 'all');
                    showToast('??撌脣�??);
                } catch (e) {
                    showToast('?瑟鰵憭望?');
                }
                _pullIndicator.remove();
                _pullIndicator = null;
            }
            _isPulling = false;
        }, { passive: true });
    }

    // ??靽格㺿?𤏪?LIFF ?嘥??𤥁?撘瑕�?餃�?讛摩
    if (LIFF_ID && LIFF_ID !== "YOUR_LIFF_ID") {
        try {
            await liff.init({ liffId: LIFF_ID });

            // 1. 瑼Ｘ䰻?臬炏撌脩蒈??
            if (!liff.isLoggedIn()) {
                // ?交𧊋?餃�嚗�撥?嗉歲頧㕑秐 LINE ?餃�?�𢒰
                // redirectUri ?舐蒈?亙?閬�?靘�?蝬脣?嚗屸�𡁜虜銝滚‵?�䌊?訫??啁訜?漤???
                liff.login();
                return; // ?餃�?�歲頧㚁?銝剜𪃾敺𣬚??瑁?
            } else {
                // 2. ?亙歇?餃�嚗�?敺𦯀蝙?刻��???
                const profile = await liff.getProfile();
                appState.user = {
                    userId: profile.userId,
                    displayName: profile.displayName,
                    pictureUrl: profile.pictureUrl
                };
                // ?硋?雿輻鍂??Email (?詨‵嚗屸???Console ?𧢲???
                // const userEmail = liff.getDecodedIDToken().email; 
            }
        } catch (e) {
            console.error("LIFF Init failed", e);
            // ?芣???LIFF ?嘥??硋仃??靘见? ID ?航炊?𣇉兛憓�?撠??�??�雁?�赤摰?
            showToast("LINE ?餃�憭望?嚗𣬚𤌍?滨�閮芸恥璅∪?");
        }
    }

    // ?湔鰵隞钅𢒰憿舐內雿輻鍂?��?讛??滨迂
    updateUserProfileUI();

    // ?�?閰血? LocalStorage 霈�?硋翰?碶誑?𣳇��??嘥?皜脫?
    try {
        const cachedEvents = localStorage.getItem('events_cache');
        if (cachedEvents) appState.events = JSON.parse(cachedEvents);

        const cachedSettings = localStorage.getItem('settings_cache');
        if (cachedSettings) appState.settings = JSON.parse(cachedSettings);

        if (appState.user && appState.user.userId) {
            const cachedRegs = localStorage.getItem('registrations_cache_' + appState.user.userId);
            if (cachedRegs) appState.myRegistrations = JSON.parse(cachedRegs);
        }
    } catch (e) {
        console.warn("頛匧�敹怠?憭望?", e);
    }

    // ??撱箇??典???hideInitialOverlay ?賢??梯��?璈笔鐤??
    window.hideInitialOverlay = function () {
        const historyLoading = document.getElementById('history-loading');
        if (historyLoading) historyLoading.classList.add('hidden');

        const overlay = document.getElementById('initial-load-overlay');
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 500);
        }

        // ?恍𢒰憿舐內敺�??閧??Ｙ?雿�?嚗屸�?滢??见?撠梯歲 toast
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
        // 瘜冽?嚗𡁻�躰ㄐ銝滢蜓?閖??㕑??亦𧞄?ｇ?鈭斤策?�?璈�偘摰�???
    }

    // ?峕艶?𧼮?甇交??𡝗??啗???(銝?await ?餃? UI)
    Promise.all([
        fetchEvents(),
        fetchSettings(),
        fetchMyRegistrations()
    ]).then(() => {
        applyUserNameMapping();
        appState.isDataLoaded = true;
        appState.currentCategory = 'all';
        renderEventGrid('all');

        // ?交??匧翰?吔?蝑㕑??坔?靘�?蝞埈??坔末?�?隞滨�鈭斤策?�?璈�綉?嗆?蝯�宏?斤𧞄?Ｙ??�???
        // 憒�??�?璈笔歇蝬栞?摰䕘??躰ㄐ?臭誑靽肽風?折??剹�?
        if (!hasCache && !_slotSpinning) {
            if (window.hideInitialOverlay) window.hideInitialOverlay();
        }

    }).catch(e => console.error("?峕艶?枏?鞈�?憭望?", e));

    // ???芸?嚗𡁶宏?日?銴�? fetchParticipationStats() ?澆㙈嚗ÊetchAttendanceTop3 撌脣銁 DOMContentLoaded 銝剖鐤?怠?銝� API嚗?
    // fetchParticipationStats(); // 撌脩宏?歹??踹??滩?隢𧢲?
    fetchJackpotTop3();
};

function applyUserNameMapping() {
    const userId = appState.user.userId;
    const originalName = appState.user.displayName; // ?笔? LINE ?滨迂
    const mapping = appState.settings.userMapping || {};

    // ?芸??�?嚗?
    // 1. 瑼Ｘ䰻 UserID ?臬炏?匧??㕑身摰?
    // 2. 瑼Ｘ䰻 LINE 憿舐內?滨迂?臬炏?匧??㕑身摰?(??UserID 瘝鍦???
    // 3. 蝬剜??�見

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
// 3. API ?閧?
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
        localStorage.setItem('events_cache', JSON.stringify(appState.events));
    } catch (e) {
        console.warn("API Error (getEvents)", e);
    }
}

async function fetchSettings() {
    if (!GAS_URL) return;
    try {
        const res = await fetch(`${GAS_URL}?action=getSettings`);
        appState.settings = await res.json();
        localStorage.setItem('settings_cache', JSON.stringify(appState.settings));
        // 撌脩宏?支??厰�?桀‵?仿?頛荔??寧�?见?頛詨�嚗?
    } catch (e) {
        console.warn("API Error (getSettings)", e);
    }
}

async function fetchMyRegistrations() {
    if (!appState.user.userId || !GAS_URL) return;
    try {
        // ?𡑒岫?枏??勗?蝝�??
        const res = await fetch(`${GAS_URL}?action=getMyRegistrations&userId=${appState.user.userId}`);
        const data = await res.json();
        appState.myRegistrations = Array.isArray(data) ? data : [];
        localStorage.setItem('registrations_cache_' + appState.user.userId, JSON.stringify(appState.myRegistrations));
    } catch (e) {
        console.warn("Fetch Registrations Failed", e);
    }
}

// ???啣?嚗𡁜枂撣剔絞閮�?銵?(?芸??�??�＊敺峕凒)
async function fetchParticipationStats() {
    if (!GAS_URL) return;
    const container = document.getElementById('home-rankings-section');
    if (!container) return;

    const cacheKey = 'participation_stats_cache';
    const cachedData = localStorage.getItem(cacheKey);

    // 1. ?�＊蝷箏翰?𡝗彍??
    if (cachedData) {
        try {
            const stats = JSON.parse(cachedData);
            container.classList.remove('hidden');
            renderParticipationChart(stats);
        } catch (e) {
            console.warn("Parse stats cache failed", e);
        }
    }

    // 2. ?峕艶?峕郊?�?唳彍??
    try {
        const res = await fetch(`${GAS_URL}?action=getParticipationStats&_=${Date.now()}`);
        const stats = await res.json();

        if (Array.isArray(stats) && stats.length > 0) {
            // ???啣?嚗𡁜??���鍂蝑�𧞄(localeCompare)?鍦?
            stats.sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return String(a.name).localeCompare(String(b.name), 'zh-TW', { collation: 'stroke' });
            });

            // ?湔鰵敹怠?
            localStorage.setItem(cacheKey, JSON.stringify(stats));
            container.classList.remove('hidden');
            renderParticipationChart(stats, !!cachedData); // 憒�?撌脫?敹怠?嚗�?銝漤?銴�偘憭批???
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
        const medal = isFirst ? '??' : (idx === 1 ? '??' : '??');
        const sizeClass = isFirst ? 'scale-110 -translate-y-1' : 'scale-95 opacity-80';
        const countColor = isFirst ? 'text-amber-500' : 'text-gray-400';

        const glowClass = isFirst ? 'ring-2 ring-amber-400/30 rounded-full p-2 bg-amber-500/10 shadow-[0_0_15px_rgba(251,191,36,0.2)]' : '';

        html += `
            <div class="flex flex-col items-center ${sizeClass}">
                <div class="flex flex-col items-center ${glowClass}">
                    <span class="text-xl leading-none mb-0.5">${medal}</span>
                    <span class="text-[11px] font-black text-template-name truncate max-w-template-width">${p.name}</span>
                </div>
                <span class="text-template-count-color text-[9px] font-black mt-0.5">${p.count}甈?/span>
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

    // ???芸??�? idempotency key嚗�俈?滩?嚗?
    if (!data._idempotencyKey) {
        data._idempotencyKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : Date.now() + '-' + Math.random().toString(36).slice(2);
    }

    // ???Ｙ??菜葫嚗𡁶凒?亙??乩??梹?銝滚?閰?fetch
    if (!navigator.onLine) {
        enqueueOffline(data);
        showToast('?𩤃? ?桀??Ｙ?嚗諹??坔歇?怠?嚗�?蝬脰楝?Ｗ儔敺諹䌊?閖��枂');
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
            console.error('GAS ?𧼮�?澆??航炊 (??JSON):', text);
            return { success: false, error: '隡箸??典??㗇聢撘誯𥲤隤? };
        }
    } catch (err) {
        // ??蝬脰楝?航炊?�??仿𣪧蝺帋???
        if (err.name === 'TypeError' || err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
            enqueueOffline(data);
            showToast('?𩤃? 蝬脰楝?啣虜嚗諹??坔歇?怠?嚗�??Ｗ儔敺諹䌊?閖��枂');
            return { queued: true };
        }
        showToast('??蝟餌絞???憭望?');
        throw err;
    }
}

// ???Ｙ?雿�?嚗𡁜???
function enqueueOffline(data) {
    try {
        const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
        queue.push({ data: data, timestamp: Date.now() });
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.warn('?Ｙ?雿�??脣?憭望?', e);
    }
}

// ???Ｙ?雿�?嚗𡁏�敺拚�???�䌊?閖???
async function processOfflineQueue() {
    let queue;
    try {
        queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    } catch (e) { return; }

    if (queue.length === 0) return;

    // ?擧蕪?㕑???24 撠𤩺??�??罸???
    const now = Date.now();
    const validQueue = queue.filter(item => (now - item.timestamp) < OFFLINE_QUEUE_MAX_AGE_MS);
    const expiredCount = queue.length - validQueue.length;

    if (validQueue.length === 0) {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
        if (expiredCount > 0) showToast(`撌脫???${expiredCount} 蝑�??�麱摮䁅??総);
        return;
    }

    showToast(`?㨩 甇?銁?�枂 ${validQueue.length} 蝑�麱摮䁅???..`);

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
            // ?�枂憭望?嚗䔶??坔銁雿�?銝剔?銝𧢲活?滩岫
            remaining.push(item);
        }
    }

    if (remaining.length > 0) {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
        showToast(`??撌脤��枂 ${successCount} 蝑�?${remaining.length} 蝑�??滩岫`);
    } else {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
        showToast(`??${successCount} 蝑�麱摮䁅??坔歇?券�?�枂嚗�);
    }

    // ?瑟鰵蝯梯?
    if (appState.currentEvent) {
        await fetchStats();
    }
}

// ==========================================
// 4. ?詨??讛摩 (?勗??�???
// ==========================================
async function enterEventDetail(eventId) {
    const event = appState.events.find(e => e.id === eventId);
    if (!event) return;

    // ?��𣂷耨甇?? 2?睲?暺墧?撠梢＊蝷?Loading Toast嚗峕??�?撽?
    showToast("甇?銁霈�?𡝗暑?閗底??..");

    appState.currentEvent = event;
    // 蝡见朖皜�膄蝯梯?隞仿�?漤＊蝷箄?鞈�?
    appState.currentStats = {};
    appState.cachedDetails = null;
    DOM.statTotal.innerText = "-";
    DOM.statSecVal.innerText = "-";

    resetFormState();

    appState.historyStack.push('detail');
    switchView('view-activity-detail');
    DOM.headerTitle.innerText = event.name;

    // 3. 皜脫??𨀣?鞈�? (?嘥?)
    renderEventStaticInfo();

    // 4. 撟唾??枏?隞交??��笔漲
    // 雿輻鍂 Promise.all ?峕郊?枏?蝯梯??�炎?亙𥼚??
    await Promise.all([
        fetchStats(),
        checkMyRegistration()
    ]);

    // 5. ?齿鰵皜脫?隞交凒?唬??厰�?桃絞閮?
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
    const isToday = !isOpen && canModify; // ?嗅予瘣餃??�鸌敺?

    // ???啣?嚗𡁏炎?仿??滚鱓
    const isBlacklisted = isCurrentUserBlacklisted();

    if (isBlacklisted) {
        // 暺穃??桐蝙?刻��??⊥?靽格㺿/?勗?
        DOM.submitBtn.innerText = "?函𤌍?滨�瘜訫𥼚?齿暑??;
        DOM.submitBtn.className = "flex-1 bg-gray-400 text-white font-bold py-3.5 rounded-xl cursor-not-allowed flex justify-center items-center gap-2";
        DOM.submitBtn.disabled = true;
        if (DOM.cancelBtn) DOM.cancelBtn.classList.add('hidden');

        const modifyInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button:not(#btn-header-share):not(#btn-stats)');
        modifyInputs.forEach(el => el.disabled = true);

    } else if (isToday) {
        // ?嗅予瘣餃?嚗𡁜𣈲霈�璅∪? (銝滚?閮曹耨??
        DOM.submitBtn.classList.add('hidden');
        DOM.submitBtn.classList.remove('flex');
        DOM.cancelBtn.classList.add('hidden');

        // 蝣箄??�?㕑撓?交??賜雁?�??函???
        const modifyInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button:not(#btn-header-share):not(#btn-stats)');
        modifyInputs.forEach(el => el.disabled = true);

    } else if (isOpen) {
        // ?芯?瘣餃?嚗𡁏迤撣訾耨??
        DOM.submitBtn.innerHTML = '<span>?湔鰵鞈�?</span><i data-lucide="refresh-cw" class="w-4 h-4"></i>';
        DOM.submitBtn.classList.replace('bg-[#06c755]', 'bg-blue-600');
        DOM.submitBtn.classList.replace('hover:bg-green-600', 'hover:bg-blue-700');
        DOM.submitBtn.disabled = false;
        DOM.cancelBtn.classList.remove('hidden');
    } else {
        // ?𥪜予?𠹺誑敺䕘?摰��蝯鞉?
        DOM.submitBtn.innerText = "撌脣𥼚??(瘣餃?撌脩???";
        DOM.submitBtn.className = "flex-1 bg-gray-400 text-white font-bold py-3.5 rounded-xl cursor-not-allowed flex justify-center items-center gap-2";
        DOM.submitBtn.disabled = true;
        DOM.cancelBtn.classList.add('hidden');
    }

    DOM.formTitle.innerText = "蝺刻摩?函??勗?";

    // 雿輻鍂蝯曹?甈�??惩??硋?甈�???
    const family = getIntField(record, 'family');
    const tableCount = getIntField(record, 'tableCount');
    const room = getField(record, 'room');
    const pickup = getField(record, 'pickup');
    const guestCount = getIntField(record, 'guestCount');
    const sponsor = getField(record, 'sponsor');

    // 憛怠�甈�?
    document.getElementById('family-count').value = family;
    if (tableCount) document.getElementById('table-count').value = tableCount;

    if (room && room !== '??) document.getElementById('room-type').value = room;
    if (pickup && pickup !== '??) document.getElementById('pickup-loc').value = pickup;

    // ?�?靘�??𡑒”
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
            appState.guestList.push({ id, name: `靘�? ${i + 1}`, count: 1, pickup: '', room: '' });
        }
        renderGuestList();
    }

    restoreSponsorList(sponsor);
    refreshIcons();
    showToast("撌脰??交�?�𥼚?滩???);
}

async function handleSubmit(e) {
    e.preventDefault();
    if (_isSubmitting) return; // ???脤?銴�?鈭日?
    const originalContent = DOM.submitBtn.innerHTML;

    if (!validateForm()) return;
    _isSubmitting = true;

    DOM.submitBtn.disabled = true;
    DOM.submitBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> ?閧?銝?..';
    refreshIcons();

    const formData = {
        action: DOM.formAction.value,
        eventId: appState.currentEvent.id,
        eventType: appState.currentEvent.type,
        eventName: appState.currentEvent.name,
        userId: appState.user.userId,
        pictureUrl: appState.user.pictureUrl,
        displayName: DOM.userName.value,
        familyCount: parseInt(document.getElementById('family-count').value, 10) - 1,
        guestList: JSON.stringify(appState.guestList),
        sponsorList: JSON.stringify(appState.sponsorList),
        roomType: document.getElementById('room-type').value,
        pickupLoc: document.getElementById('pickup-loc').value,
        tableCount: document.getElementById('table-count').value
    };

    try {
        const result = await apiSubmit(formData);
        // ??瑼Ｘ䰻敺𣬚垢?𧼮�?臬炏?�鉄?航炊
        if (result && result.error) {
            showToast('?𩤃? ' + result.error);
        } else if (result && result.queued) {
            // ?Ｙ?雿�?撌脰??�?Toast 撌脣銁 apiSubmit 憿舐內
        } else {
            showToast(formData.action === 'update' ? "?湔鰵?𣂼?嚗? : "?勗??𣂼?嚗?);
            if (!appState.myRegistrations.includes(appState.currentEvent.id)) {
                appState.myRegistrations.push(appState.currentEvent.id);
            }
            await fetchStats();
            await checkMyRegistration();
            renderEventStaticInfo();
            // ???單??湔鰵擐㚚??∠??�歇?勗??齿?閮?
            renderEventGrid(appState.currentCategory || 'all');
        }
    } catch (err) {
        showToast("?潛??航炊嚗諹??滩岫");
    } finally {
        _isSubmitting = false; // ??閫??
        DOM.submitBtn.disabled = false;
        DOM.submitBtn.innerHTML = originalContent;
        refreshIcons();
    }
}

async function handleCancel() {
    if (_isSubmitting) return; // ???脤?銴�?鈭日?
    const confirmed = await showConfirm("蝣箏?閬�?瘨�迨瘣餃??�𥼚?滚?嚗?br>?𡝗?敺�?憿滚??�??箝�?);
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
        // ??瑼Ｘ䰻敺𣬚垢?𧼮�?臬炏?�鉄?航炊
        if (result && result.error) {
            showToast('?𩤃? ' + result.error);
        } else if (result && result.queued) {
            // ?Ｙ?雿�?
        } else {
            showToast("撌脣?瘨�𥼚??);
            appState.myRegistrations = appState.myRegistrations.filter(id => id !== appState.currentEvent.id);
            resetFormState();
            await fetchStats();
            renderEventStaticInfo();
            // ???單??湔鰵擐㚚??∠?璅躰?
            renderEventGrid(appState.currentCategory || 'all');
        }
    } catch (err) {
        showToast("?𡝗?憭望?");
    } finally {
        _isSubmitting = false; // ??閫??
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
    DOM.submitBtn.innerHTML = '<span>蝣箄??勗?</span><i data-lucide="send" class="w-4 h-4"></i>';
    DOM.submitBtn.className = "flex-1 bg-[#06c755] text-white font-bold py-3.5 rounded-xl hover:bg-green-600 transition shadow-md active:scale-95 flex justify-center items-center gap-2";
    DOM.submitBtn.disabled = false;

    DOM.cancelBtn.classList.add('hidden');
    DOM.formTitle.innerText = "憛怠神?勗?鞈�?";
    DOM.userName.value = appState.user.displayName;
}

function renderEventStaticInfo() {
    const e = appState.currentEvent;
    // ??摰匧�瑼Ｘ䰻嚗𡁻俈甇Ｚ??坔??芾??交??梢𥲤
    if (!e) return;

    // ?�?甈�?
    document.getElementById('display-name').innerText = e.name;
    document.getElementById('display-organizer').innerText = e.organizer;
    document.getElementById('display-location').innerText = e.location;
    document.getElementById('display-address').innerText = e.address;
    document.getElementById('map-link').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}`;

    // ???躰酉甈�?嚗𡁏??批捆?�＊蝷綽?蝛箇蒾?�黸??
    const noteSection = document.getElementById('display-note-section');
    const noteEl = document.getElementById('display-note');
    if (e.note && e.note.trim()) {
        noteEl.innerText = e.note;
        noteSection.classList.remove('hidden');
    } else {
        noteSection.classList.add('hidden');
        noteEl.innerText = '';
    }

    // ?�?憿舐內
    const timeDiv = document.getElementById('display-time-container');
    if (e.type === 'travel' && e.time.includes('~')) {
        const [start, end] = e.time.split('~');
        // ?�?瘣餃?雿輻鍂?交?撠�鍂?澆?
        timeDiv.innerHTML = `<div class="flex flex-col text-sm"><span class="text-green-700 font-bold">韏瘀?${formatDateOnly(start)}</span><span class="text-red-700 font-bold">甇ｇ?${formatDateOnly(end)}</span></div>`;
    } else {
        timeDiv.innerText = formatDate(e.time);
    }

    // 瑼Ｘ䰻?臬炏?𣈯? -> ?𦦵鍂銵典鱓
    const isOpen = isEventOpen(e);
    const canModify = canModifyEvent(e);
    const isToday = !isOpen && canModify; // ?嗅予瘣餃??�鸌敺?

    // ???啣?嚗𡁏炎?仿??滚鱓
    const isBlacklisted = isCurrentUserBlacklisted();

    if (isBlacklisted) {
        // 暺穃??桐蝙?刻��?憿舐內?⊥??勗?嚗䔶蒂?𦦵鍂銵典鱓
        DOM.submitBtn.innerText = "?函𤌍?滨�瘜訫𥼚?齿暑??;
        DOM.submitBtn.className = "flex-1 bg-gray-400 text-white font-bold py-3.5 rounded-xl cursor-not-allowed flex justify-center items-center gap-2";
        DOM.submitBtn.disabled = true;
        if (DOM.cancelBtn) DOM.cancelBtn.classList.add('hidden');

        const formInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button:not(#btn-header-share):not(#btn-stats)');
        formInputs.forEach(el => el.disabled = true);

    } else if (!isOpen) {
        if (isToday) {
            // ?�??�暑?𤏪?摰��?航?
            // ?梯??𣂷漱?厰?
            DOM.submitBtn.classList.add('hidden');
            DOM.submitBtn.classList.remove('flex');
            if (DOM.cancelBtn) DOM.cancelBtn.classList.add('hidden');

            // ?𦦵鍂銵典鱓?扳??㕑撓?交? (靽萘??�澈?�絞閮�??函??蠘�)
            const formInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button:not(#btn-header-share):not(#btn-stats)');
            formInputs.forEach(el => el.disabled = true);
        } else {
            // ?𥪜予?𠹺誑敺䕘?摰��蝯鞉?嚗�??刻”?桀�?�?㕑撓?交?
            const formInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button');
            formInputs.forEach(el => el.disabled = true);

            DOM.submitBtn.innerText = "瘣餃?撌脩???;
            DOM.submitBtn.className = "flex-1 bg-gray-400 text-white font-bold py-3.5 rounded-xl cursor-not-allowed flex justify-center items-center gap-2";
            DOM.submitBtn.disabled = true;
        }
    }

    // ?芣迫?交?
    if (e.deadline) {
        const isExpired = new Date() > new Date(e.deadline);
        const color = isExpired ? "text-red-500 font-bold" : "text-gray-400";
        timeDiv.innerHTML += `<div class="mt-1 pt-1 border-t border-gray-100 text-xs ${color} flex items-center gap-1"><i data-lucide="hourglass" class="w-3 h-3"></i> ?芣迫嚗?{formatDate(e.deadline)}</div>`;

        if (isExpired && isOpen) { // ?�銁瘣餃?隞漤??曆?撌脤??芣迫?�??�＊蝷?
            DOM.submitBtn.disabled = true;
            DOM.submitBtn.innerText = "?勗?撌脫⏛甇?;
            DOM.submitBtn.classList.add('bg-gray-400', 'cursor-not-allowed');
            DOM.submitBtn.classList.remove('bg-[#06c755]', 'hover:bg-green-600');
        }
    }

    // ?�?见??𥟇???- 甈𢠃?瑼Ｘ䰻
    if (appState.user.userId && e.creatorId && appState.user.userId === e.creatorId) {
        DOM.managerControls.classList.remove('hidden');
    } else {
        DOM.managerControls.classList.add('hidden');
    }

    const statusBtn = document.getElementById('btn-status-toggle');
    statusBtn.className = `text-xs px-3 py-1.5 rounded-full font-bold border transition flex items-center gap-1 ${isOpen ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100'}`;
    statusBtn.innerHTML = isOpen ? '<i data-lucide="stop-circle" class="w-3 h-3"></i> ?𣈯?瘣餃?' : '<i data-lucide="play-circle" class="w-3 h-3"></i> ?见?瘣餃?';

    // 甈�?憿舐內?�??
    const fields = {
        travel: document.getElementById('field-travel'),
        banquet: document.getElementById('field-banquet'),
        itinerary: document.getElementById('travel-itinerary-section'),
        guestTravel: document.getElementById('guest-travel-options')
    };

    // ?滨蔭
    Object.values(fields).forEach(el => el.classList.add('hidden'));
    DOM.statSecLabel.innerText = "韐𠰴𨭌蝑�彍";

    if (e.type === 'travel') {
        fields.travel.classList.remove('hidden');
        fields.guestTravel.classList.remove('hidden');
        if (e.itinerary) {
            fields.itinerary.classList.remove('hidden');
            renderItinerary(e.itinerary, e.time);
        }
        DOM.statSecLabel.innerText = "撌脰??踵彍";

        // 憛怠�?賊?
        populateSelect('pickup-loc', e.pickupOpts);
        populateSelect('add-guest-pickup', e.pickupOpts);
        populateRoomOptions('room-type', e.roomOpts);
        populateRoomOptions('add-guest-room', e.roomOpts);

    } else if (e.type === 'banquet') {
        fields.banquet.classList.remove('hidden');
        DOM.statSecLabel.innerText = "?鞱?獢峕彍";
    }

    refreshIcons();
}

// --- 皜脫??𡑒” ---
function renderGuestList() {
    DOM.guestContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    appState.guestList.forEach((g, i) => {
        let details = [];
        if (g.count > 1) details.push(`${g.count}鈭槁);
        if (g.pickup) details.push(escapeHtml(g.pickup));
        if (g.room) details.push(escapeHtml(g.room));
        const subtext = details.length > 0 ? `<span class="text-xs text-gray-400 ml-1">(${details.join(', ')})</span>` : '';

        const div = document.createElement('div');
        div.className = 'flex justify-between items-center bg-white border border-gray-200 pl-3 pr-2 py-2 rounded-lg text-sm shadow-sm animate-fade-in';
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
                <span class="font-medium text-[#EFECE5]">${escapeHtml(g.name)} ${subtext}</span>
            </div>
            <div class="flex gap-2 items-center">
                <i data-lucide="edit-2" class="w-4 h-4 tag-action tag-edit" onclick="editGuest(${i})"></i>
                <i data-lucide="x" class="w-4 h-4 tag-action tag-remove" onclick="removeGuest('${g.id}')"></i>
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
        div.className = 'flex justify-between items-center bg-white border border-gray-200 pl-3 pr-2 py-2 rounded-lg text-sm shadow-sm animate-fade-in';
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <i data-lucide="gift" class="w-3.5 h-3.5 text-purple-500"></i>
                <span class="font-medium text-[#EFECE5]">${escapeHtml(s)}</span>
            </div>
            <div class="flex gap-2 items-center">
                <i data-lucide="edit-2" class="w-4 h-4 tag-action tag-edit" onclick="editSponsor(${i})"></i>
                <i data-lucide="x" class="w-4 h-4 tag-action tag-remove" onclick="removeSponsor(${i})"></i>
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

    // 蝘駁膄?嗅??�𤌍隞乩噶?齿鰵?惩�
    appState.guestList.splice(i, 1);
    renderGuestList();
    showToast("撌脰??亥??躰秐頛詨�獢�?靽格㺿敺諹?暺鮋�?�??亙??柴�?);
}

function editSponsor(i) {
    const s = appState.sponsorList[i];
    // 閫??摮𦯀葡?𧼮‵ UI ?�?頛?
    // Format 1: ?㘾?: 5??
    // Format 2: 蝝�?: 1000??
    // Format 3: ?嗡?: ...

    if (s.startsWith("?㘾?:")) {
        document.querySelector('input[name="addSponsorType"][value="alcohol"]').checked = true;
        renderAddSponsorUI();
        const content = s.substring(4); // "5??
        const unit = content.includes('蝞?) ? '蝞? : '??;
        const qty = parseInt(content, 10);
        document.getElementById('sp-qty').value = qty;
        document.getElementById('sp-unit').value = unit;

    } else if (s.startsWith("蝝�?:")) {
        document.querySelector('input[name="addSponsorType"][value="money"]').checked = true;
        renderAddSponsorUI();
        // "蝝�?: 1000??
        const money = parseInt(s.match(/\d+/)[0]);
        document.getElementById('sp-money').value = money;

    } else {
        // "?嗡?: ..."
        document.querySelector('input[name="addSponsorType"][value="other"]').checked = true;
        renderAddSponsorUI();
        const content = s.substring(4);
        document.getElementById('sp-other').value = content;
    }

    appState.sponsorList.splice(i, 1);
    renderSponsorList();
    showToast("撌脰??亥??躰秐頛詨�獢�?靽格㺿敺諹?暺鮋�?峕鰵憓噼??押�?);
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
        // 閫???交?嚗�??�𠯫?毺??滩?撽𡑒? ISO ?澆?嚗?
        const getTime = (t) => {
            if (!t) return 0;
            // ?亦�蝭�? "start~end"嚗�??见??交?
            const start = t.includes('~') ? t.split('~')[0] : t;
            return new Date(start).getTime();
        };
        return getTime(a.time) - getTime(b.time);
    });

    if (filtered.length === 0) {
        DOM.noEventsMsg.classList.remove('hidden');
    } else {
        DOM.noEventsMsg.classList.add('hidden');
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

            // ?芣迫霅血? / 撌脣𥼚?齿?蝐日?頛?
            let badge = '';
            // ?芸?憿舐內撌脣𥼚?㵪??喃蝙撌脫⏛甇?
            if (appState.myRegistrations.includes(e.id)) {
                badge = '<span class="absolute top-0 right-0 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">撌脣𥼚??/span>';
            } else if (e.deadline && new Date() > new Date(e.deadline)) {
                badge = '<span class="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">撌脫⏛甇?/span>';
            }

            // ???埝彍璅躰?嚗朞??Ｘ暑?閖??匧嗾憭?
            let countdownBadge = '';
            if (e.time) {
                const now = new Date();
                const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                let eventStart;
                if (typeof e.time === 'string' && e.time.includes('~')) {
                    eventStart = new Date(e.time.split('~')[0].trim());
                } else {
                    eventStart = new Date(e.time);
                }
                if (!isNaN(eventStart.getTime())) {
                    const eventMid = new Date(eventStart.getFullYear(), eventStart.getMonth(), eventStart.getDate());
                    const diffDays = Math.round((eventMid - todayMid) / (1000 * 60 * 60 * 24));
                    if (diffDays === 0) {
                        countdownBadge = '<span class="inline-flex items-center gap-0.5 text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-bold">?𣞁 隞𠰴予嚗?/span>';
                    } else if (diffDays === 1) {
                        countdownBadge = '<span class="inline-flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-bold">???𤾸予</span>';
                    } else if (diffDays > 1 && diffDays <= 7) {
                        countdownBadge = `<span class="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-bold">?? ?�? ${diffDays} 憭?/span>`;
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
                    <div class="text-xs text-gray-500 mb-2 break-words">銝餉齒: ${escapeHtml(e.organizer)}</div>
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

// --- 閬𣇉??�底蝝啗?閮𢠃?頛?---
async function openDetailsModal(filterType = 'all') {
    if (!appState.currentEvent) return;
    const modal = document.getElementById('details-modal');
    const content = document.getElementById('modal-content');

    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('translate-y-full', 'opacity-0');
        content.classList.add('translate-y-10', 'sm:translate-y-0', 'opacity-100');
    }, 10);

    // ?閙?靽格㺿璅䠷?
    const titleEl = document.querySelector('#details-modal h3');
    if (filterType === 'people') {
        titleEl.innerHTML = '<i data-lucide="users" class="w-5 h-5 text-gray-600"></i> 鈭箏摱?滚鱓';
    } else if (filterType === 'secondary') {
        const type = appState.currentEvent.type;
        const icon = type === 'travel' ? 'bus' : 'gift';
        const text = type === 'travel' ? '雿誩挪?�漱?? : '韐𠰴𨭌?�?獢?;
        titleEl.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5 text-gray-600"></i> ${text}?𡒊敦`;
    } else {
        titleEl.innerHTML = '<i data-lucide="list" class="w-5 h-5 text-gray-600"></i> 閰喟敦?滚鱓';
    }
    refreshIcons();

    // 憛怠�?䁅?
    const sumDiv = document.getElementById('modal-summary');
    sumDiv.innerHTML = '';
    if (appState.currentEvent.type === 'travel') {
        const pMap = appState.currentStats.pickupCounts || {};
        const rMap = appState.currentStats.roomCounts || {};
        let html = '';
        if (Object.keys(pMap).length) html += `<div class="bg-[#0D131A] border border-white/10 rounded p-1.5"><div class="font-bold mb-1 text-[#D4AF37]">?? 銝𡃏??圈?</div>${Object.entries(pMap).map(([k, v]) => `<span class="inline-block bg-white/10 text-white px-1.5 rounded text-[10px] mr-1 mb-1">${k}:${v}</span>`).join('')}</div>`;
        if (Object.keys(rMap).length) html += `<div class="bg-[#0D131A] border border-white/10 rounded p-1.5"><div class="font-bold mb-1 text-[#D4AF37]">?? ?踹?蝯梯?</div>${Object.entries(rMap).map(([k, v]) => `<span class="inline-block bg-white/10 text-white px-1.5 rounded text-[10px] mr-1 mb-1">${k}:${v}</span>`).join('')}</div>`;
        sumDiv.innerHTML = html;
    } else if (appState.currentEvent.type === 'banquet') {
        sumDiv.innerHTML = `<div class="col-span-2 bg-red-500/10 border border-red-500/20 rounded p-2 text-center font-bold text-red-400">蝮質??鞱?: ${appState.currentStats.tableCount} 獢?/div>`;
    }

    const listContainer = document.getElementById('details-lists-container');
    const loading = document.getElementById('modal-loading');
    const empty = document.getElementById('modal-empty');

    listContainer.classList.add('hidden');
    loading.classList.remove('hidden');
    empty.classList.add('hidden');

    const data = await fetchDetails();
    appState.cachedDetails = data; // ??敹怠?鞈�?隞乩??峕郊銴�ˊ雿輻鍂
    loading.classList.add('hidden');

    if (!data || data.length === 0) {
        empty.classList.remove('hidden');
        return;
    }

    listContainer.classList.remove('hidden');
    renderDetailLists(data);

    // ???寞? filterType ?梯?銝漤?閬�??�憛?
    const listP = document.getElementById('details-list-people');
    const labelP = listP.previousElementSibling;
    const listT = document.getElementById('details-list-travel');
    const labelT = document.getElementById('travel-separator');
    const listI = document.getElementById('details-list-items');
    const labelI = document.getElementById('details-separator');

    if (filterType === 'people') {
        if (listT) listT.classList.add('hidden');
        if (labelT) labelT.classList.add('hidden');
        if (listI) listI.classList.add('hidden');
        if (labelI) labelI.classList.add('hidden');
        listP.classList.remove('hidden');
        labelP.classList.remove('hidden');
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

// findCaseInsensitiveValue 撌脣銁銝𦠜䲮 FIELD_KEYS ?�憛𠰴?蝢抬?L1466嚗㚁?甇方?銝漤?銴�?蝢?

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
        const name = findCaseInsensitiveValue(row, ['name', 'Name', '憪枏?', 'UserName', 'username']) || 'Unknown';
        const safeName = escapeHtml(name);
        const family = getIntField(row, 'family');

        const guestData = parseGuestData(row);
        // ?烾??閧?嚗帋蝙?函絞銝�閮�??賣彍
        const finalGuestCount = calculateFinalGuestCount(row, guestData);

        // ??靽格迤嚗鎄amilyCount ?曉銁?脣??箝�𣬚溸撅祆彍?㵪?getIntField 撌脰???+1 (?砌犖)
        const total = family + finalGuestCount;

        let nameSuffix = '';
        if (total > 1) {
            nameSuffix = ` <span class="text-gray-600 font-bold">*${total}</span>`;
        }

        let subHtml = '';
        if (guestData.length > 0) {
            subHtml = guestData.map(g => `<div class="pl-8 text-gray-400 text-sm mt-0.5">靘�?嚗?{escapeHtml(g.name)}</div>`).join('');
        } else {
            const guestNameStr = getField(row, 'guestName');
            if (guestNameStr && guestNameStr !== '??) {
                subHtml = `<div class="pl-8 text-gray-400 text-sm mt-0.5">靘�?嚗?{escapeHtml(guestNameStr)}</div>`;
            }
        }

        const pickup = getField(row, 'pickup');
        const room = getField(row, 'room');
        const tableCount = getIntField(row, 'tableCount');
        const sponsor = getField(row, 'sponsor');

        const num = (idx + 1).toString().padStart(2, '0');

        // ?硋?閫坿𠧧璅嗵惜
        const roles = getParticipantRoles(name, appState.currentEvent);
        let tagHtml = '';
        if (roles.length > 0) {
            tagHtml = roles.map(r => `<span class="text-[12px] font-bold ml-1.5 flex items-center" style="color:${r.color};">${r.label}</span>`).join('');
        }

        const liP = document.createElement('li');
        liP.className = 'px-4 py-3 hover:bg-white/5 transition';

        // ??撠讐麐?匧?銝匧??喟?嚗�雯?�??桀�憿舐內嚗?
        let maryMedal = '';
        let maryNameColor = '';
        if (appState.jackpotRankings && appState.jackpotRankings.length > 0) {
            const rankIndex = appState.jackpotRankings.findIndex(r => r.name === name);
            if (rankIndex === 0) { maryMedal = '??'; maryNameColor = 'color:#d97706;font-weight:800;'; }
            else if (rankIndex === 1) { maryMedal = '??'; maryNameColor = 'color:#64748b;font-weight:800;'; }
            else if (rankIndex === 2) { maryMedal = '??'; maryNameColor = 'color:#b45309;font-weight:800;'; }
        }

        liP.innerHTML = `
            <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <span class="text-gray-400 font-mono text-sm">${num}.</span>
                <span class="font-bold text-[#EFECE5] text-base inline-flex items-center flex-wrap" style="${maryNameColor}">${maryMedal}${safeName}${tagHtml}${nameSuffix}</span>
            </div>
            ${subHtml}`;
        fragP.appendChild(liP);

        if (appState.currentEvent.type === 'travel') {
            // 瑼Ｘ䰻銝餉?鈭箏摱
            if ((pickup && pickup !== '??) || (room && room !== '??)) {
                hasTravel = true;
                const liT = document.createElement('li');
                liT.className = 'px-4 py-2 flex justify-between items-center hover:bg-white/5 text-sm';
                liT.innerHTML = `
                    <span class="font-medium text-[#EFECE5]">${safeName}</span>
                    <div class="text-right text-xs text-gray-500">
                        ${pickup && pickup !== '?? ? `<div class="text-blue-600">${escapeHtml(pickup)}</div>` : ''}
                        ${room && room !== '?? ? `<div class="text-orange-600">${escapeHtml(room)}</div>` : ''}
                    </div>`;
                fragT.appendChild(liT);
            }

            // 瑼Ｘ䰻靘�?
            guestData.forEach(g => {
                if ((g.pickup && g.pickup !== '??) || (g.room && g.room !== '??)) {
                    hasTravel = true;
                    const liTG = document.createElement('li');
                    liTG.className = 'px-4 py-2 flex justify-between items-center hover:bg-gray-50 text-sm';
                    liTG.innerHTML = `
                        <span class="font-medium text-[#EFECE5]"><span class="text-xs text-gray-400 mr-1">鞈?/span>${escapeHtml(g.name)}</span>
                        <div class="text-right text-xs text-gray-500">
                            ${g.pickup && g.pickup !== '?? ? `<div class="text-blue-600">${escapeHtml(g.pickup)}</div>` : ''}
                            ${g.room && g.room !== '?? ? `<div class="text-orange-600">${escapeHtml(g.room)}</div>` : ''}
                        </div>`;
                    fragT.appendChild(liTG);
                }
            });
        }

        const items = [];
        if (tableCount > 0) items.push(`隤齿? ${tableCount} 獢䈣);

        // 雿輻鍂頛𥪜𨭌?賢?閫??韐𠰴𨭌
        const spList = parseSponsorData(sponsor);
        if (spList.length > 0) {
            items.push(...spList);
        }

        if (items.length > 0) {
            hasItems = true;
            const liI = document.createElement('li');
            liI.className = 'px-4 py-3 hover:bg-white/5';
            liI.innerHTML = `
                <div class="flex justify-between items-start">
                    <span class="font-medium text-[#EFECE5] text-sm">${safeName}</span>
                    <div class="text-right flex-1 pl-4">
                        ${items.map(i => `<div class="text-xs text-purple-600 bg-purple-50 inline-block px-2 py-1 rounded mb-1 ml-1">${i}</div>`).join('')}
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
 * ??parseLocalDate ??蝯曹??�?摮𦯀葡閫??撌亙�嚗�俈甇?UTC ?�榆 +8 撠𤩺? BUG嚗?
 * ?誯?嚗?yyyy-MM-dd HH:mm' ?澆?摮𦯀葡蝯?new Date() ?�◤敶𤘪? UTC 閫??嚗?
 *          撠舘稲 GMT+8 ?啣??�?撠睲? 8 撠𤩺?嚗�? 18:29 霈?00:00嚗剹�?
 * 閫?捱嚗朞䌊?閗儘霅䀹聢撘𧶏?蝯衣�?�??�?銝脣?銝?+08:00 敺𣬚??滩圾?僐�?
 * 頛詨�嚗𡁜?銝脫? Date ?拐辣
 * 頛詨枂嚗鋽ate ?拐辣嚗𠃑MT+8 甇?Ⅱ?�?嚗?
 */
function parseLocalDate(s) {
    if (!s) return new Date(NaN);
    if (s instanceof Date) return s;
    const str = String(s).trim();
    // 憒�?撌脣???+?�?鞈�?嚗?08:00, Z, UTC 蝑㚁?嚗𣬚凒?亥圾??
    if (/[Z+]\d{2}:?\d{2}$/.test(str) || str.endsWith('Z')) {
        return new Date(str);
    }
    // ?寥? yyyy-MM-dd HH:mm(:ss) ??yyyy/MM/dd HH:mm(:ss)嚗�?隞??交??舀螱銝滩??塚?
    const match = str.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) {
        const y = match[1], mo = match[2], d = match[3];
        const h = match[4] || '00', mi = match[5] || '00', sec = match[6] || '00';
        // ?牐? +08:00 蝣箔??脫? GMT+8 閫??
        return new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}+08:00`);
    }
    return new Date(str);
}

/**
 * ??蝯曹??�??澆??吔??�澈/?𣇉?/銴�ˊ?梁鍂嚗?
 * 頛詨�嚗䥑SO ?交?摮𦯀葡??"start~end" 蝭�?摮𦯀葡
 * 頛詨枂嚗𡁏聢撘誩?敺𣬚?憿舐內摮𦯀葡
 */
function formatTimeForShare(timeStr) {
    if (!timeStr) return '';
    if (timeStr.includes('~')) {
        const [start, end] = timeStr.split('~');
    }
}

// findCaseInsensitiveValue 撌脣銁銝𦠜䲮 FIELD_KEYS ?�憛𠰴?蝢抬?L1466嚗㚁?甇方?銝漤?銴�?蝢?
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
        const name = findCaseInsensitiveValue(row, ['name', 'Name', '憪枏?', 'UserName', 'username']) || 'Unknown';
        const safeName = escapeHtml(name);
        const family = getIntField(row, 'family');

        const guestData = parseGuestData(row);
        // ?烾??閧?嚗帋蝙?函絞銝�閮�??賣彍
        const finalGuestCount = calculateFinalGuestCount(row, guestData);

        // ??靽格迤嚗鎄amilyCount ?曉銁?脣??箝�𣬚溸撅祆彍?㵪?getIntField 撌脰???+1 (?砌犖)
        const total = family + finalGuestCount;

        let nameSuffix = '';
        if (total > 1) {
            nameSuffix = ` <span class="text-gray-600 font-bold">*${total}</span>`;
        }

        let subHtml = '';
        if (guestData.length > 0) {
            subHtml = guestData.map(g => `<div class="pl-8 text-gray-400 text-sm mt-0.5">靘�?嚗?{escapeHtml(g.name)}</div>`).join('');
        } else {
            const guestNameStr = getField(row, 'guestName');
            if (guestNameStr && guestNameStr !== '??) {
                subHtml = `<div class="pl-8 text-gray-400 text-sm mt-0.5">靘�?嚗?{escapeHtml(guestNameStr)}</div>`;
            }
        }

        const pickup = getField(row, 'pickup');
        const room = getField(row, 'room');
        const tableCount = getIntField(row, 'tableCount');
        const sponsor = getField(row, 'sponsor');

        const num = (idx + 1).toString().padStart(2, '0');

        // ?硋?閫坿𠧧璅嗵惜
        const roles = getParticipantRoles(name, appState.currentEvent);
        let tagHtml = '';
        if (roles.length > 0) {
            tagHtml = roles.map(r => `<span class="text-[12px] font-bold ml-1.5 flex items-center" style="color:${r.color};">${r.label}</span>`).join('');
        }

        const liP = document.createElement('li');
        liP.className = 'px-4 py-3 hover:bg-white/5 transition';

        // ??撠讐麐?匧?銝匧??喟?嚗�雯?�??桀�憿舐內嚗?        let maryMedal = '';
        let maryNameColor = '';
        if (appState.jackpotRankings && appState.jackpotRankings.length > 0) {
            const rankIndex = appState.jackpotRankings.findIndex(r => r.name === name);
            if (rankIndex === 0) { maryMedal = '??'; maryNameColor = 'color:#d97706;font-weight:800;'; }
            else if (rankIndex === 1) { maryMedal = '??'; maryNameColor = 'color:#64748b;font-weight:800;'; }
            else if (rankIndex === 2) { maryMedal = '??'; maryNameColor = 'color:#b45309;font-weight:800;'; }
        }

        liP.innerHTML = `
            <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
                <span class="text-gray-400 font-mono text-sm">${num}.</span>
                <span class="font-bold text-[#EFECE5] text-base inline-flex items-center flex-wrap" style="${maryNameColor}">${maryMedal}${safeName}${tagHtml}${nameSuffix}</span>
            </div>
            ${subHtml}`;
        fragP.appendChild(liP);

        if (appState.currentEvent.type === 'travel') {
            // 瑼Ｘ䰻銝餉?鈭箏摱
            if ((pickup && pickup !== '??) || (room && room !== '??)) {
                hasTravel = true;
                const liT = document.createElement('li');
                liT.className = 'px-4 py-2 flex justify-between items-center hover:bg-white/5 text-sm';
                liT.innerHTML = `
                    <span class="font-medium text-[#EFECE5]">${safeName}</span>
                    <div class="text-right text-xs text-gray-500">
                        ${pickup && pickup !== '?? ? `<div class="text-blue-600">${escapeHtml(pickup)}</div>` : ''}
                        ${room && room !== '?? ? `<div class="text-orange-600">${escapeHtml(room)}</div>` : ''}
                    </div>`;
                fragT.appendChild(liT);
            }

            // 瑼Ｘ䰻靘�?
            guestData.forEach(g => {
                if ((g.pickup && g.pickup !== '??) || (g.room && g.room !== '??)) {
                    hasTravel = true;
                    const liTG = document.createElement('li');
                    liTG.className = 'px-4 py-2 flex justify-between items-center hover:bg-white/5 text-sm';
                    liTG.innerHTML = `
                        <span class="font-medium text-[#EFECE5]"><span class="text-xs text-gray-400 mr-1">鞈?/span>${escapeHtml(g.name)}</span>
                        <div class="text-right text-xs text-gray-500">
                            ${g.pickup && g.pickup !== '?? ? `<div class="text-blue-600">${escapeHtml(g.pickup)}</div>` : ''}
                            ${g.room && g.room !== '?? ? `<div class="text-orange-600">${escapeHtml(g.room)}</div>` : ''}
                        </div>`;
                    fragT.appendChild(liTG);
                }
            });
        }

        const items = [];
        if (tableCount > 0) items.push(`隤齿? ${tableCount} 獢䈣);

        // 雿輻鍂頛𥪜𨭌?賢?閫??韐𠰴𨭌
        const spList = parseSponsorData(sponsor);
        if (spList.length > 0) {
            items.push(...spList);
        }

        if (items.length > 0) {
            hasItems = true;
            const liI = document.createElement('li');
            liI.className = 'px-4 py-3 hover:bg-white/5';
            liI.innerHTML = `
                <div class="flex justify-between items-start">
                    <span class="font-medium text-[#EFECE5] text-sm">${safeName}</span>
                    <div class="text-right flex-1 pl-4">
                        ${items.map(i => `<div class="text-xs text-purple-600 bg-purple-50 inline-block px-2 py-1 rounded mb-1 ml-1">${i}</div>`).join('')}
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
 * ??parseLocalDate ??蝯曹??�?摮𦯀葡閫??撌亙�嚗�俈甇?UTC ?�榆 +8 撠𤩺? BUG嚗? * ?誯?嚗?yyyy-MM-dd HH:mm' ?澆?摮𦯀葡蝯?new Date() ?�◤敶𤘪? UTC 閫??嚗? *          撠舘稲 GMT+8 ?啣??�?撠睲? 8 撠𤩺?嚗�? 18:29 霈?00:00嚗剹�? * 閫?捱嚗朞䌊?閗儘霅䀹聢撘𧶏?蝯衣�?�??�?銝脣?銝?+08:00 敺𣬚??滩圾?僐�? * 頛詨�嚗𡁜?銝脫? Date ?拐辣
 * 頛詨枂嚗鋽ate ?拐辣嚗𠃑MT+8 甇?Ⅱ?�?嚗? */
function parseLocalDate(s) {
    if (!s) return new Date(NaN);
    if (s instanceof Date) return s;
    const str = String(s).trim();
    // 憒�?撌脣???+?�?鞈�?嚗?08:00, Z, UTC 蝑㚁?嚗𣬚凒?亥圾??    if (/[Z+]\d{2}:?\d{2}$/.test(str) || str.endsWith('Z')) {
        return new Date(str);
    }
    // ?寥? yyyy-MM-dd HH:mm(:ss) ??yyyy/MM/dd HH:mm(:ss)嚗�?隞??交??舀螱銝滩??塚?
    const match = str.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (match) {
        const y = match[1], mo = match[2], d = match[3];
        const h = match[4] || '00', mi = match[5] || '00', sec = match[6] || '00';
        // ?牐? +08:00 蝣箔??脫? GMT+8 閫??
        return new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}+08:00`);
    }
    return new Date(str);
}

/**
 * ??蝯曹??�??澆??吔??�澈/?𣇉?/銴�ˊ?梁鍂嚗? * 頛詨�嚗䥑SO ?交?摮𦯀葡??"start~end" 蝭�?摮𦯀葡
 * 頛詨枂嚗𡁏聢撘誩?敺𣬚?憿舐內摮𦯀葡
 */
function formatTimeForShare(timeStr) {
    if (!timeStr) return '';
    if (timeStr.includes('~')) {
        const [start, end] = timeStr.split('~');
        return `${formatDateOnly(start.trim())} ~ ${formatDateOnly(end.trim())}`;
    }
    const d = new Date(timeStr);
    if (isNaN(d.getTime())) return timeStr;
    const week = ['??, '銝�', '鈭?, '銝?, '??, '鈭?, '??][d.getDay()];
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${week}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/**
 * ??蝯曹??斗𪃾隞𠰴予?臬炏?箸暑?閙𠯫嚗�?鈭?銴�ˊ?�䌊?閖＊蝷箏𧑐?㚚�???梁鍂嚗? * 頛詨�嚗𡁏暑?閧�隞塚???time 甈�?嚗? * 頛詨枂嚗鋳oolean
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
        const startD = parseLocalDate(startStr); // ???寧鍂 parseLocalDate
        const endD = parseLocalDate(endStr);     // ???寧鍂 parseLocalDate
        if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
            const todayDate = parseLocalDate(todayStr);
            return todayDate >= new Date(startD.toDateString()) && todayDate <= new Date(endD.toDateString());
        }
    } else {
        const eventDate = parseLocalDate(t); // ???寧鍂 parseLocalDate
        if (!isNaN(eventDate.getTime())) {
            const eStr = `${eventDate.getFullYear()}-${(eventDate.getMonth() + 1).toString().padStart(2, '0')}-${eventDate.getDate().toString().padStart(2, '0')}`;
            return todayStr === eStr;
        }
    }
    return false;
}


/**
 * 蝯曹?閫??靘�?鞈�?嚗𡁏𣈲?游?蝔格聢撘𧶏?JSON?�SON 摮𦯀葡?𤥁??�?銝莎?
 * ?∟???JSON?�rray ?�糓 String嚗𣬚絞銝�頧厩�璅蹱??澆? Array
 * ?𧼮�靘�??拐辣???嚗㝯 name, count, pickup, room }
 */

function parseGuestData(row) {
    let guestData = [];
    if (!row || typeof row !== 'object') return guestData;

    // 摰𡁶儔?䠷�?萄�?(?啣??游?霈𠰴?)
    const jsonKeys = ['guestList', 'guestJson', 'GuestJson', 'GuestList', 'guest_json', 'guest_list', '靘�?鞈�?JSON', '靘�?鞈�?', 'json', 'JSON', 'guests', 'Guests', 'extraData'];
    const nameKeys = ['guestName', 'GuestName', 'Guest Name', 'guest_name', 'Guest Names', 'Guest_Names', 'guestNames', 'guest_names', '靘�?憪枏?', '靘�?', 'Guest', 'guest', 'memo', 'Memo', '?躰酉'];

    // 雿輻鍂撘瑕�?�??拙遆撘誩?敺埈彍??    let guestJson = findCaseInsensitiveValue(row, jsonKeys);
    let guestNameStr = findCaseInsensitiveValue(row, nameKeys);

    // 1. ?𡑒岫閫?? JSON
    if (guestJson && guestJson !== '[]' && guestJson !== '??) {
        try {
            const parsed = (typeof guestJson === 'string') ? JSON.parse(guestJson) : guestJson;
            if (Array.isArray(parsed)) {
                guestData = parsed.map(g => {
                    // ??g ?臬?銝?(靘见? ["Guest A", "Guest B"])
                    if (typeof g === 'string') {
                        return { name: g, count: 1, pickup: '', room: '' };
                    }
                    // ??g ?舐�隞?                    // 撱箇??钅◢?游?獢?                    const wrapper = document.createElement('div');
                    wrapper.className = "border border-white/10 rounded-2xl overflow-hidden bg-white/5 shadow-sm";
                    return {
                        name: g.name || g.Name || g['憪枏?'] || g.guestName || g.GuestName || g['靘�?憪枏?'] || '',
                        count: parseInt(g.count || g.Count || g['鈭箸彍']) || 1,
                        pickup: g.pickup || g.Pickup || '',
                        room: g.room || g.Room || ''
                    };
                }).filter(g => g.name); // ?擧蕪?㗇??匧?摮㛖??�𤌍
            }
        } catch (e) {
            // JSON 閫??憭望?嚗�蕭??        }
    }

    // 2. ?蹱螱蝑𣇉裦
    // ??JSON 閫??憭望??𣇉�蝛綽?銝?guestName ?箇征嚗�?閰虫蝙??guestJson ?嗡?摮𦯀葡 (?交糓蝝𥪜?銝脣‵??guestList 甈�??�?瘜?
    let sourceStr = guestNameStr;
    // ?芣???guestJson ?贝絲靘�???JSON (銝滢誑 [ ??{ ?钅�) ?�??齿?摰�訜雿𨀣芦?𡁜?銝脰???    if ((!sourceStr || sourceStr === '??) && guestJson && typeof guestJson === 'string' && !guestJson.trim().startsWith('[') && !guestJson.trim().startsWith('{')) {
        sourceStr = guestJson;
    }

    if (guestData.length === 0 && sourceStr && sourceStr !== '??) {
        // 蝣箔??箏?銝?        sourceStr = String(sourceStr);

        // ?啣??𥡝?蝚西??舀螱
        const guestEntries = sourceStr.split(/[,??\n]\s*/);
        guestEntries.forEach(g => {
            if (!g.trim()) return;
            let parts = g.split('|');
            let namePart = parts[0].trim();
            let displayName = namePart;
            let count = 1;

            // 閫?? "?滚?(2)" ??"?滚?(+2)" ?嗵車?澆?
            const match = namePart.match(/(.*?)\((\+)?(\d+)\)/);
            if (match) {
                displayName = match[1].trim();
                count = parseInt(match[3]); // match[3] is the number
            }

            guestData.push({
                name: displayName,
                count: count,
                pickup: parts[1] && parts[1] !== '?? ? parts[1] : '',
                room: parts[2] && parts[2] !== '?? ? parts[2] : ''
            });
        });
    }

    return guestData;
}

/**
 * 閫??韐𠰴𨭌鞈�?嚗�𣈲?游?蝔格聢撘𧶏?
 * ?𧼮�韐𠰴𨭌摮𦯀葡???
 */
function parseSponsorData(input) {
    let list = [];
    if (!input || input === '??) return list;

    // 1. ?𡑒岫 JSON
    try {
        const json = (typeof input === 'string' && (input.startsWith('[') || input.startsWith('{')))
            ? JSON.parse(input)
            : input;
        if (Array.isArray(json)) {
            return json;
        }
    } catch (e) { /* Not JSON */ }

    // 2. ?蹱螱嚗𡁜??脣?銝?    if (typeof input === 'string') {
        const items = input.split(/[,??]\s*/);
        items.forEach(item => {
            const clean = item.trim();
            if (clean && clean !== '??) {
                list.push(clean);
            }
        });
    }
    return list;
}

// refreshIcons 撌脣銁 script ?��摰𡁶儔嚗�鸌甈∠??穿?

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
        DOM.headerTitle.innerText = "瘣餃??�𥼚??;
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
    // 靽格迤嚗𡁏㺿?箸綉?嗆暑?訫?銵典?憛𡃏�屸?撌脣⏛?斤? active-categories
    const activeEventSection = document.getElementById('active-event-section');
    const createBtn = document.getElementById('btn-create-event');

    if (isHidden) {
        // ?�??唳風?脫芋撘?        if (activeEventSection) activeEventSection.classList.add('hidden');
        if (createBtn) createBtn.classList.add('hidden');
        container.classList.remove('hidden');
        btnText.innerText = "餈𥪜?擐㚚?";

        // 皜脫?甇瑕蟮?𡑒”
        const list = document.getElementById('history-items');
        list.innerHTML = '';
        // 蝭拚�撌脩??毺?瘣餃?嚗�?憭拇??脫風?莎?
        const history = appState.events.filter(e => !canModifyEvent(e));

        if (history.length === 0) {
            list.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">?⊥風?脩???/div>';
        } else {
            // ?��?芸?嚗帋蝙??DocumentFragment ?碶誨 innerHTML 蝝臬?
            const fragment = document.createDocumentFragment();
            history.forEach(e => {
                const div = document.createElement('div');
                div.className = "bg-white/5 p-4 rounded-xl border border-white/10 shadow-sm flex justify-between items-center cursor-pointer hover:bg-white/10 transition-all";
                div.onclick = () => openHistoryImage(e.id);
                div.innerHTML = `
                    <div>
                        <h4 class="font-bold text-white/90">${e.name}</h4>
                        <div class="text-xs text-white/60 mt-0.5">銝餉齒嚗?{e.organizer || '?芣?摰?}</div>
                        <div class="text-xs text-white/50 mt-1">${formatDateShort(e.time)}</div>
                    </div>
                    <span class="text-xs bg-white/10 text-white/70 px-2 py-1 rounded-full">撌脩???/span>`;
                fragment.appendChild(div);
            });
            list.appendChild(fragment);
        }
    } else {
        // ?�??鮋??�芋撘?        if (activeEventSection) activeEventSection.classList.remove('hidden');
        if (createBtn) createBtn.classList.remove('hidden');
        container.classList.add('hidden');
        btnText.innerText = "?亦?甇瑕蟮瘣餃?";
    }
}

// --- 甇瑕蟮瘣餃?暺墧??湔𦻖?Ｙ??𣇉? ---
async function openHistoryImage(eventId) {
    const event = appState.events.find(e => e.id === eventId);
    if (!event) return;

    appState.currentEvent = event;
    appState.cachedDetails = null;
    appState.currentStats = {};

    showToast('甇?銁?Ｙ?甇瑕蟮?硋㨃...');

    try {
        // ?枏??勗?鞈?嚗蝙?刻? fetchDetails ?詨???API嚗?        const detailRes = await fetch(`${GAS_URL}?action=getDetails&eventId=${encodeURIComponent(eventId)}`);
        appState.cachedDetails = await detailRes.json();

        // ?枏?蝯梯?鞈?嚗蝙?刻? fetchStats ?詨???API嚗?        const statsRes = await fetch(`${GAS_URL}?action=stats&eventId=${encodeURIComponent(eventId)}&_=${Date.now()}`);
        appState.currentStats = await statsRes.json();
    } catch (err) {
        console.error('?枏?甇瑕蟮?勗?鞈?憭望?:', err);
    }

    const e = appState.currentEvent;
    const data = appState.cachedDetails || [];

    try {
        const canvas = await generateEventCanvas(e, data, appState.currentStats);

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

    // 皞硋??交?閮�?
    let startDate = null;
    if (timeStr) {
        const startRaw = timeStr.includes('~') ? timeStr.split('~')[0] : timeStr;
        const d = parseLocalDate(startRaw); // ???寧鍂 parseLocalDate ?踹??亦??交??砍榆
        if (!isNaN(d.getTime())) {
            startDate = d;
        }
    }

    // 1. 閫???�?蝯?
    const rawParts = str.split(/;|嚗?);
    const groupedDays = new Map();

    let currentDayNum = 1;

    rawParts.forEach((part, index) => {
        if (!part.trim()) return;

        // ?菜葫 D1, Day 1 璅嗵惜
        let dayNum = currentDayNum;
        const match = part.match(/^(D(\d+)|Day\s*(\d+)|蝚枯s*(\d+)\s*憭?(\s*[:嚗鞲)?/i);

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

        // 皜�膄 D1: ?滨韌
        let cleanPart = part;
        if (match) {
            cleanPart = part.substring(match[0].length).trim();
        }

        groupedDays.get(dayNum).rawTexts.push(cleanPart);
    });

    // 撱箇??钅◢?游?獢?
    const wrapper = document.createElement('div');
    wrapper.className = "border border-white/10 rounded-2xl overflow-hidden bg-white/5 shadow-sm";

    // 2. 皜脫? HTML
    const sortedDayNums = Array.from(groupedDays.keys()).sort((a, b) => a - b);

    sortedDayNums.forEach((dayNum, idx) => {
        const group = groupedDays.get(dayNum);

        // 閮�??交?璅嗵惜 (憿舐內?函??脣?獢�?)
        let dayLabel = `D${dayNum}`; // ?鞱身憿舐內 D1, D2
        if (startDate) {
            const currentDay = new Date(startDate);
            currentDay.setDate(startDate.getDate() + (dayNum - 1));
            const m = currentDay.getMonth() + 1;
            const d = currentDay.getDate();
            const w = ['??, '銝�', '鈭?, '銝?, '??, '鈭?, '??][currentDay.getDay()];
            dayLabel = `${m}/${d} (${w})`;
        }

        // ??靽格㺿暺痹?銝餅?憿𣬚凒?亥身摰𡁶� "蝚?X 憭抵?蝔?
        const accordionMainTitle = `蝚?${dayNum} 憭抵?蝔㞗;

        let allContentHtml = '<div class="space-y-4 relative pl-2 pt-2 pb-2">';
        allContentHtml += '<div class="absolute left-[5px] top-4 bottom-2 w-0.5 bg-gray-100"></div>';

        group.rawTexts.forEach(text => {
            if (!text.trim()) return;

            // --- 鞈�?閫???�憛?---
            let itemTitle = text;
            let itemDesc = '';
            let itemUrl = '';

            // 1. 憒�??厩鍂 | ?�?嚗�??�?
            if (text.includes('|')) {
                const parts = text.split('|');
                itemTitle = parts[0].trim();
                itemDesc = parts.slice(1).join('|').trim();

                // 瑼Ｘ䰻?�敺䔶??𧢲?雿齿糓?衣� URL
                if (parts.length >= 3) {
                    const lastPart = parts[parts.length - 1].trim();
                    if (lastPart.startsWith('http')) {
                        itemUrl = lastPart;
                        itemDesc = parts.slice(1, parts.length - 1).join('|').trim();
                    }
                }
            }

            // 2. ?箸�?𣂼? URL
            const urlRegex = /([嚗Ě(?𪀔[\{])?(https?:\/\/[^\s\)]+)([嚗声)?髢]\}])?/;
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

            // 3. 皜�?畾条?蝚西?
            itemTitle = itemTitle.replace(/^[嚗?\s]+/, '').replace(/\(\s*\)$/, '').trim();

            // 4. ?閧?璅䠷??抒??交?
            itemTitle = itemTitle.replace(/\d{4}[-/](\d{1,2})[-/](\d{1,2})/, '$1/$2').replace(/\b0(\d):\b/g, '$1:');

            // 5. ?𣂼??�? (HH:mm)
            let timeDisplay = '';
            const timeMatch = itemTitle.match(/(?:[\d\/\-\.]+\s+)?(\d{1,2}:\d{2})(?::\d{2})?\s*(.*)/);
            if (timeMatch) {
                let rawTime = timeMatch[1];
                if (rawTime.startsWith('0')) rawTime = rawTime.substring(1);
                timeDisplay = rawTime;
                itemTitle = timeMatch[2].replace(/^[嚗?\s]+/, '');
            }

            // --- HTML ?�??�憛?---
            const mapIconHtml = itemUrl ?
                `<a href="${itemUrl}" target="_blank" class="inline-flex items-center justify-center w-6 h-6 bg-blue-50 text-blue-500 rounded-full hover:bg-blue-100 transition ml-2 shrink-0 self-center" title="撠舘⏛" onclick="event.stopPropagation()">
                    <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
                 </a>` : '';

            if (timeDisplay) {
                allContentHtml += `
                    <div class="relative flex gap-3 items-start pl-4 group/item">
                        <div class="absolute left-0 top-1.5 w-3 h-3 bg-white border-[3px] border-green-500 rounded-full z-10 shadow-sm"></div>
                        <div class="font-mono font-bold text-green-700 shrink-0 pt-0.5 w-[42px] text-right mr-1">${timeDisplay}</div>
                        <div class="flex-1 min-w-0 pt-0.5">
                            <div class="flex items-center flex-wrap">
                                <span class="text-gray-800 font-bold leading-tight">${itemTitle}</span>
                                ${mapIconHtml}
                            </div>
                            ${itemDesc ? `<p class="text-xs text-gray-500 mt-1 leading-relaxed">${itemDesc}</p>` : ''}
                        </div>
                    </div>`;
            } else {
                allContentHtml += `
                    <div class="relative flex gap-3 items-start pl-4">
                        <div class="absolute left-1 top-2.5 w-1.5 h-1.5 bg-gray-300 rounded-full z-10"></div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center flex-wrap">
                                <span class="text-gray-700 font-medium leading-tight">${itemTitle}</span>
                                ${mapIconHtml}
                            </div>
                            ${itemDesc ? `<p class="text-xs text-gray-500 mt-1 leading-relaxed">${itemDesc}</p>` : ''}
                        </div>
                    </div>`;
            }
        });
        allContentHtml += '</div>';

        // ?钅◢??Header
        const isOpen = idx === 0;

        const details = document.createElement('details');
        details.setAttribute('name', 'itinerary-group');
        details.className = "group border-b border-gray-100 last:border-0 transition-all itinerary-group";
        if (isOpen) details.setAttribute('open', '');

        const summary = document.createElement('summary');
        summary.className = "flex justify-between items-center p-4 cursor-pointer select-none bg-transparent hover:bg-white/5 transition list-none relative";

        summary.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <span class="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">${dayLabel}</span>
                <span class="font-bold text-gray-800 text-base truncate">${accordionMainTitle}</span>
            </div>
            <div class="w-6 h-6 flex items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-400 font-bold shrink-0 ml-2">
                <span class="icon-plus">+</span>
                <span class="icon-minus">??/span>
            </div>
        `;

        const contentDiv = document.createElement('div');
        contentDiv.className = "px-4 pb-4 pt-0 bg-transparent text-sm text-white/80 leading-relaxed space-y-2 group-content";
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

// --- ?�??�??賢? ---
function switchCategory(type) {
    appState.currentCategory = type;
    // 蝘駁膄?�??Tab ??active 璅??
    document.querySelectorAll('.filter-tab').forEach(btn => btn.classList.remove('active'));
    // ?牐??嗅? Tab ??active 璅??
    const tab = document.getElementById(`tab-${type}`);
    if (tab) tab.classList.add('active');

    renderEventGrid(type);
}

function showCreateView() {
    appState.historyStack.push('create');
    switchView('view-create');
    DOM.headerTitle.innerText = "撱箇??唳暑??;

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
    if (_isSubmitting) return; // ???脤?銴�?鈭日?
    const btn = document.getElementById('create-btn');
    const originalBtnHTML = btn.innerHTML; // 靽嘥??笔??厰??批捆

    // 1. ?硋??厰??踹??滩?暺墧?
    _isSubmitting = true;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> 撱箇?銝?..';
    refreshIcons();

    // 2. ?園?銵典鱓鞈�?
    const type = document.getElementById('new-type').value;
    let timeVal = '';

    // ?寞?憿𧼮??閧??�??澆?
    if (type === 'travel') {
        const start = document.getElementById('new-date-start').value;
        const end = document.getElementById('new-date-end').value;
        if (!start || !end) {
            showToast("?�?瘣餃?隢见‵撖怠枂?潸??䂿??交?");
            btn.disabled = false; btn.innerHTML = originalBtnHTML; return;
        }
        timeVal = `${start}~${end}`;
    } else {
        timeVal = document.getElementById('new-time-single').value;
        if (!timeVal) {
            showToast("隢见‵撖急暑?閙???);
            btn.disabled = false; btn.innerHTML = originalBtnHTML; return;
        }
    }

    // 3. 皞硋??喲��?鞈�??拐辣
    const payload = {
        action: 'createEvent', // ?𡃏迄 GAS ?蹱糓?�遣蝡𧢲暑?𨰻�滨?隢𧢲?
        userId: appState.user.userId, // 閮㗛??航狐撱箇???
        type: type,
        name: document.getElementById('new-name').value,
        organizer: document.getElementById('new-organizer').value,
        location: document.getElementById('new-location').value,
        address: document.getElementById('new-address').value,
        deadline: document.getElementById('new-deadline').value,
        time: timeVal,
        itinerary: document.getElementById('new-itinerary').value // ?�?銵𣬚?
    };

    try {
        // 4. ?潮��秐敺𣬚垢
        const result = await apiSubmit(payload);

        // ??瑼Ｘ䰻敺𣬚垢?𧼮�?臬炏?�鉄?航炊
        if (result && result.error) {
            showToast('?𩤃? ' + result.error);
        } else if (result && result.queued) {
            showToast('?𩤃? ?桀??Ｙ?嚗�遣蝡贝?瘙�歇?怠?');
        } else {
            showToast("瘣餃?撱箇??𣂼?嚗?);

            // 5. ?齿鰵霈�?𡝗暑?訫?銵其蒂?𧼮�擐㚚?
            await fetchEvents();
            appState.historyStack = ['home'];
            handleBackNav();
        }
    } catch (err) {
        console.error(err);
        showToast("撱箇?憭望?嚗諹?瑼Ｘ䰻蝬脰楝?𣇉?敺�?閰?);
    } finally {
        // 6. 敺拙??厰??�??
        _isSubmitting = false; // ??閫??
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
        refreshIcons();
    }
}

// --- Status Toggle (靽桀儔?�??�迤?喲��??嗵策 GAS) ---
async function toggleEventStatus() {
    const btn = document.getElementById('btn-status-toggle');
    const originalHTML = btn.innerHTML; // 閮䀝??�𧋦?厰??瑟�擧見

    // 1. 憿舐內霈�?硋???
    btn.disabled = true;
    btn.innerHTML = '<i class="animate-spin" data-lucide="loader-2"></i> ?閧?銝?;
    refreshIcons();

    // 2. ?斗𪃾?桀??�?衤蒂瘙箏??啁???
    // ?桀??舫???-> 閬�㺿??close
    // ?桀??舫???-> 閬�㺿??open
    const currentStatus = isEventOpen(appState.currentEvent);
    const newStatus = currentStatus ? "close" : "open";

    try {
        // 3. ?潮��?瘙�策 GAS
        await apiSubmit({
            action: 'toggleStatus',
            eventId: appState.currentEvent.id,
            userId: appState.user.userId, // ?冽䲰撽𡑒??臬炏?箔蜓颲虫犖
            status: newStatus
        });

        // 4. ?湔鰵?砍𧑐鞈�??�𧞄??
        // ??靽格迤嚗朞?敺𣬚垢 handleToggleStatus ?𧼮�?�??见�潛絞銝�嚗??𧢲𦆮'/'?𣈯?'嚗?
        appState.currentEvent.isActive = newStatus === "open" ? '?𧢲𦆮' : '?𣈯?';
        renderEventStaticInfo();
        showToast(newStatus === "open" ? "瘣餃?撌脤??圈??? : "瘣餃?撌脤???);

    } catch (err) {
        console.error(err);
        showToast("?�?𧢲凒?啣仃?梹?隢𧢲炎?亦雯頝?);
    } finally {
        // 5. ?Ｗ儔?厰?
        btn.disabled = false;
        // renderEventStaticInfo ?�䌊?閙凒?唳??閙?摮梹??�隞仿�躰ㄐ銝漤?閬�???originalHTML
    }
}

// Utils
/** ?斗𪃾?桀??餃�雿輻鍂?�糓?血銁暺穃??桐葉 */
function isCurrentUserBlacklisted() {
    if (!appState.settings || !appState.settings.blacklist) return false;
    if (!appState.user) return false;
    const bl = appState.settings.blacklist;
    return !!(bl[appState.user.userId] || bl[appState.user.displayName]);
}

function isEventOpen(e) {
    if (!e) return false;
    // 1. 瑼Ｘ䰻瘣餃??�??
    const statusOpen = e.isActive === true || e.isActive === '?𧢲𦆮' || e.isActive === 'open';
    if (!statusOpen) return false;

    // 2. 瑼Ｘ䰻瘣餃??交? - ?嗅予隞漤＊蝷箏銁?勗??�嚗�?憭拇?蝘餃�甇瑕蟮嚗?
    if (!e.time) return true;

    let eventDate = null;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 甇賊妟?啁訜憭拚?憪?

    // ?閧??�?瘣餃??�𠯫?毺???
    if (e.time.includes('~')) {
        eventDate = new Date(e.time.split('~')[0]);
    } else {
        eventDate = new Date(e.time);
    }

    // 憒�?鈭衤辣?交??⊥?嚗�?閮勗𥼚??
    if (isNaN(eventDate.getTime())) return true;

    eventDate.setHours(0, 0, 0, 0);

    // 閮�??𤾸予
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ?𤾸予銋见??�暑?閙?蝘餃�甇瑕蟮?�嚗�訜憭拐??坔銁?勗??�嚗?
    return eventDate.getTime() >= tomorrow.getTime();
}

// ?啣?嚗𡁏炎?交糓?血虾隞乩耨?對??嗅予隞滚虾靽格㺿嚗?
function canModifyEvent(e) {
    if (!e || !e.time) return true;

    let eventDate = null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (e.time.includes('~')) {
        eventDate = new Date(e.time.split('~')[0]);
    } else {
        eventDate = new Date(e.time);
    }

    if (isNaN(eventDate.getTime())) return true;

    eventDate.setHours(0, 0, 0, 0);

    // 閮�??𤾸予
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ?嗅予?𦠜𧊋靘�暑?閖�?臭耨?對??𥪜予?漤�脫風?莎?
    return eventDate.getTime() >= today.getTime();
}
function normalizeType(t) {
    t = t.toLowerCase();
    if (t.includes('銝�??)) return 'general';
    if (t.includes('擗鞉?')) return 'banquet';
    if (t.includes('?�?')) return 'travel';
    return t;
}

// --- Role Helper ---
// ???啣?嚗𡁶絞銝�?硋??寞?頨怠?撅祆�?(?�𩑈/頛𥪜??�𩑈/?𣂷蜓/憯賣?)
function getParticipantRoles(pName, event) {
    if (!pName) return [];
    const cleanName = pName.trim();
    const roles = [];
    const special = (appState.settings && appState.settings.specialRoles) ? appState.settings.specialRoles : {};

    if (special.president && cleanName === special.president) {
        roles.push({ type: 'president', label: '?? ?�𩑈', textLabel: '[???�𩑈]', color: '#d97706' });
    }

    if (special.vicePresident && cleanName === special.vicePresident) {
        roles.push({ type: 'vicePresident', label: '?𨰫 頛𥪜??�𩑈', textLabel: '[?𨰫頛𥪜??�𩑈]', color: '#9333ea' });
    }

    if (event && event.organizer) {
        const organizers = event.organizer.split(/[??嚗𨜏s]+/).map(o => o.trim()).filter(Boolean);
        if (organizers.includes(cleanName)) {
            roles.push({ type: 'host', label: '?㭱 ?𣂷蜓', textLabel: '[?㭱?𣂷蜓]', color: '#ea580c' });
        }
    }

    if (event && event.time) {
        let month = null;
        let timeStr = event.time;
        if (timeStr.includes('~')) timeStr = timeStr.split('~')[0];
        const d = parseLocalDate(timeStr); // ???寧鍂 parseLocalDate ?踹? UTC ?萄榆
        if (!isNaN(d.getTime())) {
            month = d.getMonth() + 1;
        }

        if (month && special.birthdays && special.birthdays[month]) {
            if (special.birthdays[month].includes(cleanName)) {
                roles.push({ type: 'birthday', label: `?? ${month}?�ˊ?鬮, textLabel: `[??${month}?�ˊ?篏`, color: '#db2777' });
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
        // ??靽格迤嚗朞𥅾?∪翰?𤥁??辷??�?閰行???
        if (!appState.cachedDetails || appState.cachedDetails.length === 0) {
            showToast("甇?銁霈�?硋???..");
            const details = await fetchDetails();
            appState.cachedDetails = details;

            if (!appState.cachedDetails || appState.cachedDetails.length === 0) {
                // ?𣇉�?∪??殷?雿�暑?閗?閮𠹺??臬?鈭恬??�??餅?嚗�??鞟內
            } else {
                showToast("?滚鱓霈�?硋???);
            }
        }

        // ?滨蔭 checkbox ?�??
        document.getElementById('share-opt-sponsor').checked = true;
        document.getElementById('share-opt-travel').checked = true;

        // ?斗𪃾?臬炏憿舐內?諹???隤齿??漤�??
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

        // ?斗𪃾?臬炏憿舐內?䔶?頠??踹??漤�??
        const isTravel = e.type === 'travel';
        const travelEl = document.getElementById('opt-container-travel');
        if (travelEl) {
            if (isTravel) {
                travelEl.classList.remove('hidden');
            } else {
                travelEl.classList.add('hidden');
            }
        }

        // 蝣箔??梯??⊿�?�?蝷?
        const noOptsEl = document.getElementById('share-no-opts');
        if (noOptsEl) noOptsEl.classList.add('hidden');

        // ?滨蔭?賊??鞱身?�??
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

        // 皜脫??�?㕑?颲虫葉瘣餃?皜�鱓
        renderShareAllEventsList();
    }
    refreshIcons();
}

function renderShareAllEventsList() {
    const container = document.getElementById('share-all-events-list');
    if (!container) return;

    const activeEvents = appState.events.filter(e => isEventOpen(e));
    if (activeEvents.length === 0) {
        container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4">?桀??∟?颲虫葉瘣餃?</div>';
        return;
    }

    container.innerHTML = '';
    activeEvents.forEach(e => {
        const item = document.createElement('label');
        item.className = "flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition border border-gray-100";
        item.innerHTML = `
            <div class="relative flex items-center">
                <input type="checkbox" name="share-all-active-checkbox" value="${e.id}" checked
                    class="peer w-4.5 h-4.5 rounded text-green-500 focus:ring-green-500 border-gray-300">
                <i data-lucide="check"
                    class="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100 left-0.5 top-0.5"></i>
            </div>
            <div class="flex-1 min-w-0">
                <span class="text-xs font-bold text-gray-800 block truncate">${escapeHtml(e.name)}</span>
                <span class="text-[10px] text-gray-400 block">${formatDateShort(e.time)}</span>
            </div>
        `;
        container.appendChild(item);
    });
}

function confirmShareCopy() {
    // ?硋?雿輻鍂?�㗲?貊???
    const includeSponsor = document.getElementById('share-opt-sponsor').checked && !document.getElementById('opt-container-sponsor').classList.contains('hidden');
    const includeTravel = document.getElementById('share-opt-travel').checked && !document.getElementById('opt-container-travel').classList.contains('hidden');
    const includeMap = document.getElementById('share-opt-map').checked;
    const includeNames = document.getElementById('share-opt-names').checked;
    const includeLink = document.getElementById('share-opt-link').checked;

    // ?𣈯?閬𣇉?
    document.getElementById('share-modal').classList.add('hidden');

    // ?瑁?銴�ˊ嚗��?亙???
    performCopy({ includeSponsor, includeTravel, includeMap, includeNames, includeLink });
}

async function confirmAllShareCopy() {
    const checkedBoxes = document.querySelectorAll('input[name="share-all-active-checkbox"]:checked');
    if (checkedBoxes.length === 0) {
        showToast("?𩤃? 隢贝秐撠煾�?�??𧢲暑??);
        return;
    }

    showToast("甇?銁?枏?瘣餃?蝯梯?鞈�?...");
    document.getElementById('share-modal').classList.add('hidden');

    const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
    const selectedEvents = appState.events.filter(e => selectedIds.includes(e.id));
    
    const eventsData = await Promise.all(selectedEvents.map(async e => {
        const [details, stats] = await Promise.all([
            fetchDetailsForEvent(e.id),
            fetchStatsForEvent(e.id)
        ]);
        return { event: e, details, stats };
    }));

    const text = buildRichShareAllText(eventsData);
    copyTextToClipboard(text);
}

// ?𦠜???(?滚鱓閬𣇉?銝𧢲䲮) ?澆㙈甇文遆撘𧶏?蝯曹??澆㙈 openShareModal 隞交?靘偦�??
function copyDetailsToClipboard() {
    openShareModal();
}

// 頛𥪜𨭌?脣??䂿訜?齿暑?蓥??滚鱓?羓絞閮�??嗵? API
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

// ?𡁶鍂瘣餃??𣇉? Canvas ?�??讛摩 (摰��靽萘??�𧋦?批捆璅??銝齿凒??
// ?寞?瘣餃??滨迂?芸??斗𪃾 Emoji
function getEventEmoji(eventName) {
    if (!eventName) return '??';
    if (eventName.includes('?𡁻?') || eventName.includes('憌?) || eventName.includes('??) || eventName.includes('摰?)) return '?椉儭?;
    if (eventName.includes('??) || eventName.includes('?仿?') || eventName.includes('撠曄?')) return '??';
    if (eventName.includes('?�?') || eventName.includes('?粹?') || eventName.includes('摰嗅滬??) || eventName.includes('??)) return '?𤦉';
    if (eventName.includes('擃条�憭?) || eventName.includes('??)) return '??;
    if (eventName.includes('?望?') || eventName.includes('KTV')) return '?絝';
    if (eventName.includes('?�𠯫') || eventName.includes('?嗥?')) return '??';
    if (eventName.includes('?�降') || eventName.includes('?𧢲?')) return '?𠗠';
    return '??';
}

async function generateEventCanvas(e, data, stats) {
    const includeSponsor = false;
    const includeTravel = true;
    const includeMap = false;
    const includeNames = true;
    const includeLink = false;

    const card = document.createElement('div');
    card.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;z-index:-1;';

    const iconEmoji = e.icon || getEventEmoji(e.name);
    
    let html = `
    <style>
      .app-container {
          font-size: 26px;
          padding: 1.5em 1.25em; display: flex; flex-direction: column; align-items: center; box-sizing: border-box;
          background: url('images/wood-bg.jpg') repeat;
          background-size: 350px;
          font-family: "PingFang TC", "Helvetica Neue", sans-serif; color: #EAD7BA;
      }
      .main-frame {
          width: 100%;
          background: linear-gradient(rgba(10, 15, 25, 0.75), rgba(10, 15, 25, 0.75)), url('images/leather-bg.jpg') repeat;
          background-size: auto, 350px;
          border-radius: 12px;
          border: 1px solid rgba(212, 175, 55, 0.3);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), inset 0 2px 10px rgba(255, 255, 255, 0.05);
          padding: 1em;
          position: relative;
          z-index: 1;
        }
      .rivet {
          position: absolute; width: 16px; height: 16px; background: radial-gradient(circle, #e2cfb3 0%, #7c5c3b 100%);
          border-radius: 50%; box-shadow: inset -1px -1px 3px rgba(0,0,0,0.6), 1px 1px 3px rgba(0,0,0,0.8);
          border: 1px solid #332414; z-index: 10; margin: 0 !important;
        }
      .rivet::after { content: ''; position: absolute; top: 50%; left: 15%; right: 15%; height: 1.5px; background: rgba(0,0,0,0.5); transform: translateY(-50%) rotate(45deg); }
      .rivet.tl { top: 8px; left: 8px; }
      .rivet.tr { top: 8px; right: 8px; }
      .rivet.bl { bottom: 8px; left: 8px; }
      .rivet.br { bottom: 8px; right: 8px; }
      .inner-box {
          background-color: rgba(26, 36, 54, 0.6);
          border: 1px solid rgba(212, 175, 55, 0.2);
          border-radius: 8px;
          box-shadow: inset 0 2px 10px rgba(0,0,0,0.5), 0 4px 6px rgba(0,0,0,0.3);
          margin-bottom: 1em;
          position: relative;
          z-index: 1;
        }
      img.custom-icon { width: 1.5em; height: 1.5em; object-fit: contain; vertical-align: middle; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.8)); }
      img.header-icon-img { width: 3em; height: 3em; object-fit: contain; filter: drop-shadow(0 4px 5px rgba(0,0,0,0.8)); margin-right: 0.5em; }
      .header-card {
        padding: 1.25em; display: flex; align-items: center; justify-content: center; gap: 0.75em;
        background: linear-gradient(180deg, rgba(42,56,82,1) 0%, rgba(26,36,54,1) 100%);
        border-radius: 8px;
      }
      .header-icon { font-size: 2.5em; line-height: 1; flex-shrink: 0; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.6)); padding-bottom: 4px; margin-right: 0.5em; }
      .header-title {
        font-size: 1.25em; font-weight: bold; letter-spacing: 0.05em; margin: 0;
        color: #F3E5AB; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
        white-space: normal; word-break: keep-all; flex: 1; line-height: 1.4;
      }
      .info-card {
        padding: 1.25em;
        background: linear-gradient(180deg, rgba(34,46,68,1) 0%, rgba(20,28,42,1) 100%);
        border-radius: 8px;
      }
      .info-list { list-style: none; padding: 0; margin: 0; font-size: 0.9em; }
      .info-list li { display: flex; align-items: flex-start; gap: 0.75em; margin-bottom: 0.85em; }
      .info-list li:last-child { margin-bottom: 0; }
      .info-list .icon { font-size: 1.25em; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.8)); }
      .info-list .text { color: #EAD7BA; line-height: 1.5; padding-top: 0.125em; font-weight: 500; letter-spacing: 0.05em; }
      .note-box { margin-top: 1em; padding-top: 1em; border-top: 1px solid rgba(212,175,122,0.3); }
      .note-box p { margin: 0; font-size: 0.85em; color: #B0A08A; line-height: 1.5; }
      .note-title { color: #D4AF7A; font-weight: bold; }
      .list-card {
        padding: 1.25em;
        border-radius: 8px;
        background-color: rgba(26,36,54,1);
        background-image: 
          linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.03) 75%, rgba(255,255,255,0.03)),
          linear-gradient(45deg, rgba(255,255,255,0.03) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.03) 75%, rgba(255,255,255,0.03));
        background-size: 40px 40px;
        background-position: 0 0, 20px 20px;
      }
      .list-header { display: flex; align-items: center; gap: 0.5em; margin-bottom: 1em; padding-bottom: 0.5em; border-bottom: 1px solid rgba(212,175,122,0.5); }
      .list-header .icon { font-size: 1.35em; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.8)); }
      .list-header h2 { font-size: 1.15em; font-weight: bold; color: #D4AF7A; letter-spacing: 0.1em; margin: 0; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
      .list-item { padding-bottom: 0.65em; margin-bottom: 0.65em; border-bottom: 1px dashed rgba(212,175,122,0.2); }
      .list-item:last-child { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
      .item-title { display: flex; align-items: center; font-weight: bold; margin-bottom: 0.15em; flex-wrap: wrap; font-size: 1.1em; }
      .item-title .name { margin-right: 0.5em; color: #F3E5AB; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
      .item-title .count { color: #EAD7BA; font-size: 0.85em; margin-left: 0.5em; font-weight: bold; font-family: monospace; }
      .item-detail { font-size: 0.85em; color: #A89580; margin-left: 2em; padding-top: 0.2em; line-height: 1.4; }
      .tag { font-size: 0.95em; font-weight: bold; margin-left: 0.5em; display: inline-flex; align-items: center; letter-spacing: 0.05em; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
      .tag-orange { color: #F97316; } .tag-pink { color: #EC4899; } .tag-purple { color: #D8B4FE; } .tag-gold { color: #EAB308; }
      .sponsor-card { padding: 1.25em; background: linear-gradient(180deg, rgba(34,46,68,1) 0%, rgba(20,28,42,1) 100%); border-radius: 8px; margin-bottom: 0; }
      .footer-wrapper { width: 100%; text-align: center; margin-top: 1em; position: relative; z-index: 10; }
      .total-count { color: #D4AF7A; font-weight: bold; font-size: 1.2em; letter-spacing: 0.15em; margin-bottom: 0.5em; text-shadow: 0 2px 4px rgba(0,0,0,0.9); }
      .copyright { color: #A89580; font-size: 0.8em; letter-spacing: 0.1em; }
    </style>
    
    <div class="app-container">
      <div class="main-frame">
        <div class="rivet tl"></div><div class="rivet tr"></div><div class="rivet bl"></div><div class="rivet br"></div>
        <div class="inner-box">
          <div class="header-card">
            <div class="header-icon">${iconEmoji}</div>
            <h1 class="header-title">${escapeHtml(e.name)}</h1>
          </div>
        </div>
        <div class="inner-box">
          <div class="info-card">
            <ul class="info-list">`;
            
    if (e.organizer) html += `<li><span class="icon"><img src="images/icons/user.png" class="inline-block w-[1.2em] h-[1.2em] align-[-0.15em] drop-shadow-md" alt="?𪈠"></span><div class="text">銝餉齒鈭綽?${escapeHtml(e.organizer)}</div></li>`;
    const timeDisplay = formatTimeForShare(e.time);
    if (timeDisplay) html += `<li><span class="icon">??</span><div class="text">?�?嚗?{escapeHtml(timeDisplay)}</div></li>`;
    if (e.location)  html += `<li><span class="icon"><img src="images/icons/pin.png" class="inline-block w-[1.2em] h-[1.2em] align-[-0.15em] drop-shadow-md" alt="??"></span><div class="text">?圈?嚗?{escapeHtml(e.location)}</div></li>`;
    if (e.address)   html += `<li><span class="icon"><img src="images/icons/car.png" class="inline-block w-[1.2em] h-[1.2em] align-[-0.15em] drop-shadow-md" alt="??"></span><div class="text">?啣?嚗?{escapeHtml(e.address)}</div></li>`;
    
    html += `</ul>`;
    if (e.note) {
        html += `<div class="note-box"><div class="note-title">?働 ?躰酉嚗?/div><p>${escapeHtml(e.note).replace(/\n/g, '<br>')}</p></div>`;
    }
    html += `</div></div>`;

    if (includeNames && data.length > 0) {
        html += `<div class="inner-box"><div class="list-card"><div class="list-header"><span class="icon">?𡤻</span><h2>?勗??滚鱓</h2></div>`;
        let count = 0;
        data.forEach(p => {
            count++;
            const family = getIntField(p, 'family');
            const guestData = parseGuestData(p);
            const finalGuestCount = calculateFinalGuestCount(p, guestData);
            const total = family + finalGuestCount;
            const num = count.toString().padStart(2, '0');
            const status = p.status || p.note || '';
            let prefix = status ? status : '';

            const roles = getParticipantRoles(p.name, e);
            let tagHtml = '';
            if (roles.length > 0) {
                tagHtml = roles.map(r => `<span class="tag" style="color:${r.color};">${r.label}</span>`).join('');
            }

            let nameColor = 'inherit';
            let maryMedal = '';
            if (appState.jackpotRankings && appState.jackpotRankings.length > 0) {
                const rankIndex = appState.jackpotRankings.findIndex(r => r.name === p.name);
                if (rankIndex === 0) { nameColor = '#f59e0b'; maryMedal = '??'; }
                else if (rankIndex === 1) { nameColor = '#94a3b8'; maryMedal = '??'; }
                else if (rankIndex === 2) { nameColor = '#b45309'; maryMedal = '??'; }
            }

            html += `<div class="list-item"><div class="item-title">`;
            html += `<span style="color:#D4AF7A;margin-right:0.5em;">${num}.</span> <span class="name" style="color:${nameColor !== 'inherit' ? nameColor : '#F3E5AB'};"><span style="font-size:1.15em;margin-right:2px">${maryMedal}</span>${escapeHtml(prefix)}${escapeHtml(p.name)}</span>${tagHtml}`;
            if (total > 1) html += `<span class="count">?${total}</span>`;
            html += `</div>`;

            if (guestData.length > 0) {
                const guestParts = guestData.map(g => g.count > 1 ? `${g.name}?${g.count}` : g.name);
                html += `<div class="item-detail">靘�?嚗?{guestParts.join('??)}</div>`;
            } else {
                const guestNameStr = getField(p, 'guestName');
                if (guestNameStr && guestNameStr !== '??) {
                    html += `<div class="item-detail">靘�?嚗?{guestNameStr}</div>`;
                }
            }

            if (includeTravel) {
                let travelLines = [];
                if (p.pickup && p.pickup !== '??) travelLines.push(`頠? ${p.pickup}`);
                if (p.room && p.room !== '??) travelLines.push(`?? ${p.room}`);
                if (guestData.length > 0) {
                    guestData.forEach(g => {
                        let extras = [];
                        if (g.pickup && g.pickup !== '??) extras.push(g.pickup);
                        if (g.room && g.room !== '??) extras.push(g.room);
                        if (extras.length > 0) travelLines.push(`[鞈𨩇${g.name}: ${extras.join('/')}`);
                    });
                }
                if (travelLines.length > 0) {
                    html += `<div class="item-detail" style="color:#A88B60;">${travelLines.join('??)}</div>`;
                }
            }
            html += `</div>`;
        });
        html += `</div></div>`;
    }

    if (data.length > 0) {
        let sponsorHtml = '';
        data.forEach(p => {
            const family = getIntField(p, 'family');
            const guestData = parseGuestData(p);
            const finalGuestCount = calculateFinalGuestCount(p, guestData);
            const total = family + finalGuestCount;
            let moneyParts = [];
            const tc = getIntField(p, 'tableCount');
            if (tc > 0) moneyParts.push(`隤齿? ${tc}獢䈣);
            const sponsorRaw = getField(p, 'sponsor');
            const sponsorList = parseSponsorData(sponsorRaw);
            sponsorList.forEach(s => moneyParts.push(s));
            
            if (moneyParts.length > 0) {
                const label = (total === 0) ? `<span style="font-size:0.8em;color:#EAB308;margin-left:0.5em;opacity:0.8;">(蝝磰???</span>` : '';
                sponsorHtml += `<div class="list-item" style="display:flex;align-items:center;gap:0.75em;padding:0.75em 0.5em;">
                                  <span class="icon" style="font-size:1.25em;">??</span> 
                                  <span class="name" style="color:#F3E5AB;font-weight:bold;text-shadow: 0 1px 2px rgba(0,0,0,0.8);">${p.name}</span>${label} 
                                  <span style="color:#A88B60;">??/span> 
                                  <span style="color:#EAD7BA;font-size:0.95em;">${moneyParts.join('??)}</span>
                                </div>`;
            }
        });
        if (sponsorHtml) {
            html += `<div class="inner-box" style="margin-bottom:0;">
                       <div class="sponsor-card">
                         <div class="list-header"><span class="icon" style="margin-right:0.5em;">?兛</span><h2>韐𠰴𨭌 / 隤齿?鞈�?</h2></div>
                         ${sponsorHtml}
                       </div>
                     </div>`;
        }
    }

    html += `
      </div>
      <!-- 摨閖�蝯梯??� -->
      <div class="footer-wrapper">
        <div class="total-count">??${stats.totalPeople || 0} 鈭箏𥼚??/div>
        <div class="copyright">憭扯��??�???瘣餃??勗?蝟餌絞</div>
      </div>
    </div>`;

    card.innerHTML = html;
    document.body.appendChild(card);

    const imgs = card.querySelectorAll('img');
    const loadPromises = Array.from(imgs).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
        });
    });
    await Promise.all(loadPromises);

    const canvas = await html2canvas(card, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#3b2518',
        width: card.scrollWidth,
        height: card.scrollHeight
    });

    document.body.removeChild(card);
    return canvas;
}


// --- ?桐?瘣餃??𣇉??�澈?蠘� ---
async function shareAsImage() {
    const e = appState.currentEvent;
    if (!e) return;
    const data = appState.cachedDetails || [];
    const stats = appState.currentStats || {};

    const btn = document.getElementById('btn-share-single');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ?Ｙ?銝?..';
    refreshIcons();

    try {
        const canvas = await generateEventCanvas(e, data, stats);

        // --- 頧厩� blob 銝血?鈭急?銝贝? ---
        canvas.toBlob(async (blob) => {
            if (!blob) { showToast('?𣇉??Ｙ?憭望?'); return; }
            const file = new File([blob], `${e.name}_?滚鱓.png`, { type: 'image/png' });

            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    let shareText = `?? ${e.name}\n`;
                    if (e.organizer) shareText += `?𪈠 銝餉齒鈭綽?${e.organizer}\n`;
                    // ??雿輻鍂?梁鍂撌亙�?賢??澆??𡝗???
                    const shareTD = formatTimeForShare(e.time);
                    if (shareTD) shareText += `?? ?�?嚗?{shareTD}\n`;
                    if (e.location) shareText += `?? ?圈?嚗?{e.location}\n`;
                    if (e.address) shareText += `?? ?啣?嚗?{e.address}\n`;
                    shareText += `---------------------\n`;
                    shareText += `??${stats.totalPeople || 0} 鈭箏𥼚?㙡n`;

                    // ??雿輻鍂?梁鍂撌亙�?賢??斗𪃾瘣餃???
                    if (isEventDay(e) && (e.address || e.location)) {
                        const mapQuery = e.address || e.location;
                        shareText += `?㚰儭?Google ?啣???嚗䨵nhttps://www.google.com/maps/search/?api=1&query=${mapQuery}`;
                    } else {
                        shareText += `?? ?勗??????嚗䨵nhttps://liff.line.me/${LIFF_ID}`;
                    }

                    await navigator.share({
                        files: [file],
                        title: e.name,
                        text: shareText
                    });
                    showToast('?𣇉??�澈?𣂼?嚗?);
                } catch (err) {
                    if (err.name !== 'AbortError') {
                        console.error('?𣇉??�澈憭望?:', err);
                        fallbackDownloadImage(canvas, e.name);
                    }
                }
            } else {
                fallbackDownloadImage(canvas, e.name);
            }

            document.getElementById('share-modal').classList.add('hidden');
        }, 'image/png');

    } catch (err) {
        console.error('?𣇉??Ｙ?憭望?', err);
        showToast('?Ｙ??𣇉?憭望?嚗? + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
        refreshIcons();
    }
}

// --- 憭𡁏暑?訫??�??�?鈭怠???---
async function shareAllAsImage() {
    const checkedBoxes = document.querySelectorAll('input[name="share-all-active-checkbox"]:checked');
    if (checkedBoxes.length === 0) {
        showToast("?𩤃? 隢贝秐撠煾�?�??𧢲暑??);
        return;
    }

    const btn = document.getElementById('btn-share-all');
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-white"></i> ?Ｙ?銝?..';
    refreshIcons();

    try {
        const selectedIds = Array.from(checkedBoxes).map(cb => cb.value);
        const selectedEvents = appState.events.filter(e => selectedIds.includes(e.id));

        showToast("甇?銁?峕艶?㰘?憭𡁏暑?訫??殷?隢讠???..");

        // 靘嘥??硋像銵峕??𡝗??𧢲暑?閧??豢?銝衣鼓鋆?
        const promises = selectedEvents.map(async (e) => {
            const [details, stats] = await Promise.all([
                fetchDetailsForEvent(e.id),
                fetchStatsForEvent(e.id)
            ]);
            const canvas = await generateEventCanvas(e, details, stats);
            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    resolve({ canvas, blob, eventName: e.name, event: e, details: details, stats: stats });
                }, 'image/png');
            });
        });

        const results = await Promise.all(promises);
        const files = [];

        results.forEach(res => {
            if (res.blob) {
                const file = new File([res.blob], `${res.eventName}_?滚鱓.png`, { type: 'image/png' });
                files.push(file);
            }
        });

        if (files.length === 0) {
            showToast('?𣇉??Ｙ?憭望?');
            return;
        }

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files })) {
            try {
                const eventsData = results.map(r => ({ event: r.event, details: r.details, stats: r.stats }));
                const shareText = buildRichShareAllText(eventsData);

                await navigator.share({
                    files: files,
                    title: '餈烐?瘣餃??滚鱓',
                    text: shareText
                });
                showToast('?𣇉??枏??�澈?𣂼?嚗?);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('憭𡁜??�澈憭望?嚗諹??粹�𣂷?銝贝?:', err);
                    results.forEach(res => fallbackDownloadImage(res.canvas, res.eventName));
                }
            }
        } else {
            // PC 蝡舀?銝齿𣈲?游?瑼娍??�澈?��讛汗?函凒?乩?摨譍?頛?
            results.forEach(res => fallbackDownloadImage(res.canvas, res.eventName));
        }

        document.getElementById('share-modal').classList.add('hidden');
    } catch (err) {
        console.error('憭𡁜??�?/?�澈?潛??航炊:', err);
        showToast('憭𡁜??Ｙ?憭望?嚗? + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
        refreshIcons();
    }
}
function fallbackDownloadImage(canvas, evtName) {
    const link = document.createElement('a');
    link.download = `${evtName || '瘣餃?'}_?滚鱓.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('撌脖?頛匧??桀??�?');
}

// --- Telegram ?潮��???---
async function sendToTelegram() {
    if (!appState.currentEvent) return;

    showToast("甇?銁?潮��秐 Telegram...");

    try {
        const result = await apiSubmit({
            action: 'sendListToTelegram',
            eventId: appState.currentEvent.id
        });

        if (result.success) {
            showToast("???滚鱓撌脩䔄?�秐 Telegram");
        } else {
            showToast("???潮��仃?? " + (result.error || "?芰䰻?航炊"));
        }
    } catch (err) {
        console.error(err);
        showToast("???潮��仃?梹?隢𧢲炎?亦雯頝?);
    }
}

// ?詨?銴�ˊ?讛摩嚗𡁏𣈲?游??貉??澆???
function performCopy(options = { includeSponsor: true, includeTravel: true, includeMap: true, includeNames: true, includeLink: true }) {
    // ??靽格㺿?箏?甇亥??硋翰?𤥁???
    const data = appState.cachedDetails || [];

    if (!data || data.length === 0) {
        // Try to fetch if cache is empty (though unlikely if modal is open)
        // But fetching async here will break mobile copy. 
        // So we just warn.
        return showToast("鞈�?霈�?碶葉?𣇉�鞈�?嚗諹?蝔滚??滩岫");
    }

    // Sync execution continues...
    { // Block to keep variable scope clean equivalent to previous .then callback

        const e = appState.currentEvent;

        let text = `?? ${e.name}\n`;
        // ?斗𪃾銝血??交暑?閗?閮?
        if (e.organizer) text += `?𪈠 銝餉齒鈭綽?${e.organizer}\n`;

        // ??靽格迤嚗帋蝙?典�?典極?瑕遆撘𤩺聢撘誩??�?
        const timeDisplay = formatTimeForShare(e.time);
        if (timeDisplay) text += `?? ?�?嚗?{timeDisplay}\n`;

        if (e.location) text += `?? ?圈?嚗?{e.location}\n`;
        if (e.address) text += `?? ?啣?嚗?{e.address}\n`;
        text += `---------------------\n`;



        if (options.includeNames !== false) {
            let count = 0;
            data.forEach((p, i) => {
                count++;
                const family = getIntField(p, 'family');
                const guestData = parseGuestData(p);
                // ?烾??閧?嚗帋蝙?函絞銝�閮�??賣彍
                const finalGuestCount = calculateFinalGuestCount(p, guestData);

                // ??靽格迤嚗鎄amilyCount ?曉銁?脣??箝�𣬚溸撅祆彍?㵪?getIntField 撌脰???+1 (?砌犖)
                const total = family + finalGuestCount;

                const num = count.toString().padStart(2, '0');
                const status = p.status || p.note || '';
                const prefix = status ? status : '';

                // ???啣?嚗𡁶??�?銴�ˊ?�??䭾?摮埈?蝐?
                const roles = getParticipantRoles(p.name, e);
                let textTags = '';
                if (roles.length > 0) {
                    textTags = ' ' + roles.map(r => r.textLabel).join('');
                }

                // ??撠讐麐?匧?銝匧??喟?嚗�?摮堒??桀?鈭怎鍂嚗?
                let maryMedalCopy = '';
                if (appState.jackpotRankings && appState.jackpotRankings.length > 0) {
                    const rankIdx = appState.jackpotRankings.findIndex(r => r.name === p.name);
                    if (rankIdx === 0) maryMedalCopy = '??';
                    else if (rankIdx === 1) maryMedalCopy = '??';
                    else if (rankIdx === 2) maryMedalCopy = '??';
                }

                text += `${num}. ${maryMedalCopy}${prefix}${p.name}${textTags}`;
                if (total > 1) text += ` *${total}`;
                text += `\n`;

                // ??靽格㺿嚗帋?鞈枏??格㟲?��?株?嚗屸＊蝷箏銁銝𧢲䲮 ??
                if (guestData.length > 0) {
                    const guestParts = guestData.map(g => {
                        return g.count > 1 ? `${g.name}*${g.count}` : g.name;
                    });
                    text += `      靘�?嚗?{guestParts.join('??)}\n`;
                } else {
                    const guestNameStr = getField(p, 'guestName');
                    if (guestNameStr && guestNameStr !== '??) {
                        text += `      靘�?嚗?{guestNameStr}\n`;
                    }
                }

                // 韐𠰴𨭌/隤齿?銝滚銁?滚鱓?折＊蝷綽??寧眏銝𧢲䲮?函??�憛羓絞銝�?堒枂

                if (options.includeTravel) {
                    let travelLines = [];
                    if (p.pickup && p.pickup !== '??) travelLines.push(`[銝蒸頠? ${p.pickup}`);
                    if (p.room && p.room !== '??) travelLines.push(`[銝蒸?? ${p.room}`);

                    if (guestData.length > 0) {
                        guestData.forEach(g => {
                            let extras = [];
                            if (g.pickup && g.pickup !== '??) extras.push(g.pickup);
                            if (g.room && g.room !== '??) extras.push(g.room);
                            if (extras.length > 0) {
                                travelLines.push(`[鞈𨩇${g.name}: ${extras.join('/')}`);
                            }
                        });
                    }
                    if (travelLines.length > 0) {
                        travelLines.forEach(l => text += `      ${l}\n`);
                    }
                }
            });
        }

        // ??韐𠰴𨭌/隤齿??函??�憛𠺪?銝滩??臬炏?暸�?滚鱓嚗�蘨閬�?鞈�?撠梢＊蝷綽?
        if (options.includeSponsor) {
            let hasSponsorData = false;
            let sponsorText = '';
            data.forEach(p => {
                let moneyLines = [];
                const tc = getIntField(p, 'tableCount');
                if (tc > 0) moneyLines.push(`隤齿?: ${tc}獢䈣);

                const sponsorRaw = getField(p, 'sponsor');
                const sponsorList = parseSponsorData(sponsorRaw);
                sponsorList.forEach(s => moneyLines.push(`韐𠰴𨭌: ${s}`));

                if (moneyLines.length > 0) {
                    hasSponsorData = true;
                    sponsorText += `${p.name}嚗?{moneyLines.join('??)}\n`;
                }
            });
            if (hasSponsorData) {
                text += `?鞱???隤齿??髢n${sponsorText}`;
            }
        }

        text += `---------------------\n`;
        text += `??${appState.currentStats.totalPeople || 0} 鈭箏𥼚?㙡n`;

        if (options.includeMap && e.address) {
            text += `?㚰儭?Google ?啣?嚗䨵nhttps://www.google.com/maps/search/?api=1&query=${e.address}\n`;
        }

        // ??瘣餃??亦訜憭抵䌊?閙𤜯?𨥈??勗???? ??Google ?啣????
        if (options.includeLink !== false) {
            // ??雿輻鍂?梁鍂撌亙�?賢??斗𪃾瘣餃???
            if (isEventDay(e) && (e.address || e.location)) {
                const mapQuery = e.address || e.location;
                text += `?㚰儭?Google ?啣???嚗䨵nhttps://www.google.com/maps/search/?api=1&query=${mapQuery}\n`;
            } else {
                text += `?? ?勗??????嚗䨵nhttps://liff.line.me/${LIFF_ID}\n`;
            }
        }

        copyTextToClipboard(text);
    }
}

// --- ?�????躰ㄐ撠望糓靽格迤?�??蛛??�𧋦?箏仃?�遆撘??�???---
function formatDateShort(isoStr) {
    if (!isoStr) return '';

    // 憒�??舀??𦠜暑?閧??�?蝭�? (靘见?: 2023-10-10~2023-10-12)
    if (isoStr.includes('~')) {
        const start = isoStr.split('~')[0];
        const d = parseLocalDate(start); // ???寧鍂 parseLocalDate
        if (isNaN(d.getTime())) return start;
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}...`;
    }

    const d = parseLocalDate(isoStr); // ???寧鍂 parseLocalDate
    if (isNaN(d.getTime())) return isoStr;

    const week = ['??, '銝�', '鈭?, '銝?, '??, '鈭?, '??][d.getDay()];
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${week})`;
}

function formatDate(isoStr) {
    if (!isoStr) return '';
    const d = parseLocalDate(isoStr); // ???詨?靽桀儔嚗𡁏㺿??parseLocalDate ?踹? UTC ?�榆嚗?8:29銝滚?霈?:00
    if (isNaN(d.getTime())) return isoStr;
    const week = ['??, '銝�', '鈭?, '銝?, '??, '鈭?, '??][d.getDay()];
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${week}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function formatDateOnly(isoStr) {
    if (!isoStr) return '';
    const d = parseLocalDate(isoStr); // ???寧鍂 parseLocalDate
    if (isNaN(d.getTime())) return isoStr;
    const week = ['??, '銝�', '鈭?, '銝?, '??, '鈭?, '??][d.getDay()];
    return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${week})`;
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
        showToast('隢见‵撖怠???);
        return false;
    }

    // ???�?瘣餃?嚗帋?頠𠰴𧑐暺噼??踹??�瘙��敹��
    if (appState.currentEvent && appState.currentEvent.type === 'travel') {
        const pickupEl = document.getElementById('pickup-loc');
        const roomEl = document.getElementById('room-type');

        if (pickupEl && !pickupEl.value) {
            showToast('?𩤃? 隢钅�?�?頠𠰴𧑐暺?);
            scrollToAndHighlight(pickupEl);
            return false;
        }
        if (roomEl && !roomEl.value) {
            showToast('?𩤃? 隢钅�?��?钅?瘙?);
            scrollToAndHighlight(roomEl);
            return false;
        }
    }

    return true;
}

// ???脣??單?摰𡁏?雿滢蒂?牐?蝝�𠧧擃䀝漁?�??�?
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
    if (!name) return showToast("隢贝撓?乩?鞈枏???);

    const pickup = document.getElementById('add-guest-pickup').value;
    const room = document.getElementById('add-guest-room').value;

    // ?Ｙ?蝪⊥??急? ID
    const id = 'g_' + Date.now() + Math.random().toString(36).substring(2, 7);

    appState.guestList.push({ id, name, count, pickup, room });
    document.getElementById('add-guest-name').value = '';
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
    // 撱箇?閬𣇉?摰孵膥
    const div = document.createElement('div');
    // ?湔𦻖雿輻鍂 insertAdjacentHTML ?鍦� body 隞仿�?滚?撅文?鋆嘥?憿?
    const html = `
<div id="manual-copy-modal" class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm hidden text-left" style="backdrop-filter: blur(4px);">
<div class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transform transition-all flex flex-col max-h-[80vh]">
<div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
    <h3 class="font-bold text-gray-800 flex items-center gap-2">
        <i data-lucide="clipboard-copy" class="w-5 h-5 text-gray-600"></i>
        銴�ˊ?滚鱓
    </h3>
    <button onclick="document.getElementById('manual-copy-modal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition">
        <i data-lucide="x" class="w-5 h-5"></i>
    </button>
</div>
<div class="p-5 space-y-4 overflow-y-auto flex-1">
    <div class="bg-blue-50 text-blue-700 p-3 rounded-lg text-sm flex items-start gap-2">
        <i data-lucide="info" class="w-4 h-4 mt-0.5 shrink-0"></i>
        <div class="leading-relaxed">?亥䌊?閗?鋆賢仃?梹?隢钅??詻�屸??𡃏?鋆賬�齿??𤏪??㚚𩑈?劐??寞?摮埈??券�銴�ˊ??/div>
    </div>
    <!-- iOS 靽格迤嚗𡁶宏??readonly嚗䔶蝙??inputmode="none" ??contenteditable -->
    <textarea id="manual-copy-area" 
        class="w-full h-48 border border-gray-200 rounded-xl p-3 text-sm font-mono bg-gray-50 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none text-gray-700" 
        inputmode="none"
        onclick="this.select(); this.setSelectionRange(0, 99999);"></textarea>
</div>
<div class="p-4 border-t border-gray-100 bg-gray-50 flex gap-3 shrink-0">
     <button onclick="document.getElementById('manual-copy-modal').classList.add('hidden')" class="flex-1 py-3 rounded-xl font-bold text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition">?𣈯?</button>
     <button onclick="retryCopy()" class="flex-1 py-3 rounded-xl font-bold text-white bg-[#06c755] hover:bg-green-600 shadow-md active:scale-95 transition flex justify-center items-center gap-2">
        <i data-lucide="copy" class="w-4 h-4"></i> 暺墧?銴�ˊ
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
    // ?芸??𡑒岫?𧼮?甇?API嚗�𣶹?㕑??潔蝙?刻��?雿𡏭孛?潔??�?嚗?
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("撌脰?鋆賢??桀�?芾票蝪?);
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
    // iOS 靽格迤
    area.setSelectionRange(0, 99999);
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showToast("撌脰?鋆賢??桀�?芾票蝪?);
            document.getElementById('manual-copy-modal').classList.add('hidden');
        } else {
            showToast("銴�ˊ憭望?嚗諹??见??瑟??券�銴�ˊ");
        }
    } catch (e) {
        showToast("銴�ˊ憭望?嚗諹??见?銴�ˊ");
    }
}

function copyTextToClipboard(text) {
    const manualFallback = () => openManualCopyModal(text);

    // 1. 蝚砌??蹱?嚗関extarea嚗��?�?璈毺�讛汗?冽𣈲?游?甇亙嘑銵䕘?
    const fallbackCopy = (txt) => {
        const textArea = document.createElement("textarea");
        textArea.value = txt;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px"; // ?踹?閬𤥁死?�?
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                if (navigator.vibrate) navigator.vibrate(50);
                showToast("?滚鱓撌脰?鋆踝?");
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
                showToast("?滚鱓撌脰?鋆踝?");
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

    // ?斗𪃾?臬炏?箸?璈蠘?蝵?
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    // ?亦�?𧢲?嚗��?�?閰虫蝙?函頂蝯勗??笔?鈭?API (?舀螱?喲��秐 LINE?�MS 蝑?
    if (isMobile && navigator.share) {
        const e = appState.currentEvent;
        navigator.share({
            title: e ? e.name : '瘣餃??�澈',
            text: text
        }).then(() => {
            console.log('?�澈?𣂼?');
        }).catch((err) => {
            // ?乩蝙?刻��蜓?訫?瘨�?鈭恬??�???AbortError嚗峕迨?�??�嘑銵諹?鋆?
            if (err.name !== 'AbortError') {
                console.warn("?毺??�澈?潛??航炊嚗峕㺿?箄?鋆賣?摮?, err);
                tryLiffOrCopy();
            }
        });
    } else {
        // ?餉�?�?銝齿𣈲?游??笔?鈭怎?鋆萘蔭嚗�??桃?銴�ˊ?�?
        tryLiffOrCopy();
    }
}

// ?箔?蝔见?蝣潭㟲瞏䈑?撠�??�??閗?蝒㛖??讛摩?函??箔? (隢见?甇文遆撘誩???copyTextToClipboard 銝𧢲䲮)
function openManualCopyModal(text) {
    ensureManualCopyModalExists();
    const area = document.getElementById('manual-copy-area');
    // 蝣箔??�?摮睃銁?滩釵??
    if (area) {
        area.value = text;
        // ?嘥? iOS Safari ?�鸌畾𡃏??�??脫迫?萇𥿢敶�枂雿��?詨?
        area.contentEditable = true;
        area.readOnly = false;
    }

    const modal = document.getElementById('manual-copy-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }

    refreshIcons();

    // ?𡑒岫?詨??�?嚗峕䲮靘蹂蝙?刻��凒?亥?鋆?
    if (area) {
        setTimeout(() => {
            area.select();
            area.setSelectionRange(0, 99999); // ?嘥?銵�?鋆萘蔭
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

// --- ?�澈?蠘�頧㗇𦻖 (?詨捆?啁? index.html) ---
window.executeShare = async function(mode) {
    if (mode === "single") {
        return shareAsImage();
    } else if (mode === "all") {
        return shareAllAsImage();
    }
};


// --- 銝滚??箏葉 (?�??? ?钅??讛摩 ---
window.toggleNoAttendance = function(checkbox) {
    const isNoAttendance = checkbox.checked;
    const familySelect = document.getElementById("family-count");
    const guestSection = document.getElementById("guest-section");
    const travelField = document.getElementById("field-travel");
    const eventType = appState && appState.currentEvent ? appState.currentEvent.type : "";

    if (isNoAttendance) {
        if (familySelect) {
            familySelect.value = "0";
            familySelect.disabled = true;
            familySelect.classList.add("opacity-50", "cursor-not-allowed");
        }
        if (guestSection) guestSection.classList.add("hidden");
        if (travelField) travelField.classList.add("hidden");
    } else {
        if (familySelect) {
            familySelect.disabled = false;
            familySelect.classList.remove("opacity-50", "cursor-not-allowed");
            if (familySelect.value === "0") familySelect.value = "1";
        }
        if (guestSection) guestSection.classList.remove("hidden");
        if (eventType === "travel" && travelField) travelField.classList.remove("hidden");
    }
};


window.buildRichShareAllText = function(eventsData) {
    const numberEmojis = ['1儭謿�', '2儭謿�', '3儭謿�', '4儭謿�', '5儭謿�', '6儭謿�', '7儭謿�', '8儭謿�', '9儭謿�', '??'];
    let shareText = `?? ?𣂼之?�??�??��𤏸??蠘?颲虫葉瘣餃? ?𡤻\n?�??�??�??�??�??�??�??�??�??�??�n`;
    
    eventsData.forEach((data, index) => {
        const e = data.event;
        const stats = data.stats || {};
        const details = data.details || [];
        const numEmoji = numberEmojis[index] || `${index + 1}.`;
        
        shareText += `${numEmoji} ${e.name}\n`;
        if (e.organizer) shareText += `   ?𪈠 銝餉齒鈭綽?${e.organizer}\n`;
        const shareTD = typeof formatTimeForShare === 'function' ? formatTimeForShare(e.time) : e.time;
        if (shareTD) shareText += `   ?? ?�?嚗?{shareTD}\n`;
        if (e.location) shareText += `   ?? ?圈?嚗?{e.location}\n`;
        
        let sponsorHtmlLines = [];
        if (details && details.length > 0) {
            details.forEach(p => {
                let moneyParts = [];
                const tc = typeof getIntField === 'function' ? getIntField(p, 'tableCount') : parseInt(p.tableCount || 0, 10);
                if (tc > 0) moneyParts.push(`隤齿?: ${tc}獢䈣);
                const sponsorRaw = typeof getField === 'function' ? getField(p, 'sponsor') : (p.sponsor || '');
                const sponsorList = typeof parseSponsorData === 'function' ? parseSponsorData(sponsorRaw) : (sponsorRaw ? sponsorRaw.split(/[,?�/).map(s=>s.trim()).filter(Boolean) : []);
                sponsorList.forEach(s => moneyParts.push(`韐𠰴𨭌: ${s}`));
                if (moneyParts.length > 0) {
                    sponsorHtmlLines.push(`      ?? ${p.name} ??${moneyParts.join('??)}`);
                }
            });
        }
        if (sponsorHtmlLines.length > 0) {
            shareText += `   ?兛 韐𠰴𨭌 / 隤齿?鞈�?\n${sponsorHtmlLines.join('\n')}\n`;
        }
        
        shareText += `   ?? 蝯梯?嚗𡁜� ${stats.totalPeople || 0} 鈭箏𥼚?㙡n\n`;
    });
    
    shareText += `?�??�??�??�??�??�??�??�??�??�??�n`;
    shareText += `?? 蝯曹??勗??????嚗䨵nhttps://liff.line.me/${typeof LIFF_ID !== 'undefined' ? LIFF_ID : ''}\n`;
    return shareText;
};


