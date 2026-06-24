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

// API Submit helper function for Mary logic
async function apiSubmit(data) {
    if (typeof GAS_URL === 'undefined' || !GAS_URL) {
        console.error("No GAS URL defined");
        return { error: "No GAS URL" };
    }

    // 管理員無限點數防護：阻擋管理員寫入後端，保護彩池與真實數據
    if (typeof CasinoApp !== 'undefined' && CasinoApp.user && typeof ADMIN_USER_IDS !== 'undefined' && ADMIN_USER_IDS.includes(CasinoApp.user.userId)) {

        const winPts = data.winPoints || 0;
        return {
            success: true,
            points: 999999,
            monthlyGift: 999999,
            totalMaryScore: (maryState.totalMaryScore || 0) + winPts,
            jackpotPool: maryState.jackpotPool || 0 // 保持原狀，不動彩池
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
    if (!CasinoApp.user || !CasinoApp.user.userId) return showToast("請先登入 LINE");
    // 在 Casino 大廳中，直接由 CasinoApp.openGame('mary') 處理
    // 此函式保留相容性，但主要邏輯已整合進 openGame
    initMaryBoard();
    initMaryBetPanel();
    await refreshMaryData();
}

function adjustMaryScale() {
    const machine = document.getElementById('mary-machine');
    const maryView = document.getElementById('view-mary');
    if (!machine || !maryView || maryView.classList.contains('hidden')) return;

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
    CasinoApp.backToLobby();
}

// openMaryHelp 定義於下方（第 2713 行），此處不重複定義

async function refreshMaryData() {
    try {
        const res = await fetch(`${GAS_URL}?action=getSmallMaryData&userId=${CasinoApp.user.userId}&name=${encodeURIComponent(CasinoApp.user.displayName)}&_=${Date.now()}`);
        const data = await res.json();
        if (data.error) return showToast(data.error);

        maryState.points = data.points;
        maryState.monthlyGift = data.monthlyGift;
        maryState.totalMaryScore = (data.MaryScore !== undefined ? data.MaryScore : data.totalMaryScore);
        maryState.jackpotPool = data.jackpotPool;

        // 管理員無限點數保護
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
            <div id="mary-bet-val-${conf.id}" class="w-full bg-black text-[#ff6666] font-mono text-[10px] font-black text-center border border-[#333] rounded-sm py-0.5 shadow-[inset_0_0_5px_rgba(255,100,100,0.5)]">0</div>
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
            if (window.CasinoAudio) window.CasinoAudio.playMary();

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
                userId: CasinoApp.user.userId,
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
                    userId: CasinoApp.user.userId,
                    name: CasinoApp.user.displayName // ★ BUG 3 修正：應為 displayName，非 name
                });
                if (res.success) {
                    // ★ 修正 F3：claimSmallMaryJackpot 後端已記帳完畢（內部呼叫 playSmallMary）
                    // 直接更新前端狀態，不再呼叫 maryCollect()（避免再次送 playSmallMary 導致彩金雙重記入）
                    maryState.winScore += res.jackpotWon; // 加上彩金用於前端動畫
                    showToast(`🎰 狂賀！獨得彩池 ${res.jackpotWon} 分！總合 ${maryState.winScore} 分！`, 5000);

                    // 直接更新後端回傳的正確點數
                    if (res.points !== undefined) maryState.points = res.points;
                    if (res.monthlyGift !== undefined) maryState.monthlyGift = res.monthlyGift;
                    if ((res.MaryScore !== undefined ? res.MaryScore : res.totalMaryScore) !== undefined) maryState.totalMaryScore = (res.MaryScore !== undefined ? res.MaryScore : res.totalMaryScore);
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
                userId: CasinoApp.user.userId,
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
                    userId: CasinoApp.user.userId,
                    name: CasinoApp.user.displayName // ★ BUG 3 修正：應為 displayName，非 name
                });
                if (res.success) {
                    // ★ 修正 F3：claimSmallMaryJackpot 後端已記帳完畢（內部呼叫 playSmallMary）
                    // 直接更新前端狀態，不再呼叫 maryCollect()（避免再次送 playSmallMary 導致彩金雙重記入）
                    maryState.winScore += res.jackpotWon; // 加上彩金用於前端動畫
                    showToast(`🎰 狂賀！獨得彩池 ${res.jackpotWon} 分！總合 ${maryState.winScore} 分！`, 5000);

                    // 直接更新後端回傳的正確點數
                    if (res.points !== undefined) maryState.points = res.points;
                    if (res.monthlyGift !== undefined) maryState.monthlyGift = res.monthlyGift;
                    if ((res.MaryScore !== undefined ? res.MaryScore : res.totalMaryScore) !== undefined) maryState.totalMaryScore = (res.MaryScore !== undefined ? res.MaryScore : res.totalMaryScore);
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
            userId: CasinoApp.user.userId,
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
            if(window.CasinoAudio) window.CasinoAudio.playWin();
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
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;';
    
    // Wrap in a card and add calculator style
    overlay.innerHTML = `
    <div style="background:linear-gradient(to bottom, #1a110a, #0d0905);border:2px solid #ffcc00;border-radius:16px;width:100%;max-width:320px;display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px;box-shadow:0 0 30px rgba(255,204,0,0.3);">
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
        <input id="mary-exchange-input" type="text" readonly placeholder="等候讀取..."
            style="width:100%;background:rgba(255,255,255,0.08);border:1px solid #fa0;border-radius:10px;
            padding:10px;color:#fa0;text-align:center;font-size:18px;font-weight:900;font-family:monospace;
            outline:none;" disabled>
        <div style="font-size:10px;color:#555;">請點擊下方數字 (需為 10 的倍數)</div>
        
        <!-- 內建計算機鍵盤 -->
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
            <button onclick="maryExchangeAddNum('C')" class="mary-key" style="background:rgba(255,50,50,0.15);color:#ff6666;border-color:rgba(255,50,50,0.3);">清除</button>
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
                color:#ccc;font-weight:700;font-size:14px;cursor:pointer;">取消</button>
            <button id="mary-exchange-btn-confirm" onclick="maryConfirmExchange()" disabled
                style="flex:1;padding:12px;background:linear-gradient(135deg,#663300,#995500);
                border:none;border-radius:10px;color:#ccc;font-weight:900;font-size:14px;cursor:not-allowed;
                box-shadow:none;transition:all 0.3s;">確認兌換</button>
        </div>
    </div>
    `;
    document.body.appendChild(overlay);

    // 背景讀取分數
    if(!CasinoApp || !CasinoApp.user) { alert('請稍後，系統尚未初始化'); return; }
    fetch(`${GAS_URL}?action=getSmallMaryData&userId=${CasinoApp.user.userId}&_=${Date.now()}`)
        .then(r => r.json())
        .then(d => {
            const actualData = d.data || d;
            const slotScore = actualData.Points !== undefined ? actualData.Points : (actualData.points !== undefined ? actualData.points : (actualData['分數'] !== undefined ? actualData['分數'] : (actualData.slotScore || 0)));
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
                inputEl.placeholder = "請點擊下方數字";
                inputEl.max = maxConvert; // ★ 修正 F1：上限改為可兌換的整數最大值
                if (maxConvert > 0) {
                    inputEl.value = ""; // 預設留空讓玩家按
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

// 支援計算機的按鍵函式
window.maryExchangeAddNum = function(val) {
    const input = document.getElementById('mary-exchange-input');
    if (!input) return;
    const maxValStr = document.getElementById('mary-exchange-max-convert')?.innerText;
    const maxVal = parseInt(maxValStr?.replace(/,/g, '')) * 10 || 0; // 上限是拉霸積分

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
            btnConfirm.innerText = "確認兌換";
        } else {
            btnConfirm.disabled = true;
            btnConfirm.style.background = 'linear-gradient(135deg,#663300,#995500)';
            btnConfirm.style.color = '#ccc';
            btnConfirm.style.cursor = 'not-allowed';
            btnConfirm.style.boxShadow = 'none';
            btnConfirm.innerText = "分數不足";
        }
    }
};

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
            userId: CasinoApp.user.userId,
            name: CasinoApp.user.displayName,
            exchangeScore: roundedVal
        });
        if (overlay) overlay.remove();
        if (res && res.success) {
            const addedChips = res.addedPoints !== undefined ? res.addedPoints : (roundedVal / 10);
            showToast(`✅ 成功兌換 ${addedChips} 個籌碼`);
            maryState.points += addedChips;
            if (typeof CasinoApp !== 'undefined') {
                CasinoApp.points += addedChips;
                document.querySelectorAll('.player-wallet-text').forEach(el => el.innerText = CasinoApp.points.toLocaleString());
            }
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
