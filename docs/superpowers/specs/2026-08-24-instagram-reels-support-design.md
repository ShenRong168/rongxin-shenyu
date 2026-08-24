# Instagram Reels Publishing Support Design

## Goal

Extend `social-publisher` so Instagram can publish a public MP4 URL as a Reel while preserving existing single-image and carousel behavior. Facebook and Threads remain image/text-only.

## Chosen Approach

Use the existing `publishInstagram()` and container lifecycle, with one normalized Instagram media descriptor shared by the local server and scheduler. This is smaller and safer than adding a parallel Reel publisher or generalizing every platform into a new media abstraction.

Alternatives considered:

- A separate `publishInstagramReel()` would duplicate container polling and publication logic.
- A cross-platform generic media dispatcher would expand scope even though Facebook and Threads video are explicitly excluded.

## Media Input Contract

Instagram accepts exactly one non-empty source:

- `imageUrl`: one image.
- `imageUrls`: one image or a 2-10 image carousel.
- `videoUrl`: one Reel video.

Supplying more than one source is an error. Empty strings and an empty `imageUrls` array do not count as supplied sources. Every URL must be absolute HTTP(S). Existing scheduled posts remain compatible because they use only one source.

The normalized descriptor is one of:

```js
{ kind: "image", imageUrl }
{ kind: "carousel", imageUrls }
{ kind: "reels", videoUrl }
```

Validation happens before any platform request so a malformed Instagram payload cannot partially publish to Facebook or Threads first.

## Meta Container Flow

- Image: create one container with `image_url` and `caption`.
- Carousel: create ordered child containers with `is_carousel_item=true`, then a parent with `media_type=CAROUSEL`, then publish only the parent.
- Reel: create one container with `media_type=REELS`, `video_url`, and `caption`, wait until ready, then publish it through the existing `/media_publish` step.

Image and carousel polling retain the current defaults of 10 attempts and 3000 ms. Reels use 60 attempts and 5000 ms by default because server-side video processing is slower. Explicit `containerPollOptions` override either media type's defaults, keeping tests fast and allowing callers to tune long videos.

## Scheduler And Local UI

`buildInstagramPublishPayload()` validates and forwards exactly one normalized source, including `videoUrl`. The scheduler prevalidates Instagram before processing any platform. Facebook and Threads payloads never receive `videoUrl`.

The local form gains an Instagram Reel public video URL field. Dry-run displays the normalized Reel payload without making Meta calls. Recent publish logs retain `videoUrl`, and schedule preview labels video posts as Reels without attempting to render an MP4 in an `<img>` element.

`scheduled-posts.json` is not modified by this feature. A future Reel schedule item can add optional `videoUrl` while leaving `imageUrl` and `imageUrls` empty or absent.

## Errors And Safety

- Missing all three Instagram media sources fails clearly.
- Multiple non-empty sources fail before any platform request.
- Non-HTTP(S) `videoUrl` fails before any platform request.
- Container `ERROR`, `EXPIRED`, or timeout prevents `/media_publish`.
- No real Meta publication is required locally. Missing `INSTAGRAM_USER_ID` or `META_PAGE_ACCESS_TOKEN` is recorded as a live-verification gap, not an implementation failure.

## Testing

- Unit tests cover normalization, exclusivity, invalid video URLs, Reel container fields, wider Reel defaults, explicit poll overrides, and parent-only publication.
- Scheduler tests cover `videoUrl` forwarding and mixed-platform rejection before any request.
- Server integration tests cover the Reel field, dry-run payload/log behavior, schedule preview, and Facebook/Threads isolation.
- Final verification runs `npm test`, `npm run check`, `npm run check:schedule-sync`, `git diff --check`, and a byte-integrity check proving `scheduled-posts.json` is unchanged.
