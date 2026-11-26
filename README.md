# 中國醫藥大學牙醫系校友會醫療團 · 公益義診網站

這個倉庫會產生醫療團的公開網站（靜態網頁），部署在 Cloudflare Pages。

- **活動資料**：從原本的 Apps Script 後台讀取（`?public_feed=1`，只有「公開發布」的活動）。
  工作人員照常在後台新增、編輯活動與照片，不需要動這個倉庫。
- **網站內容**：`build.mjs` 讀資料後產生首頁、每場活動的獨立頁面、`sitemap.xml`、`robots.txt`。
- **自動更新**：每天台灣時間凌晨 3 點左右自動重建一次（`.github/workflows/daily-rebuild.yml`）。

## 常改的設定：`site.config.json`

| 欄位 | 用途 |
|---|---|
| `siteUrl` | 網站正式網址（不要結尾斜線）。換網址或綁自己的網域時要改。 |
| `feedUrl` | Apps Script 後台的公開資料網址。 |
| `googleSiteVerification` | Google Search Console 驗證碼，只填 `content="…"` 引號裡的那串。 |
| `siteDescription` | 首頁在 Google 搜尋結果顯示的描述。 |

也可以在 Cloudflare Pages 的「環境變數」設定 `SITE_URL`、`FEED_URL`、`GOOGLE_SITE_VERIFICATION`，會優先使用。

## Cloudflare 設定

目前用 Cloudflare **Workers**（靜態檔案）部署，設定在 `wrangler.jsonc`：

- Project name：`cmu-dental-alumni`（要和 `wrangler.jsonc` 的 `name` 一樣）
- Build command：`node build.mjs`
- Deploy command：`npx wrangler deploy`

若改用 Cloudflare Pages：Framework preset 選 None、Build command `node build.mjs`、Build output directory `dist`。

要讓每天自動重建：Cloudflare Pages 專案 → Settings → Builds → Deploy hooks 建立一個 hook，
把網址存到 GitHub 倉庫的 Settings → Secrets and variables → Actions，名稱 `CF_DEPLOY_HOOK`。

想立刻更新：到 GitHub 的 Actions → Daily rebuild → Run workflow，或在 Cloudflare 按 Retry deployment。

## 在自己電腦預覽

```bash
node build.mjs
```

產生的檔案在 `dist/`。如果後台資料讀取失敗，建置會直接失敗，Cloudflare 會繼續顯示上一次成功的版本，不會變成空白網站。
