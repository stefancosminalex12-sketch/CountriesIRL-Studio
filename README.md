# CountriesIRL Studio

The content-creation workspace behind CountriesIRL: one place, one login, the
tools in a row across the top in the order you work — **Downloader → Maps →
Game Maps → Editor → Scheduler**. A clip downloaded in the Downloader goes
straight to the Editor with **Open in Editor**.

| Tool | What it does | Status |
| --- | --- | --- |
| Downloader | Paste a link from YouTube, TikTok, Instagram, Facebook, X, Reddit and 1,000+ other sites; the site is read from the link. Video in any quality, or audio as MP3. | Working |
| Maps | The Map Editor (maps.countriesirl.com), inside the studio. | Working |
| Game Maps | Vector maps for game worlds. | Soon |
| Editor | Trim a clip, frame it for 9:16 / 1:1 / 16:9, zoom and pan, add text, set the volume, export an MP4. | Working |
| Scheduler | One post, every platform, now or later. | Soon |

## Opening it

Double-click **`Start Studio.bat`**. It starts the Downloader's helper in its own
window, starts the studio, and opens it at http://localhost:5173. Close both
windows to stop.

Or by hand, in this folder:

```
npm install        (first time only)
npm run helper     (the Downloader's helper — leave it open)
npm run dev        (the studio, in a second terminal)
```

## Setting up the Downloader

Browsers are not allowed to download from YouTube and the rest, so the
Downloader hands links to a helper program on your PC
([`helper/server.mjs`](helper/server.mjs)), which uses two free tools:

- **yt-dlp** — does the downloading, for every site.
- **ffmpeg** — joins video and audio, and makes MP3s. Without it downloads still
  work, but YouTube tops out at lower quality.

Install both once, from Windows' own package manager:

```
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```

Or put `yt-dlp.exe` and `ffmpeg.exe` in `helper/bin/`. The helper looks there
first, then in winget's folder, then on PATH — no restart needed.

Keep yt-dlp up to date (`winget upgrade yt-dlp.yt-dlp`): the sites change often,
and an old yt-dlp is the usual reason a link stops working.

**It starts with Windows.** `helper/start-hidden.vbs` runs the helper with no window, and a copy
of it in the Startup folder (`CountriesIRL Studio helper.vbs`) starts it at every sign-in. To stop
that, press Win+R, type `shell:startup` and delete that file. In the Studio, click **Connect** once
(and **Allow** when the browser asks); after that it connects by itself.

The helper only answers on this computer (127.0.0.1) and only to the studio's
own addresses. Finished files are kept for an hour in your temp folder, then
cleared.

## The Editor

- **Load a clip** — drop it on the dark area, choose one, or use *Open in Editor*
  in the Downloader.
- **Trim** — drag the dark handles at either end of the timeline. Click the
  timeline to jump; Space plays and pauses (it loops the trimmed part).
- **Frame** — 9:16 for Shorts, Reels and TikTok. *Fill frame* crops to fill;
  *Fit + blur* shows the whole clip over a blurred copy of itself (the default for
  wide clips). Drag the preview to move the clip, scroll on it to zoom.
- **Text** — *Add text*, then type, pick a style (Outline, Box, Shadow), size and
  colour, and drag it into place on the preview. Move the playhead and click
  *from* / *to* to choose when it shows. Delete removes the selected text.
- **Export** — records the trimmed part at full size (1080×1920 for 9:16). It
  plays in real time, so a 30-second short takes 30 seconds; keep the tab in
  front. Chrome and Edge export MP4.

Nothing is uploaded: the Editor runs entirely in your browser.

## Adding or moving tools

The tabs are the list in [`src/tools.ts`](src/tools.ts) — move a line to move a
tab, add one to add a tool. `kind: 'embed'` shows another site of ours inside the
studio (that is how Maps works); `kind: 'soon'` puts it on the bar, greyed out.

## Putting it online (later)

1. **Cloudflare Pages** — build with `npm run build`, publish `dist/`, and give it
   the address `studio.countriesirl.com` (a subdomain; nothing to buy).
2. **Cloudflare Access** — lock that address to your email (and later your
   team's). That is the studio's login.
3. **Cloudflare Tunnel** — puts the helper on your PC online, so the Downloader
   works from the live studio, from anywhere, while your PC is on. Then set
   `HELPER_URL` in `src/tools.ts` to the tunnel's address.
