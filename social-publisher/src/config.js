import dotenv from "dotenv";

dotenv.config();

const graphVersion = process.env.META_GRAPH_VERSION || "v22.0";

export const config = {
  port: Number(process.env.PORT || 3000),
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
  graphVersion,
  meta: {
    appId: process.env.META_APP_ID || "",
    appSecret: process.env.META_APP_SECRET || "",
    redirectUri:
      process.env.META_REDIRECT_URI ||
      `${process.env.APP_BASE_URL || "http://localhost:3000"}/auth/meta/callback`,
    scopes:
      process.env.META_SCOPES ||
      "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish"
  },
  threads: {
    appId: process.env.THREADS_APP_ID || process.env.META_APP_ID || "",
    appSecret: process.env.THREADS_APP_SECRET || process.env.META_APP_SECRET || "",
    redirectUri:
      process.env.THREADS_REDIRECT_URI ||
      `${process.env.APP_BASE_URL || "http://localhost:3000"}/auth/threads/callback`,
    scopes: process.env.THREADS_SCOPES || "threads_basic,threads_content_publish"
  },
  tokenStorePath: process.env.TOKEN_STORE_PATH || "./data/tokens.json"
};

export function missingConfigKeys() {
  const missing = [];

  if (!config.meta.appId) missing.push("META_APP_ID");
  if (!config.meta.appSecret) missing.push("META_APP_SECRET");
  if (!config.threads.appId) missing.push("THREADS_APP_ID or META_APP_ID");
  if (!config.threads.appSecret) missing.push("THREADS_APP_SECRET or META_APP_SECRET");

  return missing;
}
