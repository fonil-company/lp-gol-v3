export const ATTRIBUTION_KEY = "gol-v3:attribution:v1";
export const CAMPAIGN_FIELDS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "utm_id", "fbclid", "gclid",
];

// Last nonempty campaign entry in this tab. Never cache contact information.
export function createAttribution(browser) {
  const fields = [...CAMPAIGN_FIELDS, "entry_url", "entry_referrer"];
  const pick = (value) => Object.fromEntries(fields.map((key) => [
    key, typeof value?.[key] === "string" ? value[key] : "",
  ]));
  let snapshot;
  try {
    const saved = JSON.parse(browser.sessionStorage.getItem(ATTRIBUTION_KEY));
    if (saved?.entry_url) snapshot = pick(saved);
  } catch { /* Storage may be unavailable or contain invalid JSON. */ }

  const params = new URLSearchParams(browser.location.search);
  const campaign = Object.fromEntries(CAMPAIGN_FIELDS.map((key) => [key, params.get(key) || ""]));
  if (Object.values(campaign).some((value) => value !== "") || !snapshot) {
    snapshot = {
      ...campaign,
      entry_url: browser.location.href,
      entry_referrer: browser.document.referrer || "",
    };
    try {
      browser.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(snapshot));
    } catch { /* Keep the snapshot in memory for this page. */ }
  }
  return () => ({ ...snapshot });
}

export function getCookie(document, name) {
  try {
    const prefix = `${name}=`;
    const cookie = document.cookie.split(";").map((item) => item.trim())
      .find((item) => item.startsWith(prefix));
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
  } catch {
    return "";
  }
}
