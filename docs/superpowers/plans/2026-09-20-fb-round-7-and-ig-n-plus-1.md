# FB 第七輪與 IG 第 N+1 輪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在各自到期前完成並公開驗證兩張 FB 文字卡及兩支 IG Reel，且每個產出均有單平台 queued 排程。

**Architecture:** FB 以既有 AppKit 文字卡產線穩定輸出可控中文字；IG 使用內建 `image_gen` 搭配既有角色圖，再以 `scripts/render_ig_reel.py` 產出字幕與置中 Ken Burns Reel。每個產出獨立完成檔案、排程、驗證、文件及 commit，避免批次失敗遺失進度。

**Tech Stack:** Swift/AppKit、built-in image_gen、Pillow、ffmpeg overlay、Node.js 排程檢查、GitHub Pages。

## Global Constraints

- FB 僅 Facebook；IG 僅 Instagram；均為 `status: "queued"`，使用指定 `+08:00` 時間。
- FB 文案及排程 ID 必須逐字採派工；IG 只使用核准按讚 CTA。
- FB 色票：`#A9BA9D`／`#173E35`／`#C9A86A`／`#F6F0E5`，品牌標籤為「榮心紳語 InnerDialogueStudio」。
- IG 以既有角色圖為參考：搶玩具用一位家長＋弟弟／妹妹，中秋用四人；發現媽媽頭身比例顯著失真時重生成。
- 不修改 `scripts/render_ig_reel.py`，不可混入既有未關聯工作區變更。
- 每項必須通過尺寸／解碼、`npm --prefix social-publisher run check`、公開 `curl -L` HTTP 200，並回填 vault 回報區與當日 log。

---

### Task 1: FB「不急著給答案的人」

**Files:**
- Create: `assets/not-rushing-to-answer-quote.png`
- Create: `scripts/render_not_rushing_to_answer_quote_card.swift`
- Modify: `social-publisher/scheduled-posts.json`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Create: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-09-20 第七輪FB安全的陌生人配圖.md`

**Consumes:** The approved FB copy and ID `2026-09-21-not-rushing-to-answer-facebook`.

**Produces:** A 1080×1350 PNG and Facebook-only queued post for `2026-09-21T21:00:00+08:00`.

- [ ] **Step 1: Derive the deterministic Swift renderer from `scripts/render_not_yet_let_go_quote_card.swift`.**

  Set `quote` to `不急著給答案的人`, retain the four exact palette constants, central gold separator, and `榮心紳語  InnerDialogueStudio` label. Use an existing approved blank handmade-paper background, never an image with old quote text.

- [ ] **Step 2: Render and inspect the PNG.**

  Run: `swift scripts/render_not_rushing_to_answer_quote_card.swift <blank-background.png> assets/not-rushing-to-answer-quote.png`

  Run: `sips -g pixelWidth -g pixelHeight -g format assets/not-rushing-to-answer-quote.png`

  Expected: 1080×1350 PNG. Inspect at full resolution: title and brand label have no clipping or character substitution.

- [ ] **Step 3: Add the exact approved Facebook post.**

  Add one object to `social-publisher/scheduled-posts.json` with `platforms: ["facebook"]`, the exact approved full message, `imageUrl: "https://shenrong168.github.io/rongxin-shenyu/assets/not-rushing-to-answer-quote.png"`, and `status: "queued"`.

- [ ] **Step 4: Validate and commit only Task 1 project files.**

  Run: `npm --prefix social-publisher run check`

  Run: `git diff --check`

  Run: `git add assets/not-rushing-to-answer-quote.png scripts/render_not_rushing_to_answer_quote_card.swift social-publisher/scheduled-posts.json && git commit -m "Queue FB post about patient listening" && git push origin main`

  Expected: config check exits 0; diff check has no output; push reports `main -> main`.

- [ ] **Step 5: Verify public delivery and record it.**

  Run: `curl -sS -I -L https://shenrong168.github.io/rongxin-shenyu/assets/not-rushing-to-answer-quote.png`

  Expected: final response is HTTP 200 with `content-type: image/png`. Add the asset path, dimensions, palette, tool, exact curl status to the vault report and append this item to the day log. Mark the FB mother task `[/] 1/2`.

### Task 2: FB「有些疲憊，不用解釋」

**Files:**
- Create: `assets/tired-no-explaining-quote.png`
- Create: `scripts/render_tired_no_explaining_quote_card.swift`
- Modify: `social-publisher/scheduled-posts.json`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-09-20 第七輪FB安全的陌生人配圖.md`

**Consumes:** Approved ID `2026-09-23-tired-no-explaining-facebook` and the same palette/layout contract.

**Produces:** A 1080×1350 PNG and Facebook-only queued post for `2026-09-23T21:00:00+08:00`.

- [ ] **Step 1: Create the deterministic renderer and card.**

  Adapt the Task 1 Swift renderer with `quote` set to `有些疲憊，\n不用解釋`; retain the existing background, palette, separator, and exact label. Render with `swift` to `assets/tired-no-explaining-quote.png` and validate with `sips -g pixelWidth -g pixelHeight -g format`.

- [ ] **Step 2: Queue the exact approved post.**

  Add only `2026-09-23-tired-no-explaining-facebook`, using the approved full message, `platforms: ["facebook"]`, `scheduledAt: "2026-09-23T21:00:00+08:00"`, queued status, and the public image URL ending in `tired-no-explaining-quote.png`.

- [ ] **Step 3: Validate, commit, publish, and verify.**

  Run: `npm --prefix social-publisher run check && git diff --check`

  Run: `git add assets/tired-no-explaining-quote.png scripts/render_tired_no_explaining_quote_card.swift social-publisher/scheduled-posts.json && git commit -m "Queue FB post about quiet exhaustion" && git push origin main`

  Run: `curl -sS -I -L https://shenrong168.github.io/rongxin-shenyu/assets/tired-no-explaining-quote.png`

  Expected: checks exit 0 and final curl response is HTTP 200 `image/png`. Record it in the vault report/day log and mark the FB mother task complete.

### Task 3: IG「孩子搶玩具」Reel

**Files:**
- Create: `assets/ig-characters/toy-grabbing.png`
- Create: `assets/ig-characters/reels/toy-grabbing-reel-final.mp4`
- Modify: `social-publisher/scheduled-posts.json`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Create: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-09-20 IG教養第二支孩子搶玩具.md`

**Consumes:** `assets/ig-characters/{mama,papa,otouto,imoto}-illustration.png`, approved ID `2026-09-22-toy-grabbing-instagram`, and `scripts/render_ig_reel.py`.

**Produces:** Reference-consistent illustration plus 15-second 1080×1350 MP4 and Instagram-only queued post.

- [ ] **Step 1: Generate one image with the four role references available.**

  Use built-in `image_gen` in `illustration-story` mode. Specify: warm hand-painted watercolor; a calm parent crouching with a reassuring hand on one child’s shoulder; two young children, one gently holding a toy; all faces and hands in upper two-thirds; bottom third intentionally simple for subtitles; learning communication, no punishment, fear, text, logo, or watermark. Keep the selected asset only after visual inspection confirms adult/child proportions and non-accusatory expressions.

- [ ] **Step 2: Persist and validate the illustration.**

  Copy the selected built-in output to `assets/ig-characters/toy-grabbing.png` without overwriting any reference image.

  Run: `sips -g pixelWidth -g pixelHeight -g format assets/ig-characters/toy-grabbing.png`

  Expected: 1080×1350 PNG.

- [ ] **Step 3: Render the Reel with approved core caption.**

  Run: `python3 scripts/render_ig_reel.py --image assets/ig-characters/toy-grabbing.png --output assets/ig-characters/reels/toy-grabbing-reel-final.mp4 --caption "孩子搶玩具，不是自私。" "他只是還在學怎麼說「我也想要」。"`

  Run: `ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,duration -of json assets/ig-characters/reels/toy-grabbing-reel-final.mp4`

  Expected: one 1080×1350 video stream at 30 fps, duration 15 seconds; visual review confirms centered push-in and a clear subtitle safe area.

- [ ] **Step 4: Add the IG post and independently verify it.**

  Add the full approved message to ID `2026-09-22-toy-grabbing-instagram`, platform `instagram` only, queued status, scheduled time `2026-09-22T12:30:00+08:00`, and the public `videoUrl` ending in `toy-grabbing-reel-final.mp4`.

  Run: `npm --prefix social-publisher run check && git diff --check`

  Run: `git add assets/ig-characters/toy-grabbing.png assets/ig-characters/reels/toy-grabbing-reel-final.mp4 social-publisher/scheduled-posts.json && git commit -m "Queue toy grabbing parenting IG Reel" && git push origin main`

  Run: `curl -sS -I -L https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/toy-grabbing.png && curl -sS -I -L https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/reels/toy-grabbing-reel-final.mp4`

  Expected: final HTTP 200 responses with `image/png` and `video/mp4`. Record reference files, tool version disclosure or lack of disclosure, validation evidence, and status in the vault report/day log; mark the IG mother task `[/] 1/2`.

### Task 4: IG「中秋團圓」Reel

**Files:**
- Create: `assets/ig-characters/mid-autumn-family.png`
- Create: `assets/ig-characters/reels/mid-autumn-family-reel-final.mp4`
- Modify: `social-publisher/scheduled-posts.json`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Create: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-09-20 IG中秋節Reel.md`

**Consumes:** All four role references and approved ID `2026-09-25-mid-autumn-instagram`.

**Produces:** A warm 1080×1350 illustration, 15-second MP4, and Instagram-only queued post.

- [ ] **Step 1: Generate and visually inspect the family scene.**

  Use built-in `image_gen` in `illustration-story` mode with all four role references. Specify a warm watercolor family scene on a balcony or by a window: four family members peel pomelo together and look at the moon; no advertising composition, mooncakes, in-image text, logos, or watermark; retain a calm lower third for subtitles. Regenerate if any reference character is materially distorted, especially mother’s head/body ratio.

- [ ] **Step 2: Save, check, and render the Reel.**

  Save to `assets/ig-characters/mid-autumn-family.png`; validate with `sips -g pixelWidth -g pixelHeight -g format`.

  Run: `python3 scripts/render_ig_reel.py --image assets/ig-characters/mid-autumn-family.png --output assets/ig-characters/reels/mid-autumn-family-reel-final.mp4 --caption "中秋的月亮，是全家一起抬頭看的那一顆。" "柚子剝好了，小手先伸過來。"`

  Run: `ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,duration -of json assets/ig-characters/reels/mid-autumn-family-reel-final.mp4`

  Expected: 1080×1350 PNG and a decodable 15-second 30 fps MP4.

- [ ] **Step 3: Queue, publish, verify, and close documentation.**

  Add the full approved post under `2026-09-25-mid-autumn-instagram`, only `platforms: ["instagram"]`, queued status, `scheduledAt: "2026-09-25T12:30:00+08:00"`, and public `videoUrl` ending in `mid-autumn-family-reel-final.mp4`.

  Run: `npm --prefix social-publisher run check && git diff --check`

  Run: `git add assets/ig-characters/mid-autumn-family.png assets/ig-characters/reels/mid-autumn-family-reel-final.mp4 social-publisher/scheduled-posts.json && git commit -m "Queue Mid-Autumn family IG Reel" && git push origin main`

  Run: `curl -sS -I -L https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/mid-autumn-family.png && curl -sS -I -L https://shenrong168.github.io/rongxin-shenyu/assets/ig-characters/reels/mid-autumn-family-reel-final.mp4`

  Expected: final public responses are HTTP 200 `image/png` and `video/mp4`. Record tool disclosure, all role references, dimensions, media checks and curl output, then mark the IG mother task complete.

### Task 5: Close cross-project records

**Files:**
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/README.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/_index/rongxin-shenyu.md`
- Modify: `/Users/shenrong168/.codex/automations/automation-2/memory.md`

**Consumes:** Public verification evidence from Tasks 1–4.

**Produces:** Concise, reconciled project and automation records.

- [ ] **Step 1: Add outcome-only summaries to the project README and index.**

  Include the four delivered filenames, queued dates/platforms, each project commit, and confirmation that each public asset URL returned HTTP 200. Do not restate the full approved captions.

- [ ] **Step 2: Update automation memory.**

  Add the current run timestamp, completed scope, public-verification status, and the next uncompleted non-card assignment. Preserve all existing history.

- [ ] **Step 3: Commit vault documents separately.**

  Run from `/Volumes/fast/Obsidian/ai-notes`: `git add rongxin-shenyu/todo/assignments.md rongxin-shenyu/logs/2026-09-20\ 第七輪FB安全的陌生人配圖.md rongxin-shenyu/logs/2026-09-20\ IG教養第二支孩子搶玩具.md rongxin-shenyu/logs/2026-09-20\ IG中秋節Reel.md rongxin-shenyu/README.md _index/rongxin-shenyu.md && git commit -m "Record September 20 card and Reel delivery" && git push`

  Expected: vault commit contains only this delivery record set; automation memory is updated separately in its configured location.
