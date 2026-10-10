import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/client';

export type Place = { id: string; name: string };

export type TrackedObject = {
  id: string;
  name: string;
  aliases: string;
  category: string;
  last_seen: { place: string | null; observed_at: string; confidence: number | null } | null;
};

export type LastSeenAnswer = {
  status: 'FOUND' | 'NO_OBSERVATION' | 'UNKNOWN_OBJECT';
  answer: string;
  object: { id: string; name: string } | null;
  last_seen: {
    place: string | null;
    location_label: string;
    observed_at: string;
    confidence: number | null;
    source: 'VISION' | 'MANUAL';
  } | null;
  stale: boolean;
};

export type ScanResult = { found: string[]; message: string };

export const objectKeys = {
  places: (id: string) => ['patient', id, 'places'] as const,
  objects: (id: string) => ['patient', id, 'objects'] as const,
};

export const usePlaces = (patientId: string | undefined) =>
  useQuery({
    queryKey: objectKeys.places(patientId ?? ''),
    queryFn: () => api<Place[]>(`/patients/${patientId}/places`),
    enabled: !!patientId,
  });

export const useTrackedObjects = (patientId: string | undefined) =>
  useQuery({
    queryKey: objectKeys.objects(patientId ?? ''),
    queryFn: () => api<TrackedObject[]>(`/patients/${patientId}/objects`),
    enabled: !!patientId,
  });

export const askWhereIs = (query: string) =>
  api<LastSeenAnswer>('/objects/query', { method: 'POST', body: { query } });
