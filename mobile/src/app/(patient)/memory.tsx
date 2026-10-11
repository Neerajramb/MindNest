import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { api, errorMessage } from '@/api/client';
import { useConversations, usePeopleList, type SavedConversation, type SuggestedReminder } from '@/api/assistant';
import { useAddMyReminder, useMyPatient } from '@/api/hooks';
import { usePatientId } from '@/features/patient-context';
import { uploadAudio, useVoiceRecorder } from '@/features/voice-recorder';
import { addDays, formatClock, formatDateTime, formatDay, isoDateIn } from '@/lib/time';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { TextField } from '@/ui/form';
import { Screen } from '@/ui/screen';
import { Segmented } from '@/ui/segmented';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

/** P-11 Memory: save conversations (with everyone's agreement) and look back at them. */
export default function Memory() {
  const client = useQueryClient();
  const patientId = usePatientId();
  const tz = useMyPatient().data?.timezone;
  const conversations = useConversations(patientId);
  const people = usePeopleList(patientId);
  const [personId, setPersonId] = useState<string>('none');
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'danger' } | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedReminder[]>([]);
  const addReminder = useAddMyReminder(patientId);
  const extra = (): Record<string, string> => ({
    consent_confirmed: 'true',
    ...(personId !== 'none' ? { person_id: personId } : {}),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ['patient', patientId ?? '', 'conversations'] });

  const saveRecording = async (uri: string) => {
    setBusy(true);
    try {
      const saved = await uploadAudio<SavedConversation>('/conversations/record', uri, extra());
      setSuggestions(saved.suggested_reminders ?? []);
      setMessage({ text: 'Saved. You can ask me about it later.', tone: 'success' });
      setConsent(false);
      refresh();
    } catch (err) {
      setMessage({ text: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  // At the five-minute limit the recording stops by itself and is saved like a normal stop.
  const recorder = useVoiceRecorder(300, (uri) => void saveRecording(uri));

  const toggleRecording = async () => {
    setMessage(null);
    setSuggestions([]);
    if (!recorder.recording) {
      if (!consent) return setMessage({ text: 'First confirm that everyone agreed to be recorded.', tone: 'danger' });
      if (!(await recorder.start())) setMessage({ text: 'MindNest needs the microphone. You can type a note instead.', tone: 'danger' });
      return;
    }
    const uri = await recorder.stop();
    if (uri) await saveRecording(uri);
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    setMessage(null);
    setSuggestions([]);
    try {
      const saved = await api<SavedConversation>('/conversations/note', { method: 'POST', body: { text: note.trim(), ...extra() } });
      setSuggestions(saved.suggested_reminders ?? []);
      setNote('');
      setMessage({ text: 'Saved.', tone: 'success' });
      refresh();
    } catch (err) {
      setMessage({ text: errorMessage(err), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const today = isoDateIn(tz);
  const dayLabel = (date: string) =>
    date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : formatDay(`${date}T12:00:00Z`);
  const drop = (plan: SuggestedReminder) => setSuggestions((list) => list.filter((p) => p !== plan));
  const accept = (plan: SuggestedReminder) =>
    addReminder
      .mutateAsync(plan)
      .then(() => {
        drop(plan);
        setMessage({ text: `Reminder added: ${plan.title}. Your caregiver can see it too.`, tone: 'success' });
      })
      .catch((e) => Alert.alert('Could not add the reminder', errorMessage(e)));

  const remove = (id: string) =>
    Alert.alert('Delete this memory?', 'It will be removed for good, and I will no longer be able to remind you of it.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          api(`/conversations/${id}`, { method: 'DELETE' })
            .then(refresh)
            .catch((e) => Alert.alert('Could not delete', errorMessage(e))),
      },
    ]);

  const personOptions = [{ value: 'none', label: 'Someone else' }, ...(people.data ?? []).slice(0, 3).map((p) => ({ value: p.id, label: p.name }))];

  return (
    <Screen refreshing={conversations.isRefetching} onRefresh={() => void conversations.refetch()}>
      <Card>
        <AppText variant="title">Save a conversation</AppText>
        <View style={{ gap: space.xs }}>
          <AppText variant="bodyStrong">Who are you talking with?</AppText>
          <Segmented label="Who are you talking with" value={personId} onChange={setPersonId} options={personOptions} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <AppText style={{ flex: 1 }}>Everyone here agreed to this conversation being saved.</AppText>
          <Switch accessibilityLabel="Everyone agreed to be recorded" value={consent} onValueChange={setConsent} />
        </View>
        <Button
          label={recorder.recording ? `Stop and save (${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, '0')})` : 'Start recording'}
          tone={recorder.recording ? 'danger' : 'primary'}
          icon="speaker"
          onPress={() => void toggleRecording()}
          loading={busy && !recorder.recording}
          large
        />
        {recorder.recording ? (
          <AppText color={colors.danger} accessibilityLiveRegion="polite">
            Recording… everyone can see this.
          </AppText>
        ) : null}
        <TextField label="Or write a note to remember" value={note} onChangeText={setNote} multiline placeholder="Sarah is visiting on Sunday" />
        <Button label="Save note" tone="secondary" onPress={() => void saveNote()} disabled={busy || !note.trim()} />
        {message ? <InlineNotice tone={message.tone === 'danger' ? 'danger' : 'warning'} message={message.text} /> : null}
        <AppText variant="caption" color={colors.textMuted}>
          Recordings are turned into text by an online service and the audio is then deleted.
        </AppText>
      </Card>

      {suggestions.length ? (
        <Card tint={colors.primarySoft}>
          <AppText variant="title">I heard a plan</AppText>
          <AppText>Would you like a reminder?</AppText>
          {suggestions.map((plan) => (
            <View key={`${plan.title}-${plan.date}-${plan.time}`} style={{ gap: space.sm }}>
              <AppText variant="bodyStrong">
                {plan.title} · {dayLabel(plan.date)} at {formatClock(plan.time)}
              </AppText>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button
                  label="Add reminder"
                  icon="add"
                  onPress={() => void accept(plan)}
                  loading={addReminder.isPending && addReminder.variables === plan}
                  style={{ flex: 1 }}
                />
                <Button label="No thanks" tone="ghost" onPress={() => drop(plan)} style={{ flex: 1 }} />
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <AppText variant="title">My memories</AppText>
      {conversations.isLoading ? <LoadingState /> : null}
      {conversations.error && !conversations.data ? (
        <ErrorState message={errorMessage(conversations.error)} onRetry={() => void conversations.refetch()} />
      ) : null}
      {conversations.data?.conversations.length === 0 ? (
        <EmptyState icon="people" title="Nothing saved yet" message="Saved conversations appear here." />
      ) : null}
      {conversations.data?.conversations.map((c) => (
        <Card key={c.id}>
          <AppText variant="bodyStrong">
            {c.person ? `With ${c.person.name}` : 'Conversation'} · {formatDateTime(c.started_at, tz)}
          </AppText>
          {c.messages?.slice(0, 4).map((m, i) => (
            <AppText key={i} color={m.speaker === 'PATIENT' ? colors.textMuted : colors.text}>
              {m.speaker === 'PATIENT' ? 'You' : (c.person?.name ?? 'They')}: {m.text}
            </AppText>
          ))}
          <Button label="Delete" tone="ghost" icon="trash" onPress={() => remove(c.id)} />
        </Card>
      ))}
    </Screen>
  );
}
