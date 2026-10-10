import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

import { apiBaseUrl } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { AppText } from '@/ui/text';
import { colors } from '@/ui/theme';

/** C-14 Settings & permissions (account part). Per-patient access is managed on each patient's page. */
export default function Account() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You will stop getting alerts on this phone until you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  return (
    <Screen>
      <Card>
        <AppText variant="title">{user?.name}</AppText>
        <AppText selectable>Username: {user?.username}</AppText>
        {user?.email ? <AppText selectable>Email: {user.email}</AppText> : null}
      </Card>
      <Button label="Add a patient" icon="add" onPress={() => router.push('/add-patient')} />
      <Card>
        <AppText variant="bodyStrong">Alerts on this phone</AppText>
        <AppText color={colors.textMuted}>
          Alerts appear while MindNest is open or recently used. Keep the app open on this phone during the day to
          get safe-zone and missed-medicine alerts quickly.
        </AppText>
      </Card>
      <AppText variant="caption" color={colors.textMuted} selectable>
        Server: {apiBaseUrl()}
      </AppText>
      <Button label="Sign out" tone="secondary" icon="logout" onPress={confirmSignOut} />
    </Screen>
  );
}
