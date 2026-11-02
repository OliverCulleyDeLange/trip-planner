import { describe, expect, it } from 'vitest';
import { nextOnboardingAvailabilityStatus, renderOnboardingAvailabilityGrid } from './onboarding-availability';

describe('onboarding availability input', () => {
  it('uses the same scrollable availability cells as the main availability page', () => {
    const html = renderOnboardingAvailabilityGrid('<span>MQ</span>', [{
      ariaLabel: 'Mobile QA: Monday 30 November',
      day: '30',
      kind: 'day',
      name: 'availability:day:2026-11-30',
      status: 'available',
      weekday: 'Mon',
    }]);

    expect(html).toContain('tp-calendar-scroll');
    expect(html).toContain('tp-calendar');
    expect(html).toContain('tp-availability-cell tp-binary-cell available');
    expect(html).toContain('name="availability:day:2026-11-30" value="available"');
    expect(html).not.toContain('type="radio"');
  });

  it('renders date-range choices with the main range poll layout', () => {
    const html = renderOnboardingAvailabilityGrid('<span>MQ</span>', [{
      ariaLabel: 'Mobile QA: 2 Nov to 9 Nov',
      end: '9 Nov',
      kind: 'range',
      name: 'availability:range:first',
      optionLabel: 'Option 1',
      start: '2 Nov',
      status: 'unavailable',
    }]);

    expect(html).toContain('tp-range-poll');
    expect(html).toContain('tp-option-dates');
    expect(html).toContain('tp-availability-cell tp-binary-cell unavailable');
  });

  it('toggles between the same binary availability states as the main grid', () => {
    expect(nextOnboardingAvailabilityStatus('unavailable')).toBe('available');
    expect(nextOnboardingAvailabilityStatus('available')).toBe('unavailable');
  });
});
