import React from 'react'

interface ConfirmModalProps {
  isOpen:      boolean
  title:       string
  description?: string | undefined
  confirmLabel?: string
  onClose:     () => void
  onConfirm:   () => void
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Remove',
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null

  return (
    <div className='modal-overlay'>
      <div className='modal-card'>
        <h2 className='modal-card__title'>{title}</h2>

        {description && (
          <div className='modal-card__body'>
            <p className='modal-card__description'>{description}</p>
          </div>
        )}

        <div className='modal-card__actions'>
          <button className='btn-outline modal-card__btn' onClick={onClose}>
            Cancel
          </button>
          <button className='btn-primary modal-card__btn' onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmModal
