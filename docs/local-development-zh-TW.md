# 繁體中文版本與本機開發

網站以繁體中文為主要介面。題幹、選項、答案解析與既有部落格原文保留英文，AWS 服務名稱與證照代碼亦保留原名。

## 錯題本

已整合 `kesoner/cloudcertprep` 的 `codex/wrong-answer-review` 分支之錯題功能（來源提交 `4d519b8`），並將新增介面改為繁體中文。

從導覽的「練習」選單選擇各證照的「錯題本」，或開啟 `/aws/clf-c02/wrong-answers` 與 `/aws/aif-c01/wrong-answers`。領域練習會在作答後記錄錯題；模擬測驗則在交卷後記錄。答對後，該題會自動移出同證照的錯題本。

紀錄儲存在目前瀏覽器的 `localStorage`，不需登入或 Supabase，不跨裝置同步。清除網站資料會移除紀錄，同一瀏覽器的使用者會共用這份錯題本。完整測驗進度與雲端歷史仍需登入。

整合保留目前網站與繁體中文設定，未套用來源分支的其他站點網域或部署設定。

## Windows 啟動方式

在專案根目錄執行：

```powershell
.\scripts\local.ps1 dev
```

開啟 http://localhost:4321 。此腳本會優先使用工作目錄旁 `.tools` 中已安裝的 Node.js 22，或系統的 npm。

其他檢查：

```powershell
.\scripts\local.ps1 check
.\scripts\local.ps1 build
.\scripts\local.ps1 e2e
```

E2E 使用獨立的 4399 連接埠，不會重用其他開發伺服器。先完成 build 再執行 E2E。本機 Chromium 安裝於工作目錄旁的 `.tools/browsers`。

## 登入與儲存進度

未提供 `.env` 或 `.env.local` 時，腳本使用與 CI 相同的 Supabase 佔位設定，以便啟動訪客練習。佔位設定不支援真實登入或雲端進度儲存。

要測試真實登入，請依 `.env.example` 建立 `.env.local`，填入自己的 Supabase URL 與公開 anon key，並依 `supabase/README.md` 設定資料庫、RLS、OAuth 與 Turnstile。不要將 service-role key 放入前端環境變數。

本機預設輸出 noindex 預覽。要執行完整正式 SEO 檢查：

```powershell
$env:PUBLIC_NOINDEX = 'false'
.\scripts\local.ps1 build
```

## 網域設定

`.env.local` 的 `PUBLIC_SITE_URL` 目前設為 `https://xuyuzu.online`。
程式沒有寫死這個網域；更換託管網址時，在建置環境修改此變數並重新建置即可。
canonical、sitemap、RSS、分享圖片與安全政策網址共用這項設定。
未設定時只使用開發預設值 `http://localhost:4321`，正式部署前務必設定。
分享測驗結果時使用目前瀏覽器的 origin，所以預覽站與替代網域不會導回原站。
GitHub Actions 的三個 CI 工作會讀取 Repository Variable `PUBLIC_SITE_URL`；未設定時使用僅供測試的 `https://cloudcertprep-ci.invalid`，CI 產物不作正式部署。
原作者的網址、著作權與原專案連結仍保留原始來源。

更換正式網址時，也要同步調整 Supabase 的 Auth Site URL、Redirect URLs
與帳號刪除函式的 `SITE_ORIGIN`；這些是外部服務的來源限制，不會因前端重建自動更新。

刪除帳戶也會清除此瀏覽器的整本錯題本，包含訪客紀錄；確認視窗會明示此範圍。
其他已開啟分頁會同步清空重做狀態；尚未收到清除通知的舊分頁也會透過刪除版本檢查拒絕寫回。

## 中文化維護原則

- 網站品牌為 `CloudCertPrep-zh`。`/about`、`/terms` 與 `/privacy` 說明 kesoner 自用 fork 的定位、原作者 Alex 的歸屬、贊助對象與資料不保證保存。品牌與 SEO 快照同步更新，原作者 Person 與 Organization 署名資料保留。

- `CertDomain.name` 保留英文，作為既有網址 slug 的來源。顯示名稱使用 `nameZh`，避免中文化更動網址。
- Schema.org 的 `@type`、資料庫欄位、分析事件名稱、題目 ID 與評分邏輯保留原定義。
- 首頁保留英文引用標題與來源短語，中文為主要視覺內容；作者與授權資訊維持原始來源。
- 中文頁面使用 `lang="zh-Hant"`、`og:locale="zh_TW"` 及系統中文字型，不載入網路字型。
- SEO 基準記錄本次刻意調整的中文標題與語系；引用、作者資料與連結圖檢查持續啟用。

## 已接入的 Supabase 專案

2026-11-09 已接入 `xuyuzu-cloudcertprep`，Project ref 為 `nfwenbsteyehjirbghfk`。
本機 `.env.local` 已設定公開 URL 與 publishable key，該檔案不納入 Git。
啟動腳本也會保留從系統傳入的完整連線設定，只有完全未設定時才使用佔位值。

已建立作答紀錄、領域進度、熟練度檢視及公開統計 RPC，並驗證會員資料隔離。
Email 註冊保留信箱驗證。Google 與 GitHub 尚未設定 OAuth 憑證。
錯題本目前仍儲存在本機瀏覽器，不會因接入 Supabase 自動跨裝置同步。

登入回呼與帳號刪除函式的網站來源目前對應 `http://localhost:4321`。
正式部署前需更新 Auth Site URL、Redirect URLs 及 Edge Function `SITE_ORIGIN`。
初始化 SQL 與資料庫差異記錄於 `supabase/README.md`。

網站尚未部署或推送至 GitHub；Supabase 資料表、權限與帳號刪除函式已建立於上述專案。
