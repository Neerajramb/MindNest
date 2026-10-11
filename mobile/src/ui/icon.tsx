import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ComponentProps } from 'react';

import { colors } from '@/ui/theme';

type MaterialName = ComponentProps<typeof MaterialIcons>['name'];

/**
 * One icon with both platform sources: SF Symbols on iOS, Material Icons on Android
 * (SF Symbols render nothing on Android). Icons are decorative; the adjacent text carries the meaning.
 */
export function Icon({
  ios,
  android,
  size = 26,
  color = colors.text,
}: {
  ios: SFSymbol;
  android: MaterialName;
  size?: number;
  color?: string;
}) {
  if (process.env.EXPO_OS === 'ios') {
    return (
      <SymbolView
        name={ios}
        tintColor={color}
        resizeMode="scaleAspectFit"
        style={{ width: size, height: size }}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    );
  }
  return <MaterialIcons name={android} size={size} color={color} accessibilityElementsHidden importantForAccessibility="no" />;
}

/** Shared icon pairs so the same concept looks the same everywhere (UI/UX: consistent iconography). */
export const icons = {
  home: { ios: 'house.fill', android: 'home' },
  schedule: { ios: 'calendar', android: 'calendar-today' },
  reminders: { ios: 'bell.fill', android: 'notifications' },
  more: { ios: 'square.grid.2x2.fill', android: 'apps' },
  medication: { ios: 'pills.fill', android: 'medication' },
  appointment: { ios: 'stethoscope', android: 'local-hospital' },
  routine: { ios: 'figure.walk', android: 'directions-walk' },
  safety: { ios: 'location.fill', android: 'location-on' },
  settings: { ios: 'gearshape.fill', android: 'settings' },
  help: { ios: 'sos', android: 'sos' },
  phone: { ios: 'phone.fill', android: 'phone' },
  check: { ios: 'checkmark.circle.fill', android: 'check-circle' },
  clock: { ios: 'clock.fill', android: 'schedule' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  missed: { ios: 'xmark.circle.fill', android: 'cancel' },
  offline: { ios: 'wifi.slash', android: 'wifi-off' },
  chevron: { ios: 'chevron.right', android: 'chevron-right' },
  back: { ios: 'chevron.left', android: 'chevron-left' },
  forward: { ios: 'chevron.right', android: 'chevron-right' },
  add: { ios: 'plus', android: 'add' },
  person: { ios: 'person.fill', android: 'person' },
  people: { ios: 'person.2.fill', android: 'people' },
  alert: { ios: 'bell.badge.fill', android: 'notification-important' },
  activity: { ios: 'list.bullet.rectangle', android: 'list-alt' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  edit: { ios: 'pencil', android: 'edit' },
  trash: { ios: 'trash', android: 'delete' },
  speaker: { ios: 'speaker.wave.2.fill', android: 'volume-up' },
  map: { ios: 'map.fill', android: 'map' },
  camera: { ios: 'camera.fill', android: 'photo-camera' },
  mic: { ios: 'mic.fill', android: 'mic' },
  stop: { ios: 'stop.circle.fill', android: 'stop-circle' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
} as const satisfies Record<string, { ios: SFSymbol; android: MaterialName }>;

export type IconName = keyof typeof icons;

export function NamedIcon({ name, ...rest }: { name: IconName; size?: number; color?: string }) {
  return <Icon {...icons[name]} {...rest} />;
}
