export function resolveInstagramUserId({
  page,
  configuredInstagramUserId,
  selectedInstagramUserId
} = {}) {
  return (
    page?.instagramBusinessAccount?.id ||
    configuredInstagramUserId ||
    selectedInstagramUserId ||
    null
  );
}
