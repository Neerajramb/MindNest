import { TextInput, View, type TextInputProps } from 'react-native';

import { useTextScale } from '@/ui/text-scale';
import { AppText } from '@/ui/text';
import { colors, MIN_TOUCH, radius, space, typeScale } from '@/ui/theme';

type Props = TextInputProps & { label: string; error?: string | null; hint?: string };

export function TextField({ label, error, hint, style, ...rest }: Props) {
  const scale = useTextScale();
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="bodyStrong">{label}</AppText>
      {hint ? (
        <AppText variant="caption" color={colors.textMuted}>
          {hint}
        </AppText>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={colors.textMuted}
        maxFontSizeMultiplier={2}
        style={[
          {
            minHeight: MIN_TOUCH,
            borderWidth: 2,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radius.md,
            borderCurve: 'continuous',
            paddingHorizontal: space.lg,
            paddingVertical: space.md,
            fontSize: Math.round(typeScale.body * scale),
            color: colors.text,
            backgroundColor: colors.surface,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" color={colors.danger} accessibilityLiveRegion="polite" selectable>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
