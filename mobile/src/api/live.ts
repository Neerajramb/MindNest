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

/**
 * One camera frame. `scene` also asks for the room and belongings (slower, uses the vision model). `roomHint` is the
 * room the patient was just in, so similar rooms do not flip back and forth between looks.
 */
export const liveLook = (uri: string, scene: boolean, roomHint?: string) =>
  uploadImage<LiveLook>('/live/look', uri, 'image', { scene: scene ? 'true' : 'false', ...(roomHint ? { room_hint: roomHint } : {}) });

/** One face in an AR Vision frame; `box` is x, y, width, height as fractions of the upright photo. */
export type ArFace = {
  box: [number, number, number, number];
  status: 'RECOGNIZED' | 'UNKNOWN';
  person: LivePerson | null;
  confidence: 'high' | 'medium' | null;
};

/** Familiar faces and where they are, checked on the server without the AI service (fast, frequent). */
export const liveFaces = (uri: string) => uploadImage<{ faces: ArFace[] }>('/live/faces', uri, 'image');
