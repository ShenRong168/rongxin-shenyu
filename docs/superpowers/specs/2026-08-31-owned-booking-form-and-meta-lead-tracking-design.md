# 官網預約表單與 Meta Lead 追蹤設計

## 目標

把目前由首頁連往 Google 表單的「人生除錯前置盤點」改成 `rongxinshenyu.com` 自有頁面，讓使用者在品牌網站內完成第一階段盤點；沿用現有 Google 試算表與人工審核流程，並以現行 Meta Pixel／dataset `4400969670158242` 正確回報可用於廣告優化的 `Lead` 事件。

本次不加入自動排程、付款或廣告刊登，也不取代既有完整 Google 表單。原表單改作第二階段資料蒐集及故障備援。

## 現況與問題

- 網站是 GitHub Pages 靜態站，使用自訂網域 `rongxinshenyu.com`。
- 官網已安裝現行 Pixel `4400969670158242`，首頁兩個 Google 表單 CTA 目前只在點擊時送出 `Schedule`。
- 使用者完成外部 Google 表單後不會回到官網，因此瀏覽器 Pixel 無法可靠判斷實際送出。
- 舊 Google Apps Script 曾把 `CompleteRegistration` 送往已停用的 prior-trigger Pixel；2026-08-30 的查核確認現行 dataset 仍沒有 CAPI 事件。
- 現有 Google 表單有二十多個欄位，混合初步篩選、完整聯絡、安全資料、緊急聯絡人與錄音選擇，不適合作為低摩擦的廣告落地流程。

## 選定方案

採用「官網表單＋綁定既有 Google 試算表的 Apps Script web app」。

替代方案與不採用原因：

- 直接把自訂表單 POST 到 Google Forms：依賴 Google 內部欄位編號，表單改版容易失效，且成功／失敗與追蹤回應難以可靠處理。
- 搬到 Cloudflare Workers、Firebase 或其他後端：可擴充性較高，但會新增部署、權限與維護成本，超出目前試營運需求。

Google Apps Script 官方支援以 `doPost(e)` 接收 HTTP POST，並可部署成由擁有者身分執行的 web app：
<https://developers.google.com/apps-script/guides/web>

## 使用者流程

1. 首頁、文章與導覽 CTA 前往 `/booking.html`。
2. 使用者先完成安全確認。若目前有立即自傷、他傷或急性危機，頁面顯示 119、110、1925 與就近急診資訊，不送出也不儲存該回答。
3. 符合基本服務範圍者完成第一階段盤點。
4. 前端驗證通過後，產生唯一 `event_id`，把表單送往背景 iframe 指向的 Apps Script web app。當前頁面不離開，所以失敗時回答仍保留在畫面中。
5. Apps Script 驗證、寫入試算表、寄送管理通知，並嘗試向 Meta CAPI 送出同一 `event_id` 的 `Lead`。
6. Apps Script 回傳的最小 HTML 只會用 `postMessage` 對 `https://rongxinshenyu.com` 回報成功或失敗，不回傳個資。該回應頁允許載入於背景 iframe，但不提供可操作的介面。
7. 官網收到成功訊息後，將 `event_id` 暫存於同分頁的 `sessionStorage`，再導向 `/thank-you.html?event_id={event_id}`。
8. 感謝頁只有在查詢參數與 `sessionStorage` 的成功標記一致時，才用瀏覽器 Pixel 送出同一 `event_id` 的 `Lead`，隨即刪除標記，避免重新整理重複計算。
9. 管理者人工審核後，再把現有完整 Google 表單交給合適的使用者補填第二階段資料。

## 官網元件

### `booking.html`

沿用現有植物系色票、字體、頁首與頁尾，採手機優先的單頁表單，分成三段：

1. 安全確認
2. 目前狀態
3. 聯絡與同意

第一階段欄位：

| 欄位 | 類型 | 規則 |
|---|---|---|
| 姓名或希望被稱呼的名字 | 單行文字 | 必填，1–50 字 |
| 正式聯絡 Email | Email | 必填，正規化為小寫並去除前後空白 |
| 目前最卡住的事情 | 多行文字 | 必填，20–1500 字 |
| 主要卡點 | 單選 | 心態／關係／行動／資源／不確定／其他 |
| 希望對談後帶走什麼 | 複選 | 被理解／釐清方向／具體行動／溝通策略／資源盤點／情緒安定；至少一項 |
| 方便聯絡或對談的時段 | 複選 | 平日上午／平日下午／平日晚上／週末上午／週末下午／目前先不預約；至少一項 |
| 已滿 18 歲 | 核取確認 | 必須確認 |
| 服務時位於台灣 | 核取確認 | 必須確認 |
| 個資告知與服務界線 | 核取確認 | 必須確認，附站內相關章節連結與版本日期 |

第一階段不蒐集電話、縣市、緊急聯絡人或錄音選擇，也移除現有表單重複的 Email／LINE 欄位。

### 安全分流

安全問題在正式欄位前顯示。無急迫危機才展開盤點表單；有急迫危機時：

- 不顯示送出按鈕。
- 不把安全選項寫入試算表、Email、瀏覽器儲存空間或 Meta。
- 顯示「本服務不是危機處理」與 119、110、1925、就近急診資訊。
- 提供返回首頁，但不以行銷 CTA 干擾危機資源。

### `booking.js`

負責：

- 前端驗證與可讀錯誤訊息。
- `event_id` 產生。
- 讀取 `_fbp`，以及僅在網址有有效 `fbclid` 時建立／讀取 `_fbc`；兩者只隨此次提交傳往後端，不寫入試算表。
- 垃圾欄位（honeypot）、表單開始時間與送出時間。
- 背景 iframe 提交、逾時、Apps Script `postMessage` 回應與重試。
- 送出期間鎖定按鈕，成功後建立一次性 `sessionStorage` 標記。

父頁只接受同一背景 iframe `contentWindow` 發出的訊息，並同時檢查 Google Apps Script 回應來源及目前待處理的 `event_id`；其他分頁、iframe 或不相符事件一律忽略。

頁面不使用 `localStorage` 保存卡點敘述或其他表單內容。網路或後端失敗時 DOM 不離開，因此現有輸入仍留在畫面；重新整理或關閉頁面後不保留。

### `thank-you.html`

- 顯示已收到盤點、人工審核與聯絡時程說明。
- 僅在一次性成功標記匹配時送出瀏覽器 `Lead`。
- 直接造訪、複製網址或重新整理不會再次建立新事件。
- 提供首頁連結，不自動進入付款或排程。

## Apps Script 後端

Apps Script 綁定現有 Google 試算表，原始碼另存於 repo 的 `apps-script/booking-intake/` 供版本控制；正式部署由使用者本人在 Google 介面完成。

### 接收與驗證

`doPost(e)`：

- 只接受已知欄位，忽略多餘欄位。
- 在伺服器端重做必填、列舉、Email 與字數驗證。
- honeypot 必須為空，且送出時間不得不合理地短於最小填寫時間。
- 以雜湊 Email 配合 `CacheService` 做溫和的短期 **best-effort throttle**。Cache 可能被提早淘汰，這不是持久或安全邊界；先檢查、待列資料成功寫入且 `SpreadsheetApp.flush()` 後才記錄接受次數，寫入失敗不耗用次數。
- 工作表取得／建立、標題初始化、冪等查找與列寫入都在同一把 script lock 內完成；所有持久寫入都先 `SpreadsheetApp.flush()` 再釋放鎖，避免首次建立與同時送出競態。
- 為同一 `event_id` 做列級冪等檢查；重送永遠不新增第二列。另以固定欄位順序計算正規化提交內容的 SHA-256「提交指紋」；相同 `event_id` 若帶入不同內容，視為無效冪等重送，在任何外部副作用前拒絕，原列不被覆寫。
- CAPI 與管理通知分成兩個獨立的 lock-fenced 副作用。每次只處理一項：取得 script lock 後讀取該項狀態，`sent...` 即略過；其餘狀態先寫成 `processing` 並 flush，在同一把鎖仍持有時呼叫外部服務，再寫入 `sent...`、`not_configured...` 或 `failed...` 並 flush，最後才釋放鎖。
- 試辦流量低，接受外部呼叫期間序列化的吞吐量代價。並行重送會等待鎖後看到 `sent...`，或在前一 worker 終止、Apps Script 自動釋放鎖後看到 `processing` 並恢復。若在 bounded wait 內拿不到鎖或無法確認狀態落盤，回傳最小 `ok:false` 可重試結果，讓瀏覽器保留輸入而不是靜默視為完整成功。
- 所有準備寫入試算表、且可能來自使用者的字串，只要以 `=`、`+`、`-`、`@` 開頭就加上前置 apostrophe，避免公式注入。正規化原值仍保留給 Email 與 Meta hashing，不傳送轉義後的顯示字串。
- 回應頁以 `HtmlService` 產生，僅為讓背景 iframe 將成功／失敗狀態送回官網；設定允許 iframe 載入時，回傳訊息的目標 origin 仍固定為 `https://rongxinshenyu.com`。

### 試算表

新增工作表「官網初步盤點」，欄位固定為：

- 建立時間
- event_id
- 來源頁面
- 稱呼
- Email
- 目前卡點
- 主要分類
- 期待結果
- 可聯絡／對談時段
- 成人確認
- 台灣確認
- 同意版本
- 提交指紋（正規化已知欄位的 SHA-256，不傳往 Meta／Email）
- 審核狀態（預設「待審核」）
- Meta CAPI 狀態
- 通知狀態
- 管理備註

不儲存 `_fbp`、`_fbc`、原始安全分流選項或 CAPI 權杖。

### 通知信

成功新增資料後寄到 Script Properties 設定的管理信箱。通知只含建立時間、稱呼、Email、event_id 與試算表連結；完整敘述與提交指紋留在試算表，避免敏感內容散落於 Email。通知狀態獨立持久化並在自己的 lock-fenced 區段執行。`MailApp` 沒有 idempotency key，因此若信件已送出、但 `sent` 狀態在落盤前中斷，worker 終止後的重試可能再寄一次；這是可見、可查核的 at-least-once 限制。

### Meta CAPI

使用現行 Pixel `4400969670158242`，送出標準事件 `Lead`：

- `event_name`: `Lead`
- `event_time`: Apps Script 接收時間
- `event_id`: 與瀏覽器 Pixel 相同
- `action_source`: `website`
- `event_source_url`: 官網預約頁
- `user_data.em`: 正規化 Email 的 SHA-256
- `user_data.fbp`／`fbc`: 有效時才送出

不傳送卡點文字、分類、期待、安全狀態、時段或其他表單回答。CAPI 失敗不阻擋預約寫入與感謝頁；結果寫進「Meta CAPI 狀態」供後續重送或查核。恢復送出沿用原本 `event_id`，由 Meta 做事件去重。

Pixel ID、管理信箱、成功／失敗回傳來源與 CAPI 權杖放在 Script Properties；其中權杖不進 repo、網站 HTML、試算表或執行紀錄。

## 錯誤與備援

- 前端驗證失敗：聚焦第一個錯誤欄位並顯示欄位級說明。
- Apps Script 驗證失敗：背景回報一般化錯誤，不回傳提交內容。
- 網路逾時：解鎖按鈕、保留 DOM 輸入並允許重試；同一 `event_id` 的冪等設計避免逾時後重送產生重複列，副作用依持久狀態續跑。
- 寫入或寄信失敗：只有試算表列寫入並 flush 成功才可回報整體提交成功；其後寄信失敗只更新「通知狀態」，不刪除資料也不把使用者回應改成失敗。
- CAPI 失敗：不影響使用者流程，記錄狀態；重送可用相同 `event_id` 安全恢復。
- Apps Script 長時間故障：頁面顯示現有 Google 表單備援連結。該表單仍保留為第二階段入口，但備援文案要明確說明會填較完整資料。

## 既有網站改動範圍

- 新增 `booking.html`、`thank-you.html` 與表單 JavaScript。
- 在 `styles.css` 加入沿用現有設計 token 的表單、驗證、危機資源與感謝頁樣式。
- 首頁兩個外部 Google 表單 CTA 改連 `/booking.html`；原本點擊即送出的 `Schedule` 不再當作完成轉換。
- 更新文章 CTA、導覽、footer、`sitemap.xml`、隱私說明及必要文件。
- 現有 `PageView` 與 `Contact` 保持不變。
- 現有 Google 表單保留，但從主要公開入口移除。
- 停用舊 Apps Script 的 `CompleteRegistration` prior-trigger Pixel 觸發器；不把舊 token 複製到新流程。

## 測試與驗收

### 自動檢查

- 純函式測試：欄位驗證、列舉白名單、Email 正規化、`event_id`／一次性標記、Payload shaping。
- Apps Script 可測部分：伺服器驗證、17 欄列資料、提交指紋與變造重送拒絕、公式注入防護、best-effort throttle、鎖與 flush 順序、單列冪等、逐副作用 lock fencing／中斷恢復／busy 可重試回應、CAPI／通知獨立狀態、CAPI payload 與敏感欄位排除；Google 服務以替身注入。
- 靜態檢查：主要 CTA 不再直連 Google 表單、所有頁面使用現行 Pixel、repo 無 CAPI 權杖、`sitemap.xml` 包含新頁面。
- `git diff --check` 與既有 social-publisher 測試保持通過。

### 瀏覽器驗收

- 手機與桌機尺寸。
- 鍵盤操作、焦點順序、錯誤訊息與讀屏標籤。
- 安全分流不送出或保存資料。
- 重複點擊、逾時、失敗重試與 Google 表單備援。
- 感謝頁直接造訪及重新整理不重複送事件。

### 正式上線驗收

1. 使用者在 Meta Events Manager 為 Pixel `4400969670158242` 產生新的 CAPI 權杖，親自存進 Script Properties。
2. 使用者部署 Apps Script versioned web app，執行身分為部署者，存取層級允許匿名提交。
3. 停用舊 Google Form 上送往 prior-trigger Pixel 的觸發器。
4. 送出一筆稱呼清楚標為「測試」的表單。
5. 確認試算表新增一列、管理信到達、感謝頁顯示成功。
6. 在 Meta「測試事件」確認 browser 與 server `Lead` 使用同一 `event_id` 並成功去重。
7. 移除測試列，確認公開頁面與備援連結可用；不建立或刊登廣告。

## 成功標準

- 一般使用者能在自有網域完成第一階段盤點，不必跳到 Google Forms。
- 真實成功寫入才會到達感謝頁並回報 `Lead`。
- 同一次提交在 Meta 最終只計算一筆 `Lead`。
- 敏感回答不會傳往 Meta，CAPI 權杖不會出現在公開或版本控制內容。
- 現有人工審核、Google 試算表及第二階段 Google 表單流程不中斷。
- 故障時仍有清楚的重試與 Google 表單備援路徑。

## 明確不在本次範圍

- 自動選時段、Google Calendar 預約、付款或退款自動化。
- 廣告建立、刊登、預算或受眾設定。
- 第二階段 Google 表單內容重寫。
- CRM、會員帳號、LINE Bot 或長期自動培育流程。
