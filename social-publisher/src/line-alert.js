const lineBroadcastUrl = "https://api.line.me/v2/bot/message/broadcast";

export async function notifyLineAlerts({
  alerts,
  env = process.env,
  fetchImpl = globalThis.fetch
}) {
  if (!alerts?.length) return { status: "skipped", reason: "no_alerts" };

  const channelAccessToken = env.LINE_CHANNEL_ACCESS_TOKEN;
  const followerStateUrl = env.LINE_FOLLOWER_STATE_URL;
  const followerStateToken = env.LINE_FOLLOWER_STATE_TOKEN;
  if (!channelAccessToken || !followerStateUrl || !followerStateToken) {
    return { status: "skipped", reason: "line_not_configured" };
  }

  const state = await fetchFollowerState({
    followerStateUrl,
    followerStateToken,
    fetchImpl
  });
  if (!state) return { status: "skipped", reason: "follower_state_unavailable" };
  if (!state.webhookVerifiedAt) return { status: "skipped", reason: "webhook_not_verified" };
  if (state.count !== 1) return { status: "skipped", reason: "follower_count_not_one" };

  let response;
  try {
    response = await fetchImpl(lineBroadcastUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${channelAccessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        messages: [{ type: "text", text: buildAlertText(alerts) }]
      })
    });
  } catch {
    return { status: "failed", reason: "broadcast_request_failed" };
  }

  if (!response.ok) {
    return { status: "failed", reason: "broadcast_request_failed", responseStatus: response.status };
  }

  return { status: "sent", alertCount: alerts.length };
}

async function fetchFollowerState({ followerStateUrl, followerStateToken, fetchImpl }) {
  try {
    const response = await fetchImpl(followerStateUrl, {
      headers: { authorization: `Bearer ${followerStateToken}` }
    });
    if (!response.ok) return null;

    const state = await response.json();
    if (!Number.isInteger(state.count) || state.count < 0) return null;
    return state;
  } catch {
    return null;
  }
}

function buildAlertText(alerts) {
  const lines = alerts.map((alert) => {
    const label = alert.reason === "processed late" ? "排程發文逾時" : "排程發文失敗";
    return `⚠️ ${label}：${alert.id}，請盡快查看`;
  });
  return lines.join("\n").slice(0, 5000);
}
