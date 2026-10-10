import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { api, ApiError, errorMessage } from '@/api/client';
import { usePatient } from '@/api/hooks';
import { objectKeys, usePlaces, useTrackedObjects } from '@/api/objects';
import { formatAgo, formatDateTime } from '@/lib/time';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { TextField } from '@/ui/form';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

/** C-09 Objects: tracked belongings with their last observation, and the rooms used for scans. */
export default function Objects() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const patient = usePatient(id);
  const objects = useTrackedObjects(id);
  const places = usePlaces(id);
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [room, setRoom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canEdit = ['EDITOR', 'PRIMARY'].includes(patient.data?.my_permission_level ?? '');
  const tz = patient.data?.timezone;

  const refresh = () => {
    void client.invalidateQueries({ queryKey: objectKeys.objects(id) });
    void client.invalidateQueries({ queryKey: objectKeys.places(id) });
  };

  const run = async (action: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    try {
      await action();
      after?.();
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? (err.fieldError('name') ?? err.message) : errorMessage(err));
    }
  };

  const confirmRemove = (title: string, path: string) =>
    Alert.alert(title, 'You can add it again later.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void run(() => api(path, { method: 'DELETE' })) },
    ]);

  return (
    <Screen refreshing={objects.isRefetching} onRefresh={refresh}>
      <AppText variant="title">Belongings</AppText>
      {objects.isLoading ? <LoadingState /> : null}
      {objects.error && !objects.data ? <ErrorState message={errorMessage(objects.error)} onRetry={() => void objects.refetch()} /> : null}
      {objects.data?.length === 0 ? <EmptyState icon="more" title="No belongings tracked" message="Add things the patient often loses." /> : null}
      {objects.data?.map((o) => (
        <Card key={o.id}>
          <AppText variant="bodyStrong">{o.name}</AppText>
          {o.aliases ? <AppText variant="caption" color={colors.textMuted}>Also: {o.aliases}</AppText> : null}
          <AppText color={o.last_seen ? colors.text : colors.textMuted}>
            {o.last_seen
              ? `Last seen: ${o.last_seen.place ?? 'unknown place'}, ${formatDateTime(o.last_seen.observed_at, tz)} (${formatAgo(o.last_seen.observed_at)})`
              : 'Not seen yet: scan a room with it in view'}
          </AppText>
          {canEdit ? <Button label="Stop tracking" tone="ghost" icon="trash" onPress={() => confirmRemove(`Stop tracking ${o.name}?`, `/objects/${o.id}`)} /> : null}
        </Card>
      ))}
      {canEdit ? (
        <Card>
          <AppText variant="title">Track a new item</AppText>
          <TextField label="Item" value={name} onChangeText={setName} placeholder="e.g. keys" autoCapitalize="none" />
          <TextField label="Other names (optional)" value={aliases} onChangeText={setAliases} placeholder="e.g. car keys, house keys" autoCapitalize="none" />
          <Button
            label="Add item"
            icon="add"
            onPress={() =>
              name.trim()
                ? void run(
                    () => api(`/patients/${id}/objects`, { method: 'POST', body: { name: name.trim(), aliases: aliases.trim() } }),
                    () => {
                      setName('');
                      setAliases('');
                    },
                  )
                : setError('Enter the item name.')
            }
          />
        </Card>
      ) : null}

      <View style={{ gap: space.sm }}>
        <AppText variant="title">Rooms</AppText>
        {places.data?.map((p) => (
          <Card key={p.id}>
            <AppText variant="bodyStrong">{p.name}</AppText>
            {canEdit ? <Button label="Remove room" tone="ghost" icon="trash" onPress={() => confirmRemove(`Remove ${p.name}?`, `/places/${p.id}`)} /> : null}
          </Card>
        ))}
        {canEdit ? (
          <Card>
            <TextField label="New room" value={room} onChangeText={setRoom} placeholder="e.g. Dining room" />
            <Button
              label="Add room"
              icon="add"
              tone="secondary"
              onPress={() =>
                room.trim()
                  ? void run(() => api(`/patients/${id}/places`, { method: 'POST', body: { name: room.trim() } }), () => setRoom(''))
                  : setError('Enter the room name.')
              }
            />
          </Card>
        ) : null}
      </View>
      {error ? <InlineNotice tone="danger" message={error} /> : null}
    </Screen>
  );
}
