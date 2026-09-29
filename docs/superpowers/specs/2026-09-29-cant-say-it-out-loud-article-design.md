# 「有話說不出口怎麼辦？」文章設計

日期：2026-09-29

## 目標

在榮心紳語官網新增第三篇關係溝通文章，讓使用者在「有話說不出口」的情境中，先獲得可閱讀、可練習的下一步，並安全地理解一對一線上對談的服務邊界。

## 範圍

1. 以 `articles/workplace-confusion.html` 為固定版型，新增 `articles/cant-say-it-out-loud.html`。
2. 保留範本的 SEO metadata、canonical、Open Graph、Meta Pixel、Article JSON-LD、導覽、CTA、頁尾與 CSS。
3. 將 Iris 核准的文章正文逐字放入既有文章結構；只調整標題層級、清單與版面標記。
4. 將首頁文章區的關係溝通預告卡改為新文章連結。
5. 將文章網址加入 `sitemap.xml`，`lastmod` 使用實際修改日期 `2026-09-29`。

## 不在範圍

- 不變更其他首頁、文章或 FAQ 文字。
- 不改動既有 CSS。
- 不新增價格、未核准的服務承諾或未查證的搜尋量資訊。

## 驗收

- 新頁可在本機瀏覽，HTML 結構完整。
- `fbq(` 在新頁至少出現一次。
- 新頁的 canonical、OG URL、JSON-LD URL 與 sitemap URL 都指向 `https://rongxinshenyu.com/articles/cant-say-it-out-loud.html`。
- 本機驗證通過後，提交並推送網站 repo；部署完成後以 `curl -L -I` 驗證公開頁面。
- 在 vault 的指派與執行紀錄同步完成，並分別提交網站 repo 與 vault。
