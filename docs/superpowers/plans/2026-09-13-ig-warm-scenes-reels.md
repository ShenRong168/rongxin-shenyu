# IG「溫馨情境」第 N 輪 Reels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 製作、排程並驗收三支連續的 IG 親子溫馨情境 Reels，恢復 IG 佇列。

**Architecture:** 每支內容是可獨立驗收的交付單位：一張 1080×1350 插畫，餵給既有 `scripts/render_ig_reel.py` 生成 15 秒 Reel，再新增一筆 Instagram 排程。使用 GitHub Pages 托管 PNG／MP4，推送後以 HTTP 200 驗證，並將真實進度同步到 vault。

**Tech Stack:** Image generation、Pillow、Python 3、ffmpeg overlay、Node.js social-publisher、GitHub Pages、git。

## Global Constraints

- 嚴格依序為教養解惑、極近特寫、出門前外套；不碰 paused 的 `school-eve-ready`。
- 每支都是 Reel，不做靜態圖或輪播；輸出 1080×1350、30 fps、15 秒。
- 字幕必走 `scripts/render_ig_reel.py` 的 Pillow PNG + overlay，不用 `drawtext`、SRT、`subtitles` 或 `ass`。
- 文案只用 IG 親子／生活內容、3 個相關 hashtag、正向按讚型 CTA；不用留言、收藏、反問或自責框架。
- 寫入排程前一律執行 `cd social-publisher && npm run schedule:pull`；同步若失敗即停止排程。
- 每支需同一次完成插畫、Reel、排程、commit、push、公開 PNG／MP4 HTTP 200、vault 回報與執行紀錄。
- 三支完成才勾選主任務；進行中使用 `[/]`，並寫明完成支數與下一支。

---

### Task 1: 教養解惑 Reel — 平靜接住孩子的動手瞬間

**Files:**
- Create: `assets/ig-characters/gentle-hands-not-bad.png`
- Create: `assets/ig-characters/reels/gentle-hands-not-bad-reel-final.mp4`
- Modify: `social-publisher/scheduled-posts.json`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Create: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-09-13 IG溫馨情境第N輪第1支教養解惑.md`

**Consumes:** 教養情境規格、既有 `render_ig_reel.py`。
**Produces:** 2026-09-14 12:30 的單一 Instagram `queued` 排程與公開驗證網址。

- [ ] **Step 1: 同步排程真相並確認 IG 無 queued 項目**

Run: `cd social-publisher && npm run schedule:pull`

Expected: pull 與 schedule sync 均成功；只可讀取同步後的 JSON 狀態。

- [ ] **Step 2: 產生無文字的家庭插畫並檢視品質**

產圖提示必含：4:5 直式溫暖手繪水彩插畫、幼兒正要拍打但非攻擊姿勢、家長以平靜理解的表情輕柔阻止與接住手腕、無責備無驚恐、主體不位於底部字幕安全區、無可讀文字／水印。

Expected: `assets/ig-characters/gentle-hands-not-bad.png` 為 1080×1350 PNG，人物與構圖符合規格。

- [ ] **Step 3: 以現有 renderer 產出並驗證 Reel**

Run: `python3 scripts/render_ig_reel.py --image assets/ig-characters/gentle-hands-not-bad.png --output assets/ig-characters/reels/gentle-hands-not-bad-reel-final.mp4 --caption '寶寶突然打人，不是變壞。' '他只是還不會用說的表達。'`

Run: `ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,duration -of json assets/ig-characters/reels/gentle-hands-not-bad-reel-final.mp4`

Expected: 可解碼、1080×1350、30 fps、15 秒，抽格確認字幕未遮主體臉部。

- [ ] **Step 4: 新增排程並驗證 JSON**

新增 id `2026-09-14-gentle-hands-not-bad-instagram`，platform 為 `instagram`、status 為 `queued`、`scheduledAt` 為 `2026-09-14T12:30:00+08:00`，`videoUrl` 指向上述 MP4 公開路徑。文案以溫和解釋與按讚 CTA 收尾。

Run: `cd social-publisher && npm run check && npm run check:schedule-sync`

Expected: 兩個檢查成功。

- [ ] **Step 5: 推送與公開驗證，更新 vault**

Commit 僅包含本支 PNG、MP4 與排程 JSON，push 後以 `curl -I` 驗證兩個公開資源皆 HTTP 200。將主任務標為 `[/]`，回報第 1/3 支完成與第 2 支為下一步；寫本支 vault log，commit/push vault。

### Task 2: 極近特寫 Reel — 被捧在手心

**Files:**
- Create: `assets/ig-characters/held-in-palm.png`
- Create: `assets/ig-characters/reels/held-in-palm-reel-final.mp4`
- Modify: `social-publisher/scheduled-posts.json`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Create: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-09-13 IG溫馨情境第N輪第2支被捧在手心.md`

**Consumes:** 同步後的排程與既有 renderer。
**Produces:** 2026-09-16 12:30 的單一 Instagram `queued` 排程與公開驗證網址。

- [ ] **Step 1: 重新同步並確認第一支仍為 queued**

Run: `cd social-publisher && npm run schedule:pull`

Expected: pull 與 sync 成功，第一支排程沒有被覆寫。

- [ ] **Step 2: 產生無文字的極近特寫插畫並檢視品質**

產圖提示必含：4:5 直式水彩插畫、只出現幼兒臉部與一隻成人手、手掌輕托臉頰、床單或被子簡化背景、親密安全感、不露完整人物、不含文字或水印、臉部遠離底部字幕安全區。

Expected: `assets/ig-characters/held-in-palm.png` 為 1080×1350 PNG。

- [ ] **Step 3: 產出並驗證 Reel**

Run: `python3 scripts/render_ig_reel.py --image assets/ig-characters/held-in-palm.png --output assets/ig-characters/reels/held-in-palm-reel-final.mp4 --caption '有些被好好捧著的感覺，' '會留在心裡很久。'`

Run: `ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,duration -of json assets/ig-characters/reels/held-in-palm-reel-final.mp4`

Expected: 可解碼、1080×1350、30 fps、15 秒；抽格不遮臉。

- [ ] **Step 4: 新增、檢查、推送與記錄排程**

新增 id `2026-09-16-held-in-palm-instagram`，platform `instagram`、status `queued`、`scheduledAt` `2026-09-16T12:30:00+08:00`，指向本支 MP4。文案使用按讚 CTA。

Run: `cd social-publisher && npm run check && npm run check:schedule-sync`

Expected: 檢查成功。僅提交本支資產與 JSON，push 後以 `curl -I` 驗證 PNG／MP4 均 HTTP 200；更新 assignments 為第 2/3 支完成、下一支為外套情境，新增本支 vault log 並提交 vault。

### Task 3: 溫馨日常 Reel — 出門前穿外套

**Files:**
- Create: `assets/ig-characters/coat-before-going-out.png`
- Create: `assets/ig-characters/reels/coat-before-going-out-reel-final.mp4`
- Modify: `social-publisher/scheduled-posts.json`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Create: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-09-13 IG溫馨情境第N輪第3支出門前外套.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/README.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/_index/rongxin-shenyu.md`

**Consumes:** 同步後的兩支 queued 排程與既有 renderer。
**Produces:** 2026-09-18 12:30 的單一 Instagram `queued` 排程，完成的主任務、README／索引更新與公開驗證網址。

- [ ] **Step 1: 同步排程並確認前兩支狀態**

Run: `cd social-publisher && npm run schedule:pull`

Expected: pull 與 sync 成功，兩支既有排程均維持 queued。

- [ ] **Step 2: 產生無文字的出門前外套插畫並檢視品質**

產圖提示必含：4:5 直式水彩插畫、成人蹲下替幼兒穿外套、玄關或柔和門口光線、自然親近、不是共讀或玩具場景、無文字／水印、主要臉部不在底部字幕安全區。

Expected: `assets/ig-characters/coat-before-going-out.png` 為 1080×1350 PNG。

- [ ] **Step 3: 產出並驗證 Reel**

Run: `python3 scripts/render_ig_reel.py --image assets/ig-characters/coat-before-going-out.png --output assets/ig-characters/reels/coat-before-going-out-reel-final.mp4 --caption '出門前的幾分鐘，' '也是有人好好照顧你的證明。'`

Run: `ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,duration -of json assets/ig-characters/reels/coat-before-going-out-reel-final.mp4`

Expected: 可解碼、1080×1350、30 fps、15 秒；抽格確認安全區。

- [ ] **Step 4: 新增、檢查、推送與最終同步**

新增 id `2026-09-18-coat-before-going-out-instagram`，platform `instagram`、status `queued`、`scheduledAt` `2026-09-18T12:30:00+08:00`，指向本支 MP4。文案使用按讚 CTA。

Run: `cd social-publisher && npm run check && npm run check:schedule-sync`

Expected: 檢查成功。僅提交本支資產與 JSON，push 後以 `curl -I` 驗證 PNG／MP4 均 HTTP 200。

- [ ] **Step 5: 完成 vault 收尾並驗證提交範圍**

將主任務改為 `[x]`，新增第三支 log，在 README 近期進度加入三支 Reel 與 commit／排程日期，索引更新最新紀錄連結。提交並推送 vault，確認 project 與 vault 的 `git status --short` 僅剩既有非本任務改動。

## Plan Self-Review

- **Spec coverage:** 三個指定題材、固定順序、Reel 產線、字幕限制、CTA、三個日期、逐支排程／推送／HTTP 驗證、進行中與最終 vault 收尾均有對應任務。
- **Placeholder scan:** 未含 TBD、TODO、或未定義的後續實作。
- **Consistency:** 檔名、Reel 來源與排程 ID 在各任務內一一對應；每筆排程均為單一 Instagram `queued` 項目。
