import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { api } from '@/api/client';

const MIN_INTERVAL_MS = 60_000;

/**
 * Foreground location reporting for safe-zone monitoring (SAFE-02). Runs only after the patient has granted
 * permission. Background tracking needs a development build and is listed in KNOWN_ISSUES (KI-05).
 */
export function useLocationReporting(patientId: string | undefined, enabled: boolean, onReported?: () => void) {
  const lastSent = useRef(0);

  useEffect(() => {
    if (!patientId || !enabled) return;
    let subscription: Location.LocationSubscription | null = null;
    let stopped = false;

    const send = async (position: Location.LocationObject) => {
      const now = Date.now();
      if (now - lastSent.current < MIN_INTERVAL_MS) return;
      lastSent.current = now;
      try {
        await api(`/patients/${patientId}/locations`, {
          method: 'POST',
          body: {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            accuracy_m: position.coords.accuracy != null ? Number(position.coords.accuracy.toFixed(1)) : null,
            recorded_at: new Date(position.timestamp).toISOString(),
            source: 'GPS',
            is_mocked: !!position.mocked,
          },
        });
        onReported?.();
      } catch {
        lastSent.current = 0; // retry on the next position update
      }
    };

    const start = async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted || stopped) return;
      subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: MIN_INTERVAL_MS, distanceInterval: 25 },
        (position) => void send(position),
      );
    };

    void start();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !subscription) void start();
      if (state !== 'active') {
        subscription?.remove();
        subscription = null;
      }
    });
    return () => {
      stopped = true;
      subscription?.remove();
      appState.remove();
    };
  }, [patientId, enabled, onReported]);
}
