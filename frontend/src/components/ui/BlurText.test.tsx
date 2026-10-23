import { cleanup, render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { BlurText } from './BlurText';

afterEach(cleanup);

const groupsOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('span.inline-block')).map((span) => span.textContent);

describe('BlurText', () => {
  it('reveals the Arabic heading in three groups', () => {
    const { container } = render(
      <h1><BlurText text="اختر منظومة الطاقة الشمسية المثالية لاحتياجاتك" groupSizes={[3, 2, 1]} /></h1>,
    );
    expect(groupsOf(container)).toEqual(['اختر منظومة الطاقة', 'الشمسية المثالية', 'لاحتياجاتك']);
    expect(container.querySelector('h1')).toHaveTextContent('اختر منظومة الطاقة الشمسية المثالية لاحتياجاتك');
  });

  it('keeps every word when the text has more words than the groups expect', () => {
    const { container } = render(
      <h1><BlurText text="Find the Right Solar System for Your Energy Needs" groupSizes={[3, 2, 1]} /></h1>,
    );
    expect(groupsOf(container)).toEqual(['Find the Right', 'Solar System', 'for Your Energy Needs']);
  });
});
