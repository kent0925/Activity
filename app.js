// ==========================================
        // 1. 設定與狀態
        // ==========================================

        // ★ 請替換為您的 Google Apps Script 網址
        const GAS_URL = "https://script.google.com/macros/s/AKfycbzTiALv2VOAvtuUgFx623KQgkvlmkkEc-bSgFQXiLqcxWpi9FvSrSxkSibjdRwO7tVn/exec";

        // ★ 請替換為您的 LIFF ID
        const LIFF_ID = "2008678090-aXTesgDK";

        // 狀態變數
        let appState = {
            events: [],
            settings: { organizers: [], locations: [] },
            user: { userId: '', displayName: '訪客', pictureUrl: '' },
            currentCategory: 'all',
            currentEvent: null,
            currentStats: {},
            historyStack: ['home'],
            guestList: [],
            sponsorList: [],
            isDataLoaded: false,
            myRegistrations: []
        };

        // ★ 防重複提交鎖 + 離線佇列常數
        let _isSubmitting = false;
        const OFFLINE_QUEUE_KEY = 'offlineSubmitQueue';
        const OFFLINE_QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 小時過期

        // ==========================================
        // 1.1 共用工具與常數
        // ==========================================

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

        /** 取得整數欄位值 */
        function getIntField(row, fieldName) {
            return parseInt(getField(row, fieldName)) || 0;
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
            DOM.headerTitle.innerText = "活動與報名";
            switchView('view-home');

            // ★ 離線偵測與佇列處理
            window.addEventListener('offline', () => showToast('⚠️ 網路已斷開，報名將暫存'));
            window.addEventListener('online', () => {
                showToast('✅ 網路已恢復');
                setTimeout(() => processOfflineQueue(), 1500);
            });
            // 頁面載入時也檢查是否有殘留佇列
            if (navigator.onLine) {
                setTimeout(() => processOfflineQueue(), 3000);
            }

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

            // 抓取資料
            await Promise.all([
                fetchEvents(),
                fetchSettings(),
                fetchMyRegistrations(),
                fetchParticipationStats(),
                fetchJackpotTop3()
            ]);

            // ★ 新增：套用名稱對應邏輯 (需在 fetchSettings 與 LIFF init 之後)
            applyUserNameMapping();

            appState.isDataLoaded = true;

            // 首頁直接渲染活動列表（已移除分類頁導航邏輯）
            appState.currentCategory = 'all';
            renderEventGrid('all');

            // 若在首頁則移除初始骨架屏
            document.getElementById('history-loading').classList.add('hidden');

            // 移除初始載入畫面
            const overlay = document.getElementById('initial-load-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => {
                    overlay.remove();
                }, 500);
            }
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
            if (!GAS_URL) return;
            try {
                const res = await fetch(`${GAS_URL}?action=getEvents`);
                appState.events = await res.json();
            } catch (e) {
                console.warn("API Error (getEvents)", e);
            }
        }

        async function fetchSettings() {
            if (!GAS_URL) return;
            try {
                const res = await fetch(`${GAS_URL}?action=getSettings`);
                appState.settings = await res.json();
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
                        return a.name.localeCompare(b.name, 'zh-Hant-TW');
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
                return await res.json();
            } catch (err) {
                // ★ 網路錯誤時存入離線佇列
                if (err.name === 'TypeError' || err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                    enqueueOffline(data);
                    showToast('⚠️ 網路異常，資料已暫存，待恢復後自動送出');
                    return { queued: true };
                }
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

            if (isEventOpen(appState.currentEvent)) {
                DOM.submitBtn.innerHTML = '<span>更新資料</span><i data-lucide="refresh-cw" class="w-4 h-4"></i>';
                DOM.submitBtn.classList.replace('bg-[#06c755]', 'bg-blue-600');
                DOM.submitBtn.classList.replace('hover:bg-green-600', 'hover:bg-blue-700');
                DOM.submitBtn.disabled = false;
                DOM.cancelBtn.classList.remove('hidden');
            } else {
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

            const formData = {
                action: DOM.formAction.value,
                eventId: appState.currentEvent.id,
                eventType: appState.currentEvent.type,
                eventName: appState.currentEvent.name,
                userId: appState.user.userId,
                displayName: DOM.userName.value,
                pictureUrl: appState.user.pictureUrl,
                familyCount: document.getElementById('family-count').value,
                guestList: JSON.stringify(appState.guestList),
                sponsorList: JSON.stringify(appState.sponsorList),
                roomType: document.getElementById('room-type').value,
                pickupLoc: document.getElementById('pickup-loc').value,
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
            DOM.submitBtn.className = "flex-1 bg-[#06c755] text-white font-bold py-3.5 rounded-xl hover:bg-green-600 transition shadow-md active:scale-95 flex justify-center items-center gap-2";
            DOM.submitBtn.disabled = false;

            DOM.cancelBtn.classList.add('hidden');
            DOM.formTitle.innerText = "填寫報名資料";
            DOM.userName.value = appState.user.displayName;
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
            if (!isOpen) {
                // 停用表單內所有輸入框
                const formInputs = document.querySelectorAll('#regForm input, #regForm select, #regForm button');
                formInputs.forEach(el => el.disabled = true);

                DOM.submitBtn.innerText = "活動已結束";
                DOM.submitBtn.className = "flex-1 bg-gray-400 text-white font-bold py-3.5 rounded-xl cursor-not-allowed flex justify-center items-center gap-2";
                DOM.submitBtn.disabled = true;
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
                    DOM.submitBtn.classList.remove('bg-[#06c755]', 'hover:bg-green-600');
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
                const subtext = details.length > 0 ? `<span class="text-xs text-gray-400 ml-1">(${details.join(', ')})</span>` : '';

                const div = document.createElement('div');
                div.className = 'flex justify-between items-center bg-white border border-gray-200 pl-3 pr-2 py-2 rounded-lg text-sm shadow-sm animate-fade-in';
                div.innerHTML = `
                    <div class="flex items-center gap-2">
                        <div class="w-1.5 h-1.5 rounded-full bg-orange-400"></div>
                        <span class="font-medium text-gray-700">${escapeHtml(g.name)} ${subtext}</span>
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
                        <span class="font-medium text-gray-700">${escapeHtml(s)}</span>
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
                const qty = parseInt(content);
                document.getElementById('sp-qty').value = qty;
                document.getElementById('sp-unit').value = unit;

            } else if (s.startsWith("紅包:")) {
                document.querySelector('input[name="addSponsorType"][value="money"]').checked = true;
                renderAddSponsorUI();
                // "紅包: 1000元"
                const money = parseInt(s.match(/\d+/)[0]);
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
                if (type === 'all') return isEventOpen(e) && e.isActiveValue !== '';
                return normalizeType(e.type) === type && isEventOpen(e) && e.isActiveValue !== '';
            }).sort((a, b) => {
                // 解析日期（處理日期範圍與驗證 ISO 格式）
                const getTime = (t) => {
                    if (!t) return 0;
                    // 若為範圍 "start~end"，取開始日期
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

                    // 截止警告 / 已報名標籤邏輯
                    let badge = '';
                    // 優先顯示已報名，即使已截止
                    if (appState.myRegistrations.includes(e.id)) {
                        badge = '<span class="absolute top-0 right-0 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">已報名</span>';
                    } else if (e.deadline && new Date() > new Date(e.deadline)) {
                        badge = '<span class="absolute top-0 right-0 bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-bold">已截止</span>';
                    }

                    // ★ 倒數標記：距離活動還有幾天
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
                titleEl.innerHTML = '<i data-lucide="users" class="w-5 h-5 text-white/70"></i> <span class="text-white/90">人員名單</span>';
            } else if (filterType === 'secondary') {
                const type = appState.currentEvent.type;
                const icon = type === 'travel' ? 'bus' : 'gift';
                const text = type === 'travel' ? '住宿與交通' : '贊助與認桌';
                titleEl.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5 text-white/70"></i> <span class="text-white/90">${text}明細</span>`;
            } else {
                titleEl.innerHTML = '<i data-lucide="list" class="w-5 h-5 text-white/70"></i> <span class="text-white/90">詳細名單</span>';
            }
            refreshIcons();

            // 填入摘要
            const sumDiv = document.getElementById('modal-summary');
            sumDiv.innerHTML = '';
            if (appState.currentEvent.type === 'travel') {
                const pMap = appState.currentStats.pickupCounts || {};
                const rMap = appState.currentStats.roomCounts || {};
                let html = '';
                if (Object.keys(pMap).length) html += `<div class="bg-white/5 border border-white/10 rounded p-1.5"><div class="font-bold mb-1 text-white/70">📍 上車地點</div>${Object.entries(pMap).map(([k, v]) => `<span class="inline-block bg-[#EFC958]/20 text-[#EFC958] border border-[#EFC958]/30 px-1.5 rounded text-[10px] mr-1 mb-1">${k}:${v}</span>`).join('')}</div>`;
                if (Object.keys(rMap).length) html += `<div class="bg-white/5 border border-white/10 rounded p-1.5"><div class="font-bold mb-1 text-white/70">🛏 房型統計</div>${Object.entries(rMap).map(([k, v]) => `<span class="inline-block bg-[#EFC958]/20 text-[#EFC958] border border-[#EFC958]/30 px-1.5 rounded text-[10px] mr-1 mb-1">${k}:${v}</span>`).join('')}</div>`;
                sumDiv.innerHTML = html;
            } else if (appState.currentEvent.type === 'banquet') {
                sumDiv.innerHTML = `<div class="col-span-2 bg-[#EFC958]/20 border border-[#EFC958]/30 rounded p-2 text-center font-bold text-[#EFC958]">總計預訂: ${appState.currentStats.tableCount} 桌</div>`;
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

        // 不分大小寫尋找值的輔助函式
        function findCaseInsensitiveValue(row, candidates) {
            if (!row) return undefined;
            // 1. 直接匹配 (快)
            for (const key of candidates) {
                if (row[key] !== undefined && row[key] !== '') return row[key];
            }
            // 2. 不分大小寫掃描 (慢)
            const keys = Object.keys(row);
            for (const c of candidates) {
                const lowerC = c.toLowerCase().replace(/\s/g, '');
                for (const k of keys) {
                    if (k.toLowerCase().replace(/\s/g, '') === lowerC) {
                        return row[k];
                    }
                }
            }
            return undefined;
        }

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
                const guestCountFallback = getIntField(row, 'guestCount');

                const guestTotalCount = guestData.reduce((acc, g) => acc + g.count, 0);
                const finalGuestCount = guestTotalCount > 0 ? guestTotalCount : guestCountFallback;
                const total = 1 + family + finalGuestCount;

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
                liP.className = 'px-4 py-3 hover:bg-white/5 transition border-b border-white/10 last:border-0';
                liP.innerHTML = `
                    <div class="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span class="text-white/50 font-mono text-sm">${num}.</span>
                        <span class="font-bold text-white/90 text-base inline-flex items-center flex-wrap">${safeName}${tagHtml}${nameSuffix}</span>
                    </div>
                    ${subHtml}`;
                fragP.appendChild(liP);

                if (appState.currentEvent.type === 'travel') {
                    // 檢查主要人員
                    if ((pickup && pickup !== '無') || (room && room !== '無')) {
                        hasTravel = true;
                        const liT = document.createElement('li');
                        liT.className = 'px-4 py-2 flex justify-between items-center hover:bg-white/5 text-sm border-b border-white/10 last:border-0';
                        liT.innerHTML = `
                            <span class="font-medium text-white/90">${safeName}</span>
                            <div class="text-right text-xs text-gray-500">
                                ${pickup && pickup !== '無' ? `<div class="text-blue-600">${escapeHtml(pickup)}</div>` : ''}
                                ${room && room !== '無' ? `<div class="text-orange-600">${escapeHtml(room)}</div>` : ''}
                            </div>`;
                        fragT.appendChild(liT);
                    }

                    // 檢查來賓
                    guestData.forEach(g => {
                        if ((g.pickup && g.pickup !== '無') || (g.room && g.room !== '無')) {
                            hasTravel = true;
                            const liTG = document.createElement('li');
                            liTG.className = 'px-4 py-2 flex justify-between items-center hover:bg-gray-50 text-sm';
                            liTG.innerHTML = `
                                <span class="font-medium text-white/90"><span class="text-xs text-white/50 mr-1">賓</span>${escapeHtml(g.name)}</span>
                                <div class="text-right text-xs text-gray-500">
                                    ${g.pickup && g.pickup !== '無' ? `<div class="text-blue-600">${escapeHtml(g.pickup)}</div>` : ''}
                                    ${g.room && g.room !== '無' ? `<div class="text-orange-600">${escapeHtml(g.room)}</div>` : ''}
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
                    liI.className = 'px-4 py-3 hover:bg-white/5 border-b border-white/10 last:border-0';
                    liI.innerHTML = `
                        <div class="flex justify-between items-start">
                            <span class="font-medium text-white/90 text-sm">${safeName}</span>
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
                DOM.btnShare.classList.add('hidden');
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
                // 篩選已結束的活動 (isActive !== 'open')
                const history = appState.events.filter(e => !isEventOpen(e));

                if (history.length === 0) {
                    list.innerHTML = '<div class="text-center text-gray-400 text-sm py-4">無歷史紀錄</div>';
                } else {
                    // 效能優化：使用 DocumentFragment 取代 innerHTML 累加
                    const fragment = document.createDocumentFragment();
                    history.forEach(e => {
                        const div = document.createElement('div');
                        div.className = "bg-white/5 p-4 rounded-xl border border-white/10 shadow-sm flex justify-between items-center cursor-pointer hover:bg-white/10 transition-all";
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
                card.style.cssText = 'position:fixed;left:-9999px;top:0;width:420px;padding:32px;background:linear-gradient(180deg,#162544 0%,#0f172a 100%);font-family:"Segoe UI","Noto Sans TC",sans-serif;color:rgba(255,255,255,0.9);z-index:-1;';

                let html = '';
                html += '<div style="background:linear-gradient(135deg,rgba(239,201,88,0.2) 0%,rgba(239,201,88,0.1) 100%);border:1px solid rgba(239,201,88,0.3);color:#EFC958;padding:20px 24px;border-radius:16px;margin-bottom:20px;">';
                html += `<div style="font-size:22px;font-weight:800;">📅 ${escapeHtml(e.name)}</div>`;
                html += '<div style="font-size:12px;margin-top:6px;opacity:0.8;">已結束</div>';
                html += '</div>';

                // 活動資訊區
                html += '<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
                if (e.organizer) html += `<div style="font-size:14px;margin-bottom:8px;">👤 主辦人：${escapeHtml(e.organizer)}</div>`;
                let timeDisplay = e.time;
                if (timeDisplay) {
                    if (timeDisplay.includes('~')) {
                        const [start, end] = timeDisplay.split('~');
                        timeDisplay = `${formatDateOnly(start)} ~ ${formatDateOnly(end)}`;
                    } else {
                        const d = new Date(timeDisplay);
                        if (!isNaN(d.getTime())) {
                            const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
                            timeDisplay = `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${week}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                        }
                    }
                }
                if (timeDisplay) html += `<div style="font-size:14px;margin-bottom:8px;">🕒 時間：${escapeHtml(timeDisplay)}</div>`;
                if (e.location) html += `<div style="font-size:14px;margin-bottom:8px;">📍 地點：${escapeHtml(e.location)}</div>`;
                if (e.address) html += `<div style="font-size:14px;margin-bottom:8px;">🚗 地址：${escapeHtml(e.address)}</div>`;
                html += '</div>';

                // 名單區
                if (data.length > 0) {
                    html += '<div style="background:white;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
                    html += '<div style="font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #06c755;">👥 報名名單</div>';
                    let count = 0;
                    data.forEach(p => {
                        count++;
                        const family = getIntField(p, 'family');
                        const guestData = parseGuestData(p);
                        const guestCountFallback = getIntField(p, 'guestCount');
                        const guestTotalCount = guestData.reduce((acc, g) => acc + g.count, 0);
                        const finalGuestCount = guestTotalCount > 0 ? guestTotalCount : guestCountFallback;
                        const total = 1 + family + finalGuestCount;
                        const num = count.toString().padStart(2, '0');
                        const status = p.status || p.note || '';
                        let prefix = status ? status : '';
                        const roles = getParticipantRoles(p.name, e);
                        let tagHtml = '';
                        if (roles.length > 0) {
                            tagHtml = roles.map(r => `<span style="color:${r.color};font-size:12px;font-weight:bold;margin-left:6px;display:inline-flex;align-items:center;">${r.label}</span>`).join('');
                        }
                        html += `<div style="font-size:14px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;">`;
                        html += `<span style="color:#06c755;font-weight:700;margin-right:4px;">${num}.</span> <span style="display:inline-flex;align-items:center;">${escapeHtml(prefix)}${escapeHtml(p.name)}${tagHtml}</span>`;
                        if (total > 1) html += `<span style="color:#f59e0b;font-weight:600;margin-left:6px;">×${total}</span>`;
                        html += '</div>';
                        if (guestData.length > 0) {
                            const guestParts = guestData.map(g => g.count > 1 ? `${g.name}×${g.count}` : g.name);
                            html += `<div style="font-size:12px;color:rgba(255,255,255,0.5);padding:2px 0 4px 20px;">來賓：${guestParts.join('、')}</div>`;
                        } else {
                            const guestNameStr = getField(p, 'guestName');
                            if (guestNameStr && guestNameStr !== '無') {
                                html += `<div style="font-size:12px;color:rgba(255,255,255,0.5);padding:2px 0 4px 20px;">來賓：${guestNameStr}</div>`;
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
                        if (tc > 0) moneyParts.push(`認桌: ${tc}桌`);
                        const sponsorRaw = getField(p, 'sponsor');
                        const sponsorList = parseSponsorData(sponsorRaw);
                        sponsorList.forEach(s => moneyParts.push(`贊助: ${s}`));
                        if (moneyParts.length > 0) {
                            sponsorHtml += `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);"><span style="font-weight:600;">${p.name}</span>：${moneyParts.join('、')}</div>`;
                        }
                    });
                    if (sponsorHtml) {
                        html += '<div style="background:white;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
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

        function showToast(msg) {
            const toast = document.getElementById('toast');
            document.getElementById('toast-msg').innerText = msg;
            toast.classList.remove('opacity-0', 'pointer-events-none', 'top-6');
            toast.classList.add('top-20', 'opacity-100');

            setTimeout(() => {
                toast.classList.remove('top-20', 'opacity-100');
                toast.classList.add('opacity-0', 'pointer-events-none', 'top-6');
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
                    <input id="sp-qty" type="number" class="w-20 border border-gray-300 rounded px-2 py-1 text-sm" placeholder="數量" min="1">
                    <select id="sp-unit" class="border border-gray-300 rounded px-2 py-1 text-sm bg-white">
                        <option value="瓶">瓶</option>
                        <option value="箱">箱</option>
                    </select>`;
            } else if (type === 'money') {
                area.innerHTML = `<input id="sp-money" type="number" class="w-full border border-gray-300 rounded px-2 py-1 text-sm" placeholder="金額 (100為單位)" min="100" step="100">`;
            } else {
                area.innerHTML = `<input id="sp-other" type="text" class="w-full border border-gray-300 rounded px-2 py-1 text-sm" placeholder="贊助內容">`;
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
                const num = parseInt(val);
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

            // 人數(含眷屬)：顯示 1~10 人，值為 0~9 (扣除本人)
            // 預設 1 人 (值 0)
            f.innerHTML = '';
            for (let i = 1; i <= 10; i++) {
                f.add(new Option(`${i} 人`, i - 1));
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
                const d = new Date(startRaw);
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
            wrapper.className = "border border-white/10 rounded-2xl overflow-hidden bg-white/5 shadow-sm";

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
                allContentHtml += '<div class="absolute left-[5px] top-4 bottom-2 w-0.5 bg-white/10"></div>';

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
                        `<a href="${itemUrl}" target="_blank" class="inline-flex items-center justify-center w-6 h-6 bg-blue-50 text-blue-500 rounded-full hover:bg-blue-100 transition ml-2 shrink-0 self-center" title="導航" onclick="event.stopPropagation()">
                            <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
                         </a>` : '';

                    if (timeDisplay) {
                        allContentHtml += `
                            <div class="relative flex gap-3 items-start pl-4 group/item">
                                <div class="absolute left-0 top-1.5 w-3 h-3 bg-[#162544] border-[3px] border-[#EFC958] rounded-full z-10 shadow-sm"></div>
                                <div class="font-mono font-bold text-[#EFC958] shrink-0 pt-0.5 w-[42px] text-right mr-1">${timeDisplay}</div>
                                <div class="flex-1 min-w-0 pt-0.5">
                                    <div class="flex items-center flex-wrap">
                                        <span class="text-white/90 font-bold leading-tight">${itemTitle}</span>
                                        ${mapIconHtml}
                                    </div>
                                    ${itemDesc ? `<p class="text-xs text-white/50 mt-1 leading-relaxed">${itemDesc}</p>` : ''}
                                </div>
                            </div>`;
                    } else {
                        allContentHtml += `
                            <div class="relative flex gap-3 items-start pl-4">
                                <div class="absolute left-1 top-2.5 w-1.5 h-1.5 bg-[#D4AF37]/50 rounded-full z-10"></div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center flex-wrap">
                                        <span class="text-white/80 font-medium leading-tight">${itemTitle}</span>
                                        ${mapIconHtml}
                                    </div>
                                    ${itemDesc ? `<p class="text-xs text-white/50 mt-1 leading-relaxed">${itemDesc}</p>` : ''}
                                </div>
                            </div>`;
                    }
                });
                allContentHtml += '</div>';

                // 手風琴 Header
                const isOpen = idx === 0;

                const details = document.createElement('details');
                details.setAttribute('name', 'itinerary-group');
                details.className = "group border-b border-white/10 last:border-0 transition-all itinerary-group";
                if (isOpen) details.setAttribute('open', '');

                const summary = document.createElement('summary');
                summary.className = "flex justify-between items-center p-4 cursor-pointer select-none bg-transparent hover:bg-white/5 transition list-none relative";

                summary.innerHTML = `
                    <div class="flex items-center gap-3 overflow-hidden">
                        <span class="bg-[#EFC958]/20 text-[#EFC958] text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap">${dayLabel}</span>
                        <span class="font-bold text-white/90 text-base truncate">${accordionMainTitle}</span>
                    </div>
                    <div class="w-6 h-6 flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/50 font-bold shrink-0 ml-2">
                        <span class="icon-plus">+</span>
                        <span class="icon-minus">−</span>
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
                appState.currentEvent.isActive = newStatus;
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
        function isEventOpen(e) { return e.isActive === true || e.isActive === '開放' || e.isActive === 'open'; }
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
                const d = new Date(timeStr);
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

        async function openShareModal() {
            const e = appState.currentEvent;
            const s = appState.currentStats;
            if (!e) return;

            // ★ 修正：若無快取資料，先嘗試抓取
            if (!appState.cachedDetails || appState.cachedDetails.length === 0) {
                // 顯示讀取中 Toast
                showToast("正在讀取名單...");
                const details = await fetchDetails();
                appState.cachedDetails = details;

                // 若讀取後仍無資料 (或失敗)，提示使用者
                if (!appState.cachedDetails || appState.cachedDetails.length === 0) {
                    // 雖然無名單，但活動資訊仍可分享，故不阻擋，僅提示
                    // showToast("目前無報名資料");
                } else {
                    showToast("名單讀取完成");
                }
            }

            // 重置 checkbox 狀態
            document.getElementById('share-opt-sponsor').checked = true;
            document.getElementById('share-opt-travel').checked = true;

            // 判斷是否顯示「贊助/認桌」選項
            const hasTable = s.tableCount && s.tableCount > 0;
            // 除了檢查統計數據，也從快取名單實際檢查是否有人有贊助資料
            const detailsHasSponsor = (appState.cachedDetails || []).some(p => {
                const tc = getIntField(p, 'tableCount');
                const spRaw = getField(p, 'sponsor');
                const spList = parseSponsorData(spRaw);
                return tc > 0 || spList.length > 0;
            });
            const hasSponsor = hasTable || detailsHasSponsor || (e.type !== 'travel' && s.secondary > 0);

            const sponsorEl = document.getElementById('opt-container-sponsor');
            if (hasSponsor) {
                sponsorEl.classList.remove('hidden');
            } else {
                sponsorEl.classList.add('hidden');
            }

            // 判斷是否顯示「上車/房型」選項
            const isTravel = e.type === 'travel';
            const travelEl = document.getElementById('opt-container-travel');
            if (isTravel) {
                travelEl.classList.remove('hidden');
            } else {
                travelEl.classList.add('hidden');
            }

            // ★ 智慧判斷：如果沒什麼好選的，直接複製並跳過視窗
            const showSponsor = !sponsorEl.classList.contains('hidden');
            const showTravel = !travelEl.classList.contains('hidden');

            if (!showSponsor && !showTravel) {
                performCopy({ includeSponsor: false, includeTravel: false });
                return;
            }

            // 確保隱藏無選項提示
            const noOptsEl = document.getElementById('share-no-opts');
            if (noOptsEl) noOptsEl.classList.add('hidden');

            // 重置選項預設狀態（僅勾選贊助/認桌及報名連結）
            const mapCheckbox = document.getElementById('share-opt-map');
            const namesCheckbox = document.getElementById('share-opt-names');
            const linkCheckbox = document.getElementById('share-opt-link');
            if (mapCheckbox) mapCheckbox.checked = false;
            if (namesCheckbox) namesCheckbox.checked = false;
            if (linkCheckbox) linkCheckbox.checked = true;

            document.getElementById('share-modal').classList.remove('hidden');
            refreshIcons();
        }

        function confirmShareCopy() {
            // 取得使用者勾選狀態
            const includeSponsor = document.getElementById('share-opt-sponsor').checked && !document.getElementById('opt-container-sponsor').classList.contains('hidden');
            const includeTravel = document.getElementById('share-opt-travel').checked && !document.getElementById('opt-container-travel').classList.contains('hidden');
            const includeMap = document.getElementById('share-opt-map').checked;
            const includeNames = document.getElementById('share-opt-names').checked;
            const includeLink = document.getElementById('share-opt-link').checked;

            // 關閉視窗
            document.getElementById('share-modal').classList.add('hidden');

            // 執行複製，傳入參數
            performCopy({ includeSponsor, includeTravel, includeMap, includeNames, includeLink });
        }

        // 舊按鈕 (名單視窗下方) 呼叫此函式：統一呼叫 openShareModal 以提供選項
        function copyDetailsToClipboard() {
            openShareModal();
        }

        // --- 圖片分享功能 ---
        async function shareAsImage() {
            const e = appState.currentEvent;
            if (!e) return;
            const data = appState.cachedDetails || [];

            const btn = document.getElementById('btn-share-image');
            const origHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> 產生中...';
            refreshIcons();

            // 圖片分享為固定內容，不依照勾選（只有複製文字才依勾選）
            const includeSponsor = false; // 名單內不顯示贊助，改由下方獨立區塊顯示
            const includeTravel = true;
            const includeMap = false;  // 圖片不含地圖連結
            const includeNames = true;
            const includeLink = false; // 圖片不含報名連結

            try {
                // --- 1. 動態產生分享卡片 HTML ---
                const card = document.createElement('div');
                card.style.cssText = 'position:fixed;left:-9999px;top:0;width:420px;padding:32px;background:linear-gradient(180deg,#f0fdf4 0%,#ffffff 100%);font-family:"Segoe UI","Noto Sans TC",sans-serif;color:rgba(255,255,255,0.9);z-index:-1;';

                // 活動標題區
                let html = '';
                html += '<div style="background:linear-gradient(135deg,#06c755 0%,#059669 100%);color:white;padding:20px 24px;border-radius:16px;margin-bottom:20px;">';
                html += `<div style="font-size:22px;font-weight:800;">📅 ${escapeHtml(e.name)}</div>`;
                html += '</div>';

                // 活動資訊區
                html += '<div style="background:white;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
                if (e.organizer) html += `<div style="font-size:14px;margin-bottom:8px;">👤 主辦人：${escapeHtml(e.organizer)}</div>`;
                let timeDisplay = e.time;
                if (timeDisplay) {
                    if (timeDisplay.includes('~')) {
                        // 旅遊活動：顯示日期範圍
                        const [start, end] = timeDisplay.split('~');
                        timeDisplay = `${formatDateOnly(start)} ~ ${formatDateOnly(end)}`;
                    } else {
                        const d = new Date(timeDisplay);
                        if (!isNaN(d.getTime())) {
                            const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
                            timeDisplay = `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${week}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                        }
                    }
                }
                if (timeDisplay) html += `<div style="font-size:14px;margin-bottom:8px;">🕒 時間：${escapeHtml(timeDisplay)}</div>`;
                if (e.location) html += `<div style="font-size:14px;margin-bottom:8px;">📍 地點：${escapeHtml(e.location)}</div>`;
                if (e.address) html += `<div style="font-size:14px;margin-bottom:8px;">🚗 地址：${escapeHtml(e.address)}</div>`;
                if (includeMap) {
                    const mapQuery = e.address || e.location;
                    html += `<div style="font-size:13px;margin-bottom:4px;color:#2563eb;">🗺️ 地圖：https://www.google.com/maps/search/${encodeURIComponent(mapQuery)}</div>`;
                }
                if (includeLink) {
                    html += `<div style="font-size:13px;color:#2563eb;">🔗 報名：https://liff.line.me/${LIFF_ID}</div>`;
                }
                html += '</div>';

                // 名單區
                if (includeNames && data.length > 0) {
                    html += '<div style="background:white;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
                    html += '<div style="font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #06c755;">👥 報名名單</div>';
                    let count = 0;
                    data.forEach(p => {
                        count++;
                        const family = getIntField(p, 'family');
                        const guestData = parseGuestData(p);
                        const guestCountFallback = getIntField(p, 'guestCount');
                        const guestTotalCount = guestData.reduce((acc, g) => acc + g.count, 0);
                        const finalGuestCount = guestTotalCount > 0 ? guestTotalCount : guestCountFallback;
                        const total = 1 + family + finalGuestCount;
                        const num = count.toString().padStart(2, '0');
                        const status = p.status || p.note || '';
                        let prefix = status ? status : '';

                        // ★ 新增：取得角色標籤並轉換為 HTML
                        const roles = getParticipantRoles(p.name, e);
                        let tagHtml = '';
                        if (roles.length > 0) {
                            // 改為純文字顏色變化，不使用背板色塊
                            tagHtml = roles.map(r => `<span style="color:${r.color};font-size:12px;font-weight:bold;margin-left:6px;display:inline-flex;align-items:center;">${r.label}</span>`).join('');
                        }

                        html += `<div style="font-size:14px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;">`;
                        html += `<span style="color:#06c755;font-weight:700;margin-right:4px;">${num}.</span> <span style="display:inline-flex;align-items:center;">${escapeHtml(prefix)}${escapeHtml(p.name)}${tagHtml}</span>`;
                        if (total > 1) html += `<span style="color:#f59e0b;font-weight:600;margin-left:6px;">×${total}</span>`;
                        html += '</div>';

                        // 來賓
                        if (guestData.length > 0) {
                            const guestParts = guestData.map(g => g.count > 1 ? `${g.name}×${g.count}` : g.name);
                            html += `<div style="font-size:12px;color:rgba(255,255,255,0.5);padding:2px 0 4px 20px;">來賓：${guestParts.join('、')}</div>`;
                        } else {
                            const guestNameStr = getField(p, 'guestName');
                            if (guestNameStr && guestNameStr !== '無') {
                                html += `<div style="font-size:12px;color:rgba(255,255,255,0.5);padding:2px 0 4px 20px;">來賓：${guestNameStr}</div>`;
                            }
                        }

                        // 贊助
                        if (includeSponsor) {
                            let moneyLines = [];
                            const tc = getIntField(p, 'tableCount');
                            if (tc > 0) moneyLines.push(`認桌: ${tc}桌`);
                            const sponsorRaw = getField(p, 'sponsor');
                            const sponsorList = parseSponsorData(sponsorRaw);
                            sponsorList.forEach(s => moneyLines.push(`贊助: ${s}`));
                            if (moneyLines.length > 0) {
                                html += `<div style="font-size:12px;color:#d97706;padding:2px 0 4px 20px;">${moneyLines.join('、')}</div>`;
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
                                html += `<div style="font-size:12px;color:#7c3aed;padding:2px 0 4px 20px;">${travelLines.join('、')}</div>`;
                            }
                        }
                    });
                    html += '</div>';
                }

                // 贊助/認桌彙總區（獨立區塊，不論是否勾選名單都會顯示）
                if (data.length > 0) {
                    let sponsorHtml = '';
                    data.forEach(p => {
                        let moneyParts = [];
                        const tc = getIntField(p, 'tableCount');
                        if (tc > 0) moneyParts.push(`認桌: ${tc}桌`);
                        const sponsorRaw = getField(p, 'sponsor');
                        const sponsorList = parseSponsorData(sponsorRaw);
                        sponsorList.forEach(s => moneyParts.push(`贊助: ${s}`));
                        if (moneyParts.length > 0) {
                            sponsorHtml += `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);"><span style="font-weight:600;">${p.name}</span>：${moneyParts.join('、')}</div>`;
                        }
                    });
                    if (sponsorHtml) {
                        html += '<div style="background:white;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px 20px;margin-bottom:16px;">';
                        html += '<div style="font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #f59e0b;color:#d97706;">💰 贊助 / 認桌資訊</div>';
                        html += sponsorHtml;
                        html += '</div>';
                    }
                }

                // 統計區
                html += '<div style="text-align:center;font-size:14px;font-weight:700;color:#374151;padding:8px 0;">';
                html += `共 ${appState.currentStats.totalPeople || 0} 人報名`;
                html += '</div>';

                // 浮水印
                html += '<div style="text-align:center;font-size:11px;color:#9ca3af;margin-top:8px;">大老二兄弟會 活動報名系統</div>';

                card.innerHTML = html;
                document.body.appendChild(card);

                // --- 2. 使用 html2canvas 截取卡片 ---
                const canvas = await html2canvas(card, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: null,
                    width: card.scrollWidth,
                    height: card.scrollHeight
                });

                // 移除暫時卡片
                document.body.removeChild(card);

                // --- 3. 轉為 blob 並分享或下載 ---
                canvas.toBlob(async (blob) => {
                    if (!blob) { showToast('圖片產生失敗'); return; }
                    const file = new File([blob], `${e.name}_名單.png`, { type: 'image/png' });

                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

                    if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                        try {
                            let shareText = `📅 ${e.name}\n`;
                            if (e.organizer) shareText += `👤 主辦人：${e.organizer}\n`;
                            let timeDisplay = e.time;
                            if (timeDisplay) {
                                const d = new Date(timeDisplay);
                                if (!isNaN(d.getTime())) {
                                    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
                                    timeDisplay = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}(${week}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                                }
                            }
                            if (timeDisplay) shareText += `🕒 時間：${timeDisplay}\n`;
                            if (e.location) shareText += `📍 地點：${e.location}\n`;
                            if (e.address) shareText += `🚗 地址：${e.address}\n`;
                            shareText += `---------------------\n`;
                            shareText += `共 ${appState.currentStats.totalPeople || 0} 人報名\n`;

                            // ★ 活動日當天顯示 Google 地圖連結，非活動日顯示報名連結
                            const today = new Date();
                            const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
                            let isEventDay = false;

                            if (e.time) {
                                if (typeof e.time === 'string' && e.time.includes('~')) {
                                    // 旅遊活動：日期範圍
                                    const [startStr, endStr] = e.time.split('~').map(s => s.trim());
                                    const startD = new Date(startStr);
                                    const endD = new Date(endStr);
                                    if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
                                        const todayD = new Date(todayStr);
                                        isEventDay = todayD >= new Date(startD.toDateString()) && todayD <= new Date(endD.toDateString());
                                    }
                                } else {
                                    const eventDate = new Date(e.time);
                                    if (!isNaN(eventDate.getTime())) {
                                        const eventStr = `${eventDate.getFullYear()}-${(eventDate.getMonth() + 1).toString().padStart(2, '0')}-${eventDate.getDate().toString().padStart(2, '0')}`;
                                        isEventDay = (todayStr === eventStr);
                                    }
                                }
                            }

                            if (isEventDay && (e.address || e.location)) {
                                const mapQuery = e.address || e.location;
                                shareText += `🗺️ Google 地圖👇：\nhttps://www.google.com/maps/search/?api=1&query=${mapQuery}`;
                            } else {
                                shareText += `🔗 報名連結👇：\nhttps://liff.line.me/${LIFF_ID}`;
                            }

                            await navigator.share({
                                files: [file],
                                title: e.name,
                                text: shareText
                            });
                            showToast('圖片分享成功！');
                        } catch (err) {
                            if (err.name !== 'AbortError') {
                                console.error('圖片分享失敗:', err);
                                fallbackDownloadImage(canvas, e.name);
                            }
                        }
                    } else {
                        fallbackDownloadImage(canvas, e.name);
                    }

                    document.getElementById('share-modal').classList.add('hidden');
                }, 'image/png');

            } catch (err) {
                console.error('圖片產生失敗', err);
                showToast('產生圖片失敗：' + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = origHtml;
                refreshIcons();
            }
        }

        function fallbackDownloadImage(canvas, evtName) {
            const link = document.createElement('a');
            link.download = `${evtName || '活動'}_名單.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            showToast('已下載名單圖片！');
        }

        // --- Telegram 發送功能 ---
        async function sendToTelegram() {
            if (!appState.currentEvent) return;

            showToast("正在發送至 Telegram...");

            try {
                const result = await apiSubmit({
                    action: 'sendListToTelegram',
                    eventId: appState.currentEvent.id
                });

                if (result.success) {
                    showToast("✅ 名單已發送至 Telegram");
                } else {
                    showToast("❌ 發送失敗: " + (result.error || "未知錯誤"));
                }
            } catch (err) {
                console.error(err);
                showToast("❌ 發送失敗，請檢查網路");
            }
        }

        // 核心複製邏輯：支援參數與格式化
        function performCopy(options = { includeSponsor: true, includeTravel: true, includeMap: true, includeNames: true, includeLink: true }) {
            // ★ 修改為同步讀取快取資料
            const data = appState.cachedDetails || [];

            if (!data || data.length === 0) {
                // Try to fetch if cache is empty (though unlikely if modal is open)
                // But fetching async here will break mobile copy. 
                // So we just warn.
                return showToast("資料讀取中或無資料，請稍後再試");
            }

            // Sync execution continues...
            { // Block to keep variable scope clean equivalent to previous .then callback

                const e = appState.currentEvent;

                let text = `📅 ${e.name}\n`;
                // 判斷並加入活動資訊
                if (e.organizer) text += `👤 主辦人：${e.organizer}\n`;

                // 時間處理：加入(星期X)格式
                let timeDisplay = e.time;
                if (timeDisplay) {
                    const d = new Date(timeDisplay);
                    if (!isNaN(d.getTime())) {
                        const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
                        timeDisplay = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}(${week}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                    }
                }
                if (timeDisplay) text += `🕒 時間：${timeDisplay}\n`;

                if (e.location) text += `📍 地點：${e.location}\n`;
                if (e.address) text += `🚗 地址：${e.address}\n`;
                text += `---------------------\n`;



                if (options.includeNames !== false) {
                    let count = 0;
                    data.forEach((p, i) => {
                        count++;
                        const family = getIntField(p, 'family');
                        const guestData = parseGuestData(p);
                        const guestCountFallback = getIntField(p, 'guestCount');
                        const guestTotalCount = guestData.reduce((acc, g) => acc + g.count, 0);
                        const finalGuestCount = guestTotalCount > 0 ? guestTotalCount : guestCountFallback;
                        const total = 1 + family + finalGuestCount;

                        const num = count.toString().padStart(2, '0');
                        const status = p.status || p.note || '';
                        const prefix = status ? status : '';

                        // ★ 新增：純文字複製時附加文字標籤
                        const roles = getParticipantRoles(p.name, e);
                        let textTags = '';
                        if (roles.length > 0) {
                            textTags = ' ' + roles.map(r => r.textLabel).join('');
                        }

                        text += `${num}. ${prefix}${p.name}${textTags}`;
                        if (total > 1) text += ` *${total}`;
                        text += `\n`;

                        // ★ 修改：來賓名單整合為單行，顯示在下方 ★
                        if (guestData.length > 0) {
                            const guestParts = guestData.map(g => {
                                return g.count > 1 ? `${g.name}*${g.count}` : g.name;
                            });
                            text += `      來賓：${guestParts.join('、')}\n`;
                        } else {
                            const guestNameStr = getField(p, 'guestName');
                            if (guestNameStr && guestNameStr !== '無') {
                                text += `      來賓：${guestNameStr}\n`;
                            }
                        }

                        // 贊助/認桌不在名單內顯示，改由下方獨立區塊統一列出

                        if (options.includeTravel) {
                            let travelLines = [];
                            if (p.pickup && p.pickup !== '無') travelLines.push(`[主]車: ${p.pickup}`);
                            if (p.room && p.room !== '無') travelLines.push(`[主]房: ${p.room}`);

                            if (guestData.length > 0) {
                                guestData.forEach(g => {
                                    let extras = [];
                                    if (g.pickup && g.pickup !== '無') extras.push(g.pickup);
                                    if (g.room && g.room !== '無') extras.push(g.room);
                                    if (extras.length > 0) {
                                        travelLines.push(`[賓]${g.name}: ${extras.join('/')}`);
                                    }
                                });
                            }
                            if (travelLines.length > 0) {
                                travelLines.forEach(l => text += `      ${l}\n`);
                            }
                        }
                    });
                }

                // ★ 贊助/認桌獨立區塊（不論是否勾選名單，只要有資料就顯示）
                if (options.includeSponsor) {
                    let hasSponsorData = false;
                    let sponsorText = '';
                    data.forEach(p => {
                        let moneyLines = [];
                        const tc = getIntField(p, 'tableCount');
                        if (tc > 0) moneyLines.push(`認桌: ${tc}桌`);

                        const sponsorRaw = getField(p, 'sponsor');
                        const sponsorList = parseSponsorData(sponsorRaw);
                        sponsorList.forEach(s => moneyLines.push(`贊助: ${s}`));

                        if (moneyLines.length > 0) {
                            hasSponsorData = true;
                            sponsorText += `${p.name}：${moneyLines.join('、')}\n`;
                        }
                    });
                    if (hasSponsorData) {
                        text += `【贊助/認桌】\n${sponsorText}`;
                    }
                }

                text += `---------------------\n`;
                text += `共 ${appState.currentStats.totalPeople || 0} 人報名\n`;

                if (options.includeMap && e.address) {
                    text += `🗺️ Google 地圖：\nhttps://www.google.com/maps/search/?api=1&query=${e.address}\n`;
                }

                // ★ 活動日當天自動替換：報名連結 → Google 地圖連結
                if (options.includeLink !== false) {
                    const today = new Date();
                    const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
                    let isEventDay = false;

                    if (e.time) {
                        if (typeof e.time === 'string' && e.time.includes('~')) {
                            const [startStr, endStr] = e.time.split('~').map(s => s.trim());
                            const startD = new Date(startStr);
                            const endD = new Date(endStr);
                            if (!isNaN(startD.getTime()) && !isNaN(endD.getTime())) {
                                const todayD = new Date(todayStr);
                                isEventDay = todayD >= new Date(startD.toDateString()) && todayD <= new Date(endD.toDateString());
                            }
                        } else {
                            const eventDate = new Date(e.time);
                            if (!isNaN(eventDate.getTime())) {
                                const eventStr = `${eventDate.getFullYear()}-${(eventDate.getMonth() + 1).toString().padStart(2, '0')}-${eventDate.getDate().toString().padStart(2, '0')}`;
                                isEventDay = (todayStr === eventStr);
                            }
                        }
                    }

                    if (isEventDay && (e.address || e.location)) {
                        const mapQuery = e.address || e.location;
                        text += `🗺️ Google 地圖👇：\nhttps://www.google.com/maps/search/?api=1&query=${mapQuery}\n`;
                    } else {
                        text += `🔗 報名連結👇：\nhttps://liff.line.me/${LIFF_ID}\n`;
                    }
                }

                copyTextToClipboard(text);
            }
        }

        // --- ★★★ 這裡就是修正的關鍵，原本遺失的函式 ★★★ ---
        function formatDateShort(isoStr) {
            if (!isoStr) return '';

            // 如果是旅遊活動的時間範圍 (例如: 2023-10-10~2023-10-12)
            if (isoStr.includes('~')) {
                const start = isoStr.split('~')[0];
                const d = new Date(start);
                // 如果日期無效，回傳原始字串
                if (isNaN(d.getTime())) return start;
                return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}...`;
            }

            const d = new Date(isoStr);
            // 如果日期無效，回傳原始字串
            if (isNaN(d.getTime())) return isoStr;

            const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
            // 回傳格式: 月/日 (星期)
            return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${week})`;
        }

        function formatDate(isoStr) {
            if (!isoStr) return '';
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return isoStr;
            const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
            return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} (${week}) ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        }

        function formatDateOnly(isoStr) {
            if (!isoStr) return '';
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return isoStr;
            const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
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
                showToast('請填寫姓名');
                return false;
            }
            return true;
        }

        function addGuest() {
            const name = document.getElementById('add-guest-name').value.trim();
            const count = parseInt(document.getElementById('add-guest-count').value);
            if (!name) return showToast("請輸入來賓姓名");

            const pickup = document.getElementById('add-guest-pickup').value;
            const room = document.getElementById('add-guest-room').value;

            // 產生簡易暫時 ID
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
             <button onclick="retryCopy()" class="flex-1 py-3 rounded-xl font-bold text-white bg-[#06c755] hover:bg-green-600 shadow-md active:scale-95 transition flex justify-center items-center gap-2">
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