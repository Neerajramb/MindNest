import { formatDateTime } from '@/lib/time';
import { Card } from '@/ui/card';
import { AppText } from '@/ui/text';
import { colors } from '@/ui/theme';

export function LinkCodeCard({ name, code, expiresAt }: { name: string; code: string; expiresAt: string }) {
  return (
    <Card tint={colors.primarySoft}>
      <AppText variant="title">Link code for {name}</AppText>
      <AppText
        variant="display"
        selectable
        accessibilityLabel={`Link code ${code.split('').join(' ')}`}
        style={{ letterSpacing: 4, fontVariant: ['tabular-nums'] }}
      >
        {code}
      </AppText>
      <AppText color={colors.textMuted}>
        On their phone: open MindNest, choose Patient, tap “I have a link code”. The code works once and expires{' '}
        {formatDateTime(expiresAt)}.
      </AppText>
    </Card>
  );
}
