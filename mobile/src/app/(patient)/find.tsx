import { useMutation } from '@tanstack/react-query';
import * as Speech from 'expo-speech';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useMyPatient } from '@/api/hooks';
import { askWhereIs, useTrackedObjects, type LastSeenAnswer } from '@/api/objects';
import { usePatientId } from '@/features/patient-context';
import { formatAgo } from '@/lib/time';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { TextField } from '@/ui/form';
import { NamedIcon } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { EmptyState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, MIN_TOUCH, radius, space } from '@/ui/theme';

/** P-05 Object finder: the last place an item was seen, with the time; never "it is here now" (BR-03). */
export default function Find() {
  const router = useRouter();
  const patientId = usePatientId();
  const objects = useTrackedObjects(patientId);
  const voice = useMyPatient().data?.voice_responses_enabled ?? true;
  const [query, setQuery] = useState('');
  const ask = useMutation({
    mutationFn: askWhereIs,
    onSuccess: (answer) => {
      if (voice) {
        Speech.stop();
        Speech.speak(answer.answer, { rate: 0.9 });
      }
    },
  });

  const result: LastSeenAnswer | undefined = ask.data;
  return (
    <Screen refreshing={objects.isRefetching} onRefresh={() => void objects.refetch()}>
      <AppText variant="title">What are you looking for?</AppText>
      {objects.isLoading ? <LoadingState /> : null}
      {objects.data?.length === 0 ? (
        <EmptyState icon="more" title="No belongings listed" message="Your caregiver can add the things you often look for." />
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {objects.data?.map((o) => (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityLabel={`Find my ${o.name}`}
            onPress={() => ask.mutate(`where is my ${o.name}`)}
            style={({ pressed }) => ({
              minHeight: MIN_TOUCH,
              paddingHorizontal: space.lg,
              justifyContent: 'center',
              borderRadius: radius.pill,
              borderWidth: 2,
              borderColor: colors.primary,
              backgroundColor: pressed ? colors.primarySoft : colors.surface,
            })}
          >
            <AppText variant="bodyStrong" color={colors.primary}>
              {o.name}
            </AppText>
          </Pressable>
        ))}
      </View>
      <TextField
        label="Or ask in your own words"
        value={query}
        onChangeText={setQuery}
        placeholder="Where are my keys?"
        returnKeyType="search"
        onSubmitEditing={() => query.trim() && ask.mutate(query.trim())}
      />
      <Button label="Find it" icon="forward" onPress={() => query.trim() && ask.mutate(query.trim())} loading={ask.isPending} />

      {ask.isError ? <InlineNotice tone="danger" message={errorMessage(ask.error)} /> : null}
      {result ? (
        <Card tint={result.status === 'FOUND' ? (result.stale ? colors.warningSoft : colors.successSoft) : colors.warningSoft}>
          <View style={{ flexDirection: 'row', gap: space.md }} accessibilityLiveRegion="polite">
            <NamedIcon name={result.status === 'FOUND' ? 'safety' : 'warning'} size={34} color={result.status === 'FOUND' ? colors.success : colors.warning} />
            <View style={{ flex: 1, gap: space.xs }}>
              <AppText variant="title">{result.answer}</AppText>
              {result.last_seen ? (
                <AppText color={colors.textMuted}>
                  Seen {formatAgo(result.last_seen.observed_at)} by the camera. It may have moved since.
                </AppText>
              ) : null}
            </View>
          </View>
        </Card>
      ) : null}

      <Button
        label="Scan a room"
        tone="secondary"
        icon="person"
        onPress={() => router.push('/scan')}
        accessibilityHint="Use the camera so MindNest remembers where your things are"
        large
      />
    </Screen>
  );
}
