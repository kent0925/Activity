const SLOT_CONFIG = {
    symbols: ['🍺', '🎉', '💀', '🍷', '🎲', '👑', '🔥', '💰'],
    symbolScores: {
        '🍺': 1, '🎉': 2, '💀': 0, '🍷': 3,
        '🎲': 4, '👑': 5, '🔥': 6, '💰': 10
    },
    jackpots: {
        '🍺🍺🍺': '恭喜！今晚你是買單王 👑',
        '🎉🎉🎉': '酒神附身，戰力全開！💪',
        '💀💀💀': '建議你今晚低調一點… 😇',
        '🍷🍷🍷': '品味非凡！今晚紅酒之夜 🥂',
        '🎲🎲🎲': '賭神降臨！手氣爆棚 🃏',
        '👑👑👑': '今晚你就是王！全場焦點 ✨',
        '🔥🔥🔥': '火力全開！誰都擋不住 🚀',
        '💰💰💰': '財神來了！今晚大贏家 💵',
    },
    pairMsgs: [
        '還不錯嘛，值得乾一杯！🍻',
        '差一點就中大獎了！再喝一杯壓壓驚 🫣',
        '運氣普普，酒量來補！💪',
        '有點意思，今晚有戲！🎭',
        '小中獎！獎品是幫大家倒酒 🫗',
    ],
    missMsgs: [
        '沒關係，這杯先乾為敬！🍺',
        '手氣不佳？再開一瓶就好啦！🍾',
        '看來今晚適合做個低調的觀眾 🤫',
        '沒中？沒事，我陪你喝！🥂',
        '今天先把運氣存起來！💰',
    ]
};

let _slotSpinning = false;

window.playSlotAgain = function() {
    const btn = document.getElementById('btn-play-slot');
    if (btn) btn.disabled = true;

    const resultEl = document.getElementById('slot-result');
    if (resultEl) {
        resultEl.classList.remove('show', 'jackpot');
        resultEl.textContent = '拉霸中...';
    }

    startSlotMachine();
}

function startSlotMachine() {
    if (_slotSpinning) return;
    _slotSpinning = true;

    const symbols = SLOT_CONFIG.symbols;
    const reels = [
        document.getElementById('slot-1'),
        document.getElementById('slot-2'),
        document.getElementById('slot-3')
    ];
    const resultEl = document.getElementById('slot-result');

    if (!reels[0] || !reels[1] || !reels[2] || !resultEl) {
        _slotSpinning = false;
        return;
    }

    const intervals = reels.map(reel => {
        return setInterval(() => {
            reel.querySelector('.slot-symbol').textContent =
                symbols[Math.floor(Math.random() * symbols.length)];
        }, 80);
    });

    const finalSymbols = [];

    function stopReel(index, delay) {
        setTimeout(() => {
            clearInterval(intervals[index]);
            const sym = symbols[Math.floor(Math.random() * symbols.length)];
            reels[index].querySelector('.slot-symbol').textContent = sym;
            reels[index].classList.remove('spinning');
            reels[index].classList.add('stopped');
            finalSymbols[index] = sym;

            if (finalSymbols.filter(s => s !== undefined).length === 3) showResult();
        }, delay);
    }

    stopReel(0, 800);
    stopReel(1, 1400);
    stopReel(2, 2000);

    function showResult() {
        try {
            const key = finalSymbols.join('');
            let score = Math.round(
                finalSymbols.reduce((acc, sym) => acc + (SLOT_CONFIG.symbolScores[sym] || 0), 0)
            );

            let msg = '';
            let isJackpot = false;

            if (SLOT_CONFIG.jackpots[key]) {
                msg = SLOT_CONFIG.jackpots[key];
                isJackpot = true;
                score = Math.round(score * 5);
            } else if (
                finalSymbols[0] === finalSymbols[1] ||
                finalSymbols[1] === finalSymbols[2] ||
                finalSymbols[0] === finalSymbols[2]
            ) {
                msg = SLOT_CONFIG.pairMsgs[Math.floor(Math.random() * SLOT_CONFIG.pairMsgs.length)];
                score = Math.round(score * 2);
            } else {
                msg = SLOT_CONFIG.missMsgs[Math.floor(Math.random() * SLOT_CONFIG.missMsgs.length)];
            }

            resultEl.textContent = `${msg} (獲得 ${score} 分)`;
            resultEl.classList.add('show');
            if (isJackpot) resultEl.classList.add('jackpot');

            recordJackpotResult(key, score);
        } catch (e) {
            console.error('showResult 發生錯誤', e);
        } finally {
            _slotSpinning = false;
            const btn = document.getElementById('btn-play-slot');
            if (btn) btn.disabled = false;
        }
    }
}

async function recordJackpotResult(symbolKey, score) {
    if (!CasinoApp.user || !CasinoApp.user.userId) return;

    try {
        const formData = new URLSearchParams();
        formData.append('action', 'recordJackpot');
        formData.append('userId', CasinoApp.user.userId);
        formData.append('name', CasinoApp.user.displayName || '');
        formData.append('result', symbolKey);
        formData.append('score', score);

        const res = await fetch(GAS_URL, {
            method: 'POST',
            body: formData
        });
        const json = await res.json();
        
        if (json.status === 'success') {
            // 自動同步最新積分
            if (CasinoApp.syncPoints) {
                CasinoApp.syncPoints();
            }
        }
    } catch (e) {
        console.error('紀錄分數失敗', e);
    }
}
