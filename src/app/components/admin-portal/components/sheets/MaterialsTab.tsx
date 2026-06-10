import React, { useEffect, useState } from 'react'

interface Material {
  id:       string
  name:     string
  unit:     string
  stock:    number
  note:     string
}

const STORAGE_KEY = 'memento_materials'

const load = (): Material[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : defaultMaterials()
  } catch { return defaultMaterials() }
}

const defaultMaterials = (): Material[] => [
  { id: '1', name: 'Big Straw',  unit: 'pcs', stock: 0, note: 'For drinks with chunks (Oreo, Biscoff, etc.)' },
  { id: '2', name: 'Dome Lid',   unit: 'pcs', stock: 0, note: 'For drinks with cream toppings' },
]

const save = (materials: Material[]) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(materials))

const uid = () => Math.random().toString(36).slice(2, 9)

const MaterialsTab: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>(load)
  const [addForm,   setAddForm]   = useState(false)
  const [form,      setForm]      = useState({ name: '', unit: 'pcs', stock: 0, note: '' })
  const [adjust,    setAdjust]    = useState<Record<string, string>>({})

  useEffect(() => { save(materials) }, [materials])

  const update = (fn: (prev: Material[]) => Material[]) =>
    setMaterials((prev) => fn(prev))

  const applyAdjust = (id: string, direction: 1 | -1) => {
    const raw = parseFloat(adjust[id] || '0') || 0
    update((prev) => prev.map((m) =>
      m.id === id ? { ...m, stock: Math.max(0, m.stock + direction * raw) } : m
    ))
    setAdjust((prev) => ({ ...prev, [id]: '' }))
  }

  const handleAdd = () => {
    if (!form.name.trim()) return
    update((prev) => [...prev, { id: uid(), name: form.name.trim(), unit: form.unit, stock: form.stock, note: form.note }])
    setForm({ name: '', unit: 'pcs', stock: 0, note: '' })
    setAddForm(false)
  }

  const handleDelete = (id: string) =>
    update((prev) => prev.filter((m) => m.id !== id))

  return (
    <div className='sheets-tab'>
      <div className='sheets-tab__toolbar'>
        <h2 className='sheets-tab__title'>Materials Tracker</h2>
        <p className='sheets-tab__note'>Manual stock tracker for packaging and consumables. Saved in local storage.</p>
        <button className='btn-primary' style={{ fontSize: '0.85rem', padding: '8px 16px', marginLeft: 'auto' }} onClick={() => setAddForm(true)}>
          + Add Material
        </button>
      </div>

      {addForm && (
        <div className='sheets-form'>
          <div className='sheets-form__grid'>
            <label className='sheets-form__label'>
              Name
              <input type='text' className='sheets-form__input' value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder='e.g. Paper Cup' />
            </label>
            <label className='sheets-form__label'>
              Unit
              <input type='text' className='sheets-form__input' value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} />
            </label>
            <label className='sheets-form__label'>
              Initial Stock
              <input type='number' min={0} className='sheets-form__input' value={form.stock || ''} onChange={(e) => setForm((p) => ({ ...p, stock: parseFloat(e.target.value) || 0 }))} />
            </label>
            <label className='sheets-form__label'>
              Note
              <input type='text' className='sheets-form__input' value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder='Where it is used' />
            </label>
          </div>
          <div className='sheets-form__actions'>
            <button className='btn-outline' onClick={() => setAddForm(false)}>Cancel</button>
            <button className='btn-primary' onClick={handleAdd}>Add</button>
          </div>
        </div>
      )}

      <div className='sheets-table-wrap'>
        <table className='sheets-table'>
          <thead>
            <tr>
              <th>Material</th>
              <th>Unit</th>
              <th>Stock</th>
              <th>Adjust</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.name}</strong></td>
                <td>{m.unit}</td>
                <td>
                  <span className={`materials__stock${m.stock <= 0 ? ' materials__stock--out' : m.stock < 20 ? ' materials__stock--low' : ''}`}>
                    {m.stock}
                  </span>
                </td>
                <td>
                  <div className='materials__adjust-row'>
                    <input
                      type='number'
                      min={0}
                      className='sheets-table__cell-input'
                      value={adjust[m.id] || ''}
                      onChange={(e) => setAdjust((p) => ({ ...p, [m.id]: e.target.value }))}
                      placeholder='qty'
                    />
                    <button className='materials__adj-btn materials__adj-btn--add' onClick={() => applyAdjust(m.id, 1)}>+</button>
                    <button className='materials__adj-btn materials__adj-btn--sub' onClick={() => applyAdjust(m.id, -1)}>−</button>
                  </div>
                </td>
                <td style={{ fontSize: '0.8rem', color: '#a08070' }}>{m.note || '—'}</td>
                <td>
                  <button className='materials__del-btn' onClick={() => handleDelete(m.id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default MaterialsTab
