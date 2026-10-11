import * as Speech from 'expo-speech';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { askAssistant, startSession, type AssistantAnswer } from '@/api/assistant';
import { useMyPatient } from '@/api/hooks';
import { uploadAudio, useVoiceRecorder } from '@/features/voice-recorder';
import { useWakeWord } from '@/features/wake-word';
import { formatAgo } from '@/lib/time';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { TextField } from '@/ui/form';
import { NamedIcon } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { InlineNotice } from '@/ui/states';
import { AppText } from '@/ui/text';
import { colors, MIN_TOUCH, radius, space } from '@/ui/theme';

const QUICK_PROMPTS = ['What do I have today?', 'Where are my keys?', 'Who is this?', 'When is my appointment?'];

const CONFIDENCE_NOTE: Record<AssistantAnswer['confidence'], string | null> = {
  high: null,
  medium: 'I am fairly sure about this.',
  low: 'I am not sure about this.',
};

/** P-03 AI Assistant: short, direct answers from the patient's own data; says so when it doesn't know. */
export default function Assistant() {
  const router = useRouter();
  const params = useLocalSearchParams<{ personId?: string; personName?: string }>();
  const voice = useMyPatient().data?.voice_responses_enabled ?? true;
  const recorder = useVoiceRecorder(30);
  const wake = useWakeWord();
  const session = useRef<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AssistantAnswer[]>([]);

  // Coming from "Who is this?": keep that person as context so memory answers can prefer them (RAG-05).
  useEffect(() => {
    void startSession(params.personId)
      .then((s) => (session.current = s.id))
      .catch(() => undefined);
  }, [params.personId]);

  const show = (answer: AssistantAnswer) => {
    setHistory((h) => [answer, ...h].slice(0, 10));
    if (voice) {
      Speech.stop();
      Speech.speak(answer.answer, { rate: 0.9 });
    }
  };

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setError(null);
    try {
      show(await askAssistant(question, session.current, params.personId));
      setQuery('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleVoice = async () => {
    setError(null);
    if (!recorder.recording) {
      if (!(await recorder.start())) setError('MindNest needs the microphone to hear you. You can type instead.');
      return;
    }
    const uri = await recorder.stop();
    if (!uri) return;
    setBusy(true);
    try {
      show(await uploadAudio<AssistantAnswer>('/assistant/voice-query', uri, session.current ? { session_id: session.current } : undefined));
    } catch (err) {
      setError(`${errorMessage(err)} You can type your question instead.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {params.personName ? (
        <InlineNotice message={`You are with ${params.personName}. Ask me what you talked about before.`} />
      ) : null}
      <Button
        label={recorder.recording ? `Stop and ask (${recorder.seconds}s)` : 'Speak to me'}
        tone={recorder.recording ? 'danger' : 'primary'}
        icon="speaker"
        onPress={() => void toggleVoice()}
        loading={busy && !recorder.recording}
        large
        accessibilityHint="Tap, say your question, then tap again"
      />
      {wake.status === 'idle' ? (
        <AppText color={colors.textMuted}>On any screen, you can also just say “MindNest” and then your question.</AppText>
      ) : null}
      <TextField
        label="Or type your question"
        value={query}
        onChangeText={setQuery}
        placeholder="When is my appointment?"
        returnKeyType="send"
        onSubmitEditing={() => void ask(query)}
      />
      <Button label="Ask" icon="forward" tone="secondary" onPress={() => void ask(query)} disabled={busy || !query.trim()} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {QUICK_PROMPTS.map((prompt) => (
          <Pressable
            key={prompt}
            accessibilityRole="button"
            accessibilityLabel={prompt}
            onPress={() => void ask(prompt)}
            style={({ pressed }) => ({
              minHeight: MIN_TOUCH - 8,
              paddingHorizontal: space.md,
              justifyContent: 'center',
              borderRadius: radius.pill,
              borderWidth: 2,
              borderColor: colors.primary,
              backgroundColor: pressed ? colors.primarySoft : colors.surface,
            })}
          >
            <AppText variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>
              {prompt}
            </AppText>
          </Pressable>
        ))}
      </View>

      {error ? <InlineNotice tone="danger" message={error} /> : null}

      {history.map((item, index) => (
        <Card key={`${item.question}-${index}`} tint={index === 0 ? colors.primarySoft : undefined}>
          <AppText variant="caption" color={colors.textMuted}>
            You asked: {item.question}
          </AppText>
          <View style={{ flexDirection: 'row', gap: space.sm }} accessibilityLiveRegion={index === 0 ? 'polite' : 'none'}>
            <NamedIcon name="speaker" color={colors.primary} />
            <AppText variant="title" style={{ flex: 1 }} selectable>
              {item.answer}
            </AppText>
          </View>
          {CONFIDENCE_NOTE[item.confidence] ? (
            <AppText variant="caption" color={colors.warning}>
              {CONFIDENCE_NOTE[item.confidence]}
            </AppText>
          ) : null}
          {item.sources.length ? (
            <AppText variant="caption" color={colors.textMuted}>
              From: {item.sources.map((s) => `${s.label} (${formatAgo(s.time)})`).join(', ')}
            </AppText>
          ) : null}
          {item.action ? (
            <Button
              label={item.action.screen === '/who-is-this' ? 'Open the camera' : 'Open Help'}
              icon="forward"
              onPress={() => router.push(item.action!.screen as Href)}
            />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
