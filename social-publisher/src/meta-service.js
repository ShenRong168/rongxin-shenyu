import crypto from "node:crypto";
import { config } from "./config.js";
import { fetchJson, formBody } from "./http.js";

const facebookGraphBase = `https://graph.facebook.com/${config.graphVersion}`;
const threadsGraphBase = "https://graph.threads.net/v1.0";

export function createState() {
  return crypto.randomBytes(18).toString("hex");
}

export function buildFacebookAuthUrl(state, options = {}) {
  const params = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: config.meta.redirectUri,
    state,
    scope: config.meta.scopes,
    response_type: "code"
  });

  if (options.authType) {
    params.set("auth_type", options.authType);
  }

  return `https://www.facebook.com/${config.graphVersion}/dialog/oauth?${params}`;
}

export async function exchangeFacebookCode(code) {
  const shortToken = await fetchJson(
    `${facebookGraphBase}/oauth/access_token?${new URLSearchParams({
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      redirect_uri: config.meta.redirectUri,
      code
    })}`
  );

  const longToken = await fetchJson(
    `${facebookGraphBase}/oauth/access_token?${new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      fb_exchange_token: shortToken.access_token
    })}`
  );

  const accessToken = longToken.access_token || shortToken.access_token;
  const profile = await fetchJson(
    `${facebookGraphBase}/me?${new URLSearchParams({
      fields: "id,name",
      access_token: accessToken
    })}`
  );

  const pages = await listPages(accessToken);

  return {
    token: {
      accessToken,
      expiresIn: longToken.expires_in || shortToken.expires_in || null,
      userId: profile.id,
      userName: profile.name
    },
    pages
  };
}

export async function listPages(userAccessToken) {
  const pages = await fetchJson(
    `${facebookGraphBase}/me/accounts?${new URLSearchParams({
      fields:
        "id,name,access_token,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}",
      access_token: userAccessToken
    })}`
  );

  const accountPages = (pages.data || []).map((page) => ({
    id: page.id,
    name: page.name,
    accessToken: page.access_token,
    instagramBusinessAccount:
      page.instagram_business_account || page.connected_instagram_account || null
  }));

  if (accountPages.length) return accountPages;

  return listPagesFromGranularScopes(userAccessToken);
}

async function listPagesFromGranularScopes(userAccessToken) {
  const debug = await fetchJson(
    `${facebookGraphBase}/debug_token?${new URLSearchParams({
      input_token: userAccessToken,
      access_token: `${config.meta.appId}|${config.meta.appSecret}`
    })}`
  );

  const pageIds = new Set();
  for (const scope of debug.data?.granular_scopes || []) {
    if (!scope.scope?.startsWith("pages_")) continue;
    for (const targetId of scope.target_ids || []) {
      pageIds.add(targetId);
    }
  }

  const pages = [];
  for (const pageId of pageIds) {
    const page = await fetchJson(
      `${facebookGraphBase}/${pageId}?${new URLSearchParams({
        fields:
          "id,name,access_token,instagram_business_account{id,username,name},connected_instagram_account{id,username,name}",
        access_token: userAccessToken
      })}`
    );

    pages.push({
      id: page.id,
      name: page.name,
      accessToken: page.access_token,
      instagramBusinessAccount:
        page.instagram_business_account || page.connected_instagram_account || null
    });
  }

  return pages;
}

export async function publishFacebookPage({ pageId, pageAccessToken, message, link, imageUrl }) {
  if (imageUrl) {
    return fetchJson(`${facebookGraphBase}/${pageId}/photos`, {
      method: "POST",
      body: formBody({
        url: imageUrl,
        caption: message,
        access_token: pageAccessToken
      })
    });
  }

  return fetchJson(`${facebookGraphBase}/${pageId}/feed`, {
    method: "POST",
    body: formBody({
      message,
      link,
      access_token: pageAccessToken
    })
  });
}

export async function fetchFacebookPostMetrics({ postId, pageAccessToken }) {
  const basic = await fetchJson(
    `${facebookGraphBase}/${postId}?${new URLSearchParams({
      fields: "id,created_time,permalink_url,status_type",
      access_token: pageAccessToken
    })}`
  );

  const metrics = {
    id: basic.id,
    permalink: basic.permalink_url || null,
    createdAt: basic.created_time || null,
    statusType: basic.status_type || null,
    reactions: null,
    comments: null,
    shares: null,
    note: null
  };

  try {
    const engagement = await fetchJson(
      `${facebookGraphBase}/${postId}?${new URLSearchParams({
        fields: "shares,comments.summary(true),reactions.summary(true)",
        access_token: pageAccessToken
      })}`
    );

    metrics.reactions = engagement.reactions?.summary?.total_count ?? null;
    metrics.comments = engagement.comments?.summary?.total_count ?? null;
    metrics.shares = engagement.shares?.count ?? null;
  } catch (error) {
    metrics.note =
      "Facebook engagement fields need extra read permission such as pages_read_user_content.";
  }

  return metrics;
}

export async function publishInstagram({
  instagramUserId,
  pageAccessToken,
  caption,
  imageUrl,
  containerPollOptions
}) {
  if (!imageUrl) {
    throw new Error("Instagram publishing requires an imageUrl for this MVP.");
  }

  const container = await fetchJson(`${facebookGraphBase}/${instagramUserId}/media`, {
    method: "POST",
    body: formBody({
      image_url: imageUrl,
      caption,
      access_token: pageAccessToken
    })
  });

  await waitForInstagramContainer({
    containerId: container.id,
    pageAccessToken,
    ...containerPollOptions
  });

  return fetchJson(`${facebookGraphBase}/${instagramUserId}/media_publish`, {
    method: "POST",
    body: formBody({
      creation_id: container.id,
      access_token: pageAccessToken
    })
  });
}

export async function waitForInstagramContainer({
  containerId,
  pageAccessToken,
  attempts = 10,
  delayMs = 3000
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const status = await fetchJson(
      `${facebookGraphBase}/${containerId}?${new URLSearchParams({
        fields: "status_code",
        access_token: pageAccessToken
      })}`
    );

    if (status.status_code === "FINISHED") return status;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`Instagram media container ${status.status_code}`);
    }

    if (attempt < attempts) {
      await delay(delayMs);
    }
  }

  throw new Error("Instagram media container was not ready before timeout");
}

function delay(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchInstagramMediaMetrics({ mediaId, pageAccessToken }) {
  const media = await fetchJson(
    `${facebookGraphBase}/${mediaId}?${new URLSearchParams({
      fields:
        "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count",
      access_token: pageAccessToken
    })}`
  );

  return {
    id: media.id,
    permalink: media.permalink || null,
    createdAt: media.timestamp || null,
    mediaType: media.media_type || null,
    likes: media.like_count ?? null,
    comments: media.comments_count ?? null
  };
}

export function buildThreadsAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.threads.appId,
    redirect_uri: config.threads.redirectUri,
    state,
    scope: config.threads.scopes,
    response_type: "code"
  });

  return `https://threads.net/oauth/authorize?${params}`;
}

export async function exchangeThreadsCode(code) {
  const shortToken = await fetchJson("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    body: formBody({
      client_id: config.threads.appId,
      client_secret: config.threads.appSecret,
      redirect_uri: config.threads.redirectUri,
      code,
      grant_type: "authorization_code"
    })
  });

  const longToken = await fetchJson(
    `https://graph.threads.net/access_token?${new URLSearchParams({
      grant_type: "th_exchange_token",
      client_secret: config.threads.appSecret,
      access_token: shortToken.access_token
    })}`
  );

  const accessToken = longToken.access_token || shortToken.access_token;
  const profile = await fetchJson(
    `${threadsGraphBase}/me?${new URLSearchParams({
      fields: "id,username",
      access_token: accessToken
    })}`
  );

  return {
    accessToken,
    expiresIn: longToken.expires_in || shortToken.expires_in || null,
    userId: profile.id,
    username: profile.username
  };
}

export async function publishThreads({ threadsUserId, accessToken, text, imageUrl }) {
  const container = await fetchJson(`${threadsGraphBase}/${threadsUserId}/threads`, {
    method: "POST",
    body: formBody({
      media_type: imageUrl ? "IMAGE" : "TEXT",
      image_url: imageUrl,
      text,
      access_token: accessToken
    })
  });

  return fetchJson(`${threadsGraphBase}/${threadsUserId}/threads_publish`, {
    method: "POST",
    body: formBody({
      creation_id: container.id,
      access_token: accessToken
    })
  });
}

export async function fetchThreadsPostMetrics({ postId, accessToken }) {
  const basic = await fetchJson(
    `${threadsGraphBase}/${postId}?${new URLSearchParams({
      fields: "id,media_type,permalink,owner,username,text,timestamp,shortcode,is_quote_post",
      access_token: accessToken
    })}`
  );

  const metrics = {
    id: basic.id,
    permalink: basic.permalink || null,
    createdAt: basic.timestamp || null,
    mediaType: basic.media_type || null,
    username: basic.username || null,
    shortcode: basic.shortcode || null,
    views: null,
    likes: null,
    replies: null,
    reposts: null,
    quotes: null,
    note: null
  };

  try {
    const insights = await fetchJson(
      `${threadsGraphBase}/${postId}/insights?${new URLSearchParams({
        metric: "views,likes,replies,reposts,quotes",
        access_token: accessToken
      })}`
    );

    for (const item of insights.data || []) {
      metrics[item.name] = item.values?.at(-1)?.value ?? null;
    }
  } catch (error) {
    metrics.note = "Threads insights need additional Threads insight permission.";
  }

  return metrics;
}
