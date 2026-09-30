# LINE scheduled publishing alerts

The scheduled publisher keeps the existing GitHub Actions failure and cron-job.org email path. LINE is an additional best-effort channel and never replaces email.

## Safety rule

The publisher broadcasts only when all of these are true:

1. `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_FOLLOWER_STATE_URL`, and `LINE_FOLLOWER_STATE_TOKEN` are configured.
2. The protected follower-state endpoint is reachable and returns valid JSON.
3. The endpoint has received at least one correctly signed LINE webhook request (`webhookVerifiedAt` is set).
4. The maintained follower count is exactly `1`.

Any missing, unavailable, invalid, unknown, zero, or greater-than-one state fails closed: LINE broadcast is skipped while the existing workflow failure remains available to email notification.

The initial state in `data/line-followers-count.json` is `1` because Shen is currently the only friend. It is deliberately unverified (`webhookVerifiedAt: null`), so committing the file alone cannot enable broadcast.

## Run the webhook service

Set these environment variables on a persistent HTTPS-capable host:

```text
LINE_CHANNEL_SECRET=<Messaging API channel secret>
LINE_FOLLOWER_STATE_TOKEN=<random internal bearer token>
LINE_FOLLOWER_STATE_FILE=./data/line-followers-count.json
LINE_WEBHOOK_PORT=3001
```

Start the standalone endpoint:

```bash
npm run start:line-webhook
```

It exposes:

- `POST /webhooks/line`: verifies `x-line-signature`, applies `follow`/`unfollow`, and deduplicates by `webhookEventId`.
- `GET /internal/line-follower-state`: requires `Authorization: Bearer <LINE_FOLLOWER_STATE_TOKEN>` and returns only the count and timestamps.
- `GET /health`: service health check.

Use a stable public HTTPS URL for production. A temporary ngrok URL is acceptable for setup testing, but when it is unavailable the scheduler will intentionally skip LINE alerts.

## LINE Developers Console

In the Messaging API channel:

1. Set the Webhook URL to `https://<host>/webhooks/line`.
2. Enable **Use webhook**.
3. Run **Verify**. A correctly signed verification request sets `webhookVerifiedAt` without changing the initial count.
4. Add and block the official account once in a test account if a follow/unfollow delivery test is needed, then confirm the protected state endpoint changes accordingly.

Do not use `/v2/bot/message/push` for Shen's own LINE user ID. LINE rejects that owner-to-self flow; this implementation uses the broadcast endpoint only after the safety gate passes.

## GitHub Actions secrets

Configure these repository Actions secrets:

```text
LINE_CHANNEL_ACCESS_TOKEN=<long-lived Messaging API channel access token>
LINE_FOLLOWER_STATE_URL=https://<host>/internal/line-follower-state
LINE_FOLLOWER_STATE_TOKEN=<same internal bearer token used by the webhook service>
```

Never commit the channel access token, channel secret, or internal bearer token. If the webhook service has not been deployed and verified yet, leave the state URL unset; GitHub Actions will keep the email alert path and skip LINE safely.
