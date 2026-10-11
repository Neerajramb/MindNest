import { uploadImage } from '@/api/upload';

export type LivePerson = { id: string; name: string; relationship: string };

export type LiveLook = {
  /** One or two sentences to read aloud; empty when there is nothing new to say. */
  message: string;
  face: {
    status: 'RECOGNIZED' | 'UNKNOWN' | 'NO_FACE' | 'UNCLEAR';
    message: string;
    person: LivePerson | null;
    confidence: 'high' | 'medium' | null;
  } | null;
  scene: {
    place: { id: string; name: string } | null;
    location_label: string;
    found: string[];
    others: string[];
  } | null;
  scene_failed: boolean;
};

/** One camera frame. `scene` also asks for the room and belongings (slower, uses the vision model). */
export const liveLook = (uri: string, scene: boolean) =>
  uploadImage<LiveLook>('/live/look', uri, 'image', { scene: scene ? 'true' : 'false' });
