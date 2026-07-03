export class MetaApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "MetaApiError";
    this.details = details;
  }
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const body = text ? safeJson(text) : {};

  if (!response.ok) {
    const metaMessage = body?.error?.message || body?.error_description || text;
    throw new MetaApiError(metaMessage || `HTTP ${response.status}`, {
      status: response.status,
      body
    });
  }

  return body;
}

export function formBody(values) {
  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") {
      body.set(key, String(value));
    }
  }

  return body;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
