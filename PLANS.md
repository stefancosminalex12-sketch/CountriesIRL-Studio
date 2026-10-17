# Plans for later

## A mini PC for the Downloader

**When:** once the Studio is online and getting traction: early access is
open, people other than you use the Downloader, and donations are coming in.
Until then, your own PC is the Downloader's server, so it works only while
your PC is on.

**Why:** the Downloader's helper (yt-dlp) can't run on Cloudflare, and
YouTube blocks most cloud servers, free or paid. A small computer on your
home internet is always on, works with every site including YouTube, and
costs a few euros a year in electricity.

**What to buy** (about €120–180):

- Intel **N100** or **N150** chip
- **16 GB** memory
- **256 GB+ SSD**
- **Windows included** (check it has a licence)
- An **Ethernet** port: plug it into the router with a cable
- Brands: Beelink, GMKtec, Minisforum

**Setting it up:**

1. Install Node, then `winget install yt-dlp.yt-dlp` and `winget install Gyan.FFmpeg`.
2. Copy the Studio folder over and run the helper (`npm run helper`).
3. Make the helper start on its own when Windows starts, and set the BIOS to
   power on after a power cut.
4. Cloudflare Tunnel on the mini PC, so the live Studio reaches it from
   anywhere. Then set `HELPER_URL` in `src/tools.ts` to the tunnel's address.

**Cheaper alternatives, if needed:** a Raspberry Pi 5 (8 GB) kit, ~€110–140,
runs Linux; or an old laptop left plugged in. Cloud servers (Oracle's free
one, Hetzner at ~€5/month) are always on, but YouTube often blocks them.
