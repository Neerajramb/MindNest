import { useLocalSearchParams } from 'expo-router';

import { ApiError, errorMessage } from '@/api/client';
import { useConversations } from '@/api/assistant';
import { usePatient } from '@/api/hooks';
import { formatDateTime } from '@/lib/time';
import { Card } from '@/ui/card';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors } from '@/ui/theme';

/** C-12 Conversation / Memory: shows only what the patient allows (nothing, dates only, or full text). */
export default function Memories() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tz = usePatient(id).data?.timezone;
  const conversations = useConversations(id);
  const forbidden = conversations.error instanceof ApiError && conversations.error.status === 403;

  return (
    <Screen refreshing={conversations.isRefetching} onRefresh={() => void conversations.refetch()}>
      {conversations.isLoading ? <LoadingState /> : null}
      {forbidden ? (
        <EmptyState icon="people" title="Kept private" message={errorMessage(conversations.error)} />
      ) : conversations.error ? (
        <ErrorState message={errorMessage(conversations.error)} onRetry={() => void conversations.refetch()} />
      ) : null}
      {conversations.data?.access === 'METADATA' ? (
        <AppText color={colors.textMuted}>The patient shares dates and people only, not what was said.</AppText>
      ) : null}
      {conversations.data?.conversations.length === 0 ? <EmptyState icon="people" title="No saved conversations" /> : null}
      {conversations.data?.conversations.map((c) => (
        <Card key={c.id}>
          <AppText variant="bodyStrong">
            {c.person ? `With ${c.person.name}` : 'Conversation'} · {formatDateTime(c.started_at, tz)}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {c.source === 'VOICE' ? 'Recorded' : 'Note'} · {c.turns} part{c.turns === 1 ? '' : 's'}
          </AppText>
          {c.messages?.map((m, i) => (
            <AppText key={i}>
              {m.speaker === 'PATIENT' ? 'Patient' : (c.person?.name ?? 'Other')}: {m.text}
            </AppText>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
