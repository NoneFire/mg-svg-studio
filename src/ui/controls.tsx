import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

export function ResizeHandle({
  axis, label, title, controls, className, min, max, value, onResize,
}: {
  axis: 'x' | 'y'
  label: string
  title: string
  controls: string
  className: string
  min: number
  max: number
  value: number
  onResize: (size: number, commit: boolean) => void
}) {
  const drag = useRef<{ pointerId: number; position: number; size: number; latest: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const clamp = (size: number) => Math.min(max, Math.max(min, Math.round(size)))
  const increase = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
  const decrease = axis === 'x' ? 'ArrowRight' : 'ArrowDown'

  return (
    <div
      className={`${className}${dragging ? ' dragging' : ''}`}
      role="separator"
      tabIndex={min < max ? 0 : -1}
      aria-label={label}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-controls={controls}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} 像素`}
      title={title}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary || min >= max) return
        event.preventDefault()
        event.currentTarget.focus({ preventScroll: true })
        event.currentTarget.setPointerCapture(event.pointerId)
        const position = axis === 'x' ? event.clientX : event.clientY
        drag.current = { pointerId: event.pointerId, position, size: value, latest: value }
        setDragging(true)
      }}
      onPointerMove={(event) => {
        const start = drag.current
        if (start?.pointerId !== event.pointerId) return
        const position = axis === 'x' ? event.clientX : event.clientY
        start.latest = clamp(start.size + start.position - position)
        onResize(start.latest, false)
      }}
      onLostPointerCapture={(event) => {
        const start = drag.current
        if (start?.pointerId !== event.pointerId) return
        drag.current = null
        setDragging(false)
        if (start.latest !== start.size) onResize(clamp(start.latest), true)
      }}
      onKeyDown={(event) => {
        let next: number
        if (event.key === increase) next = value + 16
        else if (event.key === decrease) next = value - 16
        else if (event.key === 'Home') next = min
        else if (event.key === 'End') next = max
        else return
        event.preventDefault()
        onResize(clamp(next), true)
      }}
    />
  )
}

export function SearchField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <div className="library-filter">
      <Icon name="search" size={14} />
      <input
        ref={input}
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button className="icon-btn" title="清空搜索框" onClick={() => {
          onChange('')
          input.current?.focus()
        }}>
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function NumberInput({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  const [text, setText] = useState(String(round(value)))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(String(round(value)))
  }, [value])
  const commit = (raw: string) => {
    const n = parseFloat(raw)
    if (!Number.isFinite(n)) {
      setText(String(round(value)))
      return
    }
    let v = n
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    onChange(v)
    setText(String(round(v)))
  }
  return (
    <span className="num-input">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setText(e.target.value)
          const n = parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(clamp(n, min, max))
        }}
        onBlur={(e) => {
          focused.current = false
          commit(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            commit(String((parseFloat(text) || 0) + step))
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            commit(String((parseFloat(text) || 0) - step))
          }
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  )
}

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="text-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function Select({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isGradient = value === 'gradient'
  const isEmpty = !value || value === 'none' || value === 'transparent'
  const hex = normalizeHex(isEmpty ? '' : value)
  const swatchBg = isGradient ? 'linear-gradient(135deg,#8b5cf6,#22d3ee)' : isEmpty ? 'transparent' : hex || value
  return (
    <span className="color-field">
      <span className={`swatch ${isEmpty ? 'empty' : ''}`} style={{ background: swatchBg }}>
        {!isGradient && <input type="color" value={hex || '#000000'} onChange={(e) => onChange(e.target.value)} />}
      </span>
      <input
        className="text-input mono"
        value={isGradient ? '渐变' : isEmpty ? '无' : value}
        disabled={isGradient}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          if (isEmpty) e.currentTarget.select()
        }}
      />
    </span>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" className={`toggle ${checked ? 'on' : ''}`} aria-pressed={checked} onClick={() => onChange(!checked)}>
      <span className="knob" />
      {label && <span className="toggle-label">{label}</span>}
    </button>
  )
}

export function IconButton({
  icon,
  title,
  onClick,
  active,
  danger,
  size = 16,
}: {
  icon: string
  title: string
  onClick?: (e: React.MouseEvent) => void
  active?: boolean
  danger?: boolean
  size?: number
}) {
  return (
    <button type="button" className={`icon-btn ${active ? 'active' : ''} ${danger ? 'danger' : ''}`} title={title} onClick={onClick}>
      <Icon name={icon} size={size} />
    </button>
  )
}

export function Chip({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'accent' | 'warn' | 'muted' }) {
  return <span className={`chip ${tone}`}>{children}</span>
}

function clamp(n: number, min?: number, max?: number) {
  let v = n
  if (min !== undefined) v = Math.max(min, v)
  if (max !== undefined) v = Math.min(max, v)
  return v
}

function round(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1000) / 1000
}

export function normalizeHex(value: string): string | null {
  if (!value) return null
  const v = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return '#' + v.slice(1).split('').map((c) => c + c).join('')
  }
  const rgb = v.match(/rgba?\(([^)]+)\)/)
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((s) => parseInt(s.trim(), 10))
    if ([r, g, b].every((n) => Number.isFinite(n))) {
      const h = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
      return `#${h(r)}${h(g)}${h(b)}`
    }
  }
  return null
}
