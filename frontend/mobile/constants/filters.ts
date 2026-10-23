/**
 * Wording for the Filters sheet's rows added with the amenity, time-of-day and distance filters.
 * The hours of Morning, Afternoon, Evening and Night are decided by the server
 * (backend/app/core/time_of_day.py); the phone only sends the word.
 */
export const TIMES_OF_DAY = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: 'Night' },
] as const;

export type TimeOfDay = (typeof TIMES_OF_DAY)[number]['value'];

export const FILTER_TEXT = {
  timeOfDay: 'Time of day',
  mustHave: 'Must have',
  howFar: 'How far',
  anyDistance: 'Any',
  // the two lines the Filters sheet already used for a missing location
  needsLocation: 'Needs your location.',
  locationOff: 'Location is off.',
};
