const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Remove scripts from head: <script src="slot.js" defer></script>, <script src="casino.js" defer></script>
html = html.replace(/<script src="slot\.js".*?><\/script>\s*/g, '');
html = html.replace(/<script src="casino\.js".*?><\/script>\s*/g, '');
html = html.replace(/<script src="mary\.js".*?><\/script>\s*/g, '');

// 2. Remove the unused "slot-loading-dots" block
// It looks like:
//         <!-- 迷你老虎機 -->
//         
//         </div>
//         <div id="slot-loading-dots" class="mt-6 flex gap-2 relative z-10">
//             <div class="w-3 h-3 bg-[#D4AF37] rounded-full animate-bounce shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style="animation-delay: 0s"></div>
//             <div class="w-3 h-3 bg-[#D4AF37] rounded-full animate-bounce shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style="animation-delay: 0.1s"></div>
//             <div class="w-3 h-3 bg-[#D4AF37] rounded-full animate-bounce shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style="animation-delay: 0.2s"></div>
//         </div>
const slotLoadingDotsRegex = /<!-- 迷你老虎機 -->[\s\S]*?<div id="slot-loading-dots"[\s\S]*?<\/div>\s*<\/div>/;
html = html.replace(slotLoadingDotsRegex, '');

// 3. Remove small-mary-modal completely
const maryModalRegex = /<div id="small-mary-modal"[\s\S]*?<!-- \/small-mary-modal -->/g;
if(html.match(maryModalRegex)) {
    html = html.replace(maryModalRegex, '');
} else {
    // Try finding the end by finding the next major section or end of body
    // The small mary modal is huge, from 830 to 1040.
    const startIdx = html.indexOf('<div id="small-mary-modal"');
    if (startIdx !== -1) {
        // Find the last closing div of it
        // Or just use a simple DOM parser approach via a temporary html file.
        // Wait, regular expressions for HTML matching are tricky if tags are nested.
    }
}

fs.writeFileSync('index.html', html);
console.log('Cleaned index.html');
