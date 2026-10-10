import { useLocalSearchParams } from 'expo-router';

import { errorMessage } from '@/api/client';
import { useActivity, usePatient } from '@/api/hooks';
import { describeActivity } from '@/lib/activity';
import { formatDateTime } from '@/lib/time';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors } from '@/ui/theme';

/** Activity log (CARE-06, FR-024). */
export default function Activity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tz = usePatient(id).data?.timezone;
  const activity = useActivity(id);
  return (
    <Screen refreshing={activity.isRefetching} onRefresh={() => void activity.refetch()}>
      {activity.isLoading ? <LoadingState /> : null}
      {activity.error && !activity.data ? <ErrorState message={errorMessage(activity.error)} onRetry={() => void activity.refetch()} /> : null}
      {activity.data?.length === 0 ? <EmptyState icon="activity" title="No activity yet" /> : null}
      {activity.data?.map((entry) => (
        <Card key={entry.id}>
          <AppText variant="bodyStrong">{describeActivity(entry)}</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {formatDateTime(entry.created_at, tz)}
            {entry.actor_name ? ` · ${entry.actor_name}` : ''}
          </AppText>
        </Card>
      ))}
    </Screen>
  );
}
