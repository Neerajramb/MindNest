import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWakeWord } from '@/features/wake-word';
import { Button } from '@/ui/button';
import { NamedIcon } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { colors, radius, space } from '@/ui/theme';

const TITLES = {
  listening: "I'm listening…",
  thinking: 'Let me check…',
  speaking: 'MindNest',
} as const;

/** Floats over every patient screen while a "MindNest" question is being heard or answered. */
export function WakeWordCard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, heard, answer, notice, dismiss } = useWakeWord();
  const active = status === 'listening' || status === 'thinking' || status === 'speaking';
  if (!active && !answer && !notice) return null;

  const action = answer?.action;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: space.md,
        right: space.md,
        bottom: insets.bottom + 96, // clear of the tab bar
        padding: space.lg,
        gap: space.sm,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: colors.primary,
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.18)',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <NamedIcon name={status === 'listening' ? 'mic' : 'speaker'} color={colors.primary} size={28} />
        <AppText variant="title" style={{ flex: 1 }}>
          {active ? TITLES[status] : 'MindNest'}
        </AppText>
      </View>
      {heard ? <AppText color={colors.textMuted}>“{heard}”</AppText> : null}
      {answer ? (
        <AppText variant="bodyStrong" selectable>
          {answer.answer}
        </AppText>
      ) : null}
      {notice ? <AppText color={colors.danger}>{notice}</AppText> : null}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {action ? (
          <Button
            label={action.screen === '/who-is-this' ? 'Open the camera' : 'Open Help'}
            icon="forward"
            onPress={() => {
              dismiss();
              router.push(action.screen as Href);
            }}
            style={{ flex: 1 }}
          />
        ) : null}
        <Button label={status === 'speaking' ? 'Stop' : 'Close'} tone="secondary" onPress={dismiss} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
