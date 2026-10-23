import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceGuideButton } from './VoiceGuideButton';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VoiceGuideButton', () => {
  it('speaks the supplied prompt using Arabic speech synthesis', () => {
    const cancel = vi.fn();
    const resume = vi.fn();
    const speak = vi.fn();
    const arabicVoice = { lang: 'ar-SA', default: true } as SpeechSynthesisVoice;
    const getVoices = vi.fn(() => [arabicVoice]);
    class MockUtterance {
      lang = '';
      rate = 1;
      voice?: SpeechSynthesisVoice;
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('speechSynthesis', { cancel, resume, speak, getVoices, onvoiceschanged: null });
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
    render(<VoiceGuideButton text="الرجاء إدخال البريد الإلكتروني الخاص بك هنا" />);

    fireEvent.click(screen.getByRole('button', { name: 'استمع إلى الإرشادات الصوتية' }));

    expect(cancel).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledOnce();
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(speak.mock.invocationCallOrder[0]);
    expect(resume.mock.invocationCallOrder[0]).toBeLessThan(speak.mock.invocationCallOrder[0]);
    expect(speak.mock.calls[0][0]).toMatchObject({
      text: 'الرجاء إدخال البريد الإلكتروني الخاص بك هنا',
      lang: 'ar-SA',
      rate: 0.9,
      voice: arabicVoice,
    });
    expect(screen.getByRole('button', { name: 'استمع إلى الإرشادات الصوتية' })).toHaveClass('animate-pulse');
  });

  it('speaks with the Arabic locale while showing guidance when voices have not loaded', async () => {
    const cancel = vi.fn();
    const resume = vi.fn();
    const speak = vi.fn();
    const voices: SpeechSynthesisVoice[] = [];
    const getVoices = vi.fn(() => voices);
    const synthesis = { cancel, resume, speak, getVoices, onvoiceschanged: null as ((event: Event) => void) | null };
    class MockUtterance {
      lang = '';
      rate = 1;
      voice?: SpeechSynthesisVoice;
      constructor(readonly text: string) {}
    }
    vi.stubGlobal('speechSynthesis', synthesis);
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance);
    render(<VoiceGuideButton text="إرشادات الحقل" />);
    const button = screen.getByRole('button', { name: 'استمع إلى الإرشادات الصوتية' });

    fireEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent('إرشادات الحقل');
    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0][0]).toMatchObject({ lang: 'ar-SA', text: 'إرشادات الحقل' });

    const arabicVoice = { lang: 'ar-IQ', default: false } as SpeechSynthesisVoice;
    voices.push(arabicVoice);
    synthesis.onvoiceschanged?.(new Event('voiceschanged'));
    fireEvent.click(button);
    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak.mock.calls[1][0]).toMatchObject({ voice: arabicVoice, lang: 'ar-IQ' });
  });

  it('shows the instruction when browser speech synthesis is unavailable', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    render(<VoiceGuideButton text="إرشادات الحقل" />);
    fireEvent.click(screen.getByRole('button', { name: 'استمع إلى الإرشادات الصوتية' }));
    expect(await screen.findByRole('status')).toHaveTextContent('إرشادات الحقل');
  });
});
