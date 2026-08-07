# Instagram 輪播支援設計

日期：2026-08-07
狀態：已由使用者確認
範圍：`social-publisher` 的 Instagram 排程發布與本機手動發文介面

## 目標

讓現有 `social-publisher` 同時支援 Instagram 單圖與 2 至 10 張圖片的輪播貼文，並確保：

- 既有 `imageUrl` 單圖排程繼續運作。
- 新排程可用可選欄位 `imageUrls` 指定輪播圖片順序。
- `http://localhost:3000` 可輸入多個公開圖片網址並進行 Dry-run 或正式發布。
- 測試不會意外發布到正式 Instagram 帳號。
- 本次不擴充 Facebook 或 Threads 多圖發布。

## 資料格式

排程貼文新增可選欄位：

```json
{
  "imageUrl": "https://example.com/legacy-single.png",
  "imageUrls": [
    "https://example.com/slide-1.png",
    "https://example.com/slide-2.png"
  ]
}
```

判斷規則：

1. `imageUrls` 有 2 至 10 個有效網址時，使用 Instagram 輪播流程，陣列順序就是輪播順序。
2. `imageUrls` 只有 1 個網址時，使用既有單圖流程。
3. `imageUrls` 缺省或為空時，回退使用 `imageUrl`。
4. 若兩個欄位同時存在，優先使用非空的 `imageUrls`。
5. Instagram 沒有任何圖片網址時維持錯誤，不建立空貼文。
6. 超過 10 張、非陣列資料、空字串或非 HTTP(S) 網址時，在呼叫 Meta API 前回報明確錯誤。

現有 `scheduled-posts.json` 不做整檔重新序列化，也不改動既有 42 筆資料；程式只新增讀取新欄位的能力。

## Instagram API 流程

單圖維持目前流程：

1. 建立單圖 media container，包含 `image_url` 與 `caption`。
2. 等待 container 狀態成為 `FINISHED`。
3. 呼叫 `/media_publish` 發布。

輪播採用 Meta 現行流程：

1. 依序為每張圖片建立子 container，帶入 `image_url` 與 `is_carousel_item=true`。
2. 等待每個子 container 狀態成為 `FINISHED`。
3. 建立父 container，帶入 `media_type=CAROUSEL`、以逗號分隔的 `children` ID 與 `caption`。
4. 等待父 container 狀態成為 `FINISHED`。
5. 對父 container 呼叫 `/media_publish`，回傳正式媒體 ID。

任務筆記中的 `CAROUSEL_ALBUM` 不用於建立 container；Meta 現行建立參數是 `CAROUSEL`。`CAROUSEL_ALBUM` 是發布後查詢媒體時回傳的媒體類型名稱。

## 程式結構

### `src/meta-service.js`

- 新增圖片網址正規化與驗證邏輯。
- 將「建立 container」與「發布 container」拆開，讓測試能驗證建立流程而不呼叫 `/media_publish`。
- `publishInstagram()` 接受 `imageUrl` 與 `imageUrls`，由正規化結果決定單圖或輪播。
- 沿用 `waitForInstagramContainer()` 處理 `FINISHED`、`ERROR`、`EXPIRED` 與逾時。
- 輪播任一步驟失敗即停止，不建立父 container 或發布不完整貼文。

### `scripts/publish-scheduled-posts.js`

- Instagram 發布 payload 加入 `post.imageUrls`。
- Facebook 與 Threads 繼續只使用 `post.imageUrl`。
- 既有狀態更新方式維持不變：任一平台錯誤則該筆標為 `failed` 並記錄錯誤文字。

### `src/server.js`

- 本機發文表單新增「輪播圖片網址」多行欄位，每行一個網址。
- 解析時去除空白行，但保留使用者輸入順序。
- Instagram 使用 `imageUrls`；若欄位留空，仍使用原本的 `imageUrl`。
- Dry-run 顯示正規化後的 payload，不呼叫 Meta API。
- 最近排程摘要以第一張圖作預覽，並顯示輪播張數。

### `README.md`

- 更新 Instagram 從「只支援圖片貼文」為「支援單圖與圖片輪播」。
- 補充 `imageUrls` 格式、2 至 10 張限制、優先順序與公開網址要求。

## 錯誤處理

- 圖片數量不合法時，在任何網路請求前失敗。
- 子 container 建立失敗時，錯誤需指出第幾張圖片，方便定位網址或素材問題。
- 任一子 container 回傳 `ERROR`、`EXPIRED` 或等待逾時時，不建立父 container。
- 父 container 未完成時不呼叫 `/media_publish`。
- 不在錯誤訊息、測試快照或 Dry-run 畫面顯示 access token。

## 測試策略

使用 Node 內建測試與 mock `fetch`，不連正式 Meta API：

1. 既有單圖測試繼續通過，確認相容性。
2. 兩張圖輪播測試完整驗證呼叫順序：兩個子 container、狀態查詢、父 container、父狀態查詢、正式發布。
3. 驗證子 container 帶 `is_carousel_item=true`，父 container 帶 `media_type=CAROUSEL` 並保持 children 順序。
4. 驗證單一 `imageUrls` 自動走單圖流程。
5. 驗證空圖片、超過 10 張與非法網址會在網路請求前失敗。
6. 驗證子 container 失敗後不會呼叫父 container 或 `/media_publish`。
7. 驗證排程器會把 `imageUrls` 傳入 Instagram，但不改變 Facebook／Threads payload。

## 安全驗證與交付

1. 先執行完整單元測試，確認不需連 Meta 即可驗證流程。
2. 確認目前本機領先遠端的 3 個既有 commit 已推送，父親節圖片的 GitHub Pages 網址逐一回 200。
3. 實際 API 驗證先只建立輪播 container，不呼叫 `/media_publish`；這會產生 Meta 暫存 container，但不會公開發文。
4. 未經使用者再次明確同意，不執行正式輪播發布。
5. 完成後 commit、push 程式修改，回填 Obsidian `assignments.md`、新增執行紀錄並同步專案索引。

## 不在本次範圍

- Facebook 多圖貼文。
- Threads 輪播貼文。
- 影片或圖影混合輪播。
- 自動把目前 IG 手動經營流程切換成排程發布。
- 修改既有已發布或已排程的貼文資料。
