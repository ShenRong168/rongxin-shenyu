const maxInstagramCarouselImages = 10;

export function parseImageUrlsInput(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeInstagramImageUrls({ imageUrl = "", imageUrls } = {}) {
  if (imageUrls !== undefined && !Array.isArray(imageUrls)) {
    throw new Error("Instagram imageUrls must be an array.");
  }

  const candidates = imageUrls?.length ? imageUrls : imageUrl ? [imageUrl] : [];
  if (!candidates.length) {
    throw new Error("Instagram publishing requires at least one image URL.");
  }
  if (candidates.length > maxInstagramCarouselImages) {
    throw new Error(`Instagram supports at most ${maxInstagramCarouselImages} images.`);
  }

  return candidates.map((value, index) => normalizeHttpUrl(value, index));
}

function normalizeHttpUrl(value, index) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Instagram image ${index + 1} must be a non-empty URL.`);
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(`Instagram image ${index + 1} must be a valid URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Instagram image ${index + 1} must use http or https.`);
  }

  return parsed.toString();
}
