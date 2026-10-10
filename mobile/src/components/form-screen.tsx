import type { ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, View } from 'react-native';

import { Button } from '@/ui/button';
import { InlineNotice } from '@/ui/states';
import { colors, space } from '@/ui/theme';

/**
 * Caregiver form shell. Saving asks for confirmation first, because schedule and medication edits change what
 * the patient is told to do (Milestone 3; UI/UX: "confirmation for potentially consequential caregiver actions").
 * The draft is kept if saving fails.
 */
export function FormScreen({
  children,
  onSave,
  saving,
  error,
  confirmTitle,
  confirmMessage,
  saveLabel = 'Save',
}: {
  children: ReactNode;
  onSave: () => void;
  saving: boolean;
  error?: string | null;
  confirmTitle: string;
  confirmMessage: string;
  saveLabel?: string;
}) {
  const confirm = () =>
    Alert.alert(confirmTitle, confirmMessage, [
      { text: 'Keep editing', style: 'cancel' },
      { text: saveLabel, onPress: onSave },
    ]);
  return (
    <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
      >
        {children}
        {error ? <InlineNotice tone="danger" message={error} /> : null}
        <View style={{ gap: space.sm }}>
          <Button label={saveLabel} icon="check" onPress={confirm} loading={saving} large />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
