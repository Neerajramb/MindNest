import { BlurView } from 'expo-blur';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { ArFace } from '@/api/live';
import { NamedIcon, type IconName } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, space } from '@/ui/theme';

/** AR Vision's own look: frosted navy glass with sky-blue accents, so it reads on top of any camera picture. */
export const AR = {
  sky: '#38BDF8',
  skyDeep: '#0EA5E9',
  skyText: '#E0F2FE',
  glass: 'rgba(8, 30, 52, 0.42)',
  border: 'rgba(186, 230, 253, 0.38)',
  white: '#FFFFFF',
  rec: '#FB7185',
} as const;

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
export const fadeIn = FadeIn.duration(220).easing(EASE_OUT);
export const fadeOut = FadeOut.duration(160);

/** A frosted panel. The blur is static; only the panel's opacity or position ever animates. */
export function Glass({
  children,
  style,
  radius = 999,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  return (
    <View
      style={[
        { borderRadius: radius, borderCurve: 'continuous', overflow: 'hidden', borderWidth: 1, borderColor: AR.border },
        style,
      ]}
    >
      <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: AR.glass }]} />
      {children}
    </View>
  );
}

export function GlassPill({ icon, text, accent = AR.sky }: { icon: IconName; text: string; accent?: string }) {
  return (
    <Glass style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10, paddingHorizontal: space.lg }}>
      <NamedIcon name={icon} size={18} color={accent} />
      <AppText variant="bodyStrong" color={AR.white} numberOfLines={1} style={{ flexShrink: 1 }}>
        {text}
      </AppText>
    </Glass>
  );
}

/** Gently breathing dot that says "recording" without words. Opacity only, so it is fine with reduced motion. */
export function RecDot() {
  return (
    <Animated.View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: AR.rec,
        animationName: { from: { opacity: 1 }, to: { opacity: 0.3 } },
        animationDuration: '900ms',
        animationIterationCount: 'infinite',
        animationDirection: 'alternate',
        animationTimingFunction: 'ease-in-out',
      }}
    />
  );
}

/** Round glass button (or a sky-blue pill with a label). Presses in slightly under the finger. */
export function ArButton({
  icon,
  label,
  onPress,
  accessibilityLabel,
  active,
  size = 64,
}: {
  icon?: IconName;
  label?: string;
  onPress: () => void;
  accessibilityLabel: string;
  active?: boolean;
  size?: number;
}) {
  const [pressed, setPressed] = useState(false);
  const filled = active || !!label;
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
      {icon ? <NamedIcon name={icon} size={label ? 22 : 28} color={AR.white} /> : null}
      {label ? (
        <AppText variant="bodyStrong" color={AR.white}>
          {label}
        </AppText>
      ) : null}
    </View>
  );
  const shape: ViewStyle = label
    ? { minHeight: MIN_TOUCH, paddingHorizontal: space.xl, justifyContent: 'center' }
    : { width: size, height: size, alignItems: 'center', justifyContent: 'center' };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
      hitSlop={8}
    >
      <Animated.View
        style={{
          transform: [{ scale: pressed ? 0.96 : 1 }],
          transitionProperty: 'transform',
          transitionDuration: 120,
          transitionTimingFunction: 'ease-out',
        }}
      >
        {filled ? (
          <View style={[shape, { borderRadius: 999, backgroundColor: active === false ? AR.glass : AR.skyDeep }]}>{body}</View>
        ) : (
          <Glass style={shape}>{body}</Glass>
        )}
      </Animated.View>
    </Pressable>
  );
}

export const NAME_PILL_WIDTH = 240;
const NAME_PILL_HEIGHT = 56;

/**
 * A name floating just above a face. New positions arrive every second or so; the pill glides there on the UI
 * thread instead of jumping, and fades in and out as people come and go.
 */
export function NamePill({ face, x, y }: { face: ArFace; x: number; y: number }) {
  const reduced = useReducedMotion();
  const tx = useSharedValue(x);
  const ty = useSharedValue(y);
  useEffect(() => {
    const glide = { duration: 300, easing: EASE_IN_OUT };
    tx.set(reduced ? x : withTiming(x, glide));
    ty.set(reduced ? y : withTiming(y, glide));
  }, [x, y, reduced, tx, ty]);
  const position = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }, { translateY: ty.get() }] }));

  const person = face.status === 'RECOGNIZED' ? face.person : null;
  return (
    <Animated.View
      entering={fadeIn}
      exiting={fadeOut}
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width: NAME_PILL_WIDTH, alignItems: 'center' }, position]}
    >
      <Glass
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          height: NAME_PILL_HEIGHT,
          paddingLeft: 6,
          paddingRight: space.lg,
          opacity: person ? 1 : 0.85,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: person ? AR.sky : 'rgba(255, 255, 255, 0.18)',
          }}
        >
          <AppText variant="title" color={AR.white}>
            {person ? person.name.charAt(0).toUpperCase() : '?'}
          </AppText>
        </View>
        <View style={{ flexShrink: 1 }}>
          <AppText variant="bodyStrong" color={AR.white} numberOfLines={1}>
            {person ? person.name : 'Not sure who'}
          </AppText>
          {person?.relationship ? (
            <AppText variant="caption" color={AR.skyText} numberOfLines={1}>
              {person.relationship}
            </AppText>
          ) : null}
        </View>
      </Glass>
      <View
        style={{
          width: 12,
          height: 12,
          marginTop: -6,
          transform: [{ rotate: '45deg' }],
          backgroundColor: person ? AR.sky : 'rgba(255, 255, 255, 0.5)',
          borderRadius: 2,
        }}
      />
    </Animated.View>
  );
}

/** Top-left corner of the name pill for a face rectangle on screen: centred above the head, kept on screen. */
export function namePillSpot(
  rect: { left: number; top: number; width: number; height: number },
  view: { width: number; height: number },
  minTop: number,
): { x: number; y: number } {
  const x = Math.min(Math.max(rect.left + rect.width / 2 - NAME_PILL_WIDTH / 2, space.sm), view.width - NAME_PILL_WIDTH - space.sm);
  const above = rect.top - NAME_PILL_HEIGHT - 14;
  const y = above >= minTop ? above : Math.min(rect.top + rect.height + 8, view.height - NAME_PILL_HEIGHT - space.sm);
  return { x, y };
}
