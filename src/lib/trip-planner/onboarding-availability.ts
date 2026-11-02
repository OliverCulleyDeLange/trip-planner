import type { AvailabilityStatus } from './types';

type AvailabilityChoiceBase = {
  ariaLabel: string;
  name: string;
  status: AvailabilityStatus;
};

export type OnboardingDayChoice = AvailabilityChoiceBase & {
  day: string;
  kind: 'day';
  weekday: string;
};

export type OnboardingRangeChoice = AvailabilityChoiceBase & {
  end: string;
  kind: 'range';
  optionLabel: string;
  start: string;
};

export type OnboardingAvailabilityChoice = OnboardingDayChoice | OnboardingRangeChoice;

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const statusLabel = (status: AvailabilityStatus): string => status === 'available' ? 'available' : 'not available';

function availabilityControl(choice: OnboardingAvailabilityChoice): string {
  const available = choice.status === 'available';
  const label = escapeHtml(choice.ariaLabel);
  return `<button type="button" class="tp-availability-cell tp-binary-cell ${available ? 'available' : 'unavailable'}" data-onboarding-availability data-availability-label="${label}" data-availability-status="${choice.status}" aria-label="${label} — ${statusLabel(choice.status)}" aria-pressed="${available}"><span>${available ? '✓' : ''}</span></button><input type="hidden" name="${escapeHtml(choice.name)}" value="${choice.status}" data-onboarding-availability-input />`;
}

export function renderOnboardingAvailabilityGrid(personHtml: string, choices: OnboardingAvailabilityChoice[]): string {
  if (!choices.length) return '';
  const controls = choices.map(availabilityControl).join('');

  if (choices[0].kind === 'day') {
    const days = choices as OnboardingDayChoice[];
    const headings = days.map(choice => `<div class="tp-day-head"><span>${escapeHtml(choice.weekday)}</span><strong>${escapeHtml(choice.day)}</strong></div>`).join('');
    return `<section class="tp-panel tp-calendar-panel tp-onboarding-availability-panel"><div class="tp-calendar-scroll"><div class="tp-calendar" style="--days:${days.length}"><div class="tp-calendar-corner">You</div>${headings}<div class="tp-calendar-person">${personHtml}</div>${controls}</div></div></section>`;
  }

  const ranges = choices as OnboardingRangeChoice[];
  const headings = ranges.map(choice => `<div class="tp-range-option"><small>${escapeHtml(choice.optionLabel)}</small><div class="tp-option-dates"><time><span>Start</span><strong>${escapeHtml(choice.start)}</strong></time><i>→</i><time><span>End</span><strong>${escapeHtml(choice.end)}</strong></time></div></div>`).join('');
  return `<section class="tp-panel tp-calendar-panel tp-onboarding-availability-panel"><div class="tp-calendar-scroll"><div class="tp-range-poll" style="--options:${ranges.length}"><div class="tp-calendar-corner">You</div>${headings}<div class="tp-calendar-person">${personHtml}</div>${controls}</div></div></section>`;
}

export function nextOnboardingAvailabilityStatus(status: string | undefined): AvailabilityStatus {
  return status === 'available' ? 'unavailable' : 'available';
}
