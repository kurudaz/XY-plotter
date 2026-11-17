# XY-plotter：描繪階段 PSD

保留原工具的預設抽線與筆刷，增加可在 PhotoCraft / CLIP STUDIO PAINT 開啟的分層 PSD。

## 使用

1. 開啟 `index.html`，或啟動下方本機伺服器後進入網址。
2. 載入圖片，沿用預設「描線繪圖機」，或切換「實驗：流線水彩」。
3. 在「階段圖層 → PSD」選擇「每 10% 進度」或「依彩色階段」。
4. 等播放跑完，或按「立即完成」。預設會自動整理圖層，不會自動下載檔案。
5. 點「下載分層 PSD」。也可以下載最終對照 PNG 與 JSON 驗證紀錄。
6. 在 PhotoCraft / CSP 開啟 PSD，從上方逐層隱藏即可回看較早階段；或只留紙張層，再由下往上逐層開啟。

每 10% 以已完成筆畫數分段，和工具的進度依據一致，不是按時間或線長切分。筆畫數無法整除十時，在跨過門檻的完整筆畫後分層；空區間保留同名空層。彩色階段依實際筆畫順序與 `stageName` 分為大塊面鋪底、中塊面塑形、小塊面刻畫、細節點睛；沒有產生的階段不捏造。開啟線稿疊加時，輪廓另成最後一層。紙張底色與固定紋理在最底層，紅色空跑線、十字準心與 UI 不寫進 PSD。

## 圖層語意與精準疊合

這是「增量像素」圖層：比較相鄰進度畫面，只保留本階段改變的像素，其餘透明。變動像素已包含當時紙張、顏料和舊筆觸的混色，以 Normal / 100% 疊合。

因此每層不是一張完整截圖，不會重複疊深前面的半透明顏料；但也不是可任意換底色、改變前層後重新混色的獨立透明顏料。應保留順序並依序開關圖層。不要把這種 PSD 當成還原原作者手繪過程；它保存的是工具演算法的描繪階段。

整理時用原本的 p5 筆刷函式重播到各門檻。最後一層以實際完成的預覽快取為準，補上重播與逐幀 Canvas 繪製之間可能出現的像素差異。中間檢查點是分段重播的畫面，不保證和歷史螢幕截圖逐像素相同；完整疊合與目前最終畫面則逐像素驗證。JSON 的 `replayComparison` 記錄套用最後畫面前的差異，`previewComparison` 和 `roundTrip` 必須為 0 才提供下載。

輸出為標準 RGB、8-bit、點陣 PSD，帶中文圖層名、完整合成影像及圖層位置。不新增特殊混合模式或智慧物件。尺寸遵循原工具（目前「原圖 100%」仍有最長邊 2200 px 的原有限制）。72 dpi 是像素文件的標示，不代表實體繪圖機尺寸。改筆刷／紙色會讓舊下載失效並重新整理；抽線參數仍需按原本的「重新轉換路徑」。

## 本機啟動與修改

已附建置好的 `stage-layers.bundle.js`，一般使用不必安裝依賴。原本的 p5.js、Tailwind 與字型仍從 CDN 載入，需要網路。

```sh
cd /Users/krdz_office/codex_office/XY-plotter
PORT=4187 bun run start
# 瀏覽 http://127.0.0.1:4187/
```

修改 JavaScript 後：

```sh
cd /Users/krdz_office/codex_office/XY-plotter
bun install --frozen-lockfile --cache-dir .cache/bun
bun test
bun run build
```

要部署到原 GitHub Pages，需一併放上 `index.html`、`stage-layers.bundle.js` 和第三方授權文件。本次只建立本機修改版，尚未推送或更新公開網站。

## 檔案

- `index.html`：原工具＋PSD 區塊與完成狀態接線；另修正水彩「立即完成／更換筆刷」時輪廓遺漏。
- `stage-layers.js`：階段重播、PSD 寫入／讀回驗證、下載與失效處理。
- `stage-core.js`：分段、裁切增量像素、合成比對。
- `stage-layers.bundle.js`：瀏覽器執行檔，包含固定版本 ag-psd。
- `tests/`：Bun 單元測試與可由 Playwright 執行的瀏覽器回歸函式。
- `examples/`：描線與彩色 PSD、最終 PNG、PhotoCraft 獨立重算 PNG 與報告。
- `VALIDATION.md`：本次實測結果。

PhotoCraft 原始碼與編譯設定未更動。查閱的專案為 `/Users/krdz_office/Desktop/photocraft`，分支 `merge/upstream-20261102`，commit `e2a51552a`；舊 HANDOFF 裡的分支描述已不是當前分支。它已有 PSD、OpenRaster、圖層資料包的讀寫功能。本次相容性測試使用現有打包 CLI 0.8.2，未等待或干擾正在進行的新版編譯。
