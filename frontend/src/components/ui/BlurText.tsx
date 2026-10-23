import { motion, useReducedMotion } from 'framer-motion';

/** Seconds the whole reveal takes; the hero buttons wait for it. */
export const BLUR_TEXT_DURATION = 0.95;

const GROUP_DURATION = 0.45;

/**
 * Splits `text` into groups of `sizes` words; leftover words join the last
 * group, so a changed translation still shows every word.
 */
function groupWords(text: string, sizes: readonly number[]): string[] {
  const words = text.trim().split(/\s+/);
  const groups: string[] = [];
  let index = 0;
  sizes.forEach((size, i) => {
    const take = i === sizes.length - 1 ? words.length - index : size;
    if (take > 0) groups.push(words.slice(index, index + take).join(' '));
    index += take;
  });
  return groups;
}

/**
 * Blur-to-sharp reveal, group by group, played once when it mounts
 * (after React Bits' Blur Text). Under reduced motion the text simply shows.
 */
export function BlurText({ text, groupSizes }: { text: string; groupSizes: readonly number[] }) {
  // framer-motion's hook knows the setting on the first render, so a reduced-
  // motion visitor never sees the blur start.
  const reduced = useReducedMotion();
  const groups = groupWords(text, groupSizes);
  const step = groups.length > 1 ? (BLUR_TEXT_DURATION - GROUP_DURATION) / (groups.length - 1) : 0;

  return (
    <>
      {groups.map((group, i) => (
        <span key={`${text}-${i}`}>
          {i > 0 && ' '}
          <motion.span
            className="inline-block"
            initial={reduced ? false : { opacity: 0, filter: 'blur(10px)', y: 10 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            transition={{ duration: GROUP_DURATION, delay: i * step, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {group}
          </motion.span>
        </span>
      ))}
    </>
  );
}
