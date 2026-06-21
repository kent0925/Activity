const GAS_URL = "https://script.google.com/macros/s/AKfycbzTiALv2VOAvtuUgFx623KQgkvlmkkEc-bSgFQXiLqcxWpi9FvSrSxkSibjdRwO7tVn/exec";
const LIFF_ID = "2008678090-aXTesgDK";
const ADMIN_USER_IDS = ["U612df670c4d7d3cde0d599ab5008451f"];

const CasinoApp = {
    user: null,
    points: 0,
    currentChip: 10, // 預設 10
    
    // Roulette
    rouletteBets: {}, // { "num_8": 20, "red": 50, ... }
    
    async init() {
        try {
            await liff.init({ liffId: LIFF_ID });
            if (!liff.isLoggedIn()) {
                liff.login();
                return;
            }
            const profile = await liff.getProfile();
            this.user = {
                userId: profile.userId,
                displayName: profile.displayName
            };
            
            // 安全性檢查
            if (!ADMIN_USER_IDS.includes(this.user.userId)) {
                alert("您沒有權限進入測試大廳");
                window.location.href = 'index.html';
                return;
            }

            await this.fetchPoints();
            this.initRouletteBoard();
            
            // 預設選取籌碼 10
            this.selectChip(10);
            
            // 關閉 Loading
            document.getElementById('loading-overlay').style.opacity = '0';
            setTimeout(() => document.getElementById('loading-overlay').classList.add('hidden'), 300);

        } catch (e) {
            console.error("Casino Init Error:", e);
            alert("初始化失敗");
        }
    },

    async fetchPoints() {
        try {
            const res = await fetch(`${GAS_URL}?action=getSmallMaryData&userId=${this.user.userId}&name=${encodeURIComponent(this.user.displayName)}&_=${Date.now()}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            this.points = data.points + data.monthlyGift;
            
            // 管理員給予無限測試點數
            this.points = 999999; 
            
            document.getElementById('player-wallet').innerText = this.points.toLocaleString();
        } catch (e) {
            console.error(e);
            document.getElementById('player-wallet').innerText = "ERROR";
        }
    },

    openGame(gameType) {
        document.getElementById('view-lobby').classList.add('hidden');
        document.getElementById('view-mary').classList.add('hidden');
        document.getElementById('view-roulette').classList.add('hidden');
        document.getElementById('view-sicbo').classList.add('hidden');
        
        document.getElementById(`view-${gameType}`).classList.remove('hidden');
        
        // 顯示底部籌碼列
        document.getElementById('casino-footer').classList.remove('translate-y-full');
    },

    backToLobby() {
        document.getElementById('view-lobby').classList.remove('hidden');
        document.getElementById('view-mary').classList.add('hidden');
        document.getElementById('view-roulette').classList.add('hidden');
        document.getElementById('view-sicbo').classList.add('hidden');
        
        // 隱藏底部籌碼列
        document.getElementById('casino-footer').classList.add('translate-y-full');
    },

    selectChip(val) {
        this.currentChip = val;
        document.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('selected'));
        const targetBtn = document.querySelector(`.chip-btn[data-value="${val}"]`);
        if (targetBtn) targetBtn.classList.add('selected');
    },

    // ==========================================
    // ROULETTE LOGIC
    // ==========================================
    initRouletteBoard() {
        const board = document.getElementById('roulette-board');
        board.innerHTML = '';
        
        // 經典輪盤配置 (3欄 12列，左邊放0)
        // 使用 CSS Grid 比較好排版
        // 這裡建立一個簡單版網格
        
        // 0 (跨 3 rows)
        const zeroCell = document.createElement('div');
        zeroCell.className = 'roulette-cell cell-green row-span-3 rounded-l-md';
        zeroCell.innerText = '0';
        zeroCell.onclick = () => this.placeRouletteBet('0', zeroCell);
        board.appendChild(zeroCell);
        
        // 數字 1-36 的容器 (Grid 12 col x 3 row)
        const numbersGrid = document.createElement('div');
        numbersGrid.className = 'grid grid-cols-12 grid-rows-3 gap-[1px]';
        
        // 輪盤數字排版順序（從左至右，由下至上：1,4,7... 在最下面）
        // Row 1 (Top): 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36
        // Row 2 (Mid): 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35
        // Row 3 (Bot): 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34
        const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
        
        const topRow = [3,6,9,12,15,18,21,24,27,30,33,36];
        const midRow = [2,5,8,11,14,17,20,23,26,29,32,35];
        const botRow = [1,4,7,10,13,16,19,22,25,28,31,34];
        
        [topRow, midRow, botRow].forEach(row => {
            row.forEach(num => {
                const cell = document.createElement('div');
                const isRed = reds.includes(num);
                cell.className = `roulette-cell ${isRed ? 'cell-red' : 'cell-black'}`;
                cell.innerText = num;
                cell.onclick = () => this.placeRouletteBet(`num_${num}`, cell);
                numbersGrid.appendChild(cell);
            });
        });
        
        board.appendChild(numbersGrid);
        
        // 外部押注區 (Outside Bets) - 放下面
        const outsideContainer = document.createElement('div');
        outsideContainer.className = 'col-span-2 grid grid-cols-3 gap-[1px] mt-[1px]';
        
        const dozens = [
            { id: '1st12', label: '1st 12' },
            { id: '2nd12', label: '2nd 12' },
            { id: '3rd12', label: '3rd 12' }
        ];
        dozens.forEach(d => {
            const el = document.createElement('div');
            el.className = 'roulette-cell cell-trans';
            el.innerText = d.label;
            el.onclick = () => this.placeRouletteBet(d.id, el);
            outsideContainer.appendChild(el);
        });
        
        const evenOdds = [
            { id: '1to18', label: '1 to 18' },
            { id: 'even', label: 'EVEN' },
            { id: 'red', label: 'RED', cls: 'text-red-500' },
            { id: 'black', label: 'BLACK', cls: 'text-gray-900' },
            { id: 'odd', label: 'ODD' },
            { id: '19to36', label: '19 to 36' }
        ];
        
        const evenContainer = document.createElement('div');
        evenContainer.className = 'col-span-2 grid grid-cols-6 gap-[1px] mt-[1px]';
        evenOdds.forEach(e => {
            const el = document.createElement('div');
            el.className = 'roulette-cell cell-trans';
            if (e.cls) {
                el.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-white ${e.cls}">${e.label}</div>`;
            } else {
                el.innerText = e.label;
            }
            el.onclick = () => this.placeRouletteBet(e.id, el);
            evenContainer.appendChild(el);
        });
        
        board.parentNode.appendChild(outsideContainer);
        board.parentNode.appendChild(evenContainer);
    },

    placeRouletteBet(betId, cellElement) {
        if (this.points < this.currentChip) {
            alert("積分不足！");
            return;
        }
        
        // 扣款
        this.points -= this.currentChip;
        document.getElementById('player-wallet').innerText = this.points.toLocaleString();
        
        // 記錄注碼
        this.rouletteBets[betId] = (this.rouletteBets[betId] || 0) + this.currentChip;
        
        // 顯示在畫面上 (尋找是否已經有籌碼元素，沒有則建立)
        let chipEl = cellElement.querySelector('.placed-chip');
        if (!chipEl) {
            chipEl = document.createElement('div');
            chipEl.className = 'placed-chip';
            cellElement.appendChild(chipEl);
        }
        // 更新顯示金額 (如果超過 1k 用 1k 顯示)
        let displayVal = this.rouletteBets[betId];
        if (displayVal >= 1000) displayVal = (displayVal/1000).toFixed(1) + 'k';
        chipEl.innerText = displayVal;
    }
};

// 啟動
document.addEventListener('DOMContentLoaded', () => {
    CasinoApp.init();
});
