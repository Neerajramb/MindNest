import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { useMyAlerts } from '@/api/hooks';
import { NamedIcon, type IconName } from '@/ui/icon';
import { colors } from '@/ui/theme';

const icon = (name: IconName) =>
  // Tint colours are configured as hex strings below, so the cast is safe.
  function TabIcon({ color }: { color: ColorValue }) {
    return <NamedIcon name={name} color={color as string} size={26} />;
  };

export default function CaregiverTabs() {
  const alerts = useMyAlerts(true);
  const count = alerts.data?.length ?? 0;
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontSize: 22, fontWeight: '700', color: colors.text },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
        tabBarStyle: { height: 84, paddingTop: 6, backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: icon('home') }} />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: icon('alert'),
          tabBarBadge: count > 0 ? count : undefined,
          tabBarAccessibilityLabel: count > 0 ? `Alerts, ${count} need attention` : 'Alerts',
        }}
      />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person') }} />
    </Tabs>
  );
}
