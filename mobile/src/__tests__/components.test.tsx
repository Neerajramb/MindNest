import { describe, expect, jest, test } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Reminder } from '@/api/types';
import { ReminderCard } from '@/components/reminder-card';
import { EmptyState } from '@/ui/states';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const due: Reminder = {
  id: 'r1', type: 'MEDICATION', source_id: 's', scheduled_at: '2026-10-10T04:00:00Z', due_at: '2026-10-10T04:00:00Z',
  message: 'Take Metformin', detail: '500mg, 1 tablet', status: 'PENDING', snoozed_until: null, acknowledged_at: null,
  acknowledged_late: false,
};

describe('ReminderCard', () => {
  test('a due medication shows its status in words and both actions', async () => {
    const onAcknowledge = jest.fn();
    const onSnooze = jest.fn();
    await render(
      <ReminderCard reminder={due} timeZone="Asia/Kolkata" now={new Date('2026-10-10T04:05:00Z')} onAcknowledge={onAcknowledge} onSnooze={onSnooze} />,
    );
    expect(screen.getByText('Due now')).toBeTruthy();
    expect(screen.getByText('500mg, 1 tablet')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'I took it' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remind me in 10 minutes' }));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(onSnooze).toHaveBeenCalledTimes(1);
  });

  test('a missed reminder can be confirmed late but not snoozed', async () => {
    await render(
      <ReminderCard reminder={{ ...due, status: 'MISSED' }} onAcknowledge={jest.fn()} onSnooze={jest.fn()} />,
    );
    expect(screen.getByText('Missed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'I took it' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remind me in 10 minutes' })).toBeNull();
  });

  test('a finished reminder has no actions', async () => {
    await render(<ReminderCard reminder={{ ...due, status: 'ACKNOWLEDGED' }} onAcknowledge={jest.fn()} />);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

test('EmptyState explains and offers the next action', async () => {
  const onPress = jest.fn();
  await render(<EmptyState icon="people" title="No patients yet" message="Add someone" action={{ label: 'Add a patient', onPress }} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add a patient' }));
  expect(onPress).toHaveBeenCalled();
});
