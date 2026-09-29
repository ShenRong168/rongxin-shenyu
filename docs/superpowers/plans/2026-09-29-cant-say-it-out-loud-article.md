# 「有話說不出口怎麼辦？」文章 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved third article to the website with exact body copy, discovery links, and SEO/tracking metadata.

**Architecture:** The article is a standalone static HTML page cloned structurally from `articles/workplace-confusion.html`. Homepage and sitemap receive one narrowly scoped discovery-link update each; no shared styles or unrelated copy change.

**Tech Stack:** Static HTML, XML sitemap, Node.js built-in test runner, GitHub Pages.

## Global Constraints

- Use the Iris-approved article body verbatim; only HTML structure may change.
- Preserve the article template's Meta Pixel implementation and visual CSS.
- Add `Article` JSON-LD for the new canonical URL.
- Do not add pricing or alter other pages' copy/CSS.
- Keep existing unrelated working-tree changes out of commits.

---

### Task 1: Add the article and its discovery links

**Files:**
- Create: `articles/cant-say-it-out-loud.html`
- Modify: `index.html`
- Modify: `sitemap.xml`

- [x] **Step 1: Verify the new page is absent**

Run: `test -f articles/cant-say-it-out-loud.html`

Expected: non-zero exit because the article has not yet been created.

- [x] **Step 2: Create the page from the article template**

Copy `articles/workplace-confusion.html`, preserving all styles, navigation, Pixel code and footer. Replace page-specific metadata and article content with the approved title, intro, four headings, three-item ordered list, service-boundary paragraph and safety reminder. Add this JSON-LD in `<head>`:

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "有話說不出口怎麼辦？先不要逼自己立刻勇敢",
    "url": "https://rongxinshenyu.com/articles/cant-say-it-out-loud.html",
    "datePublished": "2026-09-29",
    "dateModified": "2026-09-29",
    "author": { "@type": "Organization", "name": "榮心紳語 Inner Dialogue Studio" },
    "publisher": { "@type": "Organization", "name": "榮心紳語 Inner Dialogue Studio" }
  }
</script>
```

- [x] **Step 3: Replace the homepage preview with the article link**

Replace only the existing third `article-grid` card's preview markup with:

```html
<p>關係溝通</p>
<h3><a href="articles/cant-say-it-out-loud.html">有話說不出口怎麼辦？先不要逼自己立刻勇敢</a></h3>
<span>界線練習</span>
```

- [x] **Step 4: Add the sitemap entry**

Append this `<url>` element before `</urlset>`:

```xml
<url>
  <loc>https://rongxinshenyu.com/articles/cant-say-it-out-loud.html</loc>
  <lastmod>2026-09-29</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.8</priority>
</url>
```

- [x] **Step 5: Run focused static checks**

Run:

```bash
node --check articles/cant-say-it-out-loud.html
grep -c "fbq(" articles/cant-say-it-out-loud.html
rg -n "cant-say-it-out-loud" index.html sitemap.xml articles/cant-say-it-out-loud.html
```

Expected: HTML syntax check exits 0, Pixel count is at least 1, and all three files contain the article path.

### Task 2: Validate, publish, and record the completed dispatch

**Files:**
- Modify: `docs/superpowers/plans/2026-09-29-cant-say-it-out-loud-article.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/todo/assignments.md`
- Create: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/logs/2026-09-29 有話說不出口怎麼辦官網文章.md`
- Modify: `/Volumes/fast/Obsidian/ai-notes/rongxin-shenyu/README.md`

- [x] **Step 1: Validate article structure and literal content**

Run Node's built-in HTML validation test plus exact-content checks:

```bash
node --test test/booking-site.test.mjs
rg -F "有些話在心裡練習過很多次，一走到對方面前，還是說不出口。" articles/cant-say-it-out-loud.html
rg -F "榮心紳語提供的是一對一線上對談，不是心理諮商，不做診斷或治療。想了解流程，可以看常見問題。" articles/cant-say-it-out-loud.html
git diff --check
```

Expected: test exits 0, both approved strings appear once, and whitespace check exits 0.

- [ ] **Step 2: Commit and push only task files**

Stage only the article, homepage, sitemap, and task design/plan documentation. Commit and push `main` without staging pre-existing unrelated changes.

- [ ] **Step 3: Verify public deployment**

Run:

```bash
curl -L -I https://rongxinshenyu.com/articles/cant-say-it-out-loud.html
```

Record the complete original response in the execution log. If the final status is not `200`, state `待確認` rather than inferring deployment completion.

- [ ] **Step 4: Close the vault dispatch**

Mark the assignment `[x]`; add a concise report with `任務`, `產出檔案`, `驗收`, `紀錄`, `待確認`, `下一步`, and `狀態`. Create the execution log with the original verification output. Add a dated recent-progress entry to the project README, then commit the vault changes.
