/* Which site a link comes from, read from the link itself — no choosing.
   Anything not listed still works: yt-dlp knows well over a thousand sites. */

export type Platform = { id: string; name: string; color: string };

const PLATFORMS: { hosts: string[]; platform: Platform }[] = [
  { hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], platform: { id: 'youtube', name: 'YouTube', color: '#ff0033' } },
  { hosts: ['tiktok.com'], platform: { id: 'tiktok', name: 'TikTok', color: '#111111' } },
  { hosts: ['instagram.com', 'instagr.am'], platform: { id: 'instagram', name: 'Instagram', color: '#d62976' } },
  { hosts: ['facebook.com', 'fb.watch', 'fb.com'], platform: { id: 'facebook', name: 'Facebook', color: '#1877f2' } },
  { hosts: ['x.com', 'twitter.com'], platform: { id: 'x', name: 'X / Twitter', color: '#111111' } },
  { hosts: ['reddit.com', 'redd.it'], platform: { id: 'reddit', name: 'Reddit', color: '#ff4500' } },
  { hosts: ['vimeo.com'], platform: { id: 'vimeo', name: 'Vimeo', color: '#1ab7ea' } },
  { hosts: ['twitch.tv'], platform: { id: 'twitch', name: 'Twitch', color: '#9146ff' } },
  { hosts: ['soundcloud.com'], platform: { id: 'soundcloud', name: 'SoundCloud', color: '#ff5500' } }
];

const OTHER: Platform = { id: 'other', name: 'Other site', color: '#57626e' };

/* A pasted link, tidied: surrounding spaces gone, https:// added if missing. */
export function readLink(text: string): URL | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url;
  } catch {
    return null;
  }
}

export function detect(url: URL): Platform {
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile|vm|vt)\./, '');
  const match = PLATFORMS.find(({ hosts }) => hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  return match ? match.platform : OTHER;
}
