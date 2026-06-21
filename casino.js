const GAS_URL = "https://script.google.com/macros/s/AKfycbzTiALv2VOAvtuUgFx623KQgkvlmkkEc-bSgFQXiLqcxWpi9FvSrSxkSibjdRwO7tVn/exec";
const LIFF_ID = "2008678090-aXTesgDK";
const ADMIN_USER_IDS = ["U612df670c4d7d3cde0d599ab5008451f"];

const CasinoApp = {
    user: null,
    points: 0,
    currentChip: 10, // 預設 10
    
    // Roulette
    rouletteBets: {}, // { "num_8": 20, "red": 50, ... }
    
    // Sic Bo
    sicboBets: {},
    
    currentView: 'lobby',
    
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
            this.initSicboBoard();
            
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
        this.currentView = gameType;
        
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
        this.currentView = 'lobby';
    },

    handleSpin() {
        if (this.currentView === 'roulette') {
            this.spinRoulette();
        } else if (this.currentView === 'sicbo') {
            this.spinSicbo();
        }
    },

    handleClear() {
        if (this.currentView === 'roulette') {
            this.clearBets();
        } else if (this.currentView === 'sicbo') {
            this.clearSicboBets();
        }
    },

    selectChip(val) {
        this.currentChip = val;
        document.querySelectorAll('.chip-selector').forEach(el => el.classList.remove('chip-selected'));
        const el = document.querySelector(`.chip-selector[data-val="${val}"]`);
        if (el) el.classList.add('chip-selected');
    },

    showAlert(title, message, isWin = false) {
        const modal = document.getElementById('custom-modal');
        const backdrop = document.getElementById('custom-modal-backdrop');
        const content = document.getElementById('custom-modal-content');
        const titleEl = document.getElementById('custom-modal-title');
        const msgEl = document.getElementById('custom-modal-message');
        const glowEl = document.getElementById('custom-modal-glow');

        titleEl.innerHTML = title;
        msgEl.innerHTML = message.replace(/\n/g, '<br>');

        if (isWin) {
            titleEl.className = 'text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#D4AF37] to-[#FFF0A0] mb-2 relative z-10 drop-shadow-md';
            glowEl.className = 'absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-yellow-500/40 blur-3xl rounded-full';
        } else {
            titleEl.className = 'text-xl font-bold text-gray-300 mb-2 relative z-10';
            glowEl.className = 'absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-gray-500/10 blur-3xl rounded-full';
        }

        modal.classList.remove('hidden');
        // Trigger reflow
        void modal.offsetWidth;
        
        backdrop.classList.remove('opacity-0');
        content.classList.remove('scale-90', 'opacity-0');
    },

    closeModal() {
        const backdrop = document.getElementById('custom-modal-backdrop');
        const content = document.getElementById('custom-modal-content');
        
        backdrop.classList.add('opacity-0');
        content.classList.add('scale-90', 'opacity-0');
        
        setTimeout(() => {
            document.getElementById('custom-modal').classList.add('hidden');
        }, 300);
    },

    showTicker(message, type = 'win') {
        const ticker = document.getElementById('casino-ticker');
        const textEl = document.getElementById('casino-ticker-text');
        const innerEl = document.getElementById('casino-ticker-inner');
        const glowEl = document.getElementById('casino-ticker-glow');

        textEl.innerHTML = message;
        
        if (type === 'win') {
            innerEl.className = 'bg-gradient-to-r from-yellow-900/90 to-gray-900 border-l-4 border-yellow-400 rounded-lg shadow-xl p-3 flex items-center justify-between backdrop-blur-md relative overflow-hidden';
            textEl.className = 'text-sm font-bold text-yellow-300 tracking-wider relative z-10 w-full text-center drop-shadow-md';
            glowEl.className = 'absolute top-0 left-0 w-full h-full bg-yellow-400/20 opacity-100 transition-opacity duration-300 animate-pulse';
        } else {
            innerEl.className = 'bg-gradient-to-r from-gray-800/90 to-gray-900 border-l-4 border-gray-500 rounded-lg shadow-xl p-3 flex items-center justify-between backdrop-blur-md relative overflow-hidden';
            textEl.className = 'text-sm font-bold text-gray-300 tracking-wider relative z-10 w-full text-center';
            glowEl.className = 'absolute top-0 left-0 w-full h-full bg-transparent opacity-0 transition-opacity duration-300';
        }

        ticker.classList.remove('-translate-y-[150%]', 'opacity-0');
        
        if (this.tickerTimeout) clearTimeout(this.tickerTimeout);
        this.tickerTimeout = setTimeout(() => {
            ticker.classList.add('-translate-y-[150%]', 'opacity-0');
        }, 4000);
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
        zeroCell.id = 'roulette-cell-0';
        zeroCell.innerHTML = '<span>0</span>';
        zeroCell.onclick = () => this.placeRouletteBet('0', zeroCell);
        
        const doubleZeroCell = document.createElement('div');
        doubleZeroCell.className = 'roulette-cell cell-green rounded-bl-md flex flex-col justify-center';
        doubleZeroCell.id = 'roulette-cell-00';
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
                cell.id = 'roulette-cell-' + num;
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
        
        // 外部押注區 (Outside Bets) - 放下面，直接加在 numbersGrid 裡以完美對齊 12 欄
        const dozens = [
            { id: '1st12', label: '1st 12' },
            { id: '2nd12', label: '2nd 12' },
            { id: '3rd12', label: '3rd 12' }
        ];
        dozens.forEach(d => {
            const el = document.createElement('div');
            el.className = 'roulette-cell cell-trans col-span-4 mt-[1px]'; // 跨 4 欄
            el.innerText = d.label;
            el.onclick = () => this.placeRouletteBet(d.id, el);
            numbersGrid.appendChild(el);
        });
        // 補上最後一格空白 (2 to 1 的正下方)
        const emptyDozen = document.createElement('div');
        emptyDozen.className = 'mt-[1px]';
        numbersGrid.appendChild(emptyDozen);
        
        const evenOdds = [
            { id: '1to18', label: '1 to 18' },
            { id: 'even', label: 'EVEN' },
            { id: 'red', label: 'RED', cls: 'text-red-500' },
            { id: 'black', label: 'BLACK', cls: 'text-gray-900' },
            { id: 'odd', label: 'ODD' },
            { id: '19to36', label: '19 to 36' }
        ];
        
        evenOdds.forEach(e => {
            const el = document.createElement('div');
            el.className = 'roulette-cell cell-trans col-span-2 mt-[1px] text-[10px] sm:text-xs'; // 跨 2 欄
            if (e.cls) {
                el.innerHTML = `<div class="w-full h-full flex items-center justify-center bg-white/90 ${e.cls} rounded">${e.label}</div>`;
            } else {
                el.innerText = e.label;
            }
            el.onclick = () => this.placeRouletteBet(e.id, el);
            numbersGrid.appendChild(el);
        });
        // 補上最後一格空白 (2 to 1 的正下方)
        const emptyEven = document.createElement('div');
        emptyEven.className = 'mt-[1px]';
        numbersGrid.appendChild(emptyEven);
        
        board.appendChild(numbersGrid);
    },

    placeRouletteBet(betId, cellElement) {
        if (this.isSpinning) {
            this.showTicker("遊戲進行中", "開獎期間無法下注喔！");
            return;
        }
        if (this.points < this.currentChip) {
            this.showAlert("積分不足", "您的餘額不足以進行下注！");
            return;
        }
        
        // 點擊回饋特效
        cellElement.classList.add('scale-95', 'opacity-80', 'transition-all');
        setTimeout(() => cellElement.classList.remove('scale-95', 'opacity-80'), 150);
        
        // 扣款
        this.points -= this.currentChip;
        document.getElementById('player-wallet').innerText = this.points.toLocaleString();
        
        // 記錄注碼
        this.rouletteBets[betId] = (this.rouletteBets[betId] || 0) + this.currentChip;
        
        // 顯示在畫面上
        let chipEl = cellElement.querySelector('.placed-chip');
        if (!chipEl) {
            chipEl = document.createElement('div');
            chipEl.className = 'placed-chip';
            cellElement.appendChild(chipEl);
        }
        let displayVal = this.rouletteBets[betId];
        if (displayVal >= 1000) displayVal = (displayVal/1000).toFixed(1) + 'k';
        chipEl.innerText = displayVal;
    },

    // ==========================================
    // SIC BO LOGIC
    // ==========================================
    initSicboBoard() {
        const board = document.getElementById('sicbo-board');
        board.innerHTML = '';

        const createRow = (colsClass) => {
            const row = document.createElement('div');
            row.className = `grid ${colsClass} gap-[1px]`;
            return row;
        };

        const createCell = (id, label, subLabel, row) => {
            const cell = document.createElement('div');
            cell.className = 'roulette-cell cell-trans flex flex-col justify-center items-center py-2 relative';
            cell.id = `sicbo-cell-${id}`;
            cell.innerHTML = `<div class="font-bold text-sm sm:text-base">${label}</div>
                              <div class="text-[8px] sm:text-[10px] text-red-300 opacity-80 mt-1">${subLabel}</div>`;
            cell.onclick = () => this.placeSicboBet(id, cell);
            row.appendChild(cell);
        };

        // Row 1: 小 / 全圍 / 大
        const row1 = createRow('grid-cols-[1fr_auto_1fr]');
        createCell('small', '小 SMALL', '4-10 (1賠1)', row1);
        createCell('any_triple', '全圍 ANY TRIPLE', '1賠24', row1);
        createCell('big', '大 BIG', '11-17 (1賠1)', row1);
        board.appendChild(row1);

        // Row 2: 特定圍骰 (Specific Triples)
        const row2 = createRow('grid-cols-6');
        [1,2,3,4,5,6].forEach(n => createCell(`triple_${n}`, `${n}${n}${n}`, '1賠150', row2));
        board.appendChild(row2);

        // Row 3: 對子 (Specific Doubles)
        const row3 = createRow('grid-cols-6');
        [1,2,3,4,5,6].forEach(n => createCell(`double_${n}`, `${n}${n}`, '1賠8', row3));
        board.appendChild(row3);

        // Row 4: 總和 (Total Sums)
        const row4 = createRow('grid-cols-7');
        const sumsRow1 = [4, 5, 6, 7, 8, 9, 10];
        const sumsRow2 = [11, 12, 13, 14, 15, 16, 17];
        const getSumOdds = (sum) => {
            if (sum === 4 || sum === 17) return '1賠50';
            if (sum === 5 || sum === 16) return '1賠18';
            if (sum === 6 || sum === 15) return '1賠14';
            if (sum === 7 || sum === 14) return '1賠12';
            if (sum === 8 || sum === 13) return '1賠8';
            return '1賠6';
        };
        sumsRow1.forEach(sum => createCell(`sum_${sum}`, sum, getSumOdds(sum), row4));
        const row5 = createRow('grid-cols-7');
        sumsRow2.forEach(sum => createCell(`sum_${sum}`, sum, getSumOdds(sum), row5));
        board.appendChild(row4);
        board.appendChild(row5);

        // Row 5: 單骰 (Single Dice)
        const row6 = createRow('grid-cols-6');
        [1,2,3,4,5,6].forEach(n => createCell(`single_${n}`, `骰 ${n}`, '1賠1', row6));
        board.appendChild(row6);
    },

    placeSicboBet(betId, cellElement) {
        if (this.isSpinning) {
            this.showTicker("遊戲進行中", "開獎期間無法下注喔！");
            return;
        }
        if (this.points < this.currentChip) {
            this.showAlert("積分不足", "您的餘額不足以進行下注！");
            return;
        }
        
        // 點擊回饋特效
        cellElement.classList.add('scale-95', 'opacity-80', 'transition-all');
        setTimeout(() => cellElement.classList.remove('scale-95', 'opacity-80'), 150);
        
        // 扣款
        this.points -= this.currentChip;
        document.getElementById('player-wallet').innerText = this.points.toLocaleString();
        
        // 記錄注碼
        this.sicboBets[betId] = (this.sicboBets[betId] || 0) + this.currentChip;
        
        // 顯示在畫面上
        let chipEl = cellElement.querySelector('.placed-chip');
        if (!chipEl) {
            chipEl = document.createElement('div');
            chipEl.className = 'placed-chip';
            cellElement.appendChild(chipEl);
        }
        let displayVal = this.sicboBets[betId];
        if (displayVal >= 1000) displayVal = (displayVal/1000).toFixed(1) + 'k';
        chipEl.innerText = displayVal;
    },

    clearSicboBets() {
        if (this.isSpinning) return;
        
        document.querySelectorAll('.winning-cell').forEach(el => {
            el.classList.remove('winning-cell', 'winning-bet');
        });
        
        let totalBet = 0;
        for (const key in this.sicboBets) {
            totalBet += this.sicboBets[key];
        }
        if (totalBet > 0) {
            this.points += totalBet;
            document.getElementById('player-wallet').innerText = this.points.toLocaleString();
        }
        
        this.sicboBets = {};
        document.getElementById('sicbo-board').querySelectorAll('.placed-chip').forEach(el => el.remove());
    },

    spinSicbo() {
        if (this.isSpinning) return;
        if (Object.keys(this.sicboBets).length === 0) {
            this.showTicker("請先下注", "您還沒有放置任何籌碼喔！");
            return;
        }

        document.querySelectorAll('.winning-cell').forEach(el => {
            el.classList.remove('winning-cell', 'winning-bet');
        });
        this.isSpinning = true;

        // 開始骰子動畫
        const diceEls = [1, 2, 3].map(i => document.getElementById(`dice-${i}`));
        let animationInterval = setInterval(() => {
            diceEls.forEach(el => {
                el.innerText = Math.floor(Math.random() * 6) + 1;
                el.style.transform = `scale(${0.8 + Math.random() * 0.4}) rotate(${Math.random() * 40 - 20}deg)`;
            });
        }, 100);

        // 3 秒後停止並結算
        setTimeout(() => {
            clearInterval(animationInterval);
            
            // 決定最終點數
            const results = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];
            
            diceEls.forEach((el, index) => {
                el.innerText = results[index];
                el.style.transform = 'scale(1) rotate(0deg)';
                el.classList.add('shadow-[0_0_15px_rgba(220,38,38,0.8)]');
            });

            setTimeout(() => diceEls.forEach(el => el.classList.remove('shadow-[0_0_15px_rgba(220,38,38,0.8)]')), 1000);

            const sum = results.reduce((a, b) => a + b, 0);
            const counts = {};
            results.forEach(r => counts[r] = (counts[r] || 0) + 1);
            
            const isTriple = Object.values(counts).includes(3);
            const isSmall = sum >= 4 && sum <= 10 && !isTriple;
            const isBig = sum >= 11 && sum <= 17 && !isTriple;

            let totalWin = 0;
            const winningIds = [];

            if (isSmall) winningIds.push('small');
            if (isBig) winningIds.push('big');
            if (isTriple) winningIds.push('any_triple');
            
            winningIds.push(`sum_${sum}`);

            for (const [numStr, count] of Object.entries(counts)) {
                const num = parseInt(numStr);
                winningIds.push(`single_${num}`);
                if (count >= 2) winningIds.push(`double_${num}`);
                if (count === 3) winningIds.push(`triple_${num}`);
            }

            // Highlight winning cells
            winningIds.forEach(id => {
                const el = document.getElementById(`sicbo-cell-${id}`);
                if (el) {
                    if (this.sicboBets[id] > 0) {
                        el.classList.add('winning-cell', 'winning-bet');
                    } else {
                        el.classList.add('winning-cell');
                    }
                }
            });

            // 計算派彩
            for (const [betId, amount] of Object.entries(this.sicboBets)) {
                let winRatio = 0;
                if (!winningIds.includes(betId)) continue;

                if (betId === 'small' || betId === 'big') winRatio = 2; // 1賠1 -> 本金x2
                else if (betId === 'any_triple') winRatio = 25; // 1賠24 -> 本金x25
                else if (betId.startsWith('triple_')) winRatio = 151; // 1賠150 -> 本金x151
                else if (betId.startsWith('double_')) winRatio = 9; // 1賠8 -> 本金x9
                else if (betId.startsWith('single_')) {
                    const singleNum = parseInt(betId.split('_')[1]);
                    const occurrences = counts[singleNum] || 0;
                    winRatio = occurrences + 1; // 1顆賠1, 2顆賠2, 3顆賠3 (+1本金)
                }
                else if (betId.startsWith('sum_')) {
                    const sumBet = parseInt(betId.split('_')[1]);
                    if (sumBet === 4 || sumBet === 17) winRatio = 51;
                    else if (sumBet === 5 || sumBet === 16) winRatio = 19;
                    else if (sumBet === 6 || sumBet === 15) winRatio = 15;
                    else if (sumBet === 7 || sumBet === 14) winRatio = 13;
                    else if (sumBet === 8 || sumBet === 13) winRatio = 9;
                    else winRatio = 7;
                }

                totalWin += amount * winRatio;
            }

            setTimeout(() => {
                if (totalWin > 0) {
                    this.showTicker(`⭐ 骰子 ${results.join(', ')} (總和${sum})！贏得 ${totalWin.toLocaleString()} 積分 ⭐`, 'win');
                    this.points += totalWin;
                } else {
                    this.showTicker(`骰子 ${results.join(', ')} (總和${sum})！很可惜未中獎。`, 'lose');
                }

                document.getElementById('player-wallet').innerText = this.points.toLocaleString();
                
                this.sicboBets = {};
                document.getElementById('sicbo-board').querySelectorAll('.placed-chip').forEach(el => el.remove());
                
                this.isSpinning = false;
            }, 500);

        }, 3000);
    },

    clearBets() {
        if (this.isSpinning) return;
        
        document.querySelectorAll('.winning-cell').forEach(el => {
            el.classList.remove('winning-cell', 'winning-bet');
        });
        
        // 返還積分
        let totalBet = 0;
        for (const key in this.rouletteBets) {
            totalBet += this.rouletteBets[key];
        }
        if (totalBet > 0) {
            this.points += totalBet;
            document.getElementById('player-wallet').innerText = this.points.toLocaleString();
        }
        
        // 清除紀錄與畫面上的籌碼
        this.rouletteBets = {};
        document.querySelectorAll('.placed-chip').forEach(el => el.remove());
    },

    spinRoulette() {
        if (this.isSpinning) return;
        if (Object.keys(this.rouletteBets).length === 0) {
            this.showAlert("請先下注", "您還沒有放置任何籌碼喔！");
            return;
        }

        // 移除先前的中獎特效
        document.querySelectorAll('.winning-cell').forEach(el => el.classList.remove('winning-cell'));

        this.isSpinning = true;
        const sequence = ['0','28','9','26','30','11','7','20','32','17','5','22','34','15','3','24','36','13','1','00','27','10','25','29','12','8','19','31','18','6','21','33','16','4','23','35','14','2'];
        const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
        
        // 隨機抽選結果
        const winningIndex = Math.floor(Math.random() * 38);
        const winningStr = sequence[winningIndex];
        const winningNum = parseInt(winningStr);

        // 計算旋轉角度
        const sliceAngle = 360 / 38;
        const targetOffset = 360 - (winningIndex * sliceAngle);
        
        // 累積旋轉，確保永遠順時針轉 (多轉 5 圈)
        this.currentRotation = this.currentRotation || 0;
        const currentMod = this.currentRotation % 360;
        this.currentRotation += (360 * 5) + (targetOffset - currentMod);
        
        const wheel = document.getElementById('roulette-wheel');
        wheel.style.transform = `rotate(${this.currentRotation}deg)`;

        // 等待動畫結束 (5秒)
        setTimeout(() => {
            let totalWin = 0;
            
            // 結算派彩
            for (const [betId, amount] of Object.entries(this.rouletteBets)) {
                let winRatio = 0; // 包含本金的賠率
                
                if (betId === `num_${winningStr}` || betId === winningStr) {
                    winRatio = 36; // 單一號碼 1賠35
                } 
                else if (betId.startsWith('split_')) {
                    const nums = betId.split('_').slice(1);
                    if (nums.includes(winningStr)) winRatio = 18;
                }
                else if (betId.startsWith('corner_')) {
                    const nums = betId.split('_').slice(1);
                    if (nums.includes(winningStr)) winRatio = 9;
                }
                else if (winningStr !== '0' && winningStr !== '00') {
                    if (betId === 'col1' && winningNum % 3 === 1) winRatio = 3;
                    if (betId === 'col2' && winningNum % 3 === 2) winRatio = 3;
                    if (betId === 'col3' && winningNum % 3 === 0) winRatio = 3;
                    
                    if (betId === '1st12' && winningNum >= 1 && winningNum <= 12) winRatio = 3;
                    if (betId === '2nd12' && winningNum >= 13 && winningNum <= 24) winRatio = 3;
                    if (betId === '3rd12' && winningNum >= 25 && winningNum <= 36) winRatio = 3;
                    
                    if (betId === 'even' && winningNum % 2 === 0) winRatio = 2;
                    if (betId === 'odd' && winningNum % 2 === 1) winRatio = 2;
                    if (betId === 'red' && reds.includes(winningNum)) winRatio = 2;
                    if (betId === 'black' && !reds.includes(winningNum)) winRatio = 2;
                    if (betId === '1to18' && winningNum >= 1 && winningNum <= 18) winRatio = 2;
                    if (betId === '19to36' && winningNum >= 19 && winningNum <= 36) winRatio = 2;
                }
                
                totalWin += amount * winRatio;
            }

            // 讓中獎位置發光
            const winningIds = [winningStr];
            if (winningStr !== '0' && winningStr !== '00') {
                if (winningNum % 3 === 1) winningIds.push('col1');
                if (winningNum % 3 === 2) winningIds.push('col2');
                if (winningNum % 3 === 0) winningIds.push('col3');
                if (winningNum >= 1 && winningNum <= 12) winningIds.push('1st12');
                if (winningNum >= 13 && winningNum <= 24) winningIds.push('2nd12');
                if (winningNum >= 25 && winningNum <= 36) winningIds.push('3rd12');
                if (winningNum % 2 === 0) winningIds.push('even');
                if (winningNum % 2 === 1) winningIds.push('odd');
                if (reds.includes(winningNum)) winningIds.push('red');
                if (!reds.includes(winningNum)) winningIds.push('black');
                if (winningNum >= 1 && winningNum <= 18) winningIds.push('1to18');
                if (winningNum >= 19 && winningNum <= 36) winningIds.push('19to36');
            }
            for (const betId of Object.keys(this.rouletteBets)) {
                if (betId.startsWith('split_') || betId.startsWith('corner_')) {
                    const nums = betId.split('_').slice(1);
                    if (nums.includes(winningStr)) winningIds.push(betId);
                }
            }

            winningIds.forEach(id => {
                const el = document.getElementById(`roulette-cell-${id}`) || document.getElementById(`roulette-cell-num_${id}`);
                if (el) {
                    if (this.rouletteBets[id] || this.rouletteBets[`num_${id}`]) {
                        el.classList.add('winning-cell', 'winning-bet');
                    } else {
                        el.classList.add('winning-cell');
                    }
                }
            });

            // 延遲 500ms 讓玩家能看到發光特效，再跳出 alert
            setTimeout(() => {
                // 更新結果
                if (totalWin > 0) {
                    this.showTicker(`⭐ 輪盤開出 ${winningStr}！贏得 ${totalWin.toLocaleString()} 積分 ⭐`, 'win');
                    this.points += totalWin;
                } else {
                    this.showTicker(`輪盤開出 ${winningStr}！很可惜未中獎。`, 'lose');
                }

                document.getElementById('player-wallet').innerText = this.points.toLocaleString();
                
                // 清空畫面籌碼 (不退回積分)
                this.rouletteBets = {};
                document.querySelectorAll('.placed-chip').forEach(el => el.remove());
                
                this.isSpinning = false;
            }, 500);
        }, 5050);
    }
};

// 啟動
document.addEventListener('DOMContentLoaded', () => {
    CasinoApp.init();
});
