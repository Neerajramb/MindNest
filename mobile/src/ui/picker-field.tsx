import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { View } from 'react-native';

import { AppText } from '@/ui/text';
import { colors, space } from '@/ui/theme';

/** Native date/time picker with a visible label (SwiftUI on iOS, Compose on Android). */
export function PickerField({
  label,
  value,
  mode,
  onChange,
  timeZone,
  minimumDate,
}: {
  label: string;
  value: Date;
  mode: 'date' | 'time';
  onChange: (date: Date) => void;
  timeZone?: string;
  minimumDate?: Date;
}) {
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="bodyStrong">{label}</AppText>
      {/* The picker brings its own native Host. Wrapping it in a second, content-sized Host left it with no
          width, so only a grey sliver (".00") showed at the far left. */}
      <DateTimePicker
        value={value}
        mode={mode}
        display="compact"
        presentation="inline"
        accentColor={colors.primary}
        timeZoneName={timeZone}
        minimumDate={minimumDate}
        onValueChange={(_, date) => onChange(date)}
        style={{ alignSelf: 'stretch' }}
      />
    </View>
  );
}

/** "HH:MM" wall-clock string from a picked Date, using the phone's clock (time-of-day fields have no date). */
export function toClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function fromClock(hhmm: string | undefined): Date {
  const date = new Date();
  const [h, m] = (hhmm ?? '09:00').split(':').map(Number);
  date.setHours(h, m, 0, 0);
  return date;
}
