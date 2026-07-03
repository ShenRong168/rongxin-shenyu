import express from "express";
import { clearStateCookie, parseCookies, setStateCookie } from "./cookies.js";
import { config, missingConfigKeys } from "./config.js";
import { MetaApiError } from "./http.js";
import {
  buildFacebookAuthUrl,
  buildThreadsAuthUrl,
  createState,
  exchangeFacebookCode,
  exchangeThreadsCode,
  fetchFacebookPostMetrics,
  fetchInstagramMediaMetrics,
  fetchThreadsPostMetrics,
  publishFacebookPage,
  publishInstagram,
  publishThreads
} from "./meta-service.js";
import { appendPublishLog, loadStore, updateStore } from "./store.js";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", async (_req, res) => {
  const state = await loadStore();
  res.type("html").send(renderHome({ state, missing: missingConfigKeys() }));
});

app.get("/auth/meta", (_req, res) => {
  const state = createState();
  setStateCookie(res, "meta_oauth_state", state);
  res.redirect(buildFacebookAuthUrl(state));
});

app.get("/auth/meta/reselect", (_req, res) => {
  const state = createState();
  setStateCookie(res, "meta_oauth_state", state);
  res.redirect(buildFacebookAuthUrl(state, { authType: "rerequest" }));
});

app.post("/auth/meta/disconnect", async (_req, res) => {
  await updateStore((state) => ({
    ...state,
    meta: null,
    pages: [],
    selectedPageId: null,
    selectedInstagramUserId: null
  }));

  res.redirect("/");
});

app.get("/auth/meta/callback", async (req, res, next) => {
  try {
    assertOauthState(req, res, "meta_oauth_state");
    const result = await exchangeFacebookCode(String(req.query.code || ""));

    await updateStore((state) => {
      const pages = mergePages(state.pages || [], result.pages || []);
      const selectedPage =
        pages.find((page) => page.id === state.selectedPageId) ||
        pages.find((page) => page.name.includes("榮心紳語")) ||
        pages[0] ||
        null;

      return {
        ...state,
        meta: result.token,
        pages,
        selectedPageId: selectedPage?.id || null,
        selectedInstagramUserId:
          selectedPage?.instagramBusinessAccount?.id ||
          state.selectedInstagramUserId ||
          null
      };
    });

    res.redirect("/");
  } catch (error) {
    next(error);
  }
});

app.get("/auth/threads", (_req, res) => {
  const state = createState();
  setStateCookie(res, "threads_oauth_state", state);
  res.redirect(buildThreadsAuthUrl(state));
});

app.get("/auth/threads/callback", async (req, res, next) => {
  try {
    assertOauthState(req, res, "threads_oauth_state");
    const threadsToken = await exchangeThreadsCode(String(req.query.code || ""));

    await updateStore((state) => ({
      ...state,
      threads: threadsToken
    }));

    res.redirect("/");
  } catch (error) {
    next(error);
  }
});

app.get("/auth/threads/deauthorize", (_req, res) => {
  res.type("html").send(
    pageShell(`
      <section class="panel">
        <h1>Threads 已取消授權</h1>
        <p>榮心紳語一鍵發文 MVP 已收到取消授權通知。本機測試版不會保留雲端資料；若有本機 token，可刪除 <code>social-publisher/data/tokens.json</code>。</p>
      </section>
    `)
  );
});

app.get("/auth/threads/delete", (_req, res) => {
  res.type("html").send(
    pageShell(`
      <section class="panel">
        <h1>Threads 資料刪除說明</h1>
        <p>榮心紳語一鍵發文 MVP 的 token 與發文紀錄只存在你的本機 <code>social-publisher/data/tokens.json</code>。刪除此檔即可移除本機保存的 Threads 連線資料。</p>
      </section>
    `)
  );
});

app.post("/connections/page", async (req, res) => {
  const pageId = String(req.body.pageId || "");

  await updateStore((state) => {
    const page = (state.pages || []).find((candidate) => candidate.id === pageId);

    return {
      ...state,
      selectedPageId: page?.id || state.selectedPageId,
      selectedInstagramUserId:
        page?.instagramBusinessAccount?.id || state.selectedInstagramUserId
    };
  });

  res.redirect("/");
});

app.post("/publish", async (req, res, next) => {
  try {
    const state = await loadStore();
    const platforms = normalizeArray(req.body.platforms);
    const message = String(req.body.message || "").trim();
    const link = String(req.body.link || "").trim();
    const imageUrl = String(req.body.imageUrl || "").trim();
    const dryRun = req.body.dryRun === "on";

    if (!message) throw new Error("Message is required.");
    if (!platforms.length) throw new Error("Select at least one platform.");

    const results = [];

    if (platforms.includes("facebook")) {
      if (dryRun && !state.selectedPageId) {
        results.push({
          platform: "facebook",
          result: { dryRun: true, payload: { pageId: "[select-page-after-oauth]", message, link, imageUrl } }
        });
      } else {
      const page = selectedPage(state);
      const payload = { pageId: page.id, pageAccessToken: page.accessToken, message, link, imageUrl };
      results.push({
        platform: "facebook",
        result: dryRun ? { dryRun: true, payload: redact(payload) } : await publishFacebookPage(payload)
      });
      }
    }

    if (platforms.includes("instagram")) {
      if (dryRun && !state.selectedInstagramUserId) {
        results.push({
          platform: "instagram",
          result: {
            dryRun: true,
            payload: { instagramUserId: "[connect-instagram-business-after-oauth]", caption: message, imageUrl }
          }
        });
      } else {
      const page = selectedPage(state);
      const instagramUserId = state.selectedInstagramUserId || page.instagramBusinessAccount?.id;
      if (!instagramUserId) throw new Error("Selected Facebook Page has no connected Instagram Business account.");

      const payload = { instagramUserId, pageAccessToken: page.accessToken, caption: message, imageUrl };
      results.push({
        platform: "instagram",
        result: dryRun ? { dryRun: true, payload: redact(payload) } : await publishInstagram(payload)
      });
      }
    }

    if (platforms.includes("threads")) {
      if (dryRun && (!state.threads?.accessToken || !state.threads?.userId)) {
        results.push({
          platform: "threads",
          result: { dryRun: true, payload: { threadsUserId: "[connect-threads-after-oauth]", text: message, imageUrl } }
        });
      } else {
      if (!state.threads?.accessToken || !state.threads?.userId) {
        throw new Error("Connect Threads before publishing.");
      }

      const payload = {
        threadsUserId: state.threads.userId,
        accessToken: state.threads.accessToken,
        text: message,
        imageUrl
      };
      results.push({
        platform: "threads",
        result: dryRun ? { dryRun: true, payload: redact(payload) } : await publishThreads(payload)
      });
      }
    }

    await appendPublishLog({ dryRun, platforms, message, link, imageUrl, results });

    res.type("html").send(renderResult({ results, dryRun }));
  } catch (error) {
    next(error);
  }
});

app.post("/metrics/sync", async (_req, res, next) => {
  try {
    await updateStore(syncMetrics);
    res.redirect("/");
  } catch (error) {
    next(error);
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use((error, _req, res, _next) => {
  const status = error instanceof MetaApiError ? error.details.status || 502 : 400;
  res.status(status).type("html").send(renderError(error));
});

app.listen(config.port, () => {
  console.log(`Social publisher running at http://localhost:${config.port}`);
});

function assertOauthState(req, res, cookieName) {
  const cookies = parseCookies(req.headers.cookie);
  const expected = cookies[cookieName];
  const actual = String(req.query.state || "");

  clearStateCookie(res, cookieName);

  if (!expected || expected !== actual) {
    throw new Error("OAuth state mismatch. Please retry the connection flow.");
  }
}

function selectedPage(state) {
  const page = (state.pages || []).find((candidate) => candidate.id === state.selectedPageId);
  if (!page) throw new Error("Connect and select a Facebook Page first.");
  return page;
}

function mergePages(existingPages, freshPages) {
  const byId = new Map();

  for (const page of existingPages) {
    byId.set(page.id, page);
  }

  for (const page of freshPages) {
    byId.set(page.id, {
      ...byId.get(page.id),
      ...page,
      instagramBusinessAccount:
        page.instagramBusinessAccount ||
        byId.get(page.id)?.instagramBusinessAccount ||
        null
    });
  }

  return [...byId.values()];
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function redact(payload) {
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      key.toLowerCase().includes("token") ? "[redacted]" : value
    ])
  );
}

async function syncMetrics(state) {
  const page = (state.pages || []).find((candidate) => candidate.id === state.selectedPageId);

  const publishLog = [];
  for (const entry of state.publishLog || []) {
    if (entry.dryRun) {
      publishLog.push(entry);
      continue;
    }

    const metrics = [];
    for (const result of entry.results || []) {
      const postId = result.result?.id;
      if (!postId) continue;

      try {
        if (result.platform === "facebook") {
          if (!page?.accessToken) throw new Error("Missing Facebook Page token.");
          metrics.push({
            platform: result.platform,
            postId,
            syncedAt: new Date().toISOString(),
            data: await fetchFacebookPostMetrics({ postId, pageAccessToken: page.accessToken })
          });
        }

        if (result.platform === "instagram") {
          if (!page?.accessToken) throw new Error("Missing Facebook Page token.");
          metrics.push({
            platform: result.platform,
            postId,
            syncedAt: new Date().toISOString(),
            data: await fetchInstagramMediaMetrics({ mediaId: postId, pageAccessToken: page.accessToken })
          });
        }

        if (result.platform === "threads") {
          if (!state.threads?.accessToken) throw new Error("Missing Threads token.");
          metrics.push({
            platform: result.platform,
            postId,
            syncedAt: new Date().toISOString(),
            data: await fetchThreadsPostMetrics({ postId, accessToken: state.threads.accessToken })
          });
        }
      } catch (error) {
        metrics.push({
          platform: result.platform,
          postId,
          syncedAt: new Date().toISOString(),
          error: error.message
        });
      }
    }

    publishLog.push({ ...entry, metrics });
  }

  return { ...state, publishLog, metricsLastSyncedAt: new Date().toISOString() };
}

function renderHome({ state, missing }) {
  const pages = state.pages || [];
  const selected = state.selectedPageId || "";
  const recentLogs = (state.publishLog || []).slice(0, 5);

  return pageShell(`
    <section class="panel">
      <h1>榮心紳語一鍵發文 MVP</h1>
      <p>先用 dry-run 測 payload，再取消 dry-run 真正發文。IG 目前需要公開圖片網址；FB Page 和 Threads 可發純文字。</p>
      ${
        missing.length
          ? `<div class="warning">缺少環境變數：${escapeHtml(missing.join(", "))}。請先複製 .env.example 成 .env 後填入。</div>`
          : ""
      }
      <div class="actions">
        <a class="button" href="/auth/meta">連接 Facebook / Instagram</a>
        <a class="button secondary" href="/auth/meta/reselect">重新選擇 FB / IG 授權</a>
        <a class="button secondary" href="/auth/threads">連接 Threads</a>
      </div>
      <form method="post" action="/auth/meta/disconnect" class="inline-form">
        <button class="button danger" type="submit">清除本機 FB / IG 連線</button>
      </form>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>連線狀態</h2>
        <ul>
          <li>Meta：${state.meta ? `已連接 ${escapeHtml(state.meta.userName || state.meta.userId)}` : "未連接"}</li>
          <li>Threads：${state.threads ? `已連接 @${escapeHtml(state.threads.username || state.threads.userId)}` : "未連接"}</li>
          <li>Instagram：${state.selectedInstagramUserId ? `已找到 IG Business ID ${escapeHtml(state.selectedInstagramUserId)}` : "尚未找到連結的 IG Business 帳號"}</li>
        </ul>
      </div>

      <div class="panel">
        <h2>選擇 Facebook Page</h2>
        ${
          pages.length
            ? `<form method="post" action="/connections/page">
                <select name="pageId">
                  ${pages
                    .map(
                      (page) =>
                        `<option value="${escapeHtml(page.id)}" ${page.id === selected ? "selected" : ""}>${escapeHtml(page.name)}${page.instagramBusinessAccount ? " + IG" : ""}</option>`
                    )
                    .join("")}
                </select>
                <button type="submit">儲存 Page</button>
              </form>`
            : "<p>尚未取得 Page。請先連接 Facebook / Instagram。</p>"
        }
      </div>
    </section>

    <section class="panel">
      <h2>發文測試</h2>
      <form method="post" action="/publish" class="publish-form">
        <label>平台</label>
        <div class="checks">
          <label><input type="checkbox" name="platforms" value="facebook" checked> Facebook Page</label>
          <label><input type="checkbox" name="platforms" value="instagram"> Instagram</label>
          <label><input type="checkbox" name="platforms" value="threads" checked> Threads</label>
        </div>

        <label for="message">貼文文字</label>
        <textarea id="message" name="message" rows="9">你不是不敢開始，你只是還沒聽懂自己的害怕。

有時候卡在工作或創業的轉折點，不是因為你沒有能力，也不是因為你太膽小。

你需要一個空間，先把這些聲音一個一個放出來。

#榮心紳語 #人生除錯 #職涯轉折 #創業焦慮</textarea>

        <label for="link">連結（FB 可用，選填）</label>
        <input id="link" name="link" type="url" placeholder="https://shenrong168.github.io/rongxin-shenyu/articles/career-transition.html">

        <label for="imageUrl">公開圖片 URL（IG 必填；FB/Threads 選填）</label>
        <input id="imageUrl" name="imageUrl" type="url" placeholder="https://.../image.jpg">

        <label class="inline"><input type="checkbox" name="dryRun" checked> Dry-run，只測試 payload，不真的發文</label>
        <button type="submit">送出</button>
      </form>
    </section>

    <section class="panel">
      <h2>最近紀錄</h2>
      <form method="post" action="/metrics/sync" class="inline-form">
        <button type="submit">同步成效</button>
        ${
          state.metricsLastSyncedAt
            ? `<span class="muted">上次同步：${escapeHtml(formatDateTime(state.metricsLastSyncedAt))}</span>`
            : ""
        }
      </form>
      ${
        recentLogs.length
          ? renderPublishLog(recentLogs)
          : "<p>尚無發文紀錄。</p>"
      }
    </section>
  `);
}

function renderPublishLog(logs) {
  return `<div class="log-list">${logs.map(renderLogEntry).join("")}</div>`;
}

function renderLogEntry(entry) {
  const results = entry.results || [];
  const metrics = entry.metrics || [];

  return `
    <article class="log-entry">
      <div class="log-head">
        <strong>${escapeHtml(entry.dryRun ? "Dry-run" : "已發文")}</strong>
        <span class="muted">${escapeHtml(formatDateTime(entry.at))}</span>
      </div>
      <p>${escapeHtml(truncate(entry.message || "", 90))}</p>
      <div class="metric-grid">
        ${results.map((result) => renderMetricCard(result, metrics)).join("")}
      </div>
    </article>
  `;
}

function renderMetricCard(result, metrics) {
  const postId = result.result?.id;
  const metric = metrics.find(
    (candidate) => candidate.platform === result.platform && candidate.postId === postId
  );
  const data = metric?.data || null;

  return `
    <div class="metric-card">
      <div class="metric-title">${escapeHtml(platformLabel(result.platform))}</div>
      <div class="muted">${escapeHtml(postId || "尚無 post ID")}</div>
      ${data?.permalink ? `<a href="${escapeHtml(data.permalink)}" target="_blank" rel="noreferrer">開啟貼文</a>` : ""}
      ${renderMetricNumbers(result.platform, data)}
      ${metric?.error ? `<p class="metric-note">${escapeHtml(metric.error)}</p>` : ""}
      ${data?.note ? `<p class="metric-note">${escapeHtml(data.note)}</p>` : ""}
      ${metric?.syncedAt ? `<div class="muted">同步：${escapeHtml(formatDateTime(metric.syncedAt))}</div>` : ""}
    </div>
  `;
}

function renderMetricNumbers(platform, data) {
  if (!data) return `<p class="muted">尚未同步成效</p>`;

  if (platform === "facebook") {
    return `
      <dl class="metrics">
        <div><dt>反應</dt><dd>${formatMetric(data.reactions)}</dd></div>
        <div><dt>留言</dt><dd>${formatMetric(data.comments)}</dd></div>
        <div><dt>分享</dt><dd>${formatMetric(data.shares)}</dd></div>
      </dl>
    `;
  }

  if (platform === "instagram") {
    return `
      <dl class="metrics">
        <div><dt>讚</dt><dd>${formatMetric(data.likes)}</dd></div>
        <div><dt>留言</dt><dd>${formatMetric(data.comments)}</dd></div>
      </dl>
    `;
  }

  if (platform === "threads") {
    return `
      <dl class="metrics">
        <div><dt>瀏覽</dt><dd>${formatMetric(data.views)}</dd></div>
        <div><dt>讚</dt><dd>${formatMetric(data.likes)}</dd></div>
        <div><dt>回覆</dt><dd>${formatMetric(data.replies)}</dd></div>
        <div><dt>轉發</dt><dd>${formatMetric(data.reposts)}</dd></div>
      </dl>
    `;
  }

  return "";
}

function renderResult({ results, dryRun }) {
  return pageShell(`
    <section class="panel">
      <h1>${dryRun ? "Dry-run 完成" : "發文完成"}</h1>
      <pre>${escapeHtml(JSON.stringify(results, null, 2))}</pre>
      <a class="button" href="/">回首頁</a>
    </section>
  `);
}

function renderError(error) {
  return pageShell(`
    <section class="panel warning">
      <h1>發生錯誤</h1>
      <p>${escapeHtml(error.message)}</p>
      ${error.details ? `<pre>${escapeHtml(JSON.stringify(error.details, null, 2))}</pre>` : ""}
      <a class="button" href="/">回首頁</a>
    </section>
  `);
}

function platformLabel(platform) {
  return {
    facebook: "Facebook",
    instagram: "Instagram",
    threads: "Threads"
  }[platform] || platform;
}

function formatMetric(value) {
  return value === null || value === undefined ? "-" : String(value);
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function pageShell(content) {
  return `<!doctype html>
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>榮心紳語一鍵發文 MVP</title>
        <style>
          :root { color-scheme: light; --ink:#24312c; --muted:#65736c; --paper:#f8f5ee; --cream:#fffdf8; --moss:#425d4a; --line:rgba(36,49,44,.14); --clay:#b98263; }
          * { box-sizing: border-box; }
          body { margin:0; color:var(--ink); background:var(--paper); font-family:-apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif; line-height:1.7; }
          main { width:min(1040px, calc(100vw - 32px)); margin:0 auto; padding:32px 0 64px; }
          h1,h2 { line-height:1.25; }
          .panel { margin:18px 0; padding:24px; background:var(--cream); border:1px solid var(--line); border-radius:8px; }
          .grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
          .actions, .checks { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
          .button, button { display:inline-flex; min-height:42px; align-items:center; justify-content:center; padding:9px 16px; color:white; background:var(--moss); border:1px solid var(--moss); border-radius:999px; font-weight:700; text-decoration:none; cursor:pointer; }
          .button.secondary { color:var(--moss); background:white; }
          .button.danger { color:#8b2f25; background:#fff8f2; border-color:rgba(139,47,37,.28); }
          .inline-form { margin-top:12px; }
          .muted { color:var(--muted); font-size:.92rem; }
          .warning { border-color:rgba(185,130,99,.45); background:#fff8f2; }
          .publish-form { display:grid; gap:12px; }
          label { font-weight:700; }
          label.inline, .checks label { font-weight:500; }
          input, select, textarea { width:100%; padding:12px; border:1px solid var(--line); border-radius:8px; font:inherit; }
          .checks input, label.inline input { width:auto; }
          textarea { resize:vertical; }
          pre { overflow:auto; padding:16px; background:#f5f0e8; border-radius:8px; }
          .log-list { display:grid; gap:14px; margin-top:16px; }
          .log-entry { padding:16px; border:1px solid var(--line); border-radius:8px; background:white; }
          .log-head { display:flex; flex-wrap:wrap; gap:10px; align-items:baseline; justify-content:space-between; }
          .metric-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; }
          .metric-card { padding:12px; border:1px solid var(--line); border-radius:8px; background:#fffdf8; }
          .metric-title { font-weight:800; }
          .metrics { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; margin:10px 0; }
          .metrics div { padding:8px; border-radius:8px; background:#f5f0e8; }
          .metrics dt { color:var(--muted); font-size:.82rem; }
          .metrics dd { margin:0; font-weight:800; }
          .metric-note { margin:.5rem 0 0; color:#8b2f25; font-size:.9rem; }
          @media (max-width:760px) { .grid { grid-template-columns:1fr; } }
          @media (max-width:900px) { .metric-grid { grid-template-columns:1fr; } }
        </style>
      </head>
      <body><main>${content}</main></body>
    </html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
