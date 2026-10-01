import type { CategoryIconId } from './types/category'
import type { RoutineIconId } from './types/routine'

const ICON_PATHS: Record<CategoryIconId, string> = {
  check: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4Zm-3.7 8.4 2.6 2.6 4.9-5.2',
  water: 'M12 3.8c-2.9 3.6-5.6 7-5.6 10.2a5.6 5.6 0 0 0 11.2 0c0-3.2-2.7-6.6-5.6-10.2Zm-2.6 10.6a2.6 2.6 0 0 0 2.4 2.4',
  book: 'M12 6.6C10.4 5.2 8 4.6 4.5 4.6v12.8c3.5 0 5.9.6 7.5 2 1.6-1.4 4-2 7.5-2V4.6c-3.5 0-5.9.6-7.5 2Zm0 0v12.8',
  pen: 'M15.2 5.2a2.1 2.1 0 0 1 3 3L8.6 17.8l-4 1 1-4Zm-1.8 1.8 3 3',
  run: 'M14.2 5.2h.01M10.5 20l2-5.2-2.8-2.3 1.6-4.2 3.2 2.4 2.8.4M8.2 11.5l1.5-3.2L13 8M12.5 14.8l3 1.9-.7 3.3',
  dumbbell: 'M6.5 7v10m11-10v10M4 9.5v5m16-5v5M6.5 12h11',
  moon: 'M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.2 6.2 0 0 0 9.7 9.7Z',
  sun: 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6ZM12 3.5v1.8m0 13.4v1.8M3.5 12h1.8m13.4 0h1.8M6 6l1.3 1.3m9.4 9.4L18 18M6 18l1.3-1.3m9.4-9.4L18 6',
  heart: 'M12 19.2s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.3a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6Z',
  pill: 'M9.2 19.5a4 4 0 0 1-5.7-5.7l5.3-5.3a4 4 0 0 1 5.7 5.7Zm-2.9-8.2 5.7 5.7M16.5 4.5a3 3 0 0 1 3 3',
  leaf: 'M5 19c0-8.5 5-13.5 14.5-14 .3 9.5-4.7 14-12 14.2M5 19c2.2-4 5-6.8 8.8-8.8',
  music: 'M9.5 17.5V5.8l9-1.8v11.6M9.5 17.5a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0Zm9-1.9a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0ZM9.5 9.4l9-1.8',
  meal: 'M7 3.5v5.2a2 2 0 0 0 4 0V3.5M9 3.5v17M16.5 20.5v-17c-1.8 1-2.8 3.6-2.8 6.6V13h2.8',
  clean: 'M14 4l-3.2 7.2M7.2 11.2h8.6l1.7 8.3h-12Zm2 8.3v-3m3.8 3v-3',
  money: 'M4 7h16v10H4Zm8 2.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8ZM6.8 10v.01m10.4 3.99v.01',
  star: 'm12 4.2 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8Z',
  bus: 'M5.5 16V6.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2V16Zm0-5h13M8.5 16v2.5m7-2.5v2.5M8.5 13.5h.01m7 0h.01',
  cup: 'M5 9.5h11v4.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Zm11 1h1.5a2.5 2.5 0 0 1 0 5H16M8.5 4v2.5M12 4v2.5',
  game: 'M7.2 8h9.6a4.2 4.2 0 0 1 4.2 4.2v1.3a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.3A3 3 0 0 1 3 13.5v-1.3A4.2 4.2 0 0 1 7.2 8Zm.8 2.5v3m-1.5-1.5h3m6-.5h.01m2 1h.01',
  dots: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4ZM8.6 12h.01M12 12h.01m3.4 0h.01',
}

export const ICON_LABELS: Record<CategoryIconId, string> = {
  check: '체크', water: '물', book: '책', pen: '펜', run: '달리기', dumbbell: '운동', moon: '달', sun: '해',
  heart: '하트', pill: '약', leaf: '잎', music: '음악', meal: '식사', clean: '청소', money: '돈', star: '별',
  bus: '버스', cup: '컵', game: '게임', dots: '점 세 개',
}

export function Glyph({ icon, className = '' }: { icon: CategoryIconId; className?: string }) {
  return <svg className={`category-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={ICON_PATHS[icon]} />
  </svg>
}

export function RoutineIcon({ icon, className = '' }: { icon: RoutineIconId; className?: string }) {
  return <Glyph icon={icon} className={className} />
}
