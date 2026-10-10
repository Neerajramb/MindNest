import { View } from 'react-native';
import MapView, { Circle, Marker, type MapPressEvent } from 'react-native-maps';

import type { Geofence, SafetySummary } from '@/api/types';
import { colors, radius } from '@/ui/theme';

const DEFAULT_REGION = { latitude: 8.5241, longitude: 76.9366, latitudeDelta: 0.03, longitudeDelta: 0.03 };

/** Map of safe zones and the last known position. Last-known only: the label beside it says how old it is. */
export function SafetyMap({
  summary,
  zones = [],
  draft,
  onPress,
  height = 280,
}: {
  summary?: SafetySummary;
  zones?: Pick<Geofence, 'id' | 'latitude' | 'longitude' | 'radius_m' | 'name'>[];
  draft?: { latitude: number; longitude: number; radius_m: number } | null;
  onPress?: (coords: { latitude: number; longitude: number }) => void;
  height?: number;
}) {
  const last = summary?.last_location;
  const center = draft
    ? draft
    : last
      ? { latitude: last.latitude, longitude: last.longitude }
      : zones[0]
        ? { latitude: Number(zones[0].latitude), longitude: Number(zones[0].longitude) }
        : DEFAULT_REGION;
  return (
    <View
      style={{ height, borderRadius: radius.lg, overflow: 'hidden' }}
      accessible
      accessibilityLabel="Map of safe zones and last known position"
    >
      <MapView
        style={{ flex: 1 }}
        initialRegion={{ ...center, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        onPress={onPress ? (e: MapPressEvent) => onPress(e.nativeEvent.coordinate) : undefined}
      >
        {zones.map((zone) => (
          <Circle
            key={zone.id}
            center={{ latitude: Number(zone.latitude), longitude: Number(zone.longitude) }}
            radius={zone.radius_m}
            strokeColor={colors.success}
            fillColor="rgba(29, 115, 68, 0.15)"
            strokeWidth={2}
          />
        ))}
        {draft ? (
          <Circle
            center={draft}
            radius={draft.radius_m}
            strokeColor={colors.primary}
            fillColor="rgba(31, 95, 173, 0.15)"
            strokeWidth={2}
          />
        ) : null}
        {last ? (
          <Marker
            coordinate={{ latitude: last.latitude, longitude: last.longitude }}
            title={last.source === 'TEST' ? 'Simulated position' : 'Last known position'}
            pinColor={last.source === 'TEST' ? 'orange' : 'red'}
          />
        ) : null}
      </MapView>
    </View>
  );
}
