# 驗證紀錄 — 2026-11-17

## 自動驗證

`bun test`：4 個測試、34 個斷言通過。涵蓋空圖／少筆畫／不整除的百分比區間、重複階段名稱的順序、半透明疊色結果的增量分層、中文圖層名／座標／合成影像的 PSD round trip、錯誤尺寸與非不透明參考圖拒絕。

`bun run build`：通過，瀏覽器 bundle 約 0.38 MB。

`tests/browser-regression.js` 由 Playwright 在 Chromium 執行，8 個案例通過：

| 案例 | PSD 圖層數 | PSD 讀回最大通道誤差 |
|---|---:|---:|
| 預設漫畫眼部描線，自然播完 | 11 | 0 |
| 完成後改線色及鉛筆筆刷 | 11 | 0 |
| 彩色分階段＋淡彩輪廓，自然播完 | 6 | 0 |
| 彩色每 10%＋淡彩輪廓 | 12 | 0 |
| 深色紙張＋關閉顆粒 | 12 | 0 |
| 水彩立即完成，保留輪廓 | 12 | 0 |
| 空白圖片 | 11（10 個空階段） | 0 |
| 快速連續切換來源 | 11 | 0 |

## PhotoCraft 獨立讀回／合成

使用現有 CLI：

```sh
cd /Users/krdz_office/codex_office
PC_CLI=/Users/krdz_office/Desktop/photocraft/target/macos-package/photocraft-cli-0.8.2-macos-aarch64/photocraft-cli
"$PC_CLI" info XY-plotter/examples/xy-plotter-percent.psd --compact
"$PC_CLI" convert XY-plotter/examples/xy-plotter-percent.psd XY-plotter/examples/xy-plotter-percent-photocraft.png
"$PC_CLI" convert XY-plotter/examples/xy-watercolor-stages.psd XY-plotter/examples/xy-watercolor-stages-photocraft.png
```

描線 PSD 讀入 11 層，RGB / 8-bit、480×480、Normal / 100%，無匯入警告。彩色 PSD 讀入 6 層。兩個 PhotoCraft 重新合成 PNG 與對照 PNG 的 RGBA 比較：差異像素 0、最大通道誤差 0。轉成 PNG 時 CLI 提示會攤平圖層，屬於預期格式轉換提示。

## CSP 實際開啟

已在使用者電腦的 CLIP STUDIO PAINT EX 開啟 `examples/xy-watercolor-stages.psd`，顯示正確的彩色合成與以下六個可見普通點陣圖層（上到下）：

1. 05 淡彩線稿輪廓
2. 04 細節點睛
3. 03 小塊面刻畫
4. 02 中塊面塑形
5. 01 大塊面鋪底
6. 00 紙張底色與紋理

沒有出現 PSD 匯入錯誤。未修改或儲存原本已開啟的使用者作品。CSP 驗證為實際開啟與視覺確認，未宣稱已做 CSP 另存後的像素測量。

## 範圍

不是影片解碼或任意影片的逆向拆筆觸；來源為現有 XY-plotter 的圖片輸入與筆畫資料。中間階段採原筆刷重播，最後階段校準到實際完成畫面；含底層混色的增量像素適合順序回看，不是可任意重組的透明顏料。詳見 README。
