import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

import { NamedIcon, type IconName } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { colors, MIN_TOUCH, radius, space } from '@/ui/theme';

type Tone = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';

const palette: Record<Tone, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  success: { bg: colors.success, fg: colors.onPrimary, border: colors.success },
  danger: { bg: colors.danger, fg: colors.onPrimary, border: colors.danger },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

type Props = {
  label: string;
  onPress: () => void;
  tone?: Tone;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  large?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
};

/** Large, labelled button: icon plus text for every important action (UI/UX section 17). */
export function Button({ label, onPress, tone = 'primary', icon, loading, disabled, large, accessibilityHint, style }: Props) {
  const p = palette[tone];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (process.env.EXPO_OS === 'ios') void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: large ? MIN_TOUCH + 16 : MIN_TOUCH,
          paddingHorizontal: space.xl,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          borderWidth: 2,
          borderColor: p.border,
          backgroundColor: p.bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {loading ? <ActivityIndicator color={p.fg} /> : icon ? <NamedIcon name={icon} color={p.fg} /> : null}
        <AppText variant={large ? 'title' : 'bodyStrong'} color={p.fg}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}
