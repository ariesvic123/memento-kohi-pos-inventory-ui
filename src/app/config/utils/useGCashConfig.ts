import { useState, useCallback } from 'react'
import { GCashConfig } from './pos.types'

const KEY      = 'memento_gcash_qr_v3'

// Wipe any legacy keys from previous iterations
;['memento_gcash_config', 'memento_gcash_wiped_v2'].forEach((k) => localStorage.removeItem(k))

const read = (): GCashConfig | null => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const cfg = JSON.parse(raw) as GCashConfig
    return cfg.qrImage ? cfg : null
  } catch { return null }
}

export const useGCashConfig = () => {
  const [config, setConfig] = useState<GCashConfig | null>(() => read())

  const save = useCallback((qrImage: string) => {
    if (!qrImage) return
    const cfg: GCashConfig = { qrImage }
    localStorage.setItem(KEY, JSON.stringify(cfg))
    setConfig(cfg)
  }, [])

  const clear = useCallback(() => {
    localStorage.removeItem(KEY)
    setConfig(null)
  }, [])

  return { config, save, clear }
}
