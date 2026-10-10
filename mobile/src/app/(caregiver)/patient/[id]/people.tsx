import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { api, ApiError, errorMessage } from '@/api/client';
import { usePatient, usePatientWrite } from '@/api/hooks';
import { uploadImage } from '@/api/upload';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { TextField } from '@/ui/form';
import { Screen } from '@/ui/screen';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

type Person = { id: string; name: string; relationship: string; notes: string; consent_confirmed: boolean; face_count: number };

/** C-08 People: register familiar people and their face photos (PEO-01..04). */
export default function People() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const client = useQueryClient();
  const patient = usePatient(id);
  const people = useQuery({ queryKey: ['patient', id, 'people'], queryFn: () => api<Person[]>(`/patients/${id}/people`) });
  const write = usePatientWrite(id);
  const [form, setForm] = useState({ name: '', relationship: '', consent: false });
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const canEdit = ['EDITOR', 'PRIMARY'].includes(patient.data?.my_permission_level ?? '');

  const add = async () => {
    if (!form.name.trim()) return setError('Enter the person’s name.');
    if (!form.consent) return setError('Confirm that this person agreed to face recognition.');
    setError(null);
    try {
      await write.mutateAsync({
        path: `/patients/${id}/people`,
        method: 'POST',
        body: { name: form.name.trim(), relationship: form.relationship.trim(), consent_confirmed: true },
      });
      setForm({ name: '', relationship: '', consent: false });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const addPhoto = async (person: Person, source: 'camera' | 'library') => {
    const permission =
      source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Permission needed', 'Allow access to add a face photo.');
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: false,
      // iPhone library photos are often HEIC; ask for a JPEG-compatible copy the server can read.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    };
    const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets[0]) return;
    setUploading(person.id);
    try {
      await uploadImage(`/people/${person.id}/face-embeddings`, picked.assets[0].uri);
      await client.invalidateQueries({ queryKey: ['patient', id, 'people'] });
    } catch (err) {
      const detail = err instanceof ApiError ? err.fieldError('image') : null;
      Alert.alert('Photo not added', detail ?? errorMessage(err));
    } finally {
      setUploading(null);
    }
  };

  const revoke = (person: Person) =>
    Alert.alert(`Remove ${person.name}?`, 'Their face data will be deleted and they will no longer be recognised.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          write
            .mutateAsync({ path: `/people/${person.id}`, method: 'DELETE' })
            .then(() => client.invalidateQueries({ queryKey: ['patient', id, 'people'] }))
            .catch((e) => Alert.alert('Could not remove', errorMessage(e))),
      },
    ]);

  return (
    <Screen refreshing={people.isRefetching} onRefresh={() => void people.refetch()}>
      {people.isLoading ? <LoadingState /> : null}
      {people.error && !people.data ? <ErrorState message={errorMessage(people.error)} onRetry={() => void people.refetch()} /> : null}
      {people.data?.length === 0 ? (
        <EmptyState icon="people" title="No familiar people yet" message="Add family and friends so the patient can ask “Who is this?”." />
      ) : null}
      {people.data?.map((p) => (
        <Card key={p.id}>
          <AppText variant="bodyStrong">
            {p.name}
            {p.relationship ? ` · ${p.relationship}` : ''}
          </AppText>
          <AppText color={p.face_count ? colors.success : colors.warning}>
            {p.face_count ? `${p.face_count} face photo${p.face_count > 1 ? 's' : ''}` : 'No face photo yet: add 2–3 clear photos'}
          </AppText>
          {canEdit ? (
            <View style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button label="Take photo" icon="person" style={{ flex: 1 }} loading={uploading === p.id} onPress={() => void addPhoto(p, 'camera')} />
                <Button label="From photos" tone="secondary" style={{ flex: 1 }} disabled={uploading === p.id} onPress={() => void addPhoto(p, 'library')} />
              </View>
              <Button label="Remove person" tone="ghost" icon="trash" onPress={() => revoke(p)} />
            </View>
          ) : null}
        </Card>
      ))}
      {canEdit ? (
        <Card>
          <AppText variant="title">Add a person</AppText>
          <TextField label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
          <TextField label="Relationship" value={form.relationship} onChangeText={(v) => setForm({ ...form, relationship: v })} placeholder="e.g. Daughter" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <AppText style={{ flex: 1 }}>This person agreed to have their face recognised by MindNest.</AppText>
            <Switch accessibilityLabel="Consent confirmed" value={form.consent} onValueChange={(v) => setForm({ ...form, consent: v })} />
          </View>
          {error ? <InlineNotice tone="danger" message={error} /> : null}
          <Button label="Add person" icon="add" onPress={add} loading={write.isPending} />
        </Card>
      ) : null}
      <AppText variant="caption" color={colors.textMuted}>
        Photos are turned into a face signature on your MindNest server and then discarded. Removing a person deletes
        their face data.
      </AppText>
    </Screen>
  );
}
