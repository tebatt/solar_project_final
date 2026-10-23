import { useCallback, useRef } from 'react';

/**
 * Gold spotlight that follows the pointer across a group of cards.
 *
 * Every `[data-spotlight]` element inside the container gets the pointer's
 * position in its own coordinates (--spot-x / --spot-y), so the light also
 * reaches the cards next to the one under the pointer. Styles live in
 * styles/spotlight.css. Writes CSS variables only, once per frame, so React
 * never re-renders. Off on touch screens and under reduced motion.
 *
 * Returns a callback ref for the container, so it also works when the grid
 * only appears after the companies have loaded.
 */
export function useSpotlight() {
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback((container: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!container || typeof window === 'undefined' || !window.matchMedia) return;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    let frame = 0;
    let x = 0;
    let y = 0;

    const paint = () => {
      frame = 0;
      container.querySelectorAll<HTMLElement>('[data-spotlight]').forEach((card) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--spot-x', `${x - rect.left}px`);
        card.style.setProperty('--spot-y', `${y - rect.top}px`);
      });
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || !finePointer.matches || reduced.matches) return;
      x = event.clientX;
      y = event.clientY;
      container.style.setProperty('--spot-o', '1');
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    const onLeave = () => container.style.setProperty('--spot-o', '0');

    container.addEventListener('pointermove', onMove, { passive: true });
    container.addEventListener('pointerleave', onLeave);
    cleanup.current = () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}
