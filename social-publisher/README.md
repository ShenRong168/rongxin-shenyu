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
- 圖片與 Reels 必須提供公開 HTTP(S) 素材 URL
- `imageUrls` 為選填、僅限 Instagram；填入 2-10 個 URL 時會依陣列順序發布輪播
- `imageUrls` 只有一個 URL 時會使用單圖發文流程
- `videoUrl` 為選填、僅限 Instagram；填入時會以 `media_type=REELS` 建立影片 container
- `imageUrl`、非空 `imageUrls`、`videoUrl` 三者互斥，Instagram 每篇只能提供其中一種
- Facebook 與 Threads 仍只使用 `imageUrl`，不支援 `videoUrl`
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

如果不想依賴這台 Mac 開機，可以使用 GitHub Actions 的雲端排程。這個 workflow 檢查 `scheduled-posts.json`，只要有到期且狀態是 `queued` 的貼文，就會自動發出（`.github/workflows/social-publisher.yml` 目前設定為 `cron: "3/5 * * * *"`，即每 5 分鐘一次）。

> ⚠️ **`origin` 才是排程狀態的真相來源，本機檔案不是。** 這條線會往兩個方向壞掉，兩個都會咬人：
>
> - **本機改了沒 push** → 雲端只認最後一次 push 的版本，照舊版發文，而且不會有任何錯誤提示。
>   已造成兩次誤發（2026-07-17、2026-07-20）。
> - **雲端發完寫回、本機沒 pull** → 發文成功後 `github-actions[bot]` 會把 `published` commit 回 origin，
>   本機沒 `git pull` 就永遠停在 `queued`。不會誤發，但**會讓人誤判成效或重複排程**。
>   2026-08-04 實際發生過一次：三篇已發布的貼文被當成漏發。
>
> 規矩：**動這個檔案前先 `git pull`，改完一定 `git push`；要依 `status` 下判斷前也先 `git pull`。**
>
> 啟動 `npm run dev` / `npm start` 時會自動做這個雙向檢查並印出警告，也可以手動執行 `npm run check:schedule-sync`
> （有落差時 exit code 為 1）。檢查會先 `git fetch`（10 秒逾時）；連不到遠端時會明講「這次的結果不可信」，
> 而不是假裝同步。離線工作想跳過 fetch，設 `SCHEDULE_SYNC_NO_FETCH=1`。

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
      "imageUrls": [],
      "videoUrl": "",
      "topicTag": "",
      "status": "queued"
    }
  ]
}
```

欄位說明：

- `scheduledAt`：發文時間，請使用台灣時區 `+08:00`
- `platforms`：可填 `facebook`、`instagram`、`threads`
- `message`：貼文內容
- `imageUrl`：IG 單圖發文使用，且必須是公開 HTTP(S) 圖片 URL；FB / Threads 可選填
- `imageUrls`：選填、僅限 Instagram。2-10 個公開 HTTP(S) 圖片 URL 會依陣列順序發布輪播；一個 URL 使用單圖流程
- `videoUrl`：選填、僅限 Instagram Reels。必須是 Meta 可公開抓取的 HTTP(S) 影片 URL；影片 container 使用較長的處理等待時間
- Instagram 的 `imageUrl`、非空 `imageUrls`、`videoUrl` 三者互斥，同時提供會在任何平台發文前報錯
- `topicTag`：選填、僅限 Threads。填入時會在建立 Threads container 時送出 `topic_tag`；一篇限一個標籤，建議 1-50 字元，避免句點與 `&`。既有未填此欄位的貼文不受影響
- `status`：新貼文填 `queued`

GitHub Secrets 需要設定：

- `META_PAGE_ID`
- `META_PAGE_ACCESS_TOKEN`
- `INSTAGRAM_USER_ID`
- `THREADS_USER_ID`
- `THREADS_ACCESS_TOKEN`
- `GH_SECRETS_TOKEN`：供 `.github/workflows/threads-token-refresh.yml` 更新 `THREADS_ACCESS_TOKEN`。需要具備此 repo 的 Actions secrets 寫入權限；不要使用一般發文用 token 代替。

### Threads token 自動續期

Threads 長效 access token 約 60 天到期。`Refresh Threads Token` workflow 每天 00:17（Asia/Taipei）執行一次：

1. 先用 Threads `/debug_token` 讀取 `THREADS_ACCESS_TOKEN` 的有效性與到期時間。
2. 若剩餘天數大於 `THREADS_REFRESH_WITHIN_DAYS`（預設 14 天），不更新任何 secret。
3. 若已進入門檻，呼叫官方 `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=...` 換發新的長效 token。
4. 先用 `gh secret set THREADS_ACCESS_TOKEN` 更新 GitHub Secrets，再更新本機 `data/tokens.json`；若 secret 更新失敗，本機檔不會先寫成新 token，避免再次出現「本機新、Actions 舊」的落差。

本機手動檢查或續期：

```bash
cd /Volumes/fast/CODEX/rongxin-shenyu/social-publisher && npm run refresh:threads-token
```

注意：

- GitHub Actions 端要先設定 `GH_SECRETS_TOKEN`，且該 token 必須能寫入 repository Actions secrets。
- 如果 `/debug_token` 回報 token 已失效，或 refresh 回應失敗，workflow 會失敗並印出「需要 Shen 重新走 OAuth 授權」的錯誤，不會靜默略過。
- 已徹底過期的長效 token 無法 refresh，只能重新授權。
- 真實 refresh 需等 token 接近到期門檻時驗證；目前測試以 mock API 確認端點、門檻判斷、secret 寫入順序與失敗保護。

執行後 workflow 會把貼文狀態改成：

- `published`：全部平台成功
- `failed`：至少一個平台失敗，錯誤訊息會寫在 `results`

限制：

- GitHub Actions 的排程不是秒級準時，可能延遲數分鐘
- IG 不能純文字發文，必須有一種公開圖片或影片 URL
- Reels 的實際處理時間通常比圖片長；若影片長時間未完成，排程結果會標為 `failed`，不會呼叫發布步驟
- 如果 token 已經過期到無法 refresh，需要重新授權並更新 GitHub Secrets

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
- 發文佇列與 retry
- audit log

## 官方文件

- Facebook Pages API：<https://developers.facebook.com/docs/pages-api/>
- Instagram Platform content publishing：<https://developers.facebook.com/docs/instagram-platform/content-publishing/>
- Threads API：<https://developers.facebook.com/docs/threads/>
- Threads long-lived token refresh：<https://developers.facebook.com/documentation/threads/get-started/long-lived-tokens>
