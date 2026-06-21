# Casino Project - AI Handoff Document (交接文件)

## 專案背景 (Context)
此專案 (`Activity`) 為「大老二兄弟會活動報名系統」。目前主頁面 (`index.html` & `app.js`) 包含了一個「小瑪莉遊戲」。
目前正在進行**新功能擴充**：開發一個全新的「Casino 賭場大廳」，包含小瑪莉、經典輪盤 (Roulette)、骰寶 (Sic Bo)。

## 絕對開發準則 (CRITICAL RULES FOR AI)
1. **不要刪除舊版小瑪莉**：目前處於測試階段，一般玩家仍在 `index.html` 遊玩舊版小瑪莉。**絕對禁止**刪除或大幅修改 `app.js` 中既有的小瑪莉邏輯與 `index.html` 中的 Modal。
2. **管理員專屬入口**：Casino 大廳 (`casino.html`) 僅限管理員進入。在 `app.js` 中，透過判斷 `ADMIN_USER_IDS` 來動態顯示/隱藏進入 `casino.html` 的按鈕。
3. **積分共用 (Shared Wallet)**：新開發的 `casino.js` 中的輪盤與骰寶，必須直接呼叫原有的 GAS API (`?action=getSmallMaryData` 與 `?action=updateMaryPoints`)。**不需修改任何 GAS 後端程式碼**。

## 新增檔案架構 (New File Structure)
- `casino.html`: 測試版大廳入口，包含切換三個遊戲的 UI。
- `casino.css`: 賭場遊戲專用樣式、動畫 (3D輪盤、骰子跳動)。
- `casino.js`: 處理登入驗證、GAS API 呼叫、以及輪盤、骰寶、新版小瑪莉的結算邏輯。

## 目前進度 (Current Status)
- **Planning Phase**: 已完成需求釐清與架構設計。確認採用獨立檔案開發，並利用 `ADMIN_USER_IDS` 進行環境隔離。
- **Next Step**: 準備開始撰寫 `casino.html`, `casino.css`, `casino.js`。

> 任何接下來接手的 AI：請確實遵守上述準則，先完成 `casino` 三件套的撰寫，然後在 `index.html` 找個隱密的位置加上僅管理員可見的 `<button>` 導向 `casino.html` 即可。
