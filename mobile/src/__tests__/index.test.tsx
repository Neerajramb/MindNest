import { expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import Index from '@/app/index';

test('renders the app name as a header', async () => {
  await render(<Index />);
  expect(screen.getByRole('header')).toHaveTextContent('MindNest');
});
