import { create } from 'zustand'
import type { VaccinationBookingStatus, VaccinationSlot } from '../lib/vaccination-api'

type VaccinationStore = {
  selectedDate: string
  selectedSlot: VaccinationSlot | null
  availabilityByDate: Record<string, VaccinationSlot[]>
  currentBookingId: string | null
  currentStatus: VaccinationBookingStatus | null
  submitState: 'idle' | 'submitting' | 'success' | 'error'
  error: string | null

  setSelectedDate: (date: string) => void
  setSelectedSlot: (slot: VaccinationSlot | null) => void
  setAvailability: (date: string, slots: VaccinationSlot[]) => void
  setCurrentBooking: (id: string, status: VaccinationBookingStatus) => void
  setSubmitState: (state: VaccinationStore['submitState'], error?: string) => void
  reset: () => void
}

export const useVaccinationStore = create<VaccinationStore>((set) => ({
  selectedDate: '',
  selectedSlot: null,
  availabilityByDate: {},
  currentBookingId: null,
  currentStatus: null,
  submitState: 'idle',
  error: null,

  setSelectedDate: (date) => set({ selectedDate: date }),
  setSelectedSlot: (slot) => set({ selectedSlot: slot }),
  setAvailability: (date, slots) =>
    set((s) => ({ availabilityByDate: { ...s.availabilityByDate, [date]: slots } })),
  setCurrentBooking: (id, status) => set({ currentBookingId: id, currentStatus: status }),
  setSubmitState: (submitState, error) => set({ submitState, error: error ?? null }),
  reset: () => set({
    selectedDate: '', selectedSlot: null, currentBookingId: null,
    currentStatus: null, submitState: 'idle', error: null, availabilityByDate: {},
  }),
}))
