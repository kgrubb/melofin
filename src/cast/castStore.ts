import { create } from 'zustand'
import type {
  ActiveOutput,
  CastDevice,
  CastError,
  TransferPhase,
} from '@/src/cast/types'
import { idleTransfer, localOutput, type TransferState } from '@/src/cast/transferMachine'

type CastStore = {
  readonly devices: readonly CastDevice[]
  readonly transfer: TransferState
  readonly sheetOpen: boolean
  readonly volume: number | null
  readonly volumeSupported: boolean
  readonly lastError: CastError | null
  readonly setDevices: (devices: readonly CastDevice[]) => void
  readonly setTransfer: (transfer: TransferState) => void
  readonly setSheetOpen: (open: boolean) => void
  readonly setVolume: (volume: number | null) => void
  readonly setVolumeSupported: (supported: boolean) => void
  readonly setLastError: (error: CastError | null) => void
  readonly activeOutput: () => ActiveOutput
  readonly transferPhase: () => TransferPhase
}

export const useCastStore = create<CastStore>((set, get) => ({
  devices: [localOutput('This Phone')].map((o) => ({
    id: o.deviceId,
    name: o.name,
    kind: o.kind,
    subtitle: 'This device',
  })),
  transfer: idleTransfer('This Phone'),
  sheetOpen: false,
  volume: null,
  volumeSupported: false,
  lastError: null,
  setDevices: (devices) => set({ devices }),
  setTransfer: (transfer) => set({ transfer, lastError: transfer.error }),
  setSheetOpen: (sheetOpen) => set({ sheetOpen }),
  setVolume: (volume) => set({ volume }),
  setVolumeSupported: (volumeSupported) => set({ volumeSupported }),
  setLastError: (lastError) => set({ lastError }),
  activeOutput: () => get().transfer.active,
  transferPhase: () => get().transfer.phase,
}))
