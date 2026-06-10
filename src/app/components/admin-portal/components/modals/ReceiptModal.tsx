import React, { useRef, useState, useCallback } from 'react'
import html2canvas from 'html2canvas'

import { usePOS }                   from '../../../../context/POSContext'
import { GCASH_NAME, GCASH_NUMBER } from '../../../../config/utils/pos.types'
import logo    from '../../../../assets/logo.png'
import gcashQR from '../../../../assets/images/png/09474929000.png'

const ReceiptModal: React.FC = () => {
  const { lastReceipt, clearReceipt } = usePOS()

  const receiptRef    = useRef<HTMLDivElement>(null)
  const [copying,     setCopying]     = useState(false)
  const [copyDone,    setCopyDone]    = useState(false)
  const [downloading, setDownloading] = useState(false)

  if (!lastReceipt) return null

  const { orderNo, customer, method, isTakeout, items, total, date, time,
          cashReceived, change } = lastReceipt

  const isGCash = method === 'GCASH'
  const isCash  = method === 'CASH'

  const displayDate = (() => {
    const d = new Date(date)
    return isNaN(d.getTime()) ? date
      : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  })()

  const handleDownload = useCallback(async () => {
    if (!receiptRef.current || downloading) return
    setDownloading(true)
    try {
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: '#fffef8', scale: 2, useCORS: true, allowTaint: true, logging: false, imageTimeout: 0,
      })
      canvas.toBlob((blob) => {
        if (!blob) { setDownloading(false); return }
        const url = URL.createObjectURL(blob)
        const a   = document.createElement('a')
        a.href    = url
        a.download = `receipt-#${orderNo}.png`
        a.click()
        URL.revokeObjectURL(url)
        setDownloading(false)
      }, 'image/png')
    } catch { setDownloading(false) }
  }, [downloading, orderNo])

  const handleCopy = useCallback(async () => {
    if (!receiptRef.current || copying) return
    setCopying(true)
    try {
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: '#fffef8',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        imageTimeout: 0,
      })
      canvas.toBlob(async (blob) => {
        if (!blob) { setCopying(false); return }
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          setCopyDone(true)
          setTimeout(() => setCopyDone(false), 2500)
        } catch {
          const url = URL.createObjectURL(blob)
          const a   = document.createElement('a')
          a.href = url; a.download = `receipt-#${orderNo}.png`; a.click()
          URL.revokeObjectURL(url)
        }
        setCopying(false)
      }, 'image/png')
    } catch { setCopying(false) }
  }, [copying, orderNo])

  return (
    <div className='modal-overlay receipt-overlay' onClick={clearReceipt}>
      <div className='receipt-wrapper' onClick={(e) => e.stopPropagation()}>

        {/* Action bar */}
        <div className='receipt-actions'>
          <button className='receipt-actions__close' onClick={clearReceipt}>✕</button>
          <div className='receipt-actions__btns'>
            {/* Download PNG */}
            <button
              className='btn-outline receipt-actions__print-btn'
              onClick={handleDownload}
              disabled={downloading}
              title='Download as PNG'
            >
              {downloading
                ? <><span className='receipt-actions__spinner' style={{ borderColor: 'rgba(196,146,30,0.3)', borderTopColor: '#C4921E' }} /> Saving…</>
                : <>
                    <svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'>
                      <path d='M6.5 1v8M4 7l2.5 2.5L9 7'/><path d='M1.5 10.5v1a1 1 0 001 1h9a1 1 0 001-1v-1'/>
                    </svg>
                    Download
                  </>
              }
            </button>

            {/* Print */}
            <button className='btn-outline receipt-actions__print-btn' onClick={() => window.print()}>
              <svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'>
                <rect x='2' y='4' width='9' height='6' rx='1'/><path d='M4 4V2h5v2M4 10v2h5v-2'/><circle cx='9.5' cy='7' r='.5' fill='currentColor' stroke='none'/>
              </svg>
              Print
            </button>
            <button
              className={`btn-primary receipt-actions__copy${copyDone ? ' receipt-actions__copy--done' : ''}`}
              onClick={handleCopy} disabled={copying}
            >
              {copying  ? <><span className='receipt-actions__spinner' /> Capturing…</>
               : copyDone ? <><svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' strokeLinejoin='round'><path d='M2 7l3.5 3.5L11 4'/></svg> Copied!</>
               : <><svg width='13' height='13' viewBox='0 0 13 13' fill='none' stroke='currentColor' strokeWidth='1.4' strokeLinecap='round' strokeLinejoin='round'><rect x='4' y='4' width='8' height='8' rx='1'/><path d='M1 9V2a1 1 0 011-1h7'/></svg> Copy Image</>}
            </button>
          </div>
        </div>

        {/* Receipt paper */}
        <div className='receipt' ref={receiptRef}>

          {/* Header */}
          <div className='receipt__header'>
            <img src={logo} alt='Memento Kohi' className='receipt__logo' crossOrigin='anonymous' />
            <div className='receipt__header-address'>
              BLK 2 LOT 2, Astana Subdivision<br />
              Johndorf Communities, Calawisan<br />
              Lapu-lapu City, Cebu
            </div>
            <div className='receipt__header-datetime'>
              <span className='receipt__header-dt-label'>Date &amp; Time</span>
              <span>{displayDate} · {time}</span>
            </div>
          </div>
          <div className='receipt__tear' />

          {/* Meta */}
          <div className='receipt__meta'>
            {[
              { label: 'Order',    val: `#${orderNo}`, bold: true },
              { label: 'Customer', val: customer || '—', bold: true },
              { label: 'Payment',  val: method },
            ].map(({ label, val, bold }) => (
              <div key={label} className='receipt__meta-row'>
                <span className='receipt__meta-label'>{label}</span>
                <span className={`receipt__meta-val${bold ? ' receipt__meta-val--bold' : ''}`}>{val}</span>
              </div>
            ))}
            <div className='receipt__meta-row'>
              <span className='receipt__meta-label'>Type</span>
              <span className={`receipt__type-badge ${isTakeout ? 'receipt__type-badge--takeout' : 'receipt__type-badge--dinein'}`}>
                {isTakeout ? 'Takeout' : 'Dine-in'}
              </span>
            </div>
          </div>
          <div className='receipt__tear' />

          {/* Items */}
          <div className='receipt__items'>
            {items.map((item, i) => (
              <React.Fragment key={i}>
                <div className='receipt__item'>
                  <div className='receipt__item-left'>
                    <span className='receipt__item-qty'>{item.qty}×</span>
                    <span className='receipt__item-name'>{item.name}</span>
                    <span className='receipt__item-size'>{item.size}</span>
                  </div>
                  <span className='receipt__item-price'>₱{(item.price * item.qty).toFixed(2)}</span>
                </div>
                {(item.addOns ?? []).map((ao, j) => (
                  <div key={j} className='receipt__addon'>
                    <span className='receipt__addon-tree'>└</span>
                    <span className='receipt__addon-name'>+ {ao.name}</span>
                    <span className='receipt__addon-price'>₱{(ao.price * item.qty).toFixed(2)}</span>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
          <div className='receipt__tear' />

          {/* Totals */}
          <div className='receipt__totals'>
            <div className='receipt__total-row receipt__total-row--grand'>
              <span>Total</span>
              <span>₱{total.toFixed(2)}</span>
            </div>

            {isCash && (
              <>
                {cashReceived !== undefined && (
                  <div className='receipt__total-row'>
                    <span>Cash</span><span>₱{cashReceived.toFixed(2)}</span>
                  </div>
                )}
                {change !== undefined && change > 0 && (
                  <div className='receipt__total-row receipt__total-row--change'>
                    <span>Change</span><span>₱{change.toFixed(2)}</span>
                  </div>
                )}
              </>
            )}

            {/* GCash: hardcoded name → QR (static asset) → hardcoded number */}
            {isGCash && (
              <div className='receipt__gcash'>
                <div className='receipt__gcash-label'>Pay via GCash</div>
                <div className='receipt__gcash-name'>{GCASH_NAME}</div>
                {/* Wrapper div enforces a strict square box.
                    html2canvas captures divs reliably; object-fit on <img> is not. */}
                <div className='receipt__gcash-qr-box'>
                  <img
                    src={gcashQR}
                    alt='GCash QR'
                    className='receipt__gcash-qr'
                    crossOrigin='anonymous'
                  />
                </div>
                <div className='receipt__gcash-number'>{GCASH_NUMBER}</div>
              </div>
            )}
          </div>
          <div className='receipt__tear' />

          {/* Footer */}
          <div className='receipt__footer'>
            <p>Thank you for your order!</p>
            <p className='receipt__footer-sub'>We'll see you next time.</p>
            <div className='receipt__logo-text'>— Memento Kohi —</div>
          </div>

        </div>

      </div>
    </div>
  )
}

export default ReceiptModal
