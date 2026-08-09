// config.js — third-party API keys.
//
// ⚠️ This is a static site with no backend — this key ships in plain text to every visitor's
// browser and is visible to anyone who views source or looks at this public repo. That's expected
// for Geoapify's client-side key model (same as how Google Maps browser keys work), but it means
// you MUST restrict it in the Geoapify dashboard (Project → your key → "Referrer restrictions") to
// only your GitHub Pages domain (and localhost, for local testing) — otherwise anyone who copies
// this key out of the page source could spend your free daily quota.
const VIPPY_CONFIG = {
  GEOAPIFY_API_KEY: '667ab407b12644a884764036c861459e',
};
