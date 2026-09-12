# AGENTS.md — 榮心紳語(rongxin-shenyu)

本專案採用跨 AI 協作:Claude 統籌、Codex 負責程式/自動化執行(依專案分工筆記)、Antigravity 負責執行紀錄與優先級拆分。開工前請先讀:

1. Obsidian vault 共同規則:`/Volumes/fast/Obsidian/AI筆記本/AGENTS.md`
2. 本專案分工筆記(誰該做什麼、目前狀態):`/Volumes/fast/Obsidian/AI筆記本/榮心紳語/待辦/AI分工指派.md`
3. 專案索引:`/Volumes/fast/Obsidian/AI筆記本/榮心紳語/README.md`

完成任務後,請更新分工筆記裡對應項目的狀態,並視需要同步更新專案 README。

## IG Reel 字幕渲染（2026-09-12）

- 本機 `ffmpeg` 為 Homebrew 精簡版，沒有 `drawtext`／`subtitles`／`ass` 濾鏡；不要嘗試修復或改用 SRT 燒錄。
- Reel 字幕一律走 `scripts/render_ig_reel.py`（Pillow 字幕 PNG＋`overlay`）。
- 需要全功能版時安裝 `ffmpeg-full`；它是 keg-only，不影響現有 ffmpeg。
