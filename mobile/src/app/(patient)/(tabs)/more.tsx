import { useRouter, type Href } from 'expo-router';
import { View } from 'react-native';

import { NavRow } from '@/ui/card';
import { NamedIcon, type IconName } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

const ITEMS: { href: Href; icon: IconName; title: string; detail: string }[] = [
  { href: '/who-is-this', icon: 'person', title: 'Who is this?', detail: 'Recognise family and friends' },
  { href: '/medications', icon: 'medication', title: 'My medicines', detail: 'What to take and how' },
  { href: '/safety', icon: 'safety', title: 'Where am I', detail: 'Your safe places' },
  { href: '/settings', icon: 'settings', title: 'Settings', detail: 'Text size, voice and privacy' },
  { href: '/help', icon: 'help', title: 'Help', detail: 'Call someone or ask for help' },
];

export default function More() {
  const router = useRouter();
  return (
    <Screen>
      <View style={{ gap: space.sm }}>
        {ITEMS.map((item) => (
          <NavRow key={item.title} accessibilityLabel={`${item.title}. ${item.detail}`} onPress={() => router.push(item.href)}>
            <NamedIcon name={item.icon} color={colors.primary} size={30} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{item.title}</AppText>
              <AppText variant="caption" color={colors.textMuted}>
                {item.detail}
              </AppText>
            </View>
          </NavRow>
        ))}
      </View>
    </Screen>
  );
}
