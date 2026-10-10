import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTextScale } from '@/ui/text-scale';
import { colors, typeScale, type TypeVariant } from '@/ui/theme';

const weights: Record<TypeVariant, TextStyle['fontWeight']> = {
  caption: '400',
  body: '400',
  bodyStrong: '600',
  title: '700',
  heading: '700',
  display: '700',
};

type Props = TextProps & { variant?: TypeVariant; color?: string; center?: boolean };

export function AppText({ variant = 'body', color = colors.text, center, style, ...rest }: Props) {
  const scale = useTextScale();
  const size = Math.round(typeScale[variant] * scale);
  return (
    <Text
      maxFontSizeMultiplier={2}
      style={[
        { fontSize: size, lineHeight: Math.round(size * 1.35), fontWeight: weights[variant], color },
        center && { textAlign: 'center' },
        style,
      ]}
      {...rest}
    />
  );
}
