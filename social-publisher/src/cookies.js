export function parseCookies(cookieHeader = "") {
  return cookieHeader.split(";").reduce((cookies, pair) => {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (!rawKey) return cookies;
    cookies[rawKey] = decodeURIComponent(rawValue.join("="));
    return cookies;
  }, {});
}

export function setStateCookie(res, name, state) {
  res.cookie(name, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000
  });
}

export function clearStateCookie(res, name) {
  res.clearCookie(name);
}
