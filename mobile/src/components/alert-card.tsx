import { View } from 'react-native';

import type { AlertItem, AlertType } from '@/api/types';
import { formatAgo, formatDateTime } from '@/lib/time';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { NamedIcon, type IconName } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

const typeLook: Record<AlertType, { label: string; icon: IconName }> = {
  GEOFENCE: { label: 'Left safe zone', icon: 'safety' },
  MEDICATION: { label: 'Missed medication', icon: 'medication' },
  SOS: { label: 'Asked for help', icon: 'help' },
  LOCATION_UNAVAILABLE: { label: 'Location unavailable', icon: 'offline' },
  PATIENT_REMINDER: { label: 'Added a reminder', icon: 'reminders' },
  SYSTEM: { label: 'System', icon: 'alert' },
  OTHER: { label: 'Alert', icon: 'alert' },
};

export function AlertCard({
  alert,
  onAcknowledge,
  onOpen,
  busy,
}: {
  alert: AlertItem;
  onAcknowledge?: () => void;
  onOpen?: () => void;
  busy?: boolean;
}) {
  const look = typeLook[alert.type];
  const urgent = alert.severity === 'HIGH';
  const fg = urgent ? colors.danger : colors.warning;
  return (
    <Card tint={alert.acknowledged_at ? undefined : urgent ? colors.dangerSoft : colors.warningSoft}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <NamedIcon name={look.icon} color={alert.acknowledged_at ? colors.textMuted : fg} size={30} />
        <View style={{ flex: 1, gap: space.xs }}>
          <AppText variant="bodyStrong">
            {alert.patient_name} · {look.label}
            {urgent ? ' · Urgent' : ''}
          </AppText>
          <AppText selectable>{alert.message}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {formatDateTime(alert.created_at)} ({formatAgo(alert.created_at)})
          </AppText>
          {alert.data?.source === 'TEST' ? (
            <AppText variant="caption" color={colors.textMuted}>
              Simulated location (test)
            </AppText>
          ) : null}
          {alert.acknowledged_at ? (
            <AppText variant="caption" color={colors.success}>
              Acknowledged by {alert.acknowledged_by_name ?? 'a caregiver'}
            </AppText>
          ) : null}
        </View>
      </View>
      {!alert.acknowledged_at && (onAcknowledge || onOpen) ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {onOpen ? <Button label="Open" tone="secondary" onPress={onOpen} style={{ flex: 1 }} /> : null}
          {onAcknowledge ? (
            <Button label="Acknowledge" icon="check" onPress={onAcknowledge} loading={busy} style={{ flex: 1 }} />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
