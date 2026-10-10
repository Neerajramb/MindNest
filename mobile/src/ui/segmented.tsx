import { Pressable, View } from 'react-native';

import { AppText } from '@/ui/text';
import { colors, MIN_TOUCH, radius, space } from '@/ui/theme';

/** Large two-to-four option toggle (used for the Patient / Caregiver role choice). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: space.xs, gap: space.xs }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH - 8,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm,
              backgroundColor: selected ? colors.surface : 'transparent',
              borderWidth: selected ? 2 : 0,
              borderColor: colors.primary,
            }}
          >
            <AppText variant="bodyStrong" color={selected ? colors.primary : colors.textMuted}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
