import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';

import { NamedIcon } from '@/ui/icon';
import { colors, MIN_TOUCH, radius, space } from '@/ui/theme';

export function Card({ children, style, tint }: { children: ReactNode; style?: ViewStyle; tint?: string }) {
  return (
    <View
      style={[
        {
          backgroundColor: tint ?? colors.surface,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          padding: space.lg,
          gap: space.md,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A full-width tappable row with a chevron, for navigation lists. */
export function NavRow({
  children,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH + 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        paddingHorizontal: space.lg,
        backgroundColor: pressed ? colors.primarySoft : colors.surface,
        borderRadius: radius.md,
        borderCurve: 'continuous',
      })}
    >
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}>{children}</View>
      <NamedIcon name="chevron" size={20} color={colors.textMuted} />
    </Pressable>
  );
}
