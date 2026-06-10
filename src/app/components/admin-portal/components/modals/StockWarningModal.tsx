import React from 'react'

import { usePOS } from '../../../../context/POSContext'

const StockWarningModal: React.FC = () => {
  const { stockWarning, clearStockWarning } = usePOS()

  if (!stockWarning.length) return null

  return (
    <div className='modal-overlay' onClick={clearStockWarning}>
      <div className='modal-card stock-warning-modal' onClick={(e) => e.stopPropagation()}>
        <div className='stock-warning-modal__icon'>
          <svg width='36' height='36' viewBox='0 0 36 36' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round' style={{color:'#8B2020'}}>
            <path d='M18 4L3 31h30L18 4z'/>
            <path d='M18 15v8M18 26v1'/>
          </svg>
        </div>
        <h3 className='stock-warning-modal__title'>Insufficient Stock</h3>
        <p className='stock-warning-modal__body'>
          This order cannot proceed — the following ingredient{stockWarning.length > 1 ? 's' : ''} will run out:
        </p>
        <ul className='stock-warning-modal__list'>
          {stockWarning.map((name) => (
            <li key={name} className='stock-warning-modal__item'>{name}</li>
          ))}
        </ul>
        <p className='stock-warning-modal__hint'>
          Restock the ingredient{stockWarning.length > 1 ? 's' : ''} or remove the item from the cart before proceeding.
        </p>
        <div className='modal-card__actions'>
          <button className='btn-primary modal-card__btn' onClick={clearStockWarning}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export default StockWarningModal
