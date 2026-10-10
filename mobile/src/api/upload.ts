import { api } from '@/api/client';

/** Upload a local photo (file:// URI from the camera or picker) as multipart form data. */
export function uploadImage<T>(path: string, uri: string, field = 'image'): Promise<T> {
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } file descriptors.
  form.append(field, { uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  return api<T>(path, { method: 'POST', body: form, timeoutMs: 45_000 });
}
