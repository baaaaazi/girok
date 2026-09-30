export const WEEKDAYS_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'] as const
export const WEEKDAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토'] as const
export const MONTHS_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'] as const

export function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayKey(): string {
  return dateKey(new Date())
}

export function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

export function shiftDate(key: string, amount: number): string {
  const date = parseDateKey(key) ?? new Date()
  date.setDate(date.getDate() + amount)
  return dateKey(date)
}

export function shiftMonth(key: string, amount: number): string {
  const date = parseDateKey(key) ?? new Date()
  const day = date.getDate()
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1)
  target.setDate(Math.min(day, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()))
  return dateKey(target)
}

export function swipeDateAmount(deltaX: number, deltaY: number, elapsedMs: number): -1 | 0 | 1 {
  if (elapsedMs > 600 || Math.abs(deltaX) < 56 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.5) return 0
  return deltaX < 0 ? 1 : -1
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function monthTitle(date: Date): string {
  return `${date.getFullYear()}년 ${MONTHS_KO[date.getMonth()]}`
}

export function monthDays(date: Date): Date[] {
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return Array.from({ length: count }, (_, index) => new Date(date.getFullYear(), date.getMonth(), index + 1))
}

export function monthLeadingDays(date: Date): number {
  return monthStart(date).getDay()
}

export function monthGrid(date: Date): Array<Date | null> {
  const cells: Array<Date | null> = [
    ...Array.from({ length: monthLeadingDays(date) }, () => null),
    ...monthDays(date),
  ]
  while (cells.length % 7) cells.push(null)
  return cells
}

export function assertMonthLayout(date: Date): void {
  const cells = monthGrid(date)
  const firstDate = cells.findIndex((cell) => cell !== null)
  const dayCount = cells.filter((cell) => cell !== null).length
  if (firstDate !== monthLeadingDays(date) || dayCount !== monthDays(date).length || cells.length % 7 !== 0) {
    throw new Error('month grid does not align with Sunday-first weekdays')
  }
}

export function displayDate(key: string): { number: string; weekday: string; compact: string } {
  const date = parseDateKey(key) ?? new Date()
  return {
    number: `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
    weekday: WEEKDAYS_KO[date.getDay()],
    compact: `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`,
  }
}

export function isToday(key: string): boolean {
  return key === todayKey()
}

export function hours(): number[] {
  return Array.from({ length: 24 }, (_, index) => index)
}

export function hourLabel(hour: number): string {
  return `${pad(hour)}:00`
}
