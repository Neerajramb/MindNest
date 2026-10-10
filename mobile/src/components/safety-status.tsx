import { View } from 'react-native';

import type { SafetySummary } from '@/api/types';
import { formatAgo } from '@/lib/time';
import { NamedIcon, type IconName } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { colors, radius, space } from '@/ui/theme';

type Look = { title: string; detail: string; icon: IconName; fg: string; bg: string };

/**
 * Human wording for the safety state. A missing or old location is never described as safe
 * (UI/UX C-10: "clearly state that current location is unavailable rather than implying the patient is safe").
 */
export function describeSafety(summary: SafetySummary, audience: 'patient' | 'caregiver'): Look {
  const seen = summary.last_location ? `Last update ${formatAgo(summary.last_location.recorded_at)}` : 'No location yet';
  if (!summary.location_sharing_enabled) {
    return { title: 'Location sharing is off', detail: 'Safe-zone alerts are paused.', icon: 'offline', fg: colors.warning, bg: colors.warningSoft };
  }
  if (!summary.has_safe_zones) {
    return { title: 'No safe zone set', detail: audience === 'caregiver' ? 'Add a safe zone to get alerts.' : seen, icon: 'safety', fg: colors.textMuted, bg: colors.background };
  }
  if (summary.location_stale || !summary.last_location) {
    return { title: 'Location not available', detail: seen, icon: 'warning', fg: colors.warning, bg: colors.warningSoft };
  }
  if (summary.status === 'INSIDE') {
    const where = summary.zone_name ? `In safe zone: ${summary.zone_name}` : 'In a safe zone';
    return { title: where, detail: seen, icon: 'check', fg: colors.success, bg: colors.successSoft };
  }
  if (summary.status === 'OUTSIDE') {
    return {
      title: audience === 'caregiver' ? 'Outside all safe zones' : 'Away from your safe places',
      detail: seen,
      icon: 'warning',
      fg: colors.danger,
      bg: colors.dangerSoft,
    };
  }
  return { title: 'Checking location…', detail: seen, icon: 'safety', fg: colors.textMuted, bg: colors.background };
}

export function SafetyBadge({ summary, audience }: { summary: SafetySummary; audience: 'patient' | 'caregiver' }) {
  const look = describeSafety(summary, audience);
  return (
    <View
      accessible
      accessibilityLabel={`${look.title}. ${look.detail}`}
      style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: look.bg }}
    >
      <NamedIcon name={look.icon} color={look.fg} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" color={look.fg}>
          {look.title}
        </AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {look.detail}
        </AppText>
      </View>
    </View>
  );
}
