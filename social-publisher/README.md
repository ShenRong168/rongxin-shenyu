# 榮心紳語一鍵發文 MVP

這是一個本機 Node.js / Express 後端，用來測試：

- Meta OAuth 登入
- Facebook Page 連線
- Instagram Business 帳號連線
- Threads 帳號連線
- 一鍵發文到 Facebook Page / Instagram / Threads
- 半自動同步貼文成效
- GitHub Actions 雲端自動排程發文
- 本機 JSON token store
- dry-run 發文測試

## 重要界線

你需要自己登入 Meta Developers、完成 App 設定、商業驗證、權限授權與審核。這個專案負責 OAuth callback、token 換取、發文 API、錯誤顯示與本機測試流程。

不要把 `.env` 或 `data/tokens.json` commit 到 Git。

## 安裝

```bash
cd social-publisher
npm install
cp .env.example .env
```

填入 `.env`：

```bash
META_APP_ID=
META_APP_SECRET=
META_REDIRECT_URI=http://localhost:3000/auth/meta/callback

THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_REDIRECT_URI=https://你的-ngrok網址/auth/threads/callback
```

目前建議拆成兩個 Meta App：

- Threads App：先填 `THREADS_APP_ID` / `THREADS_APP_SECRET`
- Facebook / Instagram App：之後再填 `META_APP_ID` / `META_APP_SECRET`

## Meta Developers 設定

Threads API 不接受 `http://localhost` callback。請先用 ngrok 產生 HTTPS 網址：

```bash
ngrok http 3000
```

ngrok 會給你一個網址，例如：

```text
https://your-ngrok-domain.ngrok-free.dev
```

在 Meta Developers 的 Threads API 設定填：

- 重新導向回呼網址：`https://你的-ngrok網址/auth/threads/callback`
- 解除安裝回呼網址：`https://你的-ngrok網址/auth/threads/deauthorize`
- 刪除回呼網址：`https://你的-ngrok網址/auth/threads/delete`

本機 `.env` 同步填：

```bash
APP_BASE_URL=https://你的-ngrok網址
THREADS_REDIRECT_URI=https://你的-ngrok網址/auth/threads/callback
```

Facebook / Instagram App 之後再加入 OAuth redirect URI：

- `http://localhost:3000/auth/meta/callback`

Facebook / Instagram 建議權限：

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

Threads 建議權限：

- `threads_basic`
- `threads_content_publish`

正式給非 App 角色使用前，Meta 可能要求 App Review、商業驗證、隱私權政策網址與資料刪除說明。

## 啟動

請開兩個終端機。

終端機 1：

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher
npm run dev
```

終端機 2：

```bash
ngrok http 3000
```

打開 ngrok HTTPS 網址，不要從 localhost 開始 Threads OAuth：

```text
https://你的-ngrok網址
```

Threads 流程：

1. 點「連接 Threads」
2. 完成 Threads OAuth
3. 回首頁確認顯示 `Threads：已連接 @你的帳號`
4. 保持 dry-run 勾選，送出測試貼文
5. 確認 payload 沒問題後，取消 dry-run 再正式發文

已驗證成功的 Threads 測試文：

```text
測試一下榮心紳語的一鍵發文工具。

如果你看見這則，代表我把心裡的一團線，又理順了一小段。
```

## 每次重新開機後的檢查清單

1. 啟動本機後端：`npm run dev`
2. 啟動 ngrok：`ngrok http 3000`
3. 如果 ngrok 網址變了，更新：
   - `.env` 的 `APP_BASE_URL`
   - `.env` 的 `THREADS_REDIRECT_URI`
   - Meta Threads API 設定的三個 callback URL
4. 從 ngrok HTTPS 首頁進入工具
5. 先 dry-run，再正式發文

## 已跑通狀態

- Threads App 建立完成
- Threads callback 使用 ngrok HTTPS
- Threads OAuth 成功
- dry-run 成功
- 正式 Threads 發文成功
- Facebook Page App 建立完成
- Facebook Page OAuth 成功
- 正式 Facebook Page 發文成功
- Instagram 權限授權成功
- Instagram Business 帳號已抓到：`yogo918`

目前已確認的榮心紳語資產：

- Facebook Page：`榮心紳語 Inner Dialogue Studio`
- Facebook Page ID：`1230312726828490`
- Instagram 帳號：`yogo918`
- Instagram Business ID：`17841400578469179`

## 平台限制

Facebook Page：

- 純文字可發到 Page feed
- 有圖片 URL 時會改用 Page photo publish
- link 欄位只在純文字 feed 模式使用
- 目前成效同步可抓貼文 permalink 與時間
- 讚、留言、分享等互動欄位需要額外讀取權限，例如 `pages_read_user_content` 或對應 Page content access

Instagram：

- 這個 MVP 使用 Instagram Graph API content publishing
- 需要 Instagram 專業帳號，且連到 Facebook Page
- 目前只做圖片貼文，必須提供公開 `imageUrl`
- 不支援純文字 IG 貼文
- 如果 Facebook 授權視窗有「編輯存取權限」，請只勾榮心紳語粉專和 `yogo918`，避免抓到其他代管粉專或舊資產
- 目前成效同步可抓：
  - permalink
  - 發布時間
  - media type
  - like count
  - comments count

Threads：

- 可發純文字
- 提供 `imageUrl` 時會用圖片貼文
- Threads OAuth 與 token endpoint 和 Facebook Graph OAuth 不完全相同
- 目前成效同步可抓 permalink、文字、發布時間
- views、likes、replies、reposts、quotes 需要額外 Threads insights 權限

## 成效追蹤 MVP

首頁「最近紀錄」區塊有「同步成效」按鈕。按下後會針對本機 `publishLog` 裡的正式發文紀錄逐筆同步：

- Facebook：基本貼文資訊與 permalink；互動數若權限不足會顯示提示
- Instagram：貼文網址、發布時間、讚數、留言數
- Threads：貼文網址、發布時間；insights 權限不足時會顯示提示

這是半自動追蹤版，適合先建立營運節奏：

1. 每次發文後等 1-24 小時
2. 回到本機工具首頁
3. 按「同步成效」
4. 用成效結果調整下一篇 hook、主題、平台比例與圖片風格

## 雲端自動發文

如果不想依賴這台 Mac 開機，可以使用 GitHub Actions 的雲端排程。這個 workflow 每 15 分鐘檢查一次 `scheduled-posts.json`，只要有到期且狀態是 `queued` 的貼文，就會自動發出。

排程檔：

```text
social-publisher/scheduled-posts.json
```

貼文格式：

```json
{
  "timezone": "Asia/Taipei",
  "posts": [
    {
      "id": "2026-07-04-safe-stranger",
      "scheduledAt": "2026-07-04T09:00:00+08:00",
      "platforms": ["facebook", "threads"],
      "message": "貼文內容",
      "link": "",
      "imageUrl": "",
      "status": "queued"
    }
  ]
}
```

欄位說明：

- `scheduledAt`：發文時間，請使用台灣時區 `+08:00`
- `platforms`：可填 `facebook`、`instagram`、`threads`
- `message`：貼文內容
- `imageUrl`：IG 必填，且必須是公開圖片 URL；FB / Threads 可選填
- `status`：新貼文填 `queued`

GitHub Secrets 需要設定：

- `META_PAGE_ID`
- `META_PAGE_ACCESS_TOKEN`
- `INSTAGRAM_USER_ID`
- `THREADS_USER_ID`
- `THREADS_ACCESS_TOKEN`

執行後 workflow 會把貼文狀態改成：

- `published`：全部平台成功
- `failed`：至少一個平台失敗，錯誤訊息會寫在 `results`

限制：

- GitHub Actions 的排程不是秒級準時，可能延遲數分鐘
- IG 不能純文字發文，必須有公開圖片 URL
- 如果 token 過期，需要重新授權並更新 GitHub Secrets

## 本機資料

token 會存在：

```text
social-publisher/data/tokens.json
```

## 2026-06-30 Meta / IG 授權踩坑筆記

這次真正耗時的點不是 App ID、App Secret 或 redirect URI，而是 Meta OAuth 已經授權成功，但 `/me/accounts` 仍然回傳空陣列。

最後確認到的狀態：

- `debug_token` 顯示 token 有這些權限：
  - `pages_show_list`
  - `pages_read_engagement`
  - `pages_manage_posts`
  - `instagram_basic`
  - `instagram_content_publish`
  - `public_profile`
- `debug_token.data.granular_scopes` 有正確 target：
  - Page target：`1230312726828490`
  - IG target：`17841400578469179`
- 但 `/me/accounts` 回傳：

```json
{ "data": [] }
```

因此不能只依賴 `/me/accounts` 來找 Page。程式已補上 fallback：

1. 先呼叫 `/me/accounts`
2. 如果清單是空的，改呼叫 `/debug_token`
3. 從 `granular_scopes` 找到 `pages_*` 權限的 `target_ids`
4. 用 Page ID 直接抓：
   - Page 名稱
   - Page access token
   - `instagram_business_account`
   - `connected_instagram_account`

這次直接抓 Page ID 成功回傳：

```text
Page：榮心紳語 Inner Dialogue Studio
IG：yogo918
IG Business ID：17841400578469179
```

如果之後又顯示「尚未找到連結的 IG Business 帳號」，請先做這幾件事：

1. 確認 `.env` 的 `META_SCOPES` 包含：

```bash
META_SCOPES=pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish
```

2. 在本機工具按「清除本機 FB / IG 連線」
3. 再按「重新選擇 FB / IG 授權」
4. 授權畫面按「編輯存取權限」
5. 粉專只選 `榮心紳語 Inner Dialogue Studio`
6. Instagram 只選 `yogo918`
7. 權限確認頁確認有：
   - 存取 IG 個人檔案和貼文
   - 為 IG 上傳影音內容並建立貼文
   - 建立並管理粉絲專頁內容
   - 閱讀粉絲專頁發佈內容
   - 顯示管理的粉絲專頁清單

診斷時可以用 `debug_token` 判斷真相：如果 `granular_scopes` 有 Page 和 IG target，就代表使用者授權其實成功，問題多半是 `/me/accounts` 沒回傳，需要 fallback，而不是重新建立 App。

這只是 MVP。正式上線時請改成資料庫，並加上：

- 加密 token at rest
- 使用者帳號系統
- CSRF 防護
- 發文前二次確認
- token refresh / 過期提示
- 發文佇列與 retry
- audit log

## 官方文件

- Facebook Pages API：<https://developers.facebook.com/docs/pages-api/>
- Instagram Platform content publishing：<https://developers.facebook.com/docs/instagram-platform/content-publishing/>
- Threads API：<https://developers.facebook.com/docs/threads/>
