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
    isSpinning: false,
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
            // 非同步獲取點數，避免卡住 Loading 畫面
            this.fetchPoints();
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
            
            // 管理員無限點數保護
            if (ADMIN_USER_IDS.includes(this.user.userId)) {
                this.points = 999999;
            }
            
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
        
        // 小瑪莉有自己的押注面板，不需要底部籌碼列
        if (gameType === 'mary') {
            document.getElementById('casino-footer').classList.add('translate-y-full');
            // 初始化小瑪莉
            if (typeof initMaryBoard === 'function') {
                initMaryBoard();
                initMaryBetPanel();
                refreshMaryData();
            }
        } else {
            document.getElementById('casino-footer').classList.remove('translate-y-full');
        }
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
        document.getElementById('main-content').scrollTo({ top: 0, behavior: 'smooth' });
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
        document.querySelectorAll('.chip-btn').forEach(el => el.classList.remove('selected'));
        const el = document.querySelector(`.chip-btn[data-value="${val}"]`);
        if (el) el.classList.add('selected');
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
        zeroCell.onclick = (e) => { e.stopPropagation(); this.openRouletteBetPopup('0', zeroCell, e); };
        
        const doubleZeroCell = document.createElement('div');
        doubleZeroCell.className = 'roulette-cell cell-green rounded-bl-md flex flex-col justify-center';
        doubleZeroCell.id = 'roulette-cell-00';
        doubleZeroCell.innerHTML = '<span>00</span>';
        doubleZeroCell.onclick = (e) => { e.stopPropagation(); this.openRouletteBetPopup('00', doubleZeroCell, e); };
        
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
                // 點擊格子時觸發九宮格視窗
                cell.onclick = (e) => {
                    e.stopPropagation();
                    this.openRouletteBetPopup(num, cell, e);
                };

                // 產生下注籌碼的定位錨點 (Anchor Points)
                // 這些錨點不具備點擊功能，僅用於讓籌碼準確定位在格線交界處
                if (colIndex < 11) {
                    // Vertical Split Anchor (右邊界中點)
                    const vAnchor = document.createElement('div');
                    vAnchor.id = `anchor-split_${num}_${num+3}`;
                    vAnchor.className = 'absolute right-0 top-1/2 w-0 h-0 z-0 pointer-events-none';
                    cell.appendChild(vAnchor);
                }
                if (rowIndex < 2) {
                    // Horizontal Split Anchor (下邊界中點)
                    const hAnchor = document.createElement('div');
                    hAnchor.id = `anchor-split_${num}_${num-1}`;
                    hAnchor.className = 'absolute bottom-0 left-1/2 w-0 h-0 z-0 pointer-events-none';
                    cell.appendChild(hAnchor);
                }
                if (colIndex < 11 && rowIndex < 2) {
                    // Corner Anchor (右下角交界點)
                    const cAnchor = document.createElement('div');
                    cAnchor.id = `anchor-corner_${num}_${num-1}_${num+3}_${num+2}`;
                    cAnchor.className = 'absolute bottom-0 right-0 w-0 h-0 z-0 pointer-events-none';
                    cell.appendChild(cAnchor);
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

    openRouletteBetPopup(num, cellElement, event) {
        if (this.isSpinning) {
            this.showTicker("遊戲進行中", "開獎期間無法下注喔！");
            return;
        }

        // 移除現有的彈跳視窗
        const existingPopup = document.getElementById('roulette-bet-popup');
        if (existingPopup) {
            existingPopup.remove();
        }

        // 如果點擊的是原本已開啟的格子，就當作是關閉
        if (this.currentPopupCell === cellElement) {
            this.currentPopupCell = null;
            return;
        }
        this.currentPopupCell = cellElement;

        const popup = document.createElement('div');
        popup.id = 'roulette-bet-popup';
        popup.className = 'absolute z-[100] bg-gray-900 border-2 border-emerald-500 rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.5)] p-2 animate-fade-in flex flex-col gap-1';
        
        // 防止點擊彈窗內部時關閉彈窗
        popup.onclick = (e) => e.stopPropagation();

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-3 gap-1';

        // 產生按鈕的 Helper
        const createBtn = (label, betId, colorClass = 'bg-gray-800 text-gray-400') => {
            const btn = document.createElement('button');
            const isValid = betId !== null && typeof betId !== 'undefined';
            btn.className = `w-12 h-12 sm:w-14 sm:h-14 rounded flex items-center justify-center text-sm font-bold transition-all ${isValid ? 'hover:brightness-125 active:scale-95 cursor-pointer ' + colorClass : 'opacity-10 cursor-default ' + colorClass}`;
            if (isValid) {
                btn.onclick = () => {
                    // 如果有 anchor (角注或分注)，就用 anchor 作為定位點，否則用 cellElement (單注)
                    const anchorEl = document.getElementById('anchor-' + betId) || document.getElementById('roulette-cell-' + (typeof num === 'string' ? num.replace('num_', '') : num)) || cellElement;
                    this.placeRouletteBet(betId, anchorEl);
                    popup.remove();
                    this.currentPopupCell = null;
                };
                if (label) {
                    btn.innerHTML = label;
                } else {
                    // 分注或角注以圓點表示
                    btn.innerHTML = '<div class="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-white/40 border border-white/60"></div>';
                }
            }
            return btn;
        };

        if (num === '0' || num === '00') {
            // 特例：0 和 00
            const btn = createBtn(num, num, 'bg-green-600 text-white shadow-[0_0_10px_rgba(22,163,74,0.5)]');
            btn.className = btn.className.replace('w-12 h-12 sm:w-14 sm:h-14', 'w-24 h-12 sm:w-28 sm:h-14 text-lg');
            popup.appendChild(btn);
        } else {
            const n = parseInt(num);
            const isTop = (n % 3 === 0);
            const isBot = (n % 3 === 1);
            const isLeft = (n <= 3);
            const isRight = (n >= 34);

            const options = {
                center: `num_${n}`,
                up: isTop ? null : `split_${n+1}_${n}`,
                down: isBot ? null : `split_${n}_${n-1}`,
                left: isLeft ? null : `split_${n-3}_${n}`,
                right: isRight ? null : `split_${n}_${n+3}`,
                tl: (isTop || isLeft) ? null : `corner_${n-2}_${n-3}_${n+1}_${n}`,
                tr: (isTop || isRight) ? null : `corner_${n+1}_${n}_${n+4}_${n+3}`,
                bl: (isBot || isLeft) ? null : `corner_${n-3}_${n-4}_${n}_${n-1}`,
                br: (isBot || isRight) ? null : `corner_${n}_${n-1}_${n+3}_${n+2}`
            };

            const cellColorClass = document.getElementById('roulette-cell-' + n).classList.contains('cell-red') ? 'bg-red-600 text-white shadow-[0_0_10px_rgba(220,38,38,0.5)]' : 'bg-gray-900 text-white border border-gray-600 shadow-[0_0_10px_rgba(0,0,0,0.5)]';

            // 排列 3x3 陣列
            grid.appendChild(createBtn('', options.tl, 'bg-emerald-900/50 hover:bg-emerald-600'));
            grid.appendChild(createBtn('', options.up, 'bg-emerald-800/60 hover:bg-emerald-500'));
            grid.appendChild(createBtn('', options.tr, 'bg-emerald-900/50 hover:bg-emerald-600'));
            
            grid.appendChild(createBtn('', options.left, 'bg-emerald-800/60 hover:bg-emerald-500'));
            grid.appendChild(createBtn(n, options.center, cellColorClass));
            grid.appendChild(createBtn('', options.right, 'bg-emerald-800/60 hover:bg-emerald-500'));
            
            grid.appendChild(createBtn('', options.bl, 'bg-emerald-900/50 hover:bg-emerald-600'));
            grid.appendChild(createBtn('', options.down, 'bg-emerald-800/60 hover:bg-emerald-500'));
            grid.appendChild(createBtn('', options.br, 'bg-emerald-900/50 hover:bg-emerald-600'));

            popup.appendChild(grid);
            
            const title = document.createElement('div');
            title.className = 'text-center text-[10px] text-emerald-300 font-bold mb-1 tracking-widest';
            title.innerText = 'SELECT BET';
            popup.insertBefore(title, grid);
        }

        const container = document.getElementById('view-roulette');
        container.appendChild(popup);
        
        const cellRect = cellElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        let topPos = cellRect.top - containerRect.top - popup.offsetHeight - 10; 
        let leftPos = cellRect.left - containerRect.left + (cellRect.width / 2) - (popup.offsetWidth / 2);
        
        // 渲染後再調整位置避免超出邊界
        requestAnimationFrame(() => {
            const finalWidth = popup.offsetWidth;
            const finalHeight = popup.offsetHeight;
            let finalTop = cellRect.top - containerRect.top - finalHeight - 10;
            let finalLeft = cellRect.left - containerRect.left + (cellRect.width / 2) - (finalWidth / 2);
            
            if (finalTop < 0) {
                // 如果上方空間不足，放到下方
                finalTop = cellRect.bottom - containerRect.top + 10;
            }
            if (finalLeft < 10) finalLeft = 10;
            if (finalLeft + finalWidth > containerRect.width - 10) {
                finalLeft = containerRect.width - finalWidth - 10;
            }
            popup.style.top = finalTop + 'px';
            popup.style.left = finalLeft + 'px';
        });
        
        // 全域點擊關閉視窗
        if (this._closePopupHandler) {
            document.removeEventListener('click', this._closePopupHandler);
        }
        this._closePopupHandler = () => {
            if (document.getElementById('roulette-bet-popup')) {
                document.getElementById('roulette-bet-popup').remove();
                this.currentPopupCell = null;
            }
            if (this._closePopupHandler) {
                document.removeEventListener('click', this._closePopupHandler);
                this._closePopupHandler = null;
            }
        };
        setTimeout(() => {
            document.addEventListener('click', this._closePopupHandler);
        }, 0);
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
        document.querySelectorAll('.winning-cell').forEach(el => {
            el.classList.remove('winning-cell', 'winning-bet');
        });

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
