import { create } from 'zustand';

/* What the tools hand to each other. A clip downloaded in the Downloader
   goes straight to the Editor through here, without a trip through the
   Downloads folder. */
export type Clip = { blob: Blob; name: string };

type Studio = {
  /* The clip waiting for the Editor. The Editor takes it and clears it. */
  pendingClip: Clip | null;
  sendToEditor: (clip: Clip) => void;
  takeClip: () => Clip | null;
};

export const useStudio = create<Studio>((set, get) => ({
  pendingClip: null,
  sendToEditor: (clip) => {
    set({ pendingClip: clip });
    window.location.hash = 'editor';
  },
  takeClip: () => {
    const clip = get().pendingClip;
    if (clip) set({ pendingClip: null });
    return clip;
  }
}));
