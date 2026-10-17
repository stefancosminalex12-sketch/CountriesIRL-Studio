import { HELPER_URL } from '../../tools';

/* Talking to helper/server.mjs, the program on your PC that runs yt-dlp. */

export type Health = { ytdlp: string | null; ffmpeg: boolean };

export type Info = {
  title: string;
  uploader: string;
  duration: number | null;
  thumbnail: string | null;
  site: string;
  heights: number[];
  hasVideo: boolean;
};

export type Job = {
  id: string;
  status: 'running' | 'done' | 'error';
  progress: number;
  phase: string;
  name: string | null;
  size: number;
  error: string | null;
};

async function call<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(HELPER_URL + path, body === undefined ? undefined : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new HelperOffline();
  }
  const data = await response.json().catch(() => null);
  if (!data || !data.ok) throw new Error(data?.error || `The helper answered ${response.status}.`);
  return data as T;
}

export class HelperOffline extends Error {
  constructor() {
    super('The helper is not running on this PC.');
  }
}

export async function health(): Promise<Health> {
  const data = await call<{ ytdlp: string | null; ffmpeg: boolean }>('/health');
  return { ytdlp: data.ytdlp, ffmpeg: data.ffmpeg };
}

export async function lookUp(url: string): Promise<Info> {
  return (await call<{ info: Info }>('/info', { url })).info;
}

export async function startDownload(url: string, kind: 'video' | 'audio', height: number | null): Promise<Job> {
  return (await call<{ job: Job }>('/download', { url, kind, height })).job;
}

export async function jobStatus(id: string): Promise<Job> {
  return (await call<{ job: Job }>(`/jobs/${id}`)).job;
}

/* The finished file, as a Blob the studio can save or hand to the Editor. */
export async function fetchFile(id: string): Promise<{ blob: Blob; name: string }> {
  const response = await fetch(`${HELPER_URL}/jobs/${id}/file`);
  if (!response.ok) throw new Error('The file could not be fetched from the helper.');
  const name = decodeURIComponent(response.headers.get('X-Filename') || 'download');
  return { blob: await response.blob(), name };
}
