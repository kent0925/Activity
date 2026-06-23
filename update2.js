const fs = require('fs');

// Copy OLD/index.html to index.html
fs.copyFileSync('OLD/index.html', 'index.html');

let html = fs.readFileSync('index.html', 'utf8');

// 1. Remove Tailwind CDN script
html = html.replace('<script src="https://cdn.tailwindcss.com"></script>', '');

// 2. Update style.css cache buster
html = html.replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="style.css?v=20260623_2">');

// 3. Fix background URL in body (remove quotes to prevent 404)
html = html.replace("bg-[url('images/wood-bg.jpg')]", "bg-[url(images/wood-bg.jpg)]");

// 4. Update tutorial image path (if it's using .png or root directory)
html = html.replace('src="./registration_tutorial.png"', 'src="images/registration_tutorial.jpg"');
html = html.replace('src="registration_tutorial.jpg"', 'src="images/registration_tutorial.jpg"');

// 5. Update the green button to btn-primary premium-gradient
// Let's use a regex to find the button
const btnRegex = /class="w-full py-3 bg-\[#06c755\] hover:bg-\[#05b04b\] text-white font-bold rounded-xl shadow-md transition active:scale-95 text-center text-sm"/g;
html = html.replace(btnRegex, 'class="btn-primary premium-gradient"');

// 6. Fix favicon 404
// Add a blank favicon or link to logo.png
const faviconTag = '<link rel="icon" type="image/png" href="images/logo.png">\n</head>';
html = html.replace('</head>', faviconTag);

fs.writeFileSync('index.html', html, 'utf8');
console.log('Fixed index.html successfully.');
