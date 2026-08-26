# Reel-making tools (格式測試用)

兩支腳本把「靜態插畫 → 上傳就緒的 Reel」變成可重複流程，不用每次重新手刻 HTML。

## 1. 產生動畫頁面

```bash
python3 make_reel_card.py \
  --image ../whole-family-afternoon.png \
  --caption "第一行文字" "第二行文字" \
  --output ../my-new-reel.html
```

- 圖片會被 base64 內嵌進 HTML，檔案本身就是可攜帶的單一檔案。
- `--caption` 可以給多行（每行會用 `<br>` 分開），文字太長就自己拆行。
- 預設字級 56px，字數多的話可以加 `--font-size 48` 縮小。
- 輸出頁面不管視窗多大都會自動置中縮放，不會裁切。

## 2. 錄影

用瀏覽器（Chrome/Safari）打開產生的 `.html`（雙擊檔案，不要用聊天室內建預覽）：
1. 在頁面上點一下（確保鍵盤焦點在頁面上）
2. 按 **R**：畫面倒數 3·2·1 後動畫自動從頭跑
3. 開始螢幕錄影，錄到動畫跑完、停留 1-2 秒即可（總長約 18-20 秒沒問題，反正後製會裁）
4. 錄影全程不要切到別的視窗

## 3. 後製成上傳就緒的 MP4

```bash
./finish_reel.sh ~/Downloads/螢幕錄影.mov ../my-new-reel-final.mp4
```

預設會裁掉開頭倒數（前 2.3 秒）、只留動畫本體 14.7 秒，並放大到 1080×1350。
如果你錄影時多等了一下才按 R，時間點會跟預設值對不上，可以自己指定：

```bash
./finish_reel.sh ~/Downloads/螢幕錄影.mov ../my-new-reel-final.mp4 3.0 14.7
```

## 4. 上傳到系統

跟其他排程一樣，把成品 commit + push 到 repo（GitHub Pages 託管），
在 `social-publisher/scheduled-posts.json` 新增一筆 IG 貼文，
`platforms: ["instagram"]`、用 `videoUrl` 而不是 `imageUrl`，`status: "queued"`。
發布前記得 curl 驗證圖片網址回 200（詳見 `assignments.md` 的硬性規則）。
