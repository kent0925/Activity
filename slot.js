const SLOT_CONFIG = {
    symbols: ['?º', '??', '??', '?·', '?Ž²', '??', '?”¥', '?’°'],
    symbolScores: {
        '?º': 1, '??': 2, '??': 0, '?·': 3,
        '?Ž²': 4, '??': 5, '?”¥': 6, '?’°': 10
    },
    jackpots: {
        '?º?º?º': '?­å?ï¼ä??šä??¯è²·?®ç? ??',
        '??????': '?’ç??„èº«ï¼Œæˆ°?›å…¨?‹ï??’ª',
        '??????': 'å»ºè­°ä½ ä??šä?èª¿ä?é»žâ€???',
        '?·?·?·': '?å‘³?žå‡¡ï¼ä??šç??’ä?å¤???',
        '?Ž²?Ž²?Ž²': 'è³­ç??è‡¨ï¼æ?æ°??æ£???',
        '??????': 'ä»Šæ?ä½ å°±?¯ç?ï¼å…¨?´ç„¦é»???,
        '?”¥?”¥?”¥': '?«å??¨é?ï¼èª°?½æ?ä¸ä? ??',
        '?’°?’°?’°': 'è²¡ç?ä¾†ä?ï¼ä??šå¤§è´å®¶ ?’µ',
    },
    pairMsgs: [
        '?„ä??¯å?ï¼Œå€¼å?ä¹¾ä??¯ï??»',
        'å·®ä?é»žå°±ä¸­å¤§?Žä?ï¼å??ä??¯å?å£“é? ?«£',
        '?‹æ°£?®æ™®ï¼Œé??ä?è£œï??’ª',
        '?‰é??æ€ï?ä»Šæ??‰æˆ²ï¼ð??,
        'å°ä¸­?Žï??Žå??¯å¹«å¤§å®¶?’é? ??',
    ],
    missMsgs: [
        'æ²’é?ä¿‚ï??™æ¯?ˆä¹¾?ºæ•¬ï¼ð??,
        '?‹æ°£ä¸ä½³ï¼Ÿå??‹ä??¶å°±å¥½å•¦ï¼ð??,
        '?‹ä?ä»Šæ??©å??šå€‹ä?èª¿ç?è§€???¤«',
        'æ²’ä¸­ï¼Ÿæ?äº‹ï??‘é™ªä½ å?ï¼ðŸ¥?,
        'ä»Šå¤©?ˆæ??‹æ°£å­˜èµ·ä¾†ï??’°',
    ]
};

let _slotSpinning = false;

window.playSlotAgain = function() {
    const btn = document.getElementById('btn-play-slot');
    if (btn) btn.disabled = true;

    const resultEl = document.getElementById('slot-result');
    if (resultEl) {
        resultEl.classList.remove('show', 'jackpot');
        resultEl.textContent = '?‰éœ¸ä¸?..';
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

            resultEl.textContent = `${msg} (?²å? ${score} ??`;
            resultEl.classList.add('show');
            if (isJackpot) resultEl.classList.add('jackpot');

            recordJackpotResult(key, score);
        } catch (e) {
            console.error('showResult ?¼ç??¯èª¤', e);
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
            // ?ªå??Œæ­¥?€?°ç???            if (CasinoApp.syncPoints) {
                CasinoApp.syncPoints();
            }
        }
    } catch (e) {
        console.error('ç´€?„å??¸å¤±??, e);
    }
}

