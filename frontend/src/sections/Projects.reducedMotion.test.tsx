import { cleanup, render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { api } from '../api/client';
import { LanguageProvider } from '../i18n/LanguageProvider';
import { Projects } from './Projects';

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
vi.mock('../motion/Reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => children,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Projects under reduced motion', () => {
  it('keeps the static grid instead of the marquee', async () => {
    // Whether the API answers or the sample projects are used, the layout is the same.
    vi.spyOn(api, 'listProjects').mockRejectedValue(new Error('offline'));
    render(
      <LanguageProvider>
        <Projects />
      </LanguageProvider>,
    );

    await waitFor(() => expect(document.querySelector('#projects-pocket')).toBeInTheDocument());
    expect(document.querySelector('[data-testid="projects-marquee"]')).not.toBeInTheDocument();
  });
});
