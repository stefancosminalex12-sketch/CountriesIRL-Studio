/* ==========================================================================
   The studio's tools — the tabs across the top, left to right.
   --------------------------------------------------------------------------
   The order is the workflow: gather, create, cut, publish. To add a tool,
   add an entry; to move one, move its line.

   kind:
     'app'    built into the studio (its screen lives in src/tools/)
     'embed'  another site of ours, shown inside the studio by `url`
     'link'   another site of ours, opened in the whole window at `url`,
              without the studio's bar; it has its own way back (the
              Map Editor: File → Studio)
     'soon'   on the bar but not open yet
   ========================================================================== */

export type Tool = {
  id: string;
  name: string;
  blurb: string;
  kind: 'app' | 'embed' | 'link' | 'soon';
  url?: string;
};

export const TOOLS: Tool[] = [
  { id: 'downloader', name: 'Downloader', blurb: 'Grab clips from any link', kind: 'app' },
  { id: 'maps', name: 'Maps', blurb: 'World maps for videos', kind: 'link', url: 'https://maps.countriesirl.com' },
  { id: 'game-maps', name: 'Game Maps', blurb: 'Vector maps for game worlds', kind: 'soon' },
  { id: 'editor', name: 'Editor', blurb: 'Cut your short', kind: 'app' },
  { id: 'scheduler', name: 'Scheduler', blurb: 'Post everywhere at once', kind: 'soon' }
];

/* Where the downloader's helper program answers (helper/server.mjs). It runs
   on your own PC; once it is put online through Cloudflare Tunnel, this
   becomes that address. */
export const HELPER_URL = 'http://127.0.0.1:5199';

/* The donation link (the same Ko-fi page as countriesirl.com). Empty hides
   the "Support us" button in the top bar. */
export const SUPPORT_URL = 'https://ko-fi.com/L1Y628Z7U0';
