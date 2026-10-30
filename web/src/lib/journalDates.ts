// An entry's date and week, written in the language being learned, for the journal's date row and weekday
// strip ("1 tháng 10, 2026"; "Thứ 2 … CN", or "Thứ Hai … Chủ Nhật" in full). Uses the browser's Intl formatting, so it
// works for any language the browser knows, with no data of our own.

type IntlLocaleWithInfo = Intl.Locale & {
  getWeekInfo?: () => { firstDay: number }
  weekInfo?: { firstDay: number }
  getTextInfo?: () => { direction: 'ltr' | 'rtl' }
  textInfo?: { direction: 'ltr' | 'rtl' }
}

// The day the week starts on in the language's main region, as Date.getDay() numbers (0 = Sunday).
// Intl's firstDay is 1 = Monday … 7 = Sunday; browsers without week info start on Sunday.
function firstDayOfWeek(lang: string): number {
  try {
    const locale = new Intl.Locale(lang).maximize() as IntlLocaleWithInfo
    const first = locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay ?? 7
    return first % 7
  } catch {
    return 0
  }
}

// Right to left for languages written that way (Arabic, Hebrew…), so the week runs the right way round.
// Browsers without text info fall back to left to right.
function direction(lang: string): 'ltr' | 'rtl' {
  try {
    const locale = new Intl.Locale(lang) as IntlLocaleWithInfo
    return locale.getTextInfo?.().direction ?? locale.textInfo?.direction ?? 'ltr'
  } catch {
    return 'ltr'
  }
}

export type EntryDate = {
  /** "1 tháng 10, 2026" (no weekday: the week strip circles it) */
  date: string
  /** "21:30" or "9:30 PM", as the language writes times. */
  time: string
  /** The entry's week, in order, with the entry's own day marked: short names ("CN") and full ones ("Chủ Nhật"). */
  week: { label: string; long: string; today: boolean }[]
  /** The language's writing direction, for the date row and week strip. */
  dir: 'ltr' | 'rtl'
  /** The same date in English, for a learner who can't read it yet. */
  english: string
}

/** `when` is a datetime-local value ("2026-10-01T21:30"); `lang` the language's code ("vi"). */
export function entryDate(when: string, lang: string): EntryDate {
  const day = new Date(when)
  // A language code the browser can't use falls back to English rather than breaking the page.
  const format = (locale: string, options: Intl.DateTimeFormatOptions, date = day) => {
    try {
      return date.toLocaleString(locale, options)
    } catch {
      return date.toLocaleString('en', options)
    }
  }
  const start = new Date(day)
  start.setDate(day.getDate() - ((day.getDay() - firstDayOfWeek(lang) + 7) % 7))
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return {
      label: format(lang, { weekday: 'short' }, d),
      long: format(lang, { weekday: 'long' }, d),
      today: d.toDateString() === day.toDateString(),
    }
  })
  return {
    // No weekday: the week strip under it circles the day (owner's request 2026-10-30).
    date: format(lang, { day: 'numeric', month: 'long', year: 'numeric' }),
    time: format(lang, { hour: 'numeric', minute: '2-digit' }),
    week,
    english: format('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    dir: direction(lang),
  }
}

/** A month ("2026-10") written in the language being learned: "tháng 10 năm 2026", "octubre de 2026". */
export function monthLabel(month: string, lang: string): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 1, 1)
  const options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }
  try {
    return date.toLocaleDateString(lang, options)
  } catch {
    return date.toLocaleDateString('en', options)
  }
}
