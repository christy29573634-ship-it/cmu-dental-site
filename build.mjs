// Builds the static site into ./dist from the Apps Script public feed.
// Usage: node build.mjs            (fetches the live feed from site.config.json)
//        node build.mjs feed.json  (uses a local JSON file instead, for testing)
import { readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");
const config = JSON.parse(await readFile(join(ROOT, "site.config.json"), "utf8"));

// Environment variables override the config file (handy in Cloudflare's build settings).
const SITE_URL = (process.env.SITE_URL || config.siteUrl).replace(/\/+$/, "");
const FEED_URL = process.env.FEED_URL || config.feedUrl;
const VERIFICATION = (process.env.GOOGLE_SITE_VERIFICATION || config.googleSiteVerification || "").trim();
const SITE_NAME = config.siteName;

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");
const splitList = (s) => String(s || "").split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean);
const multiline = (s) => esc(s).replace(/\n/g, "<br>");
const today = new Date().toISOString().slice(0, 10);

async function loadFeed() {
  const local = process.argv[2];
  if (local) return JSON.parse(await readFile(local, "utf8"));
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(FEED_URL, { redirect: "follow" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.events)) throw new Error("feed has no events array");
      return data;
    } catch (err) {
      lastError = err;
      console.warn(`Feed attempt ${attempt} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  // Fail the build so Cloudflare keeps serving the last good version.
  throw new Error("Could not load the activity feed: " + lastError.message);
}

function head({ title, description, canonical, ogImage, ld, type = "website" }) {
  return `<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${VERIFICATION ? `<meta name="google-site-verification" content="${esc(VERIFICATION)}">\n` : ""}<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${esc(canonical)}">
<meta name="theme-color" content="#f6f0e7">
<meta property="og:type" content="${type}">
<meta property="og:locale" content="zh_TW">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n` : ""}<script type="application/ld+json">${jsonLd(ld)}</script>
<link rel="stylesheet" href="/style.css">
</head>`;
}

function header(logoUrl) {
  return `<header><div class="wrap head"><a class="brand" href="/">${logoUrl ? `<img src="${esc(logoUrl)}" alt="" width="38" height="38">` : ""}<span>${esc(SITE_NAME)}<small>DENTAL COMMUNITY OUTREACH</small></span></a><nav><a href="/#activities">義診活動</a><a href="/#about">公益理念</a></nav></div></header>`;
}

const footer = `<footer><div class="wrap">${esc(SITE_NAME)} · 記錄每一次付出，分享每一份關懷。</div></footer>`;
const eventPath = (e) => `/events/${encodeURIComponent(e.id)}/`;
const place = (e) => [e.county, e.location].filter(Boolean).join(" ");
const summary = (e) => e.description || e.treatments || e.audience || "公益義診活動";

function card(e) {
  const search = [e.title, e.county, e.location, e.doctors, e.sponsors, e.organizers, e.treatments, e.description, e.audience].join(" ").toLowerCase();
  return `<article class="card" data-year="${esc(e.year)}" data-county="${esc(e.county)}" data-search="${esc(search)}"><a href="${eventPath(e)}">${
    e.coverUrl ? `<img src="${esc(e.coverUrl)}" alt="${esc(e.title)} 義診活動照片" loading="lazy">` : ""
  }<div class="cardbody"><p class="meta">${esc([e.date || e.year, e.county].filter(Boolean).join(" · "))}</p><h3>${esc(e.title)}</h3><p>${esc(String(summary(e)).slice(0, 90))}</p><span class="more">閱讀完整義診紀錄 →</span></div></a></article>`;
}

function homePage(data) {
  const events = data.events;
  const s = data.siteSettings || {};
  const stats = data.stats || {};
  const statItems = [[stats.events ?? events.length, "累積義診場次"]];
  if (Number(stats.people) > 0) statItems.push([Number(stats.people).toLocaleString("en-US"), "累積服務人次"]);
  if (Number(stats.partners) > 0) statItems.push([stats.partners, "公益合作單位"]);
  const ld = { "@context": "https://schema.org", "@type": "Organization", name: SITE_NAME, url: SITE_URL + "/", description: config.siteDescription, ...(s.logoUrl ? { logo: s.logoUrl } : {}) };
  return `${head({ title: `${SITE_NAME}｜${config.siteTagline}`, description: config.siteDescription, canonical: SITE_URL + "/", ogImage: s.heroUrl, ld })}
<body>${header(s.logoUrl)}<main class="wrap">
<section class="hero${s.heroUrl ? " with-img" : ""}"><div><p class="eyebrow">CARE · SHARE · SMILE</p><h1>讓每一份專業，<br>成為溫暖的力量。</h1><p>走進社區、深入偏鄉，以專業牙科醫療與口腔衛教服務，陪伴每一個需要被照顧的地方。每一次出發，都是一份值得珍藏的公益紀錄。</p><a class="pill" href="#activities">探索義診紀錄 ↓</a></div>${
    s.heroUrl ? `<img class="hero-img" src="${esc(s.heroUrl)}" alt="醫療團義診形象照片">` : ""
  }</section>
<div class="stats">${statItems.map(([n, l]) => `<div><strong>${esc(n)}</strong><span>${l}</span></div>`).join("")}</div>
<section id="activities"><p class="eyebrow">OUR JOURNEY</p><h2>義診活動紀錄</h2><p class="muted">依年份、地點尋找每一段公益足跡。點擊活動卡片可閱讀完整紀錄。</p>
<div class="filters"><label>年份 <select id="year"><option value="">所有年份</option>${(data.years || []).map((y) => `<option value="${esc(y)}">${esc(y)} 年</option>`).join("")}</select></label><label>地點 <select id="county"><option value="">所有地點</option>${(data.places || []).map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("")}</select></label><label>搜尋 <input id="q" type="search" placeholder="活動、醫師、贊助商、介紹…"></label></div>
<div class="cards">${events.length ? events.map(card).join("") : ""}</div>
<p id="noResults" class="empty"${events.length ? " hidden" : ""}>${events.length ? "沒有符合條件的活動。" : "義診紀錄持續整理更新中。"}</p></section>
<section id="about"><p class="eyebrow">OUR BELIEF</p><h2>讓照護走得更遠</h2>${s.aboutUrl ? `<img class="about-img" src="${esc(s.aboutUrl)}" alt="醫療團公益理念照片" loading="lazy">` : ""}<p>記錄醫療團隊的付出，也感謝每一位支持公益的夥伴。</p></section>
</main>${footer}<script defer src="/search.js"></script></body></html>`;
}

function eventPage(e, settings) {
  const url = SITE_URL + eventPath(e);
  const description = [e.date, place(e), e.audience, summary(e)].filter(Boolean).join(" · ").slice(0, 155);
  const fields = [
    ["活動日期", e.date],
    ["活動地點", place(e)],
    ["服務對象", e.audience],
    ["治療及服務內容", e.treatments],
    ["參與醫師", e.doctors],
    ["主辦及協辦單位", e.organizers],
    ["合作及贊助單位", e.sponsors],
    ["服務人次", Number(e.serviceCount) > 0 ? Number(e.serviceCount).toLocaleString("en-US") + " 人" : ""],
  ].filter((f) => f[1]);
  const images = [e.coverUrl, ...(e.gallery || []).map((g) => g.url)].filter(Boolean);
  const ld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: String(e.title),
    description,
    mainEntityOfPage: url,
    ...(e.date ? { datePublished: e.date } : {}),
    ...(images.length ? { image: images } : {}),
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL + "/" },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL + "/" },
  };
  return `${head({ title: `${e.title}｜${SITE_NAME}`, description, canonical: url, ogImage: images[0], ld, type: "article" })}
<body>${header(settings.logoUrl)}<main class="wrap article">
<p><a href="/#activities">← 返回義診活動紀錄</a></p>
<p class="eyebrow">${esc([e.date || e.year, e.county].filter(Boolean).join(" · "))}</p>
<h1>${esc(e.title)}</h1>
${e.coverUrl ? `<img class="cover" src="${esc(e.coverUrl)}" alt="${esc(e.title)} 義診活動照片">` : ""}
${e.description ? `<p class="lead">${multiline(e.description)}</p>` : ""}
<dl class="details">${fields.map(([k, v]) => `<div><dt>${k}</dt><dd>${multiline(v)}</dd></div>`).join("")}</dl>
${(e.gallery || []).length ? `<h2>活動照片</h2><div class="gallery">${e.gallery.map((g) => `<img src="${esc(g.url)}" alt="${esc(e.title)} 義診活動照片" loading="lazy">`).join("")}</div>` : ""}
</main>${footer}</body></html>`;
}

function notFoundPage(settings) {
  return `${head({ title: `找不到頁面｜${SITE_NAME}`, description: config.siteDescription, canonical: SITE_URL + "/", ld: { "@context": "https://schema.org", "@type": "WebPage", name: "找不到頁面" } }).replace('content="index,follow,max-image-preview:large"', 'content="noindex"')}
<body>${header(settings.logoUrl)}<main class="wrap article"><h1>找不到這個頁面</h1><p>這筆紀錄可能已經移除或尚未公開。</p><p><a href="/">← 回到首頁</a></p></main>${footer}</body></html>`;
}

const data = await loadFeed();
data.events = (data.events || [])
  .filter((e) => e && e.id && e.title)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));
const settings = data.siteSettings || {};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, "index.html"), homePage(data));
for (const e of data.events) {
  const dir = join(OUT, "events", String(e.id));
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), eventPage(e, settings));
}
await writeFile(join(OUT, "404.html"), notFoundPage(settings));
await copyFile(join(ROOT, "src", "style.css"), join(OUT, "style.css"));
await copyFile(join(ROOT, "src", "search.js"), join(OUT, "search.js"));

const urls = [{ loc: SITE_URL + "/", lastmod: today }, ...data.events.map((e) => ({ loc: SITE_URL + eventPath(e), lastmod: today }))];
await writeFile(
  join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n")}\n</urlset>\n`
);
await writeFile(join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Built ${data.events.length} event page(s) for ${SITE_URL}${VERIFICATION ? " (with Google verification tag)" : " (no Google verification tag set)"}`);
