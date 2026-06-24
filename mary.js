// ==========================================
function showToast(msg, duration=3000) {
    if (typeof CasinoApp !== 'undefined' && CasinoApp.showTicker) {
        CasinoApp.showTicker(msg, 'info');
    } else {
        alert(msg);
    }
}

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
    { id: 'mango', label: '?¥­', rate: 10, color: '#ffee00' }, // ?¥­ 10x
    { id: 'bell', label: '??', rate: 20, color: '#ffdd00' }, // ?? 20x
    { id: 'watermelon', label: '??', rate: 30, color: '#44ff44' }, // ?? 30x
    { id: 'star', label: '??', rate: 40, color: '#ffff44' }, // ?? 40x
    { id: 'seven', label: '7ï¸âƒ£', rate: 50, color: '#ff2222' }, // 7ï¸âƒ£ 50x
    { id: 'bar', label: 'BAR', rate: 100, color: '#44aaff' }, // BAR 100x
    { id: 'lucky', label: '??', rate: 0, color: '#00ffaa' }  // ?ç? / å°ç?
];

// è½‰ç›¤?†å? (24?? ç¶“å…¸ä½ˆå?ï¼Œæ?å¤§ç??¨ä?ä¸‹ä¸­ï¼Œæ¬¡?åœ¨å·¦å³ä¸?
const MARY_GRID = [
    'apple', 'orange', 'mango', 'bar', 'bell', 'lucky', 'watermelon',
    'apple', 'star', 'seven', 'mango', 'bell',
    'orange', 'apple', 'mango', 'bar', 'bell', 'lucky', 'watermelon',
    'apple', 'star', 'seven', 'orange', 'bell'
];

// API Submit helper function for Mary logic
async function apiSubmit(data) {
    if (typeof GAS_URL === 'undefined' || !GAS_URL) {
        console.error("No GAS URL defined");
        return { error: "No GAS URL" };
    }

    // ç®¡ç??¡ç„¡?é??¸é˜²è­·ï??»æ?ç®¡ç??¡å¯«?¥å?ç«¯ï?ä¿è­·å½©æ??‡ç?å¯¦æ•¸??
    if (typeof CasinoApp !== 'undefined' && CasinoApp.user && typeof ADMIN_USER_IDS !== 'undefined' && ADMIN_USER_IDS.includes(CasinoApp.user.userId)) {

        const winPts = data.winPoints || 0;
        return {
            success: true,
            points: 999999,
            monthlyGift: 999999,
            totalMaryScore: (maryState.totalMaryScore || 0) + winPts,
            jackpotPool: maryState.jackpotPool || 0 // ä¿æ??Ÿç?ï¼Œä??•å½©æ±?
        };
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
        } catch (e) {
            return { error: text || 'JSON parsing error' };
        }
    } catch (e) {
        console.error("API Error", e);
        return { error: e.message };
    }
}

async function openSmallMary() {
    if (!CasinoApp.user || !CasinoApp.user.userId) return showToast("è«‹å??»å…¥ LINE");
    // ??Casino å¤§å»³ä¸­ï??´æ¥??CasinoApp.openGame('mary') ?•ç?
    // æ­¤å‡½å¼ä??™ç›¸å®¹æ€§ï?ä½†ä¸»è¦é?è¼¯å·²?´å???openGame
    initMaryBoard();
    initMaryBetPanel();
    await refreshMaryData();
}

function adjustMaryScale() {
    const machine = document.getElementById('mary-machine');
    const maryView = document.getElementById('view-mary');
    if (!machine || !maryView || maryView.classList.contains('hidden')) return;

    // ç¢ºä??ˆé??Ÿè?å½¢å?æ¸¬é??Ÿå¯¦å¤§å?
    machine.style.transform = 'none';

    // ?©ç”¨ setTimeout è®“ç€è¦½?¨å??ç¹ªï¼Œç¢ºä¿å?å¾—æ?æ­?¢º??offsetHeight
    setTimeout(() => {
        const machineH = machine.offsetHeight || 680;
        const machineW = machine.offsetWidth || 420;

        const vh = window.innerHeight;
        const vw = window.innerWidth;

        // ?ç?ä¸Šä??Šç?å®‰å…¨?€ (?¿é? iOS å·¥å…·?—è??æµ·)
        const paddingY = 60; // ä¸Šä??±é???60px
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
    CasinoApp.backToLobby();
}

// openMaryHelp å®šç¾©?¼ä??¹ï?ç¬?2713 è¡Œï?ï¼Œæ­¤?•ä??è?å®šç¾©

async function refreshMaryData() {
    try {
        const res = await fetch(`${GAS_URL}?action=getSmallMaryData&userId=${CasinoApp.user.userId}&name=${encodeURIComponent(CasinoApp.user.displayName)}&_=${Date.now()}`);
        const data = await res.json();
        if (data.error) return showToast(data.error);

        maryState.points = data.points;
        maryState.monthlyGift = data.monthlyGift;
        maryState.totalMaryScore = (data.MaryScore !== undefined ? data.MaryScore : data.totalMaryScore);
        maryState.jackpotPool = data.jackpotPool;

        // ç®¡ç??¡ç„¡?é??¸ä?è­?
        if (typeof CasinoApp !== 'undefined' && CasinoApp.user && typeof ADMIN_USER_IDS !== 'undefined' && ADMIN_USER_IDS.includes(CasinoApp.user.userId)) {
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
    if (totalBet >= userTotal) return showToast("é»æ•¸ä¸è¶³");

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

// ?°å?ï¼šéš¨æ©ŸæŠ¼æ³¨å???
function maryRandomBet() {
    if (maryState.isSpinning || maryState.doubleUpActive) return;
    const activeOptions = MARY_CONFIG.filter(c => c.rate > 0);
    if (activeOptions.length === 0) return;

    const userTotal = maryState.points + maryState.monthlyGift;
    let currentTotalBet = Object.values(maryState.currentBet).reduce((a, b) => a + b, 0);

    // æ±ºå?è¦æŠ¼å¹¾å€‹ä??Œå?æ¡?(2~4ç¨?
    const numSymbols = Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < numSymbols; i++) {
        const target = activeOptions[Math.floor(Math.random() * activeOptions.length)];
        const times = Math.floor(Math.random() * 3) + 1; // ??1~3 æ³?

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
        // ä¸Šæ? (7?? 1~7)
        { c: 1, r: 1 }, { c: 2, r: 1 }, { c: 3, r: 1 }, { c: 4, r: 1 }, { c: 5, r: 1 }, { c: 6, r: 1 }, { c: 7, r: 1 },
        // ?³å´ (5?? 2~6)
        { c: 7, r: 2 }, { c: 7, r: 3 }, { c: 7, r: 4 }, { c: 7, r: 5 }, { c: 7, r: 6 },
        // ä¸‹æ? (7?? 7~1)
        { c: 7, r: 7 }, { c: 6, r: 7 }, { c: 5, r: 7 }, { c: 4, r: 7 }, { c: 3, r: 7 }, { c: 2, r: 7 }, { c: 1, r: 7 },
        // å·¦å´ (5?? 6~2)
        { c: 1, r: 6 }, { c: 1, r: 5 }, { c: 1, r: 4 }, { c: 1, r: 3 }, { c: 1, r: 2 }
    ]; // ??24 ??

    const grid = document.getElementById('mary-track-grid');
    if (!grid) return;
    // ç§»é™¤?¤ä¸­å¿?div å¤–ç??€?‰å?ç´?
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
    // ?æ¿¾??Lucky
    MARY_CONFIG.filter(c => c.rate > 0).forEach(conf => {
        const btn = document.createElement('div');
        btn.className = 'flex flex-col items-center justify-center bg-black/60 border border-[#5a3a00] rounded-md py-1 px-0.5 cursor-pointer select-none active:brightness-125 transition-all';
        btn.innerHTML = `
            <div class="text-[8px] font-black text-[#ffcc00] mb-0.5">x${conf.rate}</div>
            <div class="text-xl leading-none mb-1">${conf.label}</div>
            <div id="mary-bet-val-${conf.id}" class="w-full bg-black text-[#ff6666] font-mono text-[10px] font-black text-center border border-[#333] rounded-sm py-0.5 shadow-[inset_0_0_5px_rgba(255,100,100,0.5)]">0</div>
        `;

        // ?·æ?è·³å‡º?¸å??µç›¤
        let pressTimer;
        let isLongPress = false;

        const startPress = (e) => {
            if (e.cancelable) e.preventDefault();
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                openMaryKeypad(conf.id, conf.label);
            }, 500); // 500ms è§¸ç™¼?·æ?
        };

        const stopPress = (e) => {
            if (e && e.cancelable) e.preventDefault();
            if (pressTimer) clearTimeout(pressTimer);

            // ?­æ? (?ªè§¸?¼é•·?? ä¸”é?ç§»å‡º/?–æ?äº‹ä»¶
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
// ?¸å??µç›¤ (Keypad) ?è¼¯
// ==========================================
let maryKeypadTargetId = null;

function openMaryKeypad(id, label) {
    if (maryState.isSpinning || maryState.doubleUpActive) return;
    maryKeypadTargetId = id;

    const overlay = document.getElementById('mary-keypad-overlay');
    const title = document.getElementById('mary-keypad-title');
    const input = document.getElementById('mary-keypad-input');

    if (overlay) overlay.classList.remove('hidden');
    if (title) title.innerText = `?¼æ³¨: ${label}`;

    const currentVal = maryState.currentBet[id] || 0;
    if (input) {
        input.value = currentVal > 0 ? currentVal : '';
        // ?¥ç‚º?‹æ??Ÿç??µç›¤é«”é?ï¼Œä??¯å???input.focus()
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
            if (current.length < 6) { // ?åˆ¶è¼¸å…¥?·åº¦
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
    if (isNaN(val) || val < 0) return; // å®¹è¨±è¼¸å…¥ä¸­æš«?‚ç‚ºç©?

    const totalBetExcludingTarget = Object.keys(maryState.currentBet).reduce((sum, key) => {
        return key === maryKeypadTargetId ? sum : sum + maryState.currentBet[key];
    }, 0);

    const userTotal = maryState.points + maryState.monthlyGift;
    const maxAvailable = userTotal - totalBetExcludingTarget;

    if (val > maxAvailable) {
        input.value = maxAvailable > 0 ? maxAvailable : 0;
        showToast("?€å¤šåª?½æŠ¼?°å¯?¨é?é¡ä???);
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

    // è¨ˆç?å·²æŠ¼æ³¨ç¸½é¡ï?Credit ?³æ??æ??©é??¯ç”¨é»æ•¸
    const betPoints = Object.values(maryState.currentBet).reduce((a, b) => a + b, 0);
    const total = (maryState.points + maryState.monthlyGift);
    const displayCredit = Math.max(0, total - betPoints);
    if (pointsEl) pointsEl.innerText = displayCredit.toString().padStart(4, '0');
    if (giftEl) giftEl.innerText = `è´ˆå?: ${maryState.monthlyGift}`;
    if (jackpotEl) jackpotEl.innerText = `?° å½©é?æ±? ${maryState.jackpotPool || 0}`;

    if (winEl) winEl.innerText = maryState.winScore.toString().padStart(4, '0');
    if (centerNumEl) centerNumEl.innerText = maryState.winScore > 0 ? maryState.winScore : '0';

    const startBtn = document.getElementById('mary-btn-start');
    if (startBtn) {
        // ?‹è?ä¸­ã€æ?æ¯”å¤§å°ç??‹ï?ç­‰å??©å®¶æ±ºå?ï¼‰æ??–å? START
        const noBet = Object.values(maryState.currentBet).every(v => v === 0);
        startBtn.disabled = maryState.isSpinning || maryState.doubleUpActive || (total <= 0 && noBet);
    }
}

const highlight = (idx, on, force = false) => {
    const cell = document.getElementById(`mary-cell-${idx}`);
    if (!cell) return;

    // ???°å?ï¼šä?è­·ä?æ­»ç???
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

// è¨˜é??¶å??‰æ?ä½ç½®
let maryCurrentPos = 0;

async function maryStartSpin() {
    if (maryState.isSpinning || maryState.doubleUpActive) return;

    // ??æ¸…é™¤?ä?å±€æ®˜ç??„é€ç?
    if (maryState.keepLights) {
        maryState.keepLights.forEach(idx => highlight(idx, false, true)); // force clear
    }
    maryState.keepLights = [];

    const betPoints = Object.values(maryState.currentBet).reduce((a, b) => a + b, 0);
    if (betPoints <= 0) return showToast("è«‹å??¸ç¬¦?Ÿå?æ³?);

    maryState.isSpinning = true;
    document.getElementById('mary-btn-start').disabled = true;

    // (ä¸‹æ³¨?¢æ¿æ­¸é›¶å·²ç§»?³é??²ç??Ÿå?)

    const trackLen = MARY_GRID.length; // 24

    // ???•æ?æ¬Šé??‹ç?ç³»çµ± (ç²¾æ??§åˆ¶ 25% ä¸­ç??‡è? RTPï¼Œä?å¤§ç??¨ç?)
    let isWin = false;
    const betSymbols = Object.keys(maryState.currentBet).filter(id => (maryState.currentBet[id] || 0) > 0);

    // ???°é?æ±‚ï??¨é??®æŠ¼æ³¨ä¸­å°ç?æ©Ÿç?ä¸Šå?
    let winRate = 0.25; // ?ºç? 25%
    const maxOptions = MARY_CONFIG.filter(c => c.rate > 0).length; // 8??
    if (betSymbols.length >= maxOptions) {
        winRate = 0.50; // ?¨æŠ¼?‚æ??‡åˆ° 50%
    } else if (betSymbols.length >= maxOptions - 2) {
        winRate = 0.35; // ?¼æ³¨ 6 ?…ä»¥ä¸Šæ??‡åˆ° 35%
    }

    // ä¸­ç??¤å?
    if (betSymbols.length > 0 && Math.random() < winRate) {
        isWin = true;
    }

    // ??ä½¿ç”¨?…æ?å®šç²¾æº–æ??æ?å°„è¡¨ (ä¸­ç??‚ç?æ¬Šé?)
    const weightMap = {
        'apple': 50,  // ?€å®¹æ?ä¸?
        'orange': 10,
        'mango': 5,
        'bell': 4,
        'star': 3,
        'watermelon': 2,
        'seven': 0.5, // ä¸?(æ¥µç???
        'bar': 0.2  // BAR (ç¥è©±ç´?
    };

    // ???°å?ï¼šå¹¸?‹å?è¹Ÿåˆ¤å®?(1.5% æ©Ÿç??¡è?é¢¨æ§?‹å¤§??
    const isLuckyMiracle = Math.random() < 0.015;

    let weights = [];
    for (let i = 0; i < trackLen; i++) {
        const sym = MARY_GRID[i];
        const conf = MARY_CONFIG.find(c => c.id === sym);
        const betAmt = maryState.currentBet[sym] || 0;

        let w = weightMap[sym] || 1;

        // ??é¢¨æ§?è¼¯ï¼šå¤§æ³¨åˆ¤å®?(?®é??¼æ³¨ ??20 é»?
        if (betAmt >= 20 && !isLuckyMiracle) {
            // ?å?è¹Ÿæ?ï¼šé™¤äº†è??œï??¶é?å¤§é??•æ³¨?…ç›®?„æ??å¼·?¶ä?å£?
            if (sym !== 'apple') {
                w = Math.max(0.1, w / 5);
            } else {
                // ?‹æ??¨å¤§é¡æŠ¼æ³¨æ?æ¬Šé??è€Œå???(å¼•å??³æ?å°è??‡ç?)
                w = 200;
            }
        } else if (isLuckyMiracle) {
            // å¹¸é?å¥‡è??¼ç??‚ï??é?å¤§ç??¼æ???(é©šå???
            if (sym === 'bar' || sym === 'seven' || sym === 'star') {
                w = w * 10;
            }
        }

        // ??ä½¿ç”¨?…ç‰¹æ®Šè?æ±‚ï?å¤§ç??”é›¢?¤å?
        if (sym === 'bar' || sym === 'seven') {
            // ä¿ç?æ¥µç??‰æ??‡ï?ä¸å? isWin ?åˆ¶
            weights.push(isLuckyMiracle ? w : w * 0.5);
        } else if (isWin) {
            // ä¸­ç?ï¼šåªå¾æ??¼æ³¨?„ä¸­å°ç??…ä¸­ä¾æ? weightMap ?‘é¸
            if (betAmt > 0 && conf && conf.rate > 0) {
                // ?¥ä¸­?ä??‰æŠ¼?‹æ?ï¼Œè??œæ??å?å¼?(ä¿æœ¬æ©Ÿåˆ¶)
                if (sym === 'apple') w = 200;
                weights.push(w);
            } else {
                weights.push(0);
            }
        } else {
            // æ²’ä¸­?ï??‘é¸æ²’æŠ¼æ³¨ç??…ç›®?–é€ç?
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
        // ?é˜²?¬ä?ï¼šæ??‰æ??éƒ½??0 ?‚ï??€?å…¨?¨æ?
        weights = weights.map(() => 10);
        totalWeight = weights.reduce((a, b) => a + b, 0);
    }
    // ??? å…¥åº•é?ï¼šç¢ºä¿å¤§?ï?BAR/7ï¼‰åœ¨?´é?æ± ä¸­? æ?æ¥µä?ï¼? 0.5%ï¼?
    const bigPrizeCount = weights.filter((w, i) => MARY_GRID[i] === 'bar' || MARY_GRID[i] === 'seven')
        .reduce((a, b) => a + b, 0);
    const minTotal = bigPrizeCount * 200; // å¤§ç??¼ä?æ¯”ä?è¶…é? 1/200
    if (totalWeight < minTotal) {
        const pad = minTotal - totalWeight;
        // å°‡å·®é¡å¹³?‡è??°é?å¤§ç???
        const nonBigIdxs = weights.map((w, i) => (MARY_GRID[i] !== 'bar' && MARY_GRID[i] !== 'seven') ? i : -1).filter(i => i >= 0);
        if (nonBigIdxs.length > 0) {
            const addEach = Math.ceil(pad / nonBigIdxs.length);
            nonBigIdxs.forEach(i => { weights[i] += addEach; });
            totalWeight = weights.reduce((a, b) => a + b, 0);
        }
    }

    // ?½ç±¤æ±ºå??®æ?
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

    // ?¨ç??„æ?è½‰å??«å‡½??
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

    // ç¬?1 æ¬¡æ?è½?
    await doSpinAnim(targetIdx, 2, 50);
    maryState.keepLights.push(targetIdx); // ä¿è­·ç¬¬ä??‹ä¸­?æ ¼

    let winScore = (maryState.currentBet[targetId] || 0) * targetConfig.rate;
    let displayMsg = targetConfig.label;

    // ???™é??ç?æ©Ÿåˆ¶ (Lucky Star)
    if (targetId === 'lucky') {
        showToast("?? ?å…©?ˆï?");
        await new Promise(r => setTimeout(r, 600)); // ?œé?ä¸€ä¸‹å???

        for (let i = 0; i < 2; i++) {
            // ç¬?2, 3 æ¬¡æ?è½?(å¿«é€Ÿè??ˆï?1?ˆï?ç¨å¿«)
            // ?ºä??‰è¶£ï¼Œé€ç??‚éš¨æ©Ÿé€å¤§?ä»¥å¤–ç??–æ?
            let extraTargetIdx = Math.floor(Math.random() * trackLen);
            const extraSym = MARY_GRID[extraTargetIdx];
            if (extraSym === 'bar' || extraSym === 'seven' || extraSym === 'lucky') {
                extraTargetIdx = (extraTargetIdx + 1) % trackLen; // ?¿é?å¤§ç?æ­»æ¿?²éŒ¯
                if (MARY_GRID[extraTargetIdx] === 'bar' || MARY_GRID[extraTargetIdx] === 'seven') {
                    extraTargetIdx = (extraTargetIdx + 1) % trackLen;
                }
            }

            await doSpinAnim(extraTargetIdx, 1, 30);
            maryState.keepLights.push(extraTargetIdx); // ä¿è­·?ç??ˆè?

            const extraTargetId = MARY_GRID[extraTargetIdx];
            const extraTargetConfig = MARY_CONFIG.find(c => c.id === extraTargetId);

            // ç´¯å??†æ•¸
            if (extraTargetId !== 'lucky') {
                let extraWin = (maryState.currentBet[extraTargetId] || 0) * extraTargetConfig.rate;
                winScore += extraWin;
            }

            // è®“å??‹ä¸­?æ ¼?½ä??ç™¼äº?
            highlight(extraTargetIdx, true);
            await new Promise(r => setTimeout(r, 400));
        }
    }

    maryState.isSpinning = false;
    maryState.winScore = winScore;

    // ä¸­ç??¼é???
    if (winScore > 0) {
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
            const targetsToBlink = maryState.keepLights.length > 0 ? maryState.keepLights : [targetIdx];
            targetsToBlink.forEach(idx => highlight(idx, blinkCount % 2 === 0, true));
            blinkCount++;
            if (blinkCount >= 8) clearInterval(blinkInterval);
        }, 180);
    }

    // ?Œæ­¥å¾Œç«¯
    try {
        const res = await apiSubmit({
            action: 'playSmallMary',
            userId: CasinoApp.user.userId,
            betPoints,
            winPoints: winScore,
            symbol: displayMsg
        });
        if (res.success) {
            maryState.points = res.points;
            maryState.monthlyGift = res.monthlyGift;
            maryState.totalMaryScore = (res.MaryScore !== undefined ? res.MaryScore : res.totalMaryScore);
            if (res.jackpotPool !== undefined) maryState.jackpotPool = res.jackpotPool;
            updateMaryUI();
        }
    } catch (e) { console.error(e); }

    if (winScore > 0) {
        // ?‹æ??‡å? (?¥ä¸­?€å¤§ç? BAR)
        if (targetId === 'bar' && navigator.vibrate) {
            navigator.vibrate([500, 200, 500]);
        }

        showToast(`?? ä¸­ç?ï¼?{displayMsg} ?²å? ${winScore} ?†`);
        const db = document.getElementById('mary-double-btns');
        if (db) {
            db.classList.remove('hidden');
            db.style.display = 'flex';
            const btns = db.querySelectorAll('button');
            if (btns[2]) btns[2].textContent = '?˜ç?';
        }
        maryState.doubleUpActive = true;
        maryState.doubleUpStreak = 0; // ???ç½®?é?è¨ˆæ•¸

        // ??3 ç§’å??ªæ?ä½œè‡ª?•é???
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
        showToast(`?ªä¸­?????½åœ¨ ${displayMsg}ï¼Œå?è©¦ä?æ¬¡ï?`);
    }
}

async function maryDoubleUp(choice) {
    if (!maryState.doubleUpActive || maryState.isSpinning) return;
    // ?©å®¶?‰æ?ä½œï?æ¸…é™¤?ªå??˜ç?è¨ˆæ???
    if (maryState._autoCollectTimer) { clearTimeout(maryState._autoCollectTimer); maryState._autoCollectTimer = null; }

    // ?–å??‰é??²æ­¢?è???
    const dbContainer = document.getElementById('mary-double-btns');
    if (dbContainer) dbContainer.style.pointerEvents = 'none';

    // ???°é?æ±‚ï??ªè??„é?æ®µå??‡æ§??
    let winProb = 0.50; // ç¬?1 ??(streak = 0)
    if (maryState.doubleUpStreak === 1) winProb = 0.40;      // ç¬?2 ??
    else if (maryState.doubleUpStreak === 2) winProb = 0.30; // ç¬?3 ??
    else if (maryState.doubleUpStreak === 3) winProb = 0.05; // ç¬?4 ??
    else if (maryState.doubleUpStreak >= 4) winProb = 0.001; // ç¬?5 ??(?ä???

    let isForceWin = Math.random() < winProb;
    let num;

    if (isForceWin) {
        // è®“ç©å®¶è?ï¼šé??ºç¬¦?ˆç©å®¶ç?æ¸¬ç??¸å?
        if (choice === 'small') {
            num = Math.floor(Math.random() * 6) + 1; // 1-6
        } else {
            num = Math.floor(Math.random() * 6) + 8; // 8-13
        }
    } else {
        // è®“ç©å®¶è¼¸ï¼šéš¨æ©Ÿé??ºè?å®¶é€šæ®º(7)?–æ˜¯?¸å??„æ•¸å­?
        if (Math.random() < 0.3) {
            num = 7; // ?šæ®º
        } else {
            if (choice === 'small') {
                num = Math.floor(Math.random() * 6) + 8; // ?œå??‹å¤§
            } else {
                num = Math.floor(Math.random() * 6) + 1;  // ?œå¤§?‹å?
            }
        }
    }

    const numEl = document.getElementById('mary-double-number');
    const numDisplay = document.getElementById('mary-double-num-display');
    if (numEl) numEl.innerText = num;
    if (numDisplay) numDisplay.classList.remove('hidden');

    const btnSmall = document.getElementById('btn-mary-small');
    const btnBig = document.getElementById('btn-mary-big');

    // ??ä¿®æ­£ F5ï¼šåœ¨ä¿®æ”¹ winScore ?å?ä¿å??¬å??‘é?ï¼Œè?å¾Œç«¯?½æ­£ç¢ºæ”¶?°è¼¸??è´å??„é?é¡?
    const winBeforeChange = maryState.winScore;

    let win = false;
    if (num === 7) {
        win = false; // ?Šå®¶?šæ®º
    } else if (choice === 'small' && num <= 6) {
        win = true;
    } else if (choice === 'big' && num >= 8) {
        win = true;
    }

    if (win) {
        maryState.winScore *= 2;
        maryState.doubleUpStreak = (maryState.doubleUpStreak || 0) + 1; // è¨˜é????
        if (choice === 'big') {
            if (btnBig) btnBig.classList.add('brightness-150', 'scale-110', 'ring-4', 'ring-white');
            if (btnSmall) btnSmall.classList.add('opacity-30', 'grayscale');
        } else {
            if (btnSmall) btnSmall.classList.add('brightness-150', 'scale-110', 'ring-4', 'ring-white');
            if (btnBig) btnBig.classList.add('opacity-30', 'grayscale');
        }
    } else {
        maryState.winScore = 0;
        maryState.doubleUpStreak = 0; // å¤±æ?æ­¸é›¶
        maryState.doubleUpActive = false;
        if (btnBig) btnBig.classList.add('opacity-30', 'grayscale');
        if (btnSmall) btnSmall.classList.add('opacity-30', 'grayscale');
        maryClearBet();
    }

    // ?³æ??´æ–°?˜ç??‰é??„æ•¸å­—ï??¿å?ç­‰å??•ç•«??800ms ?Ÿé?é¡¯ç¤º?Šæ•¸å­?
    const immediateDb = document.getElementById('mary-double-btns');
    if (immediateDb) {
        const immediateBtns = immediateDb.querySelectorAll('button');
        if (immediateBtns[2]) {
            if (maryState.winScore > 0) {
                immediateBtns[2].textContent = `???˜ç? (${maryState.winScore})`;
            } else {
                immediateBtns[2].textContent = '?˜ç?';
            }
        }
    }

    updateMaryUI();

    // ?Œæ­¥?³å?ç«?
    // ??BUG 7 ä¿®æ­£ï¼šé?äº”é?ï¼ˆstreak >= 5ï¼‰æ?ï¼Œå?çºŒæ??¼å« claimSmallMaryJackpotï¼?
    // ?¶å?ç«¯å…§?¨ä??¼å« playSmallMaryï¼Œç‚º?¿å??™é?è¨ˆå?ï¼Œæ­¤?•è·³??playSmallMary??
    // ??F5 èªªæ?ï¼šä½¿??winBeforeChangeï¼ˆä¿®?¹å??„é?é¡ï??³å?ç«?
    //   - è´ï?doubleWin = maryState.winScoreï¼ˆç¿»?å?ï¼‰ï?å¾Œç«¯ç´¯å? MaryScore
    //   - è¼¸ï?doubleWin = -winBeforeChangeï¼ˆè??¸ï?ï¼Œå?ç«¯å¯æ­?¢ºè¨ˆç?è¼¸æ??„é?é¡ä¸¦è£œå½©?‘æ?
    const willTriggerJackpot = win && (maryState.doubleUpStreak >= 5);
    if (!willTriggerJackpot) {
        try {
            const res = await apiSubmit({
                action: 'playSmallMary',
                userId: CasinoApp.user.userId,
                betPoints: 0,
                isDoubleUp: true,
                doubleWin: win ? maryState.winScore : -winBeforeChange,
                symbol: win ? `å¤§å?ç¿»å€Ã?` : `å¤§å?è¼???{num})`
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

        if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ?¢å¾©é»æ?

        // ???ä??œæ–¬å°‡å½©æ± è§¸??
        if (win && maryState.doubleUpStreak >= 5) {
            maryState.doubleUpStreak = 0; // ?ç½®
            const dbBtnsJP = document.getElementById('mary-double-btns');
            if (dbBtnsJP) { dbBtnsJP.classList.add('hidden'); dbBtnsJP.style.pointerEvents = 'auto'; }
            if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ???¢å¾© pointerEvents
            showToast("?? ?­å?ï¼é?äº”é??¬å?ï¼Œè§¸?¼å½©æ± å¤§?ï?æ­?œ¨çµç?ä¸?..", 4000);

            try {
                const res = await apiSubmit({
                    action: 'claimSmallMaryJackpot',
                    userId: CasinoApp.user.userId,
                    name: CasinoApp.user.displayName // ??BUG 3 ä¿®æ­£ï¼šæ???displayNameï¼Œé? name
                });
                if (res.success) {
                    // ??ä¿®æ­£ F3ï¼šclaimSmallMaryJackpot å¾Œç«¯å·²è?å¸³å??¢ï??§éƒ¨?¼å« playSmallMaryï¼?
                    // ?´æ¥?´æ–°?ç«¯?€?‹ï?ä¸å??¼å« maryCollect()ï¼ˆé¿?å?æ¬¡é€?playSmallMary å°è‡´å½©é??™é?è¨˜å…¥ï¼?
                    maryState.winScore += res.jackpotWon; // ? ä?å½©é??¨æ–¼?ç«¯?•ç•«
                    showToast(`?° ?‚è?ï¼ç¨å¾—å½©æ±?${res.jackpotWon} ?†ï?ç¸½å? ${maryState.winScore} ?†ï?`, 5000);

                    // ?´æ¥?´æ–°å¾Œç«¯?å‚³?„æ­£ç¢ºé???
                    if (res.points !== undefined) maryState.points = res.points;
                    if (res.monthlyGift !== undefined) maryState.monthlyGift = res.monthlyGift;
                    if ((res.MaryScore !== undefined ? res.MaryScore : res.totalMaryScore) !== undefined) maryState.totalMaryScore = (res.MaryScore !== undefined ? res.MaryScore : res.totalMaryScore);
                } else {
                    showToast(`? ï? å½©æ??ç¤ºï¼?{res.error || '?ªçŸ¥?„éŒ¯èª?}`, 3000);
                }
            } catch (e) {
                console.error("?˜å?å½©æ?å¤±æ?", e);
            }

            // æ¸…é™¤æ¯”å¤§å°?UI
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

            // ?±è??´å€‹é??å??‰é?
            const dbBtnsLose = document.getElementById('mary-double-btns');
            if (dbBtnsLose) {
                dbBtnsLose.classList.add('hidden');
                dbBtnsLose.style.pointerEvents = 'auto'; // ??ä¿®å¾©ï¼šæ¢å¾?pointerEventsï¼Œé˜²æ­¢ä?å±€æ®˜ç?
            }
            if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ???Œæ­¥?¢å¾©?Ÿå??ƒç…§

            updateMaryUI();
            document.getElementById('mary-btn-start').disabled = false;
        } else {
            const db = document.getElementById('mary-double-btns');
            if (db) {
                const btns = db.querySelectorAll('button');
                if (btns[2]) {
                    btns[2].textContent = `???˜ç? (${maryState.winScore})`;
                    btns[2].style.pointerEvents = 'auto'; // å¼·åˆ¶?˜ç??‰é??¯é?
                }
            }
        }
    }, 800); // 800ms
}

async function maryDoubleUp(choice) {
    if (!maryState.doubleUpActive || maryState.isSpinning) return;
    // ?©å®¶?‰æ?ä½œï?æ¸…é™¤?ªå??˜ç?è¨ˆæ???
    if (maryState._autoCollectTimer) { clearTimeout(maryState._autoCollectTimer); maryState._autoCollectTimer = null; }

    // ?–å??‰é??²æ­¢?è???
    const dbContainer = document.getElementById('mary-double-btns');
    if (dbContainer) dbContainer.style.pointerEvents = 'none';

    // ???°é?æ±‚ï??ªè??„é?æ®µå??‡æ§??
    let winProb = 0.50; // ç¬?1 ??(streak = 0)
    if (maryState.doubleUpStreak === 1) winProb = 0.40;      // ç¬?2 ??
    else if (maryState.doubleUpStreak === 2) winProb = 0.30; // ç¬?3 ??
    else if (maryState.doubleUpStreak === 3) winProb = 0.05; // ç¬?4 ??
    else if (maryState.doubleUpStreak >= 4) winProb = 0.001; // ç¬?5 ??(?ä???

    let isForceWin = Math.random() < winProb;
    let num;

    if (isForceWin) {
        // è®“ç©å®¶è?ï¼šé??ºç¬¦?ˆç©å®¶ç?æ¸¬ç??¸å?
        if (choice === 'small') {
            num = Math.floor(Math.random() * 6) + 1; // 1-6
        } else {
            num = Math.floor(Math.random() * 6) + 8; // 8-13
        }
    } else {
        // è®“ç©å®¶è¼¸ï¼šéš¨æ©Ÿé??ºè?å®¶é€šæ®º(7)?–æ˜¯?¸å??„æ•¸å­?
        if (Math.random() < 0.3) {
            num = 7; // ?šæ®º
        } else {
            if (choice === 'small') {
                num = Math.floor(Math.random() * 6) + 8; // ?œå??‹å¤§
            } else {
                num = Math.floor(Math.random() * 6) + 1;  // ?œå¤§?‹å?
            }
        }
    }

    const numEl = document.getElementById('mary-double-number');
    const numDisplay = document.getElementById('mary-double-num-display');
    if (numEl) numEl.innerText = num;
    if (numDisplay) numDisplay.classList.remove('hidden');

    const btnSmall = document.getElementById('btn-mary-small');
    const btnBig = document.getElementById('btn-mary-big');

    // ??ä¿®æ­£ F5ï¼šåœ¨ä¿®æ”¹ winScore ?å?ä¿å??¬å??‘é?ï¼Œè?å¾Œç«¯?½æ­£ç¢ºæ”¶?°è¼¸??è´å??„é?é¡?
    const winBeforeChange = maryState.winScore;

    let win = false;
    if (num === 7) {
        win = false; // ?Šå®¶?šæ®º
    } else if (choice === 'small' && num <= 6) {
        win = true;
    } else if (choice === 'big' && num >= 8) {
        win = true;
    }

    if (win) {
        maryState.winScore *= 2;
        maryState.doubleUpStreak = (maryState.doubleUpStreak || 0) + 1; // è¨˜é????
        if (choice === 'big') {
            if (btnBig) btnBig.classList.add('brightness-150', 'scale-110', 'ring-4', 'ring-white');
            if (btnSmall) btnSmall.classList.add('opacity-30', 'grayscale');
        } else {
            if (btnSmall) btnSmall.classList.add('brightness-150', 'scale-110', 'ring-4', 'ring-white');
            if (btnBig) btnBig.classList.add('opacity-30', 'grayscale');
        }
    } else {
        maryState.winScore = 0;
        maryState.doubleUpStreak = 0; // å¤±æ?æ­¸é›¶
        maryState.doubleUpActive = false;
        if (btnBig) btnBig.classList.add('opacity-30', 'grayscale');
        if (btnSmall) btnSmall.classList.add('opacity-30', 'grayscale');
        maryClearBet();
    }

    // ?³æ??´æ–°?˜ç??‰é??„æ•¸å­—ï??¿å?ç­‰å??•ç•«??800ms ?Ÿé?é¡¯ç¤º?Šæ•¸å­?
    const immediateDb = document.getElementById('mary-double-btns');
    if (immediateDb) {
        const immediateBtns = immediateDb.querySelectorAll('button');
        if (immediateBtns[2]) {
            if (maryState.winScore > 0) {
                immediateBtns[2].textContent = `???˜ç? (${maryState.winScore})`;
            } else {
                immediateBtns[2].textContent = '?˜ç?';
            }
        }
    }

    updateMaryUI();

    // ?Œæ­¥?³å?ç«?
    // ??BUG 7 ä¿®æ­£ï¼šé?äº”é?ï¼ˆstreak >= 5ï¼‰æ?ï¼Œå?çºŒæ??¼å« claimSmallMaryJackpotï¼?
    // ?¶å?ç«¯å…§?¨ä??¼å« playSmallMaryï¼Œç‚º?¿å??™é?è¨ˆå?ï¼Œæ­¤?•è·³??playSmallMary??
    // ??F5 èªªæ?ï¼šä½¿??winBeforeChangeï¼ˆä¿®?¹å??„é?é¡ï??³å?ç«?
    //   - è´ï?doubleWin = maryState.winScoreï¼ˆç¿»?å?ï¼‰ï?å¾Œç«¯ç´¯å? MaryScore
    //   - è¼¸ï?doubleWin = -winBeforeChangeï¼ˆè??¸ï?ï¼Œå?ç«¯å¯æ­?¢ºè¨ˆç?è¼¸æ??„é?é¡ä¸¦è£œå½©?‘æ?
    const willTriggerJackpot = win && (maryState.doubleUpStreak >= 5);
    if (!willTriggerJackpot) {
        try {
            const res = await apiSubmit({
                action: 'playSmallMary',
                userId: CasinoApp.user.userId,
                betPoints: 0,
                isDoubleUp: true,
                doubleWin: win ? maryState.winScore : -winBeforeChange,
                symbol: win ? `å¤§å?ç¿»å€Ã?` : `å¤§å?è¼???{num})`
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

        if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ?¢å¾©é»æ?

        // ???ä??œæ–¬å°‡å½©æ± è§¸??
        if (win && maryState.doubleUpStreak >= 5) {
            maryState.doubleUpStreak = 0; // ?ç½®
            const dbBtnsJP = document.getElementById('mary-double-btns');
            if (dbBtnsJP) { dbBtnsJP.classList.add('hidden'); dbBtnsJP.style.pointerEvents = 'auto'; }
            if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ???¢å¾© pointerEvents
            showToast("?? ?­å?ï¼é?äº”é??¬å?ï¼Œè§¸?¼å½©æ± å¤§?ï?æ­?œ¨çµç?ä¸?..", 4000);

            try {
                const res = await apiSubmit({
                    action: 'claimSmallMaryJackpot',
                    userId: CasinoApp.user.userId,
                    name: CasinoApp.user.displayName // ??BUG 3 ä¿®æ­£ï¼šæ???displayNameï¼Œé? name
                });
                if (res.success) {
                    // ??ä¿®æ­£ F3ï¼šclaimSmallMaryJackpot å¾Œç«¯å·²è?å¸³å??¢ï??§éƒ¨?¼å« playSmallMaryï¼?
                    // ?´æ¥?´æ–°?ç«¯?€?‹ï?ä¸å??¼å« maryCollect()ï¼ˆé¿?å?æ¬¡é€?playSmallMary å°è‡´å½©é??™é?è¨˜å…¥ï¼?
                    maryState.winScore += res.jackpotWon; // ? ä?å½©é??¨æ–¼?ç«¯?•ç•«
                    showToast(`?° ?‚è?ï¼ç¨å¾—å½©æ±?${res.jackpotWon} ?†ï?ç¸½å? ${maryState.winScore} ?†ï?`, 5000);

                    // ?´æ¥?´æ–°å¾Œç«¯?å‚³?„æ­£ç¢ºé???
                    if (res.points !== undefined) maryState.points = res.points;
                    if (res.monthlyGift !== undefined) maryState.monthlyGift = res.monthlyGift;
                    if ((res.MaryScore !== undefined ? res.MaryScore : res.totalMaryScore) !== undefined) maryState.totalMaryScore = (res.MaryScore !== undefined ? res.MaryScore : res.totalMaryScore);
                } else {
                    showToast(`? ï? å½©æ??ç¤ºï¼?{res.error || '?ªçŸ¥?„éŒ¯èª?}`, 3000);
                }
            } catch (e) {
                console.error("?˜å?å½©æ?å¤±æ?", e);
            }

            // æ¸…é™¤æ¯”å¤§å°?UI
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

            // ?±è??´å€‹é??å??‰é?
            const dbBtnsLose = document.getElementById('mary-double-btns');
            if (dbBtnsLose) {
                dbBtnsLose.classList.add('hidden');
                dbBtnsLose.style.pointerEvents = 'auto'; // ??ä¿®å¾©ï¼šæ¢å¾?pointerEventsï¼Œé˜²æ­¢ä?å±€æ®˜ç?
            }
            if (dbContainer) dbContainer.style.pointerEvents = 'auto'; // ???Œæ­¥?¢å¾©?Ÿå??ƒç…§

            updateMaryUI();
            document.getElementById('mary-btn-start').disabled = false;
        } else {
            const db = document.getElementById('mary-double-btns');
            if (db) {
                const btns = db.querySelectorAll('button');
                if (btns[2]) {
                    btns[2].textContent = `???˜ç? (${maryState.winScore})`;
                    btns[2].style.pointerEvents = 'auto'; // å¼·åˆ¶?˜ç??‰é??¯é?
                }
            }
        }
    }, 800); // 800ms
}

// ?˜ç?
async function maryCollect() {
    if (maryState.isSpinning || !maryState.doubleUpActive || maryState.winScore <= 0) return;
    // æ¸…é™¤?ªå??˜ç?è¨ˆæ??¨ï??¥ç‚º?‹å?è§¸ç™¼ï¼?
    if (maryState._autoCollectTimer) { clearTimeout(maryState._autoCollectTimer); maryState._autoCollectTimer = null; }

    maryState.doubleUpActive = false; // ç«‹å³æ¨™è?ï¼Œé˜²æ­¢é?è¤‡é?
    const win = maryState.winScore;
    const startPoints = maryState.points;
    let targetPoints = startPoints + win;

    // ?±è??‰é??€
    const dbBtns = document.getElementById('mary-double-btns');
    if (dbBtns) {
        dbBtns.classList.add('hidden');
        dbBtns.style.display = 'none';
    }
    document.getElementById('mary-double-result').classList.add('hidden');

    // ??ä¿®æ­£ F4ï¼šç”¨?—æ?è¿½è¹¤å¾Œç«¯?¯å¦?å?ï¼Œå¤±?—æ?ä¸ä»¥?ç«¯?ç?è¦†è?é»æ•¸
    let backendOk = false;
    try {
        const res = await apiSubmit({
            action: 'playSmallMary',
            userId: CasinoApp.user.userId,
            betPoints: 0,
            winPoints: win,
            symbol: '?˜ç?'
        });

        if (res && res.success) {
            targetPoints = res.points;
            maryState.monthlyGift = res.monthlyGift;
            backendOk = true;
        } else {
            showToast(`? ï? ?˜ç??Œæ­¥å¤±æ?ï¼?{res?.error || 'ä¼ºæ??¨ç„¡?æ?'}ï¼Œè??è©¦`, 3000);
        }
    } catch (e) {
        console.error(e);
        showToast('???˜ç??šè??°å¸¸ï¼Œè?ç¨å??è©¦', 3000);
    }

    // ?¥å?ç«¯å¤±?—ï??„å? doubleUpActive è®“ç©å®¶å¯ä»¥é?è©¦é???
    if (!backendOk) {
        maryState.doubleUpActive = true;
        maryState.winScore = win; // ?„å? winScore
        if (dbBtns) {
            dbBtns.classList.remove('hidden');
            dbBtns.style.display = 'flex';
        }
        document.getElementById('mary-btn-start').disabled = false;
        return;
    }

    // ???†æ•¸?•ç•«ç§»è?ï¼šä??‘é??•æ?æ±ºå?æ­¥é€²å¤§å°?
    // ??0 ???‹ä???1)ï¼?1-100 ???ä???10)ï¼?100 ???¾ä???100)
    let stepAmount;
    if (win <= 30) {
        stepAmount = 1;
    } else if (win <= 100) {
        stepAmount = 10;
    } else {
        stepAmount = 100;
    }
    const intervalMs = 40; // ?ºå??“é? 40msï¼ˆè?è¦ºæ??¢ä?ä¸æ?å»¶ï?
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
            maryState.points = targetPoints; // ?¡æ­£?æ­¸å¾Œç«¯æ­?¢º??
            maryState.isSpinning = false;
            maryState.doubleUpActive = false;
            maryClearBet(); // ???˜ç?å¾Œæ?ç©ºä?æ³¨ï?ä¸‹ä?å±€?€?æ–°?¼æ³¨
            updateMaryUI();
            showToast(`??å·²é???${win} ?†ï?`);
            document.getElementById('mary-btn-start').disabled = false;
        }
    }, intervalMs);
}

// ?Œæ?ï¼ˆå??Ÿé?çª—ç?ï¼?
function maryExchange() {
    if (maryState.isSpinning || maryState.doubleUpActive) return;

    const overlay = document.createElement('div');
    overlay.id = 'mary-exchange-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;';
    
    // Wrap in a card and add calculator style
    overlay.innerHTML = `
    <div style="background:linear-gradient(to bottom, #1a110a, #0d0905);border:2px solid #ffcc00;border-radius:16px;width:100%;max-width:320px;display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px;box-shadow:0 0 30px rgba(255,204,0,0.3);">
        <div style="font-size:16px;font-weight:900;color:#ffcc00;">?’± ?‰éœ¸??10:1 ?Œæ?</div>
        <div style="background:#111;border:1px solid #ff6600;border-radius:10px;padding:10px 16px;width:100%;text-align:center;">
            <div style="font-size:10px;color:#ff6600;margin-bottom:4px;letter-spacing:2px;">YOU HAVE</div>
            <div id="mary-exchange-slot-score" style="font-size:28px;font-weight:900;color:#fa0;font-family:monospace;" class="animate-pulse">è®€?–ä¸­...</div>
            <div style="font-size:10px;color:#888;">?‰éœ¸ç©å?</div>
        </div>
        <div style="color:#ccc;font-size:11px;text-align:center;">
            ?€å¤šå¯??<b id="mary-exchange-max-convert" style="color:#0f0;">---</b> é»å??ªè?é»æ•¸<br>
            <span style="color:#666;font-size:10px;">ï¼?0 ?‰éœ¸????1 å°ç‘ª?‰é?ï¼?/span>
        </div>
        <input id="mary-exchange-input" type="text" readonly placeholder="ç­‰å€™è???.."
            style="width:100%;background:rgba(255,255,255,0.08);border:1px solid #fa0;border-radius:10px;
            padding:10px;color:#fa0;text-align:center;font-size:18px;font-weight:900;font-family:monospace;
            outline:none;" disabled>
        <div style="font-size:10px;color:#555;">è«‹é??Šä??¹æ•¸å­?(?€??10 ?„å€æ•¸)</div>
        
        <!-- ?§å»ºè¨ˆç?æ©Ÿéµ??-->
        <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;width:100%;">
            <button onclick="maryExchangeAddNum(1)" class="mary-key">1</button>
            <button onclick="maryExchangeAddNum(2)" class="mary-key">2</button>
            <button onclick="maryExchangeAddNum(3)" class="mary-key">3</button>
            <button onclick="maryExchangeAddNum(4)" class="mary-key">4</button>
            <button onclick="maryExchangeAddNum(5)" class="mary-key">5</button>
            <button onclick="maryExchangeAddNum(6)" class="mary-key">6</button>
            <button onclick="maryExchangeAddNum(7)" class="mary-key">7</button>
            <button onclick="maryExchangeAddNum(8)" class="mary-key">8</button>
            <button onclick="maryExchangeAddNum(9)" class="mary-key">9</button>
            <button onclick="maryExchangeAddNum('C')" class="mary-key" style="background:rgba(255,50,50,0.15);color:#ff6666;border-color:rgba(255,50,50,0.3);">æ¸…é™¤</button>
            <button onclick="maryExchangeAddNum(0)" class="mary-key">0</button>
            <button onclick="maryExchangeAddNum('MAX')" class="mary-key" style="background:rgba(50,255,50,0.15);color:#66ff66;font-size:12px;border-color:rgba(50,255,50,0.3);">MAX</button>
        </div>
        <style>
            .mary-key {
                background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
                color: #fff; font-size: 16px; font-weight: bold; border-radius: 8px; padding: 10px 0;
                cursor: pointer; transition: 0.1s; user-select: none;
            }
            .mary-key:active { background: rgba(255,255,255,0.2); transform: scale(0.95); }
        </style>

        <div style="display:flex;gap:10px;width:100%;margin-top:4px;">
            <button onclick="document.getElementById('mary-exchange-overlay').remove()"
                style="flex:1;padding:12px;background:rgba(255,255,255,0.1);border:none;border-radius:10px;
                color:#ccc;font-weight:700;font-size:14px;cursor:pointer;">?–æ?</button>
            <button id="mary-exchange-btn-confirm" onclick="maryConfirmExchange()" disabled
                style="flex:1;padding:12px;background:linear-gradient(135deg,#663300,#995500);
                border:none;border-radius:10px;color:#ccc;font-weight:900;font-size:14px;cursor:not-allowed;
                box-shadow:none;transition:all 0.3s;">ç¢ºè??Œæ?</button>
        </div>
    </div>
    `;
    document.body.appendChild(overlay);

    // ?Œæ™¯è®€?–å???
    if(!CasinoApp || !CasinoApp.user) { alert('è«‹ç?å¾Œï?ç³»çµ±å°šæœª?å???); return; }
    fetch(`${GAS_URL}?action=getSmallMaryData&userId=${CasinoApp.user.userId}&_=${Date.now()}`)
        .then(r => r.json())
        .then(d => {
            const actualData = d.data || d;
            const slotScore = actualData.Points !== undefined ? actualData.Points : (actualData.points !== undefined ? actualData.points : (actualData['?†æ•¸'] !== undefined ? actualData['?†æ•¸'] : (actualData.slotScore || 0)));
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
                inputEl.placeholder = "è«‹é??Šä??¹æ•¸å­?;
                inputEl.max = maxConvert; // ??ä¿®æ­£ F1ï¼šä??æ”¹?ºå¯?Œæ??„æ•´?¸æ?å¤§å€?
                if (maxConvert > 0) {
                    inputEl.value = ""; // ?è¨­?™ç©ºè®“ç©å®¶æ?
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
                    btnEl.innerText = "?†æ•¸ä¸è¶³";
                }
            }
        })
        .catch(e => {
            const scoreEl = document.getElementById('mary-exchange-slot-score');
            if (scoreEl) {
                scoreEl.classList.remove('animate-pulse');
                scoreEl.innerText = 'è®€?–å¤±??;
                scoreEl.style.color = 'red';
            }
        });
}

function openMaryHelp() {
    const el = document.getElementById('mary-help-overlay');
    if (el) el.classList.remove('hidden');
}

// ?¯æ´è¨ˆç?æ©Ÿç??‰éµ?½å?
window.maryExchangeAddNum = function(val) {
    const input = document.getElementById('mary-exchange-input');
    if (!input) return;
    const maxValStr = document.getElementById('mary-exchange-max-convert')?.innerText;
    const maxVal = parseInt(maxValStr?.replace(/,/g, '')) * 10 || 0; // ä¸Šé??¯æ??¸ç???

    if (val === 'C') {
        input.value = "";
    } else if (val === 'MAX') {
        input.value = maxVal;
    } else {
        let currentVal = input.value || "";
        let newValStr = currentVal + val;
        let newVal = parseInt(newValStr);
        if (newVal > maxVal) newVal = maxVal;
        input.value = newVal;
    }
    
    // Check if confirm button should be enabled
    const btnConfirm = document.getElementById('mary-exchange-btn-confirm');
    if (btnConfirm) {
        let checkVal = parseInt(input.value) || 0;
        if (checkVal >= 10 && checkVal <= maxVal) {
            btnConfirm.disabled = false;
            btnConfirm.style.background = 'linear-gradient(135deg,#cc6600,#ffaa00)';
            btnConfirm.style.color = '#000';
            btnConfirm.style.cursor = 'pointer';
            btnConfirm.style.boxShadow = '0 0 15px rgba(255,150,0,0.4)';
            btnConfirm.innerText = "ç¢ºè??Œæ?";
        } else {
            btnConfirm.disabled = true;
            btnConfirm.style.background = 'linear-gradient(135deg,#663300,#995500)';
            btnConfirm.style.color = '#ccc';
            btnConfirm.style.cursor = 'not-allowed';
            btnConfirm.style.boxShadow = 'none';
            btnConfirm.innerText = "?†æ•¸ä¸è¶³";
        }
    }
};

async function maryConfirmExchange() {
    const input = document.getElementById('mary-exchange-input');
    const val = parseInt(input ? input.value : 0);
    if (!val || isNaN(val) || val < 10) return showToast('è«‹è¼¸?¥å?æ³•ç??†æ•¸ï¼ˆæ?å°?10ï¼?);
    const roundedVal = Math.floor(val / 10) * 10;

    // ???ªå?ï¼šå?? å?ç«¯é?é¡åˆ¤?·é˜²??
    const maxConvertStr = document.getElementById('mary-exchange-max-convert')?.innerText;
    const maxConvert = parseInt(maxConvertStr?.replace(/,/g, '')) || 0;
    if (roundedVal > (maxConvert * 10)) return showToast('?Œæ?é»æ•¸è¶…é??¯ç”¨é¤˜é?');

    const overlay = document.getElementById('mary-exchange-overlay');
    if (overlay) {
        overlay.innerHTML = `<div class="flex flex-col items-center gap-4"><div class="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div><div class="text-amber-500 font-bold">æ­?œ¨?•ç??Œæ?...</div></div>`;
    }

    try {
        const res = await apiSubmit({
            action: 'exchangeSlotToMary',
            userId: CasinoApp.user.userId,
            name: CasinoApp.user.displayName,
            exchangeScore: roundedVal
        });
        if (overlay) overlay.remove();
        if (res && res.success) {
            const addedChips = res.addedPoints !== undefined ? res.addedPoints : (roundedVal / 10);
            showToast(`???å??Œæ? ${addedChips} ?‹ç?ç¢¼`);
            maryState.points += addedChips;
            if (typeof CasinoApp !== 'undefined') {
                CasinoApp.points += addedChips;
                document.querySelectorAll('.player-wallet-text').forEach(el => el.innerText = CasinoApp.points.toLocaleString());
            }
            updateMaryUI();
        } else {
            showToast(res ? (res.error || '?Œæ?å¤±æ?ï¼Œè?ç¢ºè??‰éœ¸?†æ•¸?¯å¦å°šå?è¶?) : 'ä¼ºæ??¨ç„¡?æ?');
        }
    } catch (e) {
        if (overlay) overlay.remove();
        console.error(e);
        showToast('???¼ç??°å¸¸?¯èª¤ï¼Œè?ç¨å??è©¦');
    }
}

/** HTML è·³è„«ï¼šé˜²æ­¢ä½¿?¨è€…è¼¸?¥ç? XSS ?»æ? */

