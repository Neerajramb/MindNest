import { Pressable, View } from 'react-native';

import { AppText } from '@/ui/text';
import { colors, MIN_TOUCH, radius, space } from '@/ui/theme';

/** Large two-to-four option toggle. Four options, or three with a long label, wrap two per row so labels stay large and on one line. */
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
  const longest = Math.max(...options.map((o) => o.label.length));
  const wrap = options.length > 3 || (options.length === 3 && longest > 10);
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        flexWrap: wrap ? 'wrap' : 'nowrap',
        backgroundColor: colors.primarySoft,
        borderRadius: radius.md,
        padding: space.xs,
        gap: space.xs,
      }}
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
              // Two per row when wrapping; the gap is taken out of the basis so pairs fit side by side.
              flexGrow: 1,
              flexBasis: wrap ? '45%' : 0,
              minHeight: MIN_TOUCH - 8,
              paddingHorizontal: space.sm,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.sm,
              backgroundColor: selected ? colors.surface : 'transparent',
              // Same border width either way, so the selected option does not shift or look raised.
              borderWidth: 2,
              borderColor: selected ? colors.primary : 'transparent',
            }}
          >
            <AppText
              variant="bodyStrong"
              color={selected ? colors.primary : colors.textMuted}
              center
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
