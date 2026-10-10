import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { NamedIcon, type IconName } from '@/ui/icon';
import { colors } from '@/ui/theme';

/**
 * Persistent patient navigation (UI/UX section 3). JS tabs are used instead of native tabs so labels and
 * targets can be larger than the system tab bar allows.
 */
const tab = (title: string, icon: IconName) => ({
  title,
  // Tint colours are configured as hex strings below, so the cast is safe.
  tabBarIcon: ({ color }: { color: ColorValue }) => <NamedIcon name={icon} color={color as string} size={28} />,
  tabBarAccessibilityLabel: title,
});

export default function PatientTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontSize: 24, fontWeight: '700', color: colors.text },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 15, fontWeight: '600' },
        tabBarStyle: { height: 88, paddingTop: 8, backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="home" options={{ ...tab('Home', 'home'), headerShown: false }} />
      <Tabs.Screen name="assistant" options={tab('Ask me', 'speaker')} />
      <Tabs.Screen name="schedule" options={tab('My day', 'schedule')} />
      <Tabs.Screen name="reminders" options={tab('Reminders', 'reminders')} />
      <Tabs.Screen name="more" options={tab('More', 'more')} />
    </Tabs>
  );
}
