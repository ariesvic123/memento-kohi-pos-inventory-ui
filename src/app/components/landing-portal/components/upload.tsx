import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'

import { usePOS } from '../../../context/POSContext'
import logo from '../../../assets/logo.png'
import '../styles/upload.scss'

const Upload: React.FC = () => {
  const { initializeStore } = usePOS()
  const navigate            = useNavigate()
  const fileInputRef        = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string>('')
  const [error,    setError]    = useState<string>('')
  const [ready,    setReady]    = useState(false)
  const [wb,       setWb]       = useState<XLSX.WorkBook | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const parsed = XLSX.read(evt.target?.result as string, { type: 'binary', cellStyles: true, cellFormula: true })
        setWb(parsed)
        setReady(true)
      } catch {
        setError('Could not read file. Make sure it is a valid .xlsx file.')
        setReady(false)
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleInitialize = () => {
    if (!wb) { setError('Please upload your POS file first.'); return }
    initializeStore(wb)
    navigate('/pos/terminal')
  }

  return (
    <div className='upload__wrapper'>
      <div className='upload__card'>
        <img src={logo} alt='Memento Kohi' className='upload__logo' />
        <p className='upload__subtitle'>Upload your POS Excel file to begin</p>

        <div
          className='upload__dropzone'
          onClick={() => fileInputRef.current?.click()}
        >
          <span className='upload__dropzone-icon'>📂</span>
          <span className='upload__dropzone-label'>
            {fileName || 'Click to select .xlsx file'}
          </span>
          <input
            ref={fileInputRef}
            type='file'
            accept='.xlsx,.xls'
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        {error && <p className='upload__error'>{error}</p>}

        <button
          className={`upload__btn${ready ? ' upload__btn--ready' : ''}`}
          onClick={handleInitialize}
          disabled={!ready}
        >
          INITIALIZE SYSTEM
        </button>
      </div>
    </div>
  )
}

export default Upload
