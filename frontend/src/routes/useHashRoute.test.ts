import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { paths, useHashRoute } from './useHashRoute';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

it('resolves the FAQ and support route', () => {
  window.location.hash = '#/faq';
  const { result } = renderHook(() => useHashRoute());

  expect(result.current.route).toBe('faq');
  expect(paths.faq).toBe('#/faq');
});
