import { normalizeInstagramImageUrls } from "./instagram-images.js";

export function normalizeInstagramMediaInput({ imageUrl = "", imageUrls, videoUrl = "" } = {}) {
  const sources = [
    hasValue(imageUrl),
    Array.isArray(imageUrls) ? imageUrls.length > 0 : imageUrls !== undefined,
    hasValue(videoUrl)
  ];

  if (sources.filter(Boolean).length !== 1) {
    throw new Error(
      "Instagram publishing requires exactly one of imageUrl, imageUrls, or videoUrl."
    );
  }

  if (sources[2]) {
    return {
      kind: "reels",
      videoUrl: normalizeVideoUrl(videoUrl)
    };
  }

  const normalizedImageUrls = normalizeInstagramImageUrls({ imageUrl, imageUrls });
  if (normalizedImageUrls.length === 1) {
    return {
      kind: "image",
      imageUrl: normalizedImageUrls[0]
    };
  }

  return {
    kind: "carousel",
    imageUrls: normalizedImageUrls
  };
}

function hasValue(value) {
  return typeof value === "string" ? Boolean(value.trim()) : value !== undefined && value !== null;
}

function normalizeVideoUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Instagram video must be a non-empty URL.");
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Instagram video must be a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Instagram video must use http or https.");
  }

  return parsed.toString();
}
