import { createContext, useContext, useId, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { CATEGORY_NAME_MAX_LENGTH, CUSTOM_CATEGORY_MAX, EMPTY_CATEGORY_DATA, categoryHours, categoryMeta, categoryOrder, nameTaken } from './lib/categories'
import { CATEGORY_COLORS, CATEGORY_COLOR_IDS, CATEGORY_ICON_IDS, type CategoryColorId, type CategoryData, type CategoryIconId, type CustomCategory } from './types/category'
import type { AppData } from './types/record'
import { Glyph, ICON_LABELS } from './icons'
import { useSheet } from './sheet'

type StyleVars = CSSProperties & Record<`--${string}`, string | number>
export type CategoryDraft = Omit<CustomCategory, 'id'> & { id?: string }

const COLOR_LABELS: Record<CategoryColorId, string> = {
  blue: '파랑', violet: '보라', orange: '주황', teal: '청록', yellow: '노랑', pink: '분홍', green: '초록', gray: '회색',
  red: '빨강', sky: '하늘', brown: '갈색', lime: '연두',
}
// The extra colors first, since the eight routine colors are already taken by the built-in categories.
const DEFAULT_COLORS: CategoryColorId[] = ['red', 'sky', 'brown', 'lime']

export const CategoryContext = createContext<CategoryData>(EMPTY_CATEGORY_DATA)

// Resolves any category id (built-in, custom, or one whose definition is gone) to its label, color and icon.
export function useCategories() {
  const data = useContext(CategoryContext)
  return { data, meta: (id: string) => categoryMeta(id, data), order: categoryOrder(data) }
}

export function CategoryIcon({ category, className = '' }: { category: string; className?: string }) {
  const { meta } = useCategories()
  return <Glyph icon={meta(category).icon} className={className} />
}

export function blankCategory(data: CategoryData): CategoryDraft {
  const used = new Set(data.categories.map((category) => category.color))
  return { name: '', icon: 'star', color: DEFAULT_COLORS.find((color) => !used.has(color)) ?? 'red' }
}

function colorStyle(color: CategoryColorId): StyleVars {
  return { '--category': CATEGORY_COLORS[color] }
}

export function CategorySettings({ data, records, onAdd, onEdit }: {
  data: CategoryData
  records: AppData['records']
  onAdd: () => void
  onEdit: (category: CustomCategory) => void
}) {
  const full = data.categories.length >= CUSTOM_CATEGORY_MAX
  return <section className="setting-section" aria-labelledby="category-title">
    <div className="setting-heading">
      <div><h2 id="category-title">기록 카테고리</h2><p>기본 카테고리 8개 말고도 나만의 카테고리를 만들어 기록할 수 있어요.</p></div>
      <span className="setting-count">{data.categories.length} / {CUSTOM_CATEGORY_MAX}</span>
    </div>
    {data.categories.length > 0 && <ul className="category-manage-list">
      {data.categories.map((category, index) => <li key={category.id} style={{ ...colorStyle(category.color), '--i': index } as StyleVars}>
        <button type="button" className="category-manage-row" onClick={() => onEdit(category)} aria-label={`${category.name} 카테고리 수정`}>
          <span className="legend-icon"><Glyph icon={category.icon} /></span>
          <span className="category-manage-name">{category.name}</span>
          <span className="category-manage-count">{categoryHours(records, category.id)}시간</span>
          <span className="category-manage-chevron" aria-hidden="true">›</span>
        </button>
      </li>)}
    </ul>}
    <div className="setting-actions">
      <button className="outline-button" type="button" disabled={full} onClick={onAdd}>+ 카테고리 추가</button>
    </div>
    {full && <p className="setting-hint">카테고리는 {CUSTOM_CATEGORY_MAX}개까지 만들 수 있어요.</p>}
  </section>
}

export function CategoryDialog({ draft, data, onClosed, onSave, onDelete }: {
  draft: CategoryDraft
  data: CategoryData
  onClosed: () => void
  onSave: (draft: CategoryDraft) => boolean
  onDelete: (id: string) => boolean
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const { close, dialogProps } = useSheet(onClosed, titleRef)
  const uid = useId()
  const [name, setName] = useState(draft.name)
  const [icon, setIcon] = useState<CategoryIconId>(draft.icon)
  const [color, setColor] = useState<CategoryColorId>(draft.color)
  const [failed, setFailed] = useState(false)
  const editing = Boolean(draft.id)
  const taken = name.trim().length > 0 && nameTaken(data, name, draft.id)
  const valid = name.trim().length > 0 && !taken

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    if (onSave({ ...draft, name: name.trim(), icon, color })) close()
    else setFailed(true)
  }
  const remove = () => {
    if (!draft.id) return
    if (onDelete(draft.id)) close()
  }

  return <dialog className="entry-dialog routine-dialog" aria-labelledby={`${uid}-title`} {...dialogProps}>
    <form className="entry-form" onSubmit={submit}>
      <header className="dialog-heading"><div>
        <span className="eyebrow">기록 카테고리</span>
        <h2 id={`${uid}-title`} ref={titleRef} tabIndex={-1}>{editing ? '카테고리 수정' : '새 카테고리'}</h2>
      </div></header>

      <div className="category-preview" style={colorStyle(color)} aria-hidden="true">
        <span className="category-option category-option-selected"><Glyph key={icon} icon={icon} /><span>{name.trim() || '이름'}</span></span>
      </div>

      <label className="sheet-field">
        <span className="sheet-label">이름</span>
        <input className="sheet-input" value={name} maxLength={CATEGORY_NAME_MAX_LENGTH} placeholder="예: 독서, 알바" enterKeyHint="done" aria-invalid={taken || undefined} onChange={(event) => setName(event.target.value)} />
        {taken && <span className="sheet-hint sheet-hint-error">이미 있는 이름이에요.</span>}
      </label>

      <fieldset className="sheet-fieldset">
        <legend className="sheet-label">아이콘</legend>
        <div className="icon-options" style={colorStyle(color)}>
          {CATEGORY_ICON_IDS.map((id) => <label key={id} className={`icon-option ${icon === id ? 'icon-option-selected' : ''}`}>
            <input className="visually-hidden" type="radio" name={`${uid}-icon`} value={id} checked={icon === id} onChange={() => setIcon(id)} aria-label={ICON_LABELS[id]} />
            <Glyph icon={id} />
          </label>)}
        </div>
      </fieldset>

      <fieldset className="sheet-fieldset">
        <legend className="sheet-label">색</legend>
        <div className="color-options color-options-wide">
          {CATEGORY_COLOR_IDS.map((id) => <label key={id} className={`color-option ${color === id ? 'color-option-selected' : ''}`} style={colorStyle(id)}>
            <input className="visually-hidden" type="radio" name={`${uid}-color`} value={id} checked={color === id} onChange={() => setColor(id)} aria-label={COLOR_LABELS[id]} />
          </label>)}
        </div>
      </fieldset>

      <footer className="dialog-footer">
        {editing && <button className="delete-entry" type="button" onClick={remove}>카테고리 삭제</button>}
        <span className={`save-status ${failed ? 'save-status-error' : ''}`} role="status" aria-live="polite">{failed ? '저장하지 못함' : ''}</span>
        <button className="ghost-button" type="button" onClick={close}>취소</button>
        <button className="save-entry" type="submit" disabled={!valid}>{editing ? '저장' : '추가'}</button>
      </footer>
    </form>
  </dialog>
}
