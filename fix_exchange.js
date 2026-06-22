const fs = require('fs');

// 1. Fix maryExchange in mary.js
let maryJs = fs.readFileSync('mary.js', 'utf8');

// Replace the maryExchange overlay creation logic
const oldOverlayContent = `const overlay = document.createElement('div');
    overlay.id = 'mary-exchange-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.95);border-radius:24px;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;';
    overlay.innerHTML = \`
        <div style="font-size:16px;font-weight:900;color:#ffcc00;">積分換霸幣 (10:1 兌換)</div>
        <div style="background:#111;border:1px solid #ff6600;border-radius:10px;padding:10px 16px;width:100%;text-align:center;">
            <div style="font-size:10px;color:#ff6600;margin-bottom:4px;letter-spacing:2px;">YOU HAVE</div>
            <div id="mary-exchange-slot-score" style="font-size:28px;font-weight:900;color:#fa0;font-family:monospace;" class="animate-pulse">讀取中...</div>
            <div style="font-size:10px;color:#888;">拉霸積分</div>
        </div>
        <div style="color:#ccc;font-size:11px;text-align:center;">
            最多可將 <b id="mary-exchange-max-convert" style="color:#0f0;">---</b> 點拉霸積分<br>
            <span style="color:#666;font-size:10px;">換成 <b id="mary-exchange-max-mary" style="color:#ffcc00;">---</b> 霸幣 (Casino籌碼)</span>
        </div>
        <input id="mary-exchange-input" type="number" inputmode="numeric" pattern="[0-9]*" min="10" step="10" placeholder="等候中..."
            style="width:100%;background:rgba(255,255,255,0.08);border:1px solid #fa0;border-radius:10px;
            padding:10px;color:#fa0;text-align:center;font-size:18px;font-weight:900;font-family:monospace;
            outline:none;" disabled>
        <div style="font-size:10px;color:#555;">最少10分，請輸入10的倍數</div>
        <div style="display:flex;gap:10px;width:100%;">
            <button onclick="document.getElementById('mary-exchange-overlay').remove()"
                style="flex:1;padding:12px;background:rgba(255,255,255,0.1);border:none;border-radius:10px;
                color:#ccc;font-weight:700;font-size:13px;cursor:pointer;">取消</button>
            <button id="mary-exchange-btn-confirm" onclick="maryConfirmExchange()" disabled
                style="flex:2;padding:12px;background:linear-gradient(135deg,#663300,#995500);
                border:none;border-radius:10px;color:#ccc;font-weight:900;font-size:13px;cursor:not-allowed;
                box-shadow:none;transition:all 0.3s;">確認兌換</button>
        </div>
    \`;
    document.getElementById('mary-machine').appendChild(overlay);`;

const newOverlayContent = `const overlay = document.createElement('div');
    overlay.id = 'mary-exchange-overlay';
    // 改為覆蓋全螢幕的固定層，並在中間顯示一個對話框
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;';
    overlay.innerHTML = \`
        <div style="background:linear-gradient(to bottom, #1a110a, #0d0905);border:2px solid #ffcc00;border-radius:16px;width:100%;max-width:320px;display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px;box-shadow:0 0 30px rgba(255,204,0,0.3);">
            <div style="font-size:18px;font-weight:900;color:#ffcc00;">兌換 Casino 籌碼<br><span style="font-size:12px;color:#aaa;">拉霸積分 10 : 1 籌碼/霸幣</span></div>
            <div style="background:#000;border:1px solid #ff6600;border-radius:10px;padding:12px;width:100%;text-align:center;">
                <div style="font-size:10px;color:#ff6600;margin-bottom:4px;letter-spacing:2px;">目前拉霸積分</div>
                <div id="mary-exchange-slot-score" style="font-size:32px;font-weight:900;color:#fa0;font-family:monospace;" class="animate-pulse">讀取中...</div>
            </div>
            <div style="color:#ccc;font-size:12px;text-align:center;">
                最多可將 <b id="mary-exchange-max-convert" style="color:#0f0;">---</b> 積分<br>
                <span style="color:#888;font-size:11px;">兌換成 <b id="mary-exchange-max-mary" style="color:#ffcc00;">---</b> 籌碼</span>
            </div>
            <input id="mary-exchange-input" type="number" inputmode="numeric" pattern="[0-9]*" min="10" step="10" placeholder="等候中..."
                style="width:100%;background:rgba(255,255,255,0.08);border:1px solid #fa0;border-radius:10px;
                padding:12px;color:#0f0;text-align:center;font-size:24px;font-weight:900;font-family:monospace;
                outline:none;" disabled>
            <div style="font-size:10px;color:#888;">最少 10 分，請輸入 10 的倍數</div>
            <div style="display:flex;gap:10px;width:100%;margin-top:4px;">
                <button onclick="document.getElementById('mary-exchange-overlay').remove()"
                    style="flex:1;padding:12px;background:rgba(255,255,255,0.1);border:none;border-radius:10px;
                    color:#ccc;font-weight:700;font-size:14px;cursor:pointer;">取消</button>
                <button id="mary-exchange-btn-confirm" onclick="maryConfirmExchange()" disabled
                    style="flex:2;padding:12px;background:linear-gradient(135deg,#ff6600,#cc3300);
                    border:none;border-radius:10px;color:#fff;font-weight:900;font-size:14px;cursor:not-allowed;
                    box-shadow:none;transition:all 0.3s;">確認兌換</button>
            </div>
        </div>
    \`;
    document.body.appendChild(overlay);`;

maryJs = maryJs.replace(oldOverlayContent, newOverlayContent);

// Also need to check if maryState is defined before accessing maryState.isSpinning
// Because in Casino, mary.js is loaded but openSmallMary might not have been called, but wait, maryState is globally defined at the top: let maryState = { isSpinning: false, ... };
// So it won't throw ReferenceError.
fs.writeFileSync('mary.js', maryJs);
console.log('Fixed mary.js');

// 2. Add the button back to casino.html
let html = fs.readFileSync('casino.html', 'utf8');
const searchString = \`<button onclick="CasinoApp.handleClear()" class="text-xs px-3 py-1.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 active:scale-95 transition border border-gray-600 shadow-md">清除</button>\`;
const replacementString = \`<button onclick="CasinoApp.handleClear()" class="text-xs px-3 py-1.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 active:scale-95 transition border border-gray-600 shadow-md">清除</button>
                        <button onclick="maryExchange()" class="text-xs px-4 py-1.5 rounded bg-gradient-to-r from-blue-600 to-blue-800 text-white font-bold hover:brightness-110 active:scale-95 transition shadow-[0_0_10px_rgba(37,99,235,0.5)] border border-blue-400">兌換</button>\`;

if (html.includes(searchString) && !html.includes('onclick="maryExchange()" class="text-xs px-4 py-1.5 rounded bg-gradient-to-r from-blue-600')) {
    html = html.replace(searchString, replacementString);
    fs.writeFileSync('casino.html', html);
    console.log('Added button back to casino.html');
} else {
    console.log('Button might already exist or searchString not found.');
}
