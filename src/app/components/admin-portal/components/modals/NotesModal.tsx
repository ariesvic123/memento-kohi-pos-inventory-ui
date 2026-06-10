import React, { useEffect, useRef, useState } from 'react'

import { CartItem } from '../../../../config/utils/pos.types'

interface NotesModalProps {
  item:      CartItem | null
  extras:    CartItem[]
  onConfirm: (item: CartItem, selectedExtras: CartItem[]) => void
  onClose:   () => void
}

const NotesModal: React.FC<NotesModalProps> = ({ item, extras, onConfirm, onClose }) => {
  const [notes,         setNotes]         = useState('')
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (item) {
      setNotes('')
      setSelectedNames(new Set())
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [item])

  if (!item) return null

  const toggleExtra = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const selectedExtras = extras.filter((e) => selectedNames.has(e.name))
  const total = item.price + selectedExtras.reduce((sum, e) => sum + e.price, 0)

  const handleConfirm = () => {
    const trimmed = notes.trim()
    const mainItem = trimmed ? { ...item, notes: trimmed } : item
    onConfirm(mainItem, selectedExtras)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className='modal-overlay' onClick={onClose}>
      <div className='notes-modal' onClick={(e) => e.stopPropagation()} onKeyDown={handleKey}>

        <div className='notes-modal__header'>
          <span className='notes-modal__name'>{item.name}</span>
          <span className='notes-modal__size'>{item.size} · ₱{item.price}</span>
        </div>

        {extras.length > 0 && (
          <div className='notes-modal__extras'>
            <label className='notes-modal__label'>Add-ons</label>
            <div className='notes-modal__extras-grid'>
              {extras.map((extra) => {
                const active = selectedNames.has(extra.name)
                return (
                  <button
                    key={extra.name}
                    type='button'
                    className={`notes-modal__extra-chip${active ? ' notes-modal__extra-chip--active' : ''}`}
                    onClick={() => toggleExtra(extra.name)}
                  >
                    <span className='notes-modal__extra-name'>{extra.name}</span>
                    <span className='notes-modal__extra-price'>+₱{extra.price}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <label className='notes-modal__label'>Special Instructions</label>
        <textarea
          ref={inputRef}
          className='notes-modal__input'
          placeholder='e.g. less sugar, less ice, no whip…'
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className='notes-modal__total'>
          Total: <strong>₱{total}</strong>
          {selectedExtras.length > 0 && (
            <span className='notes-modal__total-breakdown'>
              &nbsp;(₱{item.price} + {selectedExtras.map((e) => `₱${e.price} ${e.name}`).join(', ')})
            </span>
          )}
        </div>

        <div className='modal-card__actions'>
          <button className='btn-outline modal-card__btn' onClick={onClose}>
            Cancel
          </button>
          <button className='btn-primary modal-card__btn' onClick={handleConfirm}>
            Add to Order
          </button>
        </div>
      </div>
    </div>
  )
}

export default NotesModal
