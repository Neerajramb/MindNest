import { useNetInfo } from '@react-native-community/netinfo';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/ui/button';
import { NamedIcon, type IconName } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { colors, radius, space } from '@/ui/theme';

/** Every data screen has four states: loading, error, empty and content (UI/UX section 16). */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={{ padding: space.xxl, alignItems: 'center', gap: space.md }} accessibilityLiveRegion="polite">
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText color={colors.textMuted}>{label}</AppText>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.lg }} accessibilityLiveRegion="polite">
      <NamedIcon name="warning" size={40} color={colors.danger} />
      <AppText center selectable>
        {message}
      </AppText>
      {onRetry ? <Button label="Try again" icon="forward" tone="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.md }}>
      <NamedIcon name={icon} size={40} color={colors.textMuted} />
      <AppText variant="title" center>
        {title}
      </AppText>
      {message ? (
        <AppText center color={colors.textMuted}>
          {message}
        </AppText>
      ) : null}
      {action ? <Button label={action.label} icon="add" onPress={action.onPress} /> : null}
    </View>
  );
}

/** Non-blocking notice shown above cached content when a refresh failed. */
export function InlineNotice({ message, tone = 'warning' }: { message: string; tone?: 'warning' | 'danger' }) {
  const bg = tone === 'danger' ? colors.dangerSoft : colors.warningSoft;
  const fg = tone === 'danger' ? colors.danger : colors.warning;
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: bg }}
    >
      <NamedIcon name="warning" size={22} color={fg} />
      <AppText variant="caption" color={fg} style={{ flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}

/** "You are offline" banner: the app never claims live results while offline (UI/UX section 16). */
export function OfflineBanner() {
  const net = useNetInfo();
  if (net.isConnected !== false) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, backgroundColor: colors.warningSoft }}
    >
      <NamedIcon name="offline" size={22} color={colors.warning} />
      <AppText variant="caption" color={colors.warning} style={{ flex: 1 }}>
        You are offline. Showing saved information; changes need a connection.
      </AppText>
    </View>
  );
}
