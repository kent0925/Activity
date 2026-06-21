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
            this.drawRouletteWheel();
            
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
    drawRouletteWheel() {
        const wheel = document.getElementById('roulette-wheel');
        wheel.innerHTML = '';
        
        // 美式輪盤順序 (0, 00 與 1-36)
        const sequence = ['0','28','9','26','30','11','7','20','32','17','5','22','34','15','3','24','36','13','1','00','27','10','25','29','12','8','19','31','18','6','21','33','16','4','23','35','14','2'];
        const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
        const anglePerSlice = 360 / 38;
        
        // 繪製背景 (Conic Gradient)
        let gradientParts = [];
        for (let i = 0; i < 38; i++) {
            const numStr = sequence[i];
            const num = parseInt(numStr);
            let color = '#111827'; // Black
            if (numStr === '0' || numStr === '00') color = '#16a34a'; // Green
            else if (reds.includes(num)) color = '#dc2626'; // Red
            
            // 使用小數點以防出現接縫
            gradientParts.push(`${color} ${(i * anglePerSlice).toFixed(2)}deg ${((i + 1) * anglePerSlice).toFixed(2)}deg`);
        }
        
        // 將起始角度微調半個 slice，讓數字落在扇形正中央
        wheel.style.background = `conic-gradient(from ${-(anglePerSlice / 2)}deg, ${gradientParts.join(', ')})`;
        
        // 放置數字
        for (let i = 0; i < 38; i++) {
            const numStr = sequence[i];
            const angle = i * anglePerSlice;
            const numEl = document.createElement('div');
            // 設定為絕對定位，並將變形原點設在中心，文字放在最上方邊緣
            numEl.className = 'absolute top-0 left-0 w-full h-full pointer-events-none flex justify-center text-white font-black text-sm drop-shadow-md';
            numEl.style.transform = `rotate(${angle}deg)`;
            numEl.innerHTML = `<span style="padding-top: 6px;">${numStr}</span>`;
            wheel.appendChild(numEl);
        }
    },

    initRouletteBoard() {
        const board = document.getElementById('roulette-board');
        board.innerHTML = '';
        
        // 美式輪盤配置 (3欄 12列，左邊放 0 和 00)
        
        // 0 與 00 的容器 (跨 3 rows)
        const zeroContainer = document.createElement('div');
        zeroContainer.className = 'grid grid-rows-2 gap-[1px] row-span-3 h-full';
        
        const zeroCell = document.createElement('div');
        zeroCell.className = 'roulette-cell cell-green rounded-tl-md flex flex-col justify-center';
        zeroCell.innerHTML = '<span>0</span>';
        zeroCell.onclick = () => this.placeRouletteBet('0', zeroCell);
        
        const doubleZeroCell = document.createElement('div');
        doubleZeroCell.className = 'roulette-cell cell-green rounded-bl-md flex flex-col justify-center';
        doubleZeroCell.innerHTML = '<span>00</span>';
        doubleZeroCell.onclick = () => this.placeRouletteBet('00', doubleZeroCell);
        
        zeroContainer.appendChild(zeroCell);
        zeroContainer.appendChild(doubleZeroCell);
        board.appendChild(zeroContainer);
        
        // 數字 1-36 與橫列(Columns) 的容器 (Grid 13 col x 3 row)
        // 多出 1 col 給 "2 to 1" (Column bets)
        const numbersGrid = document.createElement('div');
        numbersGrid.className = 'grid grid-cols-[repeat(12,minmax(0,1fr))_auto] grid-rows-3 gap-[1px] relative';
        
        const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
        const topRow = [3,6,9,12,15,18,21,24,27,30,33,36];
        const midRow = [2,5,8,11,14,17,20,23,26,29,32,35];
        const botRow = [1,4,7,10,13,16,19,22,25,28,31,34];
        
        [topRow, midRow, botRow].forEach((row, rowIndex) => {
            row.forEach((num, colIndex) => {
                const cell = document.createElement('div');
                const isRed = reds.includes(num);
                cell.className = `roulette-cell ${isRed ? 'cell-red' : 'cell-black'} relative`;
                cell.innerHTML = `<span>${num}</span>`;
                // 直接點擊本體為單一數字
                cell.onclick = (e) => {
                    // 避免點擊到邊界 target 時觸發單一數字
                    if(e.target === cell || e.target.tagName === 'SPAN') {
                        this.placeRouletteBet(`num_${num}`, cell);
                    }
                };

                // 加入 Split 與 Corner 感應區 (除最後一行/列外)
                if (colIndex < 11) {
                    // Vertical Split (左右號碼)
                    const vSplit = document.createElement('div');
                    vSplit.className = 'touch-target-v';
                    vSplit.onclick = (e) => { e.stopPropagation(); this.placeRouletteBet(`split_${num}_${num+3}`, vSplit); };
                    cell.appendChild(vSplit);
                }
                if (rowIndex < 2) {
                    // Horizontal Split (上下號碼)
                    const hSplit = document.createElement('div');
                    hSplit.className = 'touch-target-h';
                    hSplit.onclick = (e) => { e.stopPropagation(); this.placeRouletteBet(`split_${num}_${num-1}`, hSplit); };
                    cell.appendChild(hSplit);
                }
                if (colIndex < 11 && rowIndex < 2) {
                    // Corner (四角號碼)
                    const corner = document.createElement('div');
                    corner.className = 'touch-target-c';
                    corner.onclick = (e) => { e.stopPropagation(); this.placeRouletteBet(`corner_${num}_${num-1}_${num+3}_${num+2}`, corner); };
                    cell.appendChild(corner);
                }

                numbersGrid.appendChild(cell);
            });
            
            // 該 row 最後加上 2 to 1 (Column bet)
            const colBet = document.createElement('div');
            colBet.className = 'roulette-cell cell-trans text-[10px] px-1';
            colBet.innerText = '2 to 1';
            const colId = rowIndex === 0 ? 'col3' : (rowIndex === 1 ? 'col2' : 'col1');
            colBet.onclick = () => this.placeRouletteBet(colId, colBet);
            numbersGrid.appendChild(colBet);
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
