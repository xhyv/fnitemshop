# DropBazaar - unofficial Fortnite Item Shop viewer

Unofficial fan app. Not affiliated with Epic Games.
Free forever: no Mac, no paid developer account, no paid hosting, no API key.

Hosting choice: **GitHub Pages** (free, simple, gives you an https link, which iPhone needs for installing a web app).
Data source: **fortnite-api.com** `/v2/shop` (free, no key, as you asked).

---

## What is in this folder

| File | What it does |
|---|---|
| `index.html` | The page |
| `style.css` | The dark gaming look |
| `app.js` | All the logic (loading the shop, search, filters, countdown, pull-to-refresh) |
| `sw.js` | Makes the app work offline |
| `manifest.webmanifest` | Tells the iPhone the name, colors and icons |
| `icons/` | The app icons (4 PNG files) |

Do not rename or move anything. Keep the `icons` folder as it is.

---

## Step 1 - Preview it on your computer (optional but recommended)

1. Unzip the download so you have a normal folder.
2. Open `index.html` in Chrome, Edge, Firefox or Safari (double-click it).
3. To see it with fake sample data (to check the layout, filters, errors), add `?demo` to the end of the address bar and press Enter, for example:
   `file:///C:/Users/you/Downloads/dropbazaar/index.html?demo`
   - `?demo=error` pretends the shop service is down.
   - `?demo=empty` pretends the shop is empty.
4. To see it phone-sized in Chrome or Edge: press **F12**, then the little phone/tablet icon (or Ctrl+Shift+M).

Offline mode and installing only work once the app is online at a real link (Step 2 to 5).

---

## Step 2 - Make a free GitHub account

1. Go to **github.com** and click **Sign up**.
2. Enter your email, a password and a username. Remember the username: it becomes part of your app link.
3. Confirm your email when GitHub sends you a message.

## Step 3 - Create a repository and upload the files

1. Click the **+** at the top right, then **New repository**.
2. Name it `dropbazaar`. Choose **Public**. Click **Create repository**.
3. On the next page click the link **uploading an existing file**.
4. Open your unzipped folder. Select **everything inside it** (the files AND the `icons` folder) and drag it into the GitHub page.
   Make sure `index.html` is at the top level, not inside another folder.
5. Wait for the uploads to finish. Scroll down and click **Commit changes**.

## Step 4 - Turn on free hosting

1. In your repository click **Settings** (top row).
2. In the left menu click **Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Set **Branch** to **main** and the folder to **/ (root)**. Click **Save**.
5. Wait 1 to 2 minutes and refresh the page. A box appears with your link:
   `https://YOUR-USERNAME.github.io/dropbazaar/`

## Step 5 - Install it on your iPhone

1. On the iPhone open **Safari** (it must be Safari, not Chrome) and go to your link.
2. Wait for the shop to load once.
3. Tap the **Share** button (square with an arrow).
4. Scroll down and tap **Add to Home Screen**, then **Add**.
5. Open DropBazaar from your home screen. It runs full screen.

---

## How to use it

- Pull down from the top to refresh, or tap the refresh button.
- The countdown shows time to the next daily reset at 00:00 UTC (right now that is 01:00 in the Netherlands; it becomes 02:00 in summer time). The app refreshes itself shortly after the reset.
- Tap any card for the big picture, description, type, rarity and bundle contents.
- Use the search bar and the two dropdowns to filter by item type and rarity.
- Tap the info button (top right) for the about screen and a "Clear saved shop and cache" button.

If the internet or the shop service is down, the app shows a friendly message and keeps showing the last saved shop. Item pictures you have already seen are saved too. Pictures you never opened may be missing offline.

---

## Updating later

To change a file: open it in your GitHub repository, click the pencil icon, edit, and click **Commit changes**.
If you change `app.js`, `style.css` or `index.html`, also open `sw.js` and change `const VERSION = 'v1';` to `'v2'` (then `'v3'`, and so on) so phones pick up the new version. Close and reopen the app twice.

## If something goes wrong

- **Blank or old page on GitHub link:** wait 2 minutes, then hard refresh. Check that Pages is set to `main` and `/ (root)`.
- **404 error:** `index.html` is probably inside a folder. Upload the files again so it sits at the top level.
- **No images:** the image service may be slow. Pull to refresh.
- **Add to Home Screen is missing:** you are not in Safari, or you are in a private tab.
- **Shop looks strange or empty:** use the info button, tap "Clear saved shop and cache", and reload.
- **Never shows a countdown change at reset:** that is normal for the first minute; the app retries for about 10 minutes.

## Credits and legal

Shop data and item images are provided by fortnite-api.com. Fortnite and everything related belong to Epic Games, Inc. This app uses an original name and icon and no Epic logos, fonts or website code.
