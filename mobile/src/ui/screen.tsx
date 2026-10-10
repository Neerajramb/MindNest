import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { OfflineBanner } from '@/ui/states';
import { colors, space } from '@/ui/theme';

/** Scrollable screen body with safe-area insets, pull-to-refresh and the offline banner. */
export function Screen({
  children,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: space.xxl }}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined
      }
    >
      <OfflineBanner />
      <View style={{ padding: space.lg, gap: space.lg }}>{children}</View>
    </ScrollView>
  );
}
