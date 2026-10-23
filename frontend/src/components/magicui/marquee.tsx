// Magic UI Marquee — https://magicui.design/docs/components/marquee
// Source: magicuidesign/magicui apps/www/registry/magicui/marquee.tsx.
// Adapted for this project only where needed:
//   - Tailwind 3 syntax (`gap-[var(--gap)]` instead of v4's `gap-(--gap)`);
//     the keyframes live in tailwind.config.cjs.
//   - the project's `cn` helper (strings only) instead of `@/lib/utils`.
//   - repeated copies are hidden from screen readers, so every item is
//     announced once. They stay clickable, since a copy may be the one in view.
//   - with pauseOnHover, keyboard focus inside also pauses the animation.
import { type ComponentPropsWithoutRef } from 'react';

import { cn } from '../../lib/cn';

interface MarqueeProps extends ComponentPropsWithoutRef<'div'> {
  /**
   * Optional CSS class name to apply custom styles
   */
  className?: string;
  /**
   * Whether to reverse the animation direction
   * @default false
   */
  reverse?: boolean;
  /**
   * Whether to pause the animation on hover
   * @default false
   */
  pauseOnHover?: boolean;
  /**
   * Content to be displayed in the marquee
   */
  children: React.ReactNode;
  /**
   * Whether to animate vertically instead of horizontally
   * @default false
   */
  vertical?: boolean;
  /**
   * Number of times to repeat the content
   * @default 4
   */
  repeat?: number;
}

export function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  children,
  vertical = false,
  repeat = 4,
  ...props
}: MarqueeProps) {
  return (
    <div
      {...props}
      className={cn(
        'group flex gap-[var(--gap)] overflow-hidden p-2 [--duration:40s] [--gap:1rem]',
        vertical ? 'flex-col' : 'flex-row',
        className,
      )}
    >
      {Array(repeat)
        .fill(0)
        .map((_, i) => (
          <div
            key={i}
            aria-hidden={i > 0 || undefined}
            className={cn(
              'flex shrink-0 justify-around gap-[var(--gap)]',
              vertical ? 'animate-marquee-vertical flex-col' : 'animate-marquee flex-row',
              pauseOnHover && 'group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]',
              reverse && '[animation-direction:reverse]',
            )}
          >
            {children}
          </div>
        ))}
    </div>
  );
}
