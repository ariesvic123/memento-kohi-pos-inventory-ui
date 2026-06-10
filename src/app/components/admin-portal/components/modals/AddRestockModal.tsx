import React, { useEffect, useState } from 'react'

import { usePOS }               from '../../../../context/POSContext'
import { RestockEntry }         from '../../../../config/utils/pos.types'
import { dateStrToExcelSerial } from '../../../../config/utils/pos.helpers'

const UNITS = ['g', 'ml', 'kg', 'L', 'pcs', 'pack', 'box']
const NEW_SENTINEL = '__new__'

const today = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Convert an Excel date serial to a YYYY-MM-DD string for <input type="date">
const serialToInputDate = (serial: number): string => {
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const blankForm = () => ({
  Item:            '',
  'Volume/Weight': 0,
  unit:            'g',
  QTY:             1,
  Price:           0,
  Total:           0,
  Method:          'CASH' as 'CASH' | 'GCASH',
  Supplier:        '',
  dateStr:         today(),
})

type FormState = ReturnType<typeof blankForm>

const entryToForm = (entry: RestockEntry): FormState => ({
  Item:            entry.Item,
  'Volume/Weight': entry['Volume/Weight'],
  unit:            entry.unit,
  QTY:             entry.QTY,
  Price:           entry.Price,
  Total:           entry.Total,
  Method:          entry.Method,
  Supplier:        entry.Supplier,
  dateStr:         serialToInputDate(entry.Date),
})

// ── ComboSelect ──────────────────────────────────────────────────────────────
interface ComboSelectProps {
  options:     string[]
  value:       string
  onChange:    (val: string) => void
  placeholder: string
  newLabel:    string
  disabled?:   boolean
}

const ComboSelect: React.FC<ComboSelectProps> = ({ options, value, onChange, placeholder, newLabel, disabled }) => {
  const [isNew, setIsNew] = useState(false)

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === NEW_SENTINEL) {
      setIsNew(true)
      onChange('')
    } else {
      onChange(e.target.value)
    }
  }

  const handleBack = () => {
    setIsNew(false)
    onChange('')
  }

  if (isNew) {
    return (
      <div className='combo-select__new'>
        <input
          type='text'
          className='sheets-form__input'
          placeholder={`Type new ${newLabel.toLowerCase()}…`}
          value={value}
          autoFocus
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type='button' className='combo-select__back' onClick={handleBack} title='Back to list'>
          ←
        </button>
      </div>
    )
  }

  return (
    <select
      className='sheets-form__input'
      value={value || ''}
      disabled={disabled}
      onChange={handleSelect}
    >
      <option value=''>{placeholder}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
      {options.length > 0 && <option disabled>──────────</option>}
      <option value={NEW_SENTINEL}>+ {newLabel}</option>
    </select>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────
interface Props {
  isOpen:      boolean
  onClose:     () => void
  editEntry?:  RestockEntry   // when provided: edit mode
  editIndex?:  number         // index in restockRows to update
}

const AddRestockModal: React.FC<Props> = ({ isOpen, onClose, editEntry, editIndex }) => {
  const { inventory, restockRows, addRestock, updateRestockEntry } = usePOS()
  const [form,     setForm]     = useState<FormState>(blankForm())
  const [error,    setError]    = useState('')
  const [resetKey, setResetKey] = useState(0)

  const isEdit = editEntry !== undefined && editIndex !== undefined

  // Sync form when edit entry changes (modal opened in edit mode)
  useEffect(() => {
    if (isOpen && editEntry) {
      setForm(entryToForm(editEntry))
      setError('')
      setResetKey((k) => k + 1)
    }
    if (isOpen && !editEntry) {
      setForm(blankForm())
      setError('')
      setResetKey((k) => k + 1)
    }
  }, [isOpen, editEntry])

  const existingSuppliers = Array.from(
    new Set(restockRows.map((r) => r.Supplier).filter(Boolean))
  )

  const set = (k: string, v: unknown) => {
    setForm((prev) => {
      const next = { ...prev, [k]: v }
      next.Total = next.Price * next.QTY
      return next
    })
  }

  const reset = () => {
    setForm(blankForm())
    setError('')
    setResetKey((k) => k + 1)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = () => {
    if (!form.Item.trim())          { setError('Item name is required.');      return }
    if (form['Volume/Weight'] <= 0) { setError('Volume/Weight must be > 0.');  return }
    if (form.QTY <= 0)              { setError('QTY must be > 0.');            return }
    if (form.Price <= 0)            { setError('Price must be > 0.');          return }
    if (!form.dateStr)              { setError('Date is required.');            return }
    setError('')

    const payload = { ...form, Total: form.Price * form.QTY }

    if (isEdit) {
      const entry: RestockEntry = {
        Item:            payload.Item,
        'Volume/Weight': payload['Volume/Weight'],
        unit:            payload.unit,
        QTY:             payload.QTY,
        Price:           payload.Price,
        Total:           payload.Total,
        Method:          payload.Method,
        Supplier:        payload.Supplier,
        Date:            dateStrToExcelSerial(payload.dateStr),
      }
      updateRestockEntry(editIndex!, entry)
    } else {
      addRestock(payload)
    }

    reset()
    onClose()
  }

  if (!isOpen) return null

  const costPreview = form.Price > 0 && form.QTY > 0
    ? (form.Price * form.QTY).toFixed(2)
    : null

  return (
    <div className='modal-overlay' onClick={handleClose}>
      <div
        className='modal-card restock-modal'
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && handleClose()}
      >
        <h3 className='restock-modal__title'>
          {isEdit ? `Edit Restock — ${editEntry!.Item}` : 'Add Restock'}
        </h3>

        <div className='sheets-form__grid'>
          <label className='sheets-form__label'>
            Item
            <ComboSelect
              key={`item-${resetKey}`}
              options={inventory.map((inv) => inv.INGREDIENTS)}
              value={form.Item}
              onChange={(v) => set('Item', v)}
              placeholder='— select ingredient —'
              newLabel='New Item'
              disabled={isEdit}
            />
          </label>

          <label className='sheets-form__label'>
            Volume / Weight
            <input
              type='number' min={0}
              className='sheets-form__input'
              value={form['Volume/Weight'] || ''}
              onChange={(e) => set('Volume/Weight', parseFloat(e.target.value) || 0)}
            />
          </label>

          <label className='sheets-form__label'>
            Unit
            <select className='sheets-form__input' value={form.unit} onChange={(e) => set('unit', e.target.value)}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>

          <label className='sheets-form__label'>
            QTY
            <input
              type='number' min={1}
              className='sheets-form__input'
              value={form.QTY || ''}
              onChange={(e) => set('QTY', parseFloat(e.target.value) || 0)}
            />
          </label>

          <label className='sheets-form__label'>
            Price <span className='restock-modal__label-sub'>(per unit)</span>
            <input
              type='number' min={0}
              className='sheets-form__input'
              value={form.Price || ''}
              onChange={(e) => set('Price', parseFloat(e.target.value) || 0)}
            />
          </label>

          <label className='sheets-form__label'>
            Method
            <select className='sheets-form__input' value={form.Method} onChange={(e) => set('Method', e.target.value)}>
              <option value='CASH'>CASH</option>
              <option value='GCASH'>GCASH</option>
            </select>
          </label>

          <label className='sheets-form__label'>
            Supplier
            <ComboSelect
              key={`supplier-${resetKey}`}
              options={existingSuppliers}
              value={form.Supplier}
              onChange={(v) => set('Supplier', v)}
              placeholder='— select supplier —'
              newLabel='New Supplier'
            />
          </label>

          <label className='sheets-form__label'>
            Date
            <input
              type='date'
              className='sheets-form__input'
              value={form.dateStr}
              onChange={(e) => set('dateStr', e.target.value)}
            />
          </label>
        </div>

        {costPreview && (
          <div className='restock-modal__cost-preview'>
            Cost preview: <strong>₱{costPreview}</strong>
            <span className='restock-modal__cost-preview-detail'>
              &nbsp;(₱{form.Price} × {form.QTY})
            </span>
          </div>
        )}

        {isEdit && (
          <p className='restock-modal__edit-note'>
            Editing updates ingredient prices and drink costs across the app. Inventory stock levels are not retroactively adjusted.
          </p>
        )}

        {error && <p className='sheets-form__error restock-modal__error'>{error}</p>}

        <div className='modal-card__actions'>
          <button className='btn-outline modal-card__btn' onClick={handleClose}>Cancel</button>
          <button className='btn-primary modal-card__btn' onClick={handleSubmit}>
            {isEdit ? 'Update Restock' : 'Save Restock'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddRestockModal
