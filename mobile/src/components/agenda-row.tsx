import { View } from 'react-native';

import type { AgendaItem } from '@/api/types';
import { StatusPill, displayState, typeIcon } from '@/components/reminder-card';
import { formatTime } from '@/lib/time';
import { NamedIcon } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { colors, radius, space } from '@/ui/theme';

/**
 * One schedule entry (P-06/P-07): medication rows are visually distinct, the next item is emphasised and
 * finished items stay visible but secondary (UI/UX section 10).
 */
export function AgendaRow({ item, isNext, timeZone }: { item: AgendaItem; isNext?: boolean; timeZone?: string }) {
  const isMedication = item.kind === 'MEDICATION';
  const past = new Date(item.end_at ?? item.at) < new Date();
  const state = item.reminder ? displayState({ status: item.reminder.status, due_at: item.at }) : null;
  const done = state === 'done';
  const accent = isMedication ? colors.medication : colors.primary;
  const label = `${formatTime(item.at, timeZone)}, ${item.title}${item.location ? `, at ${item.location}` : ''}${
    isNext ? ', next' : ''
  }`;
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.md,
        borderCurve: 'continuous',
        backgroundColor: isNext ? colors.primarySoft : isMedication ? colors.medicationSoft : colors.surface,
        borderWidth: isNext ? 2 : 0,
        borderColor: colors.primary,
        opacity: done || (past && !isNext) ? 0.7 : 1,
      }}
    >
      <View style={{ width: 84 }}>
        <AppText variant="bodyStrong">{formatTime(item.at, timeZone)}</AppText>
        {isNext ? (
          <AppText variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
            NEXT
          </AppText>
        ) : null}
      </View>
      <NamedIcon name={typeIcon[item.kind]} size={26} color={accent} />
      <View style={{ flex: 1, gap: space.xs }}>
        <AppText variant="bodyStrong" style={done ? { textDecorationLine: 'line-through' } : undefined}>
          {item.title}
        </AppText>
        {item.detail ? (
          <AppText variant="caption" color={colors.textMuted}>
            {item.detail}
          </AppText>
        ) : null}
        {item.location ? (
          <AppText variant="caption" color={colors.textMuted}>
            {item.location}
          </AppText>
        ) : null}
        {state && state !== 'upcoming' ? <StatusPill state={state} /> : null}
      </View>
    </View>
  );
}
