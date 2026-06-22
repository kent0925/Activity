// ==========================================
// 大老二兄弟會活動報名系統 - 初始化腳本
// 從 index.html <head> 內的 <script> 抽出

// 全域語錄陣列 (供分享功能共用)
window.APP_QUOTES = [
    "錢放在口袋會咬人，把它變成酒精就不痛了。",
    "這不是喝酒，這是「液體麵包」的試吃大會。",
    "根據研究，不喝酒的人，這輩子都沒喝醉過（廢話）。",
    "地球有 70% 是水，你身體有 70% 是酒精，這才叫天人合一。",
    "別問我為什麼要喝，因為清醒的時候，你們長得太普通了。",
    "酒是用糧食做的，所以喝酒等於吃飯，別跟我說你吃飽了。",
    "我的星座運勢說，今晚不宜清醒，宜發瘋。",
    "人生已經夠複雜了，只有「再來一杯」是單純的。",
    "你的酒量是試用期的喔？還沒轉正？",
    "我看你拿酒杯的手勢，像在拿香拜拜，是在祭祖嗎？",
    "留那麼多酒底養魚？你是要參加海釣大賽？",
    "你是來喝酒的，還是來當氣氛破壞者的？",
    "膽子小沒關係，酒量差也沒關係，但兩個都有就有關係了。",
    "別躲在螢幕後面當巨人，出來當酒桌上的侏儒。",
    "你的藉口跟你的髮量一樣，越來越稀疏了。",
    "我都喝三輪了，你還在那邊「微醺」？效率太差了吧。",
    "你是騎烏龜出門的嗎？",
    "酒都醒了，你人還在哪？需要報失蹤人口嗎？",
    "我們是在喝酒，不是在等你相親，快滾過來。",
    "再不來，我們就要把你的那份喝掉，帳單寄給你。",
    "你的導航是導到太平洋去了喔？",
    "你的酒杯長蜘蛛網了嗎？",
    "是在養生還是在養老？你是來幫我們送終的嗎？",
    "別讓酒杯空得像你的腦袋一樣。",
    "定位傳過來，不然我去把你綁過來。",
    "你的社交功能已暫停，請立即注入酒精重啟。",
    "不要做聚會的「幽靈人口」，我看得到你已讀。",
    "你是被三秒膠黏在沙發上喔？",
    "別逼我把你的名字寫在酒瓶上祭拜。",
    "遲到的人，罰酒是規矩，被嗆是樂趣。",
    "我看你不是忙，你是忘了怎麼做人（社交）。",
    "看心理醫生很貴，這裡有一批很便宜的酒精治療。",
    "清醒的你太無聊，喝醉的你才像個人。",
    "腦袋放家裡，酒杯握手裡，這才是週末的標準姿勢。",
    "投資理財有賺有賠，投資酒精保證快樂（而且絕對賠錢）。",
    "明天是個未知數，今晚是個絕對值。",
    "我們喝的不是酒，是成年人的「暫停鍵」。",
    "你心中的苦，酒精會幫你消化；你消化不了的，馬桶會幫你。",
    "別跟我談人生，我現在只想談酒深（深淺）。",
    "酒精是成年人的奶嘴，不吸睡不著。",
    "I 人 E 人，喝了酒都是自己人。",
    "你的原則在酒精面前，一文不值。",
    "減肥是明天的事，喝酒是現在的義務。",
    "別擔心熱量，酒精會燃燒你的羞恥心，連帶燃燒脂肪（誤）。",
    "這種天氣不喝酒，難道要出去淋雨嗎？",
    "你的酒量就像手機電量，太低會焦慮，快來充飽。",
    "別說你沒錢，你缺的不是錢，是出來嗨的勇氣。",
    "擇日不如撞日，撞日不如今日醉。",
    "別問幾點結束，要問你幾點倒下。",
    "你的行程表滿了？把它撕了，現在我有空。",
    "只有小孩子才做選擇，成年人當然是「再來一瓶」。",
    "酒杯舉起來，煩惱滾一邊。",
    "話都在酒裡，不來就是看不起。",
    "不是猛龍不過江，不是酒鬼不開幫。",
    "酒精濃度檢測：開始！",
    "你的靈魂缺水了。",
    "別囉唆，開瓶聲最好聽。",
    "只有醉，沒有退。",
    "喉嚨借過。",
    "酒精格式化。",
    "補血。",
    "只有現在。",
    "乾了算我的。",
    "集合令。",
    "酒鬼點名。",
    "戰力展示。",
    "歸零。",
    "喝！"
];


// 語錄與拉霸功能初始化
// 隨機選擇語錄 (首頁、Meta 專用)
const randomQuote = window.APP_QUOTES[Math.floor(Math.random() * window.APP_QUOTES.length)];

document.addEventListener('DOMContentLoaded', function () {
    const ogDesc = document.getElementById('og-description');
    const metaDesc = document.getElementById('meta-description');
    if (ogDesc) ogDesc.setAttribute('content', randomQuote);
    if (metaDesc) metaDesc.setAttribute('content', randomQuote);

    const sloganText = document.getElementById('slogan-text');
    if (sloganText) sloganText.innerText = randomQuote;

    // ★ 取得並顯示出席王 Top 3
    fetchAttendanceTop3();

    // ★ 啟動迷你老虎機已經移除，改由 app.js 或 init.js 主動觸發隱藏
});

// 新增：抓取拉霸 Top 3 數據 (優化版：先顯後更，每日快取)
async function fetchJackpotTop3() {
    const overlayContainer = document.getElementById('overlay-rankings-container');
    const homeContainer = document.getElementById('home-rankings-section');
    if (!overlayContainer && !homeContainer) return;

    const cacheKey = 'jackpot_full_cache';
    let cachedData = null;
    try {
        const stored = localStorage.getItem(cacheKey);
        if (stored) cachedData = JSON.parse(stored);
    } catch (e) {
        console.warn("Parse cache failed", e);
    }

    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    let hasValidCache = false;

    if (cachedData && cachedData.data && Array.isArray(cachedData.data)) {
        appState.jackpotRankings = cachedData.data;
        const top3 = cachedData.data.slice(0, 3);
        renderJackpotTop3(top3);
        if (overlayContainer) overlayContainer.classList.remove('opacity-0', 'translate-y-4');
        if (homeContainer) homeContainer.classList.remove('hidden');

        if (cachedData.date === todayStr) {
            hasValidCache = true; // 已經是今天的快取，不需再打 API
        }
    }

    if (hasValidCache) return;

    try {
        const res = await fetch(`${GAS_URL}?action=getMaryRankings&_=${Date.now()}`);
        const responseJson = await res.json();
        // GAS 改為回傳 { status: 'success', data: [...] }
        const allData = responseJson.data || responseJson; 

        if (Array.isArray(allData) && allData.length > 0) {
            allData.sort((a, b) => {
                const valA = a.score !== undefined ? a.score : a.count;
                const valB = b.score !== undefined ? b.score : b.count;
                if (valB !== valA) return valB - valA;
                return String(a.name).localeCompare(String(b.name), 'zh-TW', { collation: 'stroke' });
            });

            localStorage.setItem(cacheKey, JSON.stringify({ date: todayStr, data: allData }));
            appState.jackpotRankings = allData;

            const top3 = allData.slice(0, 3);
            renderJackpotTop3(top3);
            if (overlayContainer) overlayContainer.classList.remove('opacity-0', 'translate-y-4');
            if (homeContainer) homeContainer.classList.remove('hidden');
        }
    } catch (e) {
        console.warn("Fetch Jackpot All failed", e);
    }
}

// 新增：抓取出席王 Top 3 數據 (優化版：先顯後更，每日快取)
async function fetchAttendanceTop3() {
    const overlayContainer = document.getElementById('overlay-rankings-container');
    const homeContainer = document.getElementById('home-rankings-section');
    if (!overlayContainer && !homeContainer) return;

    const cacheKey = 'attendance_full_cache';
    let cachedData = null;
    try {
        const stored = localStorage.getItem(cacheKey);
        if (stored) cachedData = JSON.parse(stored);
    } catch (e) {
        console.warn("Parse cache failed", e);
    }

    const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    let hasValidCache = false;

    if (cachedData && cachedData.data && Array.isArray(cachedData.data)) {
        appState.attendanceRankings = cachedData.data;
        const top3 = cachedData.data.slice(0, 3);
        renderAttendanceTop3(top3);
        if (overlayContainer) overlayContainer.classList.remove('opacity-0', 'translate-y-4');
        if (homeContainer) homeContainer.classList.remove('hidden');

        if (cachedData.date === todayStr) {
            hasValidCache = true; // 已經是今天的快取，不需再打 API
        }
    }

    if (hasValidCache) return;

    try {
        const res = await fetch(`${GAS_URL}?action=getParticipationStats&_=${Date.now()}`);
        const responseJson = await res.json();
        // GAS 改為回傳 { status: 'success', data: [...] }
        const allData = responseJson.data || responseJson;

        if (Array.isArray(allData) && allData.length > 0) {
            allData.sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return String(a.name).localeCompare(String(b.name), 'zh-TW', { collation: 'stroke' });
            });

            localStorage.setItem(cacheKey, JSON.stringify({ date: todayStr, data: allData }));
            appState.attendanceRankings = allData;

            const top3 = allData.slice(0, 3);
            renderAttendanceTop3(top3);
            if (overlayContainer) overlayContainer.classList.remove('opacity-0', 'translate-y-4');
            if (homeContainer) homeContainer.classList.remove('hidden');
        }
    } catch (e) {
        console.warn("Fetch Participation Full failed", e);
    }
}

function renderJackpotTop3(data) {
    const container = document.getElementById('home-rankings-section');
    const listEl = document.getElementById('jackpot-top3-list'); // Overlay list
    const homeListEl = document.getElementById('home-jackpot-list'); // Home list
    if (!listEl && !homeListEl) return;
    if (container) container.classList.remove('hidden');

    const displayOrder = data.length >= 3 ? [1, 0, 2] : (data.length === 2 ? [0, 1] : [0]);

    let html = '';
    displayOrder.forEach(idx => {
        if (!data[idx]) return;
        const p = data[idx];
        const isFirst = idx === 0;
        const medal = isFirst ? '🥇' : (idx === 1 ? '🥈' : '🥉');
        const sizeClass = isFirst ? 'scale-110 -translate-y-1' : 'scale-95 opacity-80';

        const glowClass = isFirst ? 'ring-2 ring-amber-400/30 rounded-full p-2 bg-amber-500/10 shadow-[0_0_15px_rgba(251,191,36,0.2)]' : '';

        const safeName = p.name ? p.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") : '';
        html += `
                <div class="flex flex-col items-center ${sizeClass}">
                    <div class="flex flex-col items-center ${glowClass}">
                        <span class="text-xl leading-none mb-0.5">${medal}</span>
                        <span class="text-[11px] font-black text-template-name truncate max-w-template-width">${safeName}</span>
                    </div>
                    <span class="text-template-count-color text-[9px] font-black mt-0.5">${p.score !== undefined ? p.score + ' 分' : p.count + ' 次'}</span>
                </div>
            `;
    });

    if (listEl) {
        listEl.innerHTML = html
            .replace(/text-template-name/g, 'text-white')
            .replace(/text-template-count-color/g, 'text-white/80')
            .replace(/max-w-template-width/g, 'max-w-[50px]');
    }
    if (homeListEl) {
        homeListEl.innerHTML = html
            .replace(/text-template-name/g, 'text-white/90')
            .replace(/text-template-count-color/g, 'text-amber-400')
            .replace(/max-w-template-width/g, 'max-w-[60px]');
    }

    if (typeof refreshIcons === 'function') refreshIcons();
}

function renderAttendanceTop3(data) {
    const container = document.getElementById('home-rankings-section');
    const listEl = document.getElementById('participation-top3-list');
    const overlayListEl = document.getElementById('overlay-participation-list');
    if (!listEl && !overlayListEl) return;
    if (container) container.classList.remove('hidden');

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

        const safeName = p.name ? p.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") : '';
        html += `
            <div class="flex flex-col items-center ${sizeClass}">
                <div class="flex flex-col items-center ${glowClass}">
                    <span class="text-xl leading-none mb-0.5">${medal}</span>
                    <span class="text-[11px] font-black text-template-name truncate max-w-template-width">${safeName}</span>
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
        overlayListEl.innerHTML = html
            .replace(/text-template-name/g, 'text-white')
            .replace(/text-template-count-color/g, 'text-white/80')
            .replace(/max-w-template-width/g, 'max-w-[50px]');
    }

    if (typeof refreshIcons === 'function') refreshIcons();
}

