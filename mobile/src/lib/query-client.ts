import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, type Query } from '@tanstack/react-query';

import { ApiError } from '@/api/client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

const CACHE_KEY = 'mindnest-query-cache';

export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: CACHE_KEY });

/**
 * Only the patient's own day-to-day read data is kept for offline use (agenda, reminders, medications,
 * profile), for at most 24 hours, and wiped on sign-out. Caregiver views and alerts are never persisted.
 */
const OFFLINE_KEYS = new Set(['agenda', 'reminders', 'medications', 'safety']);

export function shouldPersist(query: Query): boolean {
  if (query.state.status !== 'success') return false;
  const [scope, , kind] = query.queryKey as string[];
  if (scope === 'patients' && query.queryKey[1] === 'me') return true;
  return scope === 'patient' && OFFLINE_KEYS.has(kind);
}

export async function clearPersistedCache(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY);
}
