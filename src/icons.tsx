import type { CategoryId } from './types/record'

const CATEGORY_ICON_PATHS: Record<CategoryId, string> = {
  sleep: 'M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.2 6.2 0 0 0 9.7 9.7Z',
  study: 'M12 6.6C10.4 5.2 8 4.6 4.5 4.6v12.8c3.5 0 5.9.6 7.5 2 1.6-1.4 4-2 7.5-2V4.6c-3.5 0-5.9.6-7.5 2Zm0 0v12.8',
  meal: 'M7 3.5v5.2a2 2 0 0 0 4 0V3.5M9 3.5v17M16.5 20.5v-17c-1.8 1-2.8 3.6-2.8 6.6V13h2.8',
  travel: 'M5.5 16V6.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2V16Zm0-5h13M8.5 16v2.5m7-2.5v2.5M8.5 13.5h.01m7 0h.01',
  rest: 'M5 9.5h11v4.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Zm11 1h1.5a2.5 2.5 0 0 1 0 5H16M8.5 4v2.5M12 4v2.5',
  game: 'M7.2 8h9.6a4.2 4.2 0 0 1 4.2 4.2v1.3a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.3A3 3 0 0 1 3 13.5v-1.3A4.2 4.2 0 0 1 7.2 8Zm.8 2.5v3m-1.5-1.5h3m6-.5h.01m2 1h.01',
  exercise: 'M6.5 7v10m11-10v10M4 9.5v5m16-5v5M6.5 12h11',
  other: 'M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4ZM8.6 12h.01M12 12h.01m3.4 0h.01',
}

export function CategoryIcon({ category, className = '' }: { category: CategoryId; className?: string }) {
  return <svg className={`category-icon ${className}`} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={CATEGORY_ICON_PATHS[category]} />
  </svg>
}
