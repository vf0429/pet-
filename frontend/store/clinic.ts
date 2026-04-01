'use client'

import { create } from 'zustand'
import {
  getClinicStats,
  getClinicAppointments,
  updateAppointmentStatus,
  getClinicVisit,
  updateClinicVisit,
  pushVisitToApp,
  getClinicFollowups,
  updateFollowupStatus,
  getClinicPharmacy,
  dispensePharmacyItem,
  uploadVisitFile,
  getInsuranceCoveragePreview,
  getInsuranceClaims,
  createInsuranceClaim,
  uploadInsuranceClaimFile,
  listClinicClients,
  getClinicClientDetail,
  listClinicPatients,
  getClinicPatientDetail,
  listClinicReminders,
  fulfillClinicReminder,
  ClinicStatsVM,
  ClinicAppointmentVM,
  ClinicVisitVM,
  ClinicFollowupVM,
  PharmacyItemVM,
  VisitFileVM,
  AppointmentStatus,
  VisitStatus,
  FollowupStatus,
  UpdateClinicVisitParams,
  GetClinicAppointmentsParams,
  GetClinicFollowupsParams,
  GetClinicPharmacyParams,
  UpdateAppointmentStatusParams,
  MatrixDoctorVM,
  InsuranceCoveragePreviewVM,
  InsuranceClaimVM,
  InsuranceClaimStatus,
  CreateInsuranceClaimParams,
  ClinicClientVM,
  ClinicClientDetailVM,
  ClinicPatientListVM,
  ClinicPatientDetailVM,
  HealthReminderVM,
  ReminderTabCounts,
  ReminderStatus,
  ListClinicClientsParams,
  ListClinicPatientsParams,
  ListRemindersParams,
  ApiError,
} from '@/lib/api'

// ----- Clinic Dashboard Store -----

interface ClinicDashboardState {
  stats: ClinicStatsVM | null
  isLoadingStats: boolean
  statsError: string | null

  fetchStats: () => Promise<void>
  fetchDashboardData: () => Promise<void>
  clearDashboard: () => void
}

export const useClinicDashboardStore = create<ClinicDashboardState>((set, get) => ({
  stats: null,
  isLoadingStats: false,
  statsError: null,

  fetchStats: async () => {
    set({ isLoadingStats: true, statsError: null })
    try {
      const stats = await getClinicStats()
      set({ stats, isLoadingStats: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load clinic stats'
      set({ statsError: message, isLoadingStats: false })
    }
  },

  fetchDashboardData: async () => {
    await get().fetchStats()
  },

  clearDashboard: () => {
    set({ stats: null, statsError: null })
  },
}))

// ----- Clinic Appointments Store -----

interface ClinicAppointmentsState {
  appointments: ClinicAppointmentVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
  filters: {
    status: string
    date: string
    q: string
    doctorId: number | null
  }
  view: 'list' | 'matrix'
  matrixData: {
    date: string
    timeSlots: string[]
    doctors: MatrixDoctorVM[]
  } | null
  isLoading: boolean
  error: string | null
  isUpdatingStatus: boolean
  statusUpdateError: string | null

  fetchAppointments: (params?: GetClinicAppointmentsParams) => Promise<void>
  updateStatus: (id: number, params: UpdateAppointmentStatusParams) => Promise<{ visitId: number | null }>
  setView: (view: 'list' | 'matrix') => void
  setFilters: (filters: Partial<ClinicAppointmentsState['filters']>) => void
  setPage: (page: number) => void
  clearAppointments: () => void
}

export const useClinicAppointmentsStore = create<ClinicAppointmentsState>((set, get) => ({
  appointments: [],
  total: 0,
  page: 1,
  perPage: 20,
  hasMore: false,
  filters: {
    status: '',
    date: new Date().toISOString().split('T')[0],
    q: '',
    doctorId: null,
  },
  view: 'list',
  matrixData: null,
  isLoading: false,
  error: null,
  isUpdatingStatus: false,
  statusUpdateError: null,

  fetchAppointments: async (params?: GetClinicAppointmentsParams) => {
    const currentFilters = get().filters
    const currentView = get().view
    set({ isLoading: true, error: null })

    try {
      const data = await getClinicAppointments({
        view: params?.view ?? currentView,
        status: (currentFilters.status as AppointmentStatus) || undefined,
        date: params?.date ?? currentFilters.date,
        q: params?.q ?? (currentFilters.q || undefined),
        doctorId: currentFilters.doctorId ?? undefined,
        page: params?.page ?? get().page,
        perPage: params?.perPage ?? get().perPage,
      })

      if (data.view === 'list') {
        set({
          appointments: data.appointments.map((a) => ({
            id: a.id,
            patientId: a.patient_id ?? null,
            petName: a.pet_name,
            petOwnerName: a.pet_owner_name,
            petOwnerPhone: a.pet_owner_phone,
            visitType: a.visit_type,
            doctorId: a.doctor_id,
            doctorName: a.doctor_name,
            scheduledAt: a.scheduled_at,
            status: a.status,
            cancelReason: a.cancel_reason,
            notes: a.notes,
            createdAt: a.created_at,
            updatedAt: a.updated_at,
          })),
          total: data.total,
          page: data.page,
          perPage: data.per_page,
          hasMore: data.has_more,
          matrixData: null,
          isLoading: false,
        })
      } else {
        set({
          appointments: [],
          matrixData: {
            date: data.date,
            timeSlots: data.time_slots,
            doctors: data.doctors.map((d) => ({
              doctorId: d.doctor_id,
              doctorName: d.doctor_name,
              slots: d.slots.map((s) => ({
                time: s.time,
                appointmentId: s.appointment_id,
                petName: s.pet_name,
                visitType: s.visit_type,
                status: s.status,
                durationMinutes: s.duration_minutes,
              })),
            })),
          },
          isLoading: false,
        })
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load appointments'
      set({ error: message, isLoading: false })
    }
  },

  updateStatus: async (id: number, params: UpdateAppointmentStatusParams) => {
    set({ isUpdatingStatus: true, statusUpdateError: null })
    try {
      const result = await updateAppointmentStatus(id, params)
      await get().fetchAppointments()
      set({ isUpdatingStatus: false })
      return { visitId: result.visit_id }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update appointment status'
      set({ statusUpdateError: message, isUpdatingStatus: false })
      throw error
    }
  },

  setView: (view) => {
    set({ view })
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      page: 1,
    }))
  },

  setPage: (page) => {
    set({ page })
  },

  clearAppointments: () => {
    set({ appointments: [], total: 0, page: 1, hasMore: false, error: null, matrixData: null })
  },
}))

// ----- Clinic Visit Store -----

interface ClinicVisitState {
  visit: ClinicVisitVM | null
  isLoading: boolean
  error: string | null
  isSaving: boolean
  saveError: string | null
  isPushing: boolean
  pushError: string | null
  isUploadingFile: boolean
  uploadError: string | null

  fetchVisit: (id: number) => Promise<void>
  saveVisit: (id: number, data: UpdateClinicVisitParams) => Promise<void>
  pushToApp: (id: number) => Promise<void>
  uploadFile: (visitId: number, file: File) => Promise<VisitFileVM>
  clearVisit: () => void
}

export const useClinicVisitStore = create<ClinicVisitState>((set, get) => ({
  visit: null,
  isLoading: false,
  error: null,
  isSaving: false,
  saveError: null,
  isPushing: false,
  pushError: null,
  isUploadingFile: false,
  uploadError: null,

  fetchVisit: async (id: number) => {
    set({ isLoading: true, error: null })
    try {
      const visit = await getClinicVisit(id)
      set({ visit, isLoading: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load visit'
      set({ error: message, isLoading: false })
    }
  },

  saveVisit: async (id: number, data: UpdateClinicVisitParams) => {
    set({ isSaving: true, saveError: null })
    try {
      await updateClinicVisit(id, data)
      await get().fetchVisit(id)
      set({ isSaving: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to save visit'
      set({ saveError: message, isSaving: false })
      throw error
    }
  },

  pushToApp: async (id: number) => {
    set({ isPushing: true, pushError: null })
    try {
      await pushVisitToApp(id)
      await get().fetchVisit(id)
      set({ isPushing: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to push visit to App'
      set({ pushError: message, isPushing: false })
      throw error
    }
  },

  uploadFile: async (visitId: number, file: File) => {
    set({ isUploadingFile: true, uploadError: null })
    try {
      const fileVM = await uploadVisitFile(visitId, file)
      // Refresh visit to get updated files list
      await get().fetchVisit(visitId)
      set({ isUploadingFile: false })
      return fileVM
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to upload file'
      set({ uploadError: message, isUploadingFile: false })
      throw error
    }
  },

  clearVisit: () => {
    set({ visit: null, error: null, saveError: null, pushError: null, uploadError: null })
  },
}))

// ----- Clinic Followups Store -----

interface ClinicFollowupsState {
  followups: ClinicFollowupVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
  activeTab: 'all' | FollowupStatus | 'overdue'
  isLoading: boolean
  error: string | null
  isUpdating: boolean
  updateError: string | null

  fetchFollowups: (params?: GetClinicFollowupsParams) => Promise<void>
  updateStatus: (id: number, targetStatus: 'done' | 'skipped', resultNote?: string) => Promise<void>
  setActiveTab: (tab: ClinicFollowupsState['activeTab']) => void
  setPage: (page: number) => void
  clearFollowups: () => void
}

export const useClinicFollowupsStore = create<ClinicFollowupsState>((set, get) => ({
  followups: [],
  total: 0,
  page: 1,
  perPage: 20,
  hasMore: false,
  activeTab: 'all',
  isLoading: false,
  error: null,
  isUpdating: false,
  updateError: null,

  fetchFollowups: async (params?: GetClinicFollowupsParams) => {
    const activeTab = get().activeTab
    set({ isLoading: true, error: null })
    try {
      const statusParam = activeTab === 'all' ? undefined : activeTab as FollowupStatus | 'overdue'
      const data = await getClinicFollowups({
        status: params?.status ?? statusParam,
        page: params?.page ?? get().page,
        perPage: params?.perPage ?? get().perPage,
      })
      set({
        followups: data.followups,
        total: data.total,
        page: data.page,
        perPage: data.perPage,
        hasMore: data.hasMore,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load followups'
      set({ error: message, isLoading: false })
    }
  },

  updateStatus: async (id: number, targetStatus: 'done' | 'skipped', resultNote?: string) => {
    set({ isUpdating: true, updateError: null })
    try {
      await updateFollowupStatus(id, targetStatus, resultNote)
      await get().fetchFollowups()
      set({ isUpdating: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update followup status'
      set({ updateError: message, isUpdating: false })
      throw error
    }
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab, page: 1 })
  },

  setPage: (page) => {
    set({ page })
  },

  clearFollowups: () => {
    set({ followups: [], total: 0, page: 1, hasMore: false, error: null })
  },
}))

// ----- Clinic Pharmacy Store -----

interface ClinicPharmacyState {
  items: PharmacyItemVM[]
  total: number
  page: number
  perPage: number
  filters: {
    search: string
    isPrescriptionOnly: boolean | null
    expiryFilter: 'expiring_soon' | 'expired' | ''
  }
  isLoading: boolean
  error: string | null
  isDispensing: boolean
  dispenseError: string | null

  fetchPharmacy: (params?: GetClinicPharmacyParams) => Promise<void>
  dispense: (id: number, quantity: number, prescriptionId?: number, note?: string) => Promise<void>
  setFilters: (filters: Partial<ClinicPharmacyState['filters']>) => void
  setPage: (page: number) => void
  clearDispenseError: () => void
  clearPharmacy: () => void
}

export const useClinicPharmacyStore = create<ClinicPharmacyState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  perPage: 20,
  filters: {
    search: '',
    isPrescriptionOnly: null,
    expiryFilter: '',
  },
  isLoading: false,
  error: null,
  isDispensing: false,
  dispenseError: null,

  fetchPharmacy: async (params?: GetClinicPharmacyParams) => {
    const currentFilters = get().filters
    set({ isLoading: true, error: null })
    try {
      const data = await getClinicPharmacy({
        search: params?.search ?? (currentFilters.search || undefined),
        isPrescriptionOnly: params?.isPrescriptionOnly ?? (currentFilters.isPrescriptionOnly ?? undefined),
        expiryFilter: params?.expiryFilter ?? (currentFilters.expiryFilter || undefined),
        page: params?.page ?? get().page,
        perPage: params?.perPage ?? get().perPage,
      })
      set({
        items: data.items,
        total: data.total,
        page: data.page,
        perPage: data.perPage,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load pharmacy items'
      set({ error: message, isLoading: false })
    }
  },

  dispense: async (id: number, quantity: number, prescriptionId?: number, note?: string) => {
    set({ isDispensing: true, dispenseError: null })
    try {
      await dispensePharmacyItem(id, quantity, prescriptionId, note)
      await get().fetchPharmacy()
      set({ isDispensing: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to dispense pharmacy item'
      set({ dispenseError: message, isDispensing: false })
      throw error
    }
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      page: 1,
    }))
  },

  setPage: (page) => {
    set({ page })
  },

  clearDispenseError: () => {
    set({ dispenseError: null })
  },

  clearPharmacy: () => {
    set({ items: [], total: 0, page: 1, error: null, dispenseError: null })
  },
}))

// ----- Clinic Insurance Store -----

interface ClinicInsuranceState {
  // Coverage preview
  coveragePreview: InsuranceCoveragePreviewVM | null
  isLoadingCoverage: boolean
  coverageError: string | null

  // Claims list
  claims: InsuranceClaimVM[]
  claimsTotal: number
  claimsPage: number
  claimsPerPage: number
  claimsHasMore: boolean
  claimsFilters: {
    status: InsuranceClaimStatus | ''
  }
  isLoadingClaims: boolean
  claimsError: string | null

  // Claim creation
  isSubmittingClaim: boolean
  submitClaimError: string | null

  // File upload
  isUploadingFiles: boolean
  uploadFileError: string | null

  // General error
  error: string | null

  fetchCoveragePreview: (visitId: number) => Promise<void>
  fetchClaims: (params?: { status?: InsuranceClaimStatus; page?: number; perPage?: number }) => Promise<void>
  submitClaim: (params: CreateInsuranceClaimParams) => Promise<{ id: number }>
  uploadFile: (claimId: number, file: File) => Promise<void>
  setClaimsFilters: (filters: Partial<ClinicInsuranceState['claimsFilters']>) => void
  setClaimsPage: (page: number) => void
  clearCoveragePreview: () => void
  clearClaims: () => void
}

export const useClinicInsuranceStore = create<ClinicInsuranceState>((set, get) => ({
  coveragePreview: null,
  isLoadingCoverage: false,
  coverageError: null,

  claims: [],
  claimsTotal: 0,
  claimsPage: 1,
  claimsPerPage: 20,
  claimsHasMore: false,
  claimsFilters: {
    status: '' as InsuranceClaimStatus | '',
  },
  isLoadingClaims: false,
  claimsError: null,

  isSubmittingClaim: false,
  submitClaimError: null,

  isUploadingFiles: false,
  uploadFileError: null,

  error: null,

  fetchCoveragePreview: async (visitId: number) => {
    set({ isLoadingCoverage: true, coverageError: null, error: null })
    try {
      const preview = await getInsuranceCoveragePreview(visitId)
      set({ coveragePreview: preview, isLoadingCoverage: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load coverage preview'
      set({ coverageError: message, isLoadingCoverage: false, error: message })
    }
  },

  fetchClaims: async (params) => {
    const filters = get().claimsFilters
    set({ isLoadingClaims: true, claimsError: null, error: null })
    try {
      const data = await getInsuranceClaims({
        status: (filters.status as InsuranceClaimStatus) || undefined,
        page: params?.page ?? get().claimsPage,
        perPage: params?.perPage ?? get().claimsPerPage,
      })
      set({
        claims: data.claims,
        claimsTotal: data.total,
        claimsPage: data.page,
        claimsPerPage: data.perPage,
        claimsHasMore: data.hasMore,
        isLoadingClaims: false,
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load insurance claims'
      set({ claimsError: message, isLoadingClaims: false, error: message })
    }
  },

  submitClaim: async (params) => {
    set({ isSubmittingClaim: true, submitClaimError: null, error: null })
    try {
      const result = await createInsuranceClaim(params)
      set({ isSubmittingClaim: false })
      // Refresh claims list
      await get().fetchClaims()
      return { id: result.id }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to submit insurance claim'
      set({ submitClaimError: message, isSubmittingClaim: false, error: message })
      throw error
    }
  },

  uploadFile: async (claimId: number, file: File) => {
    set({ isUploadingFiles: true, uploadFileError: null, error: null })
    try {
      await uploadInsuranceClaimFile(claimId, file)
      set({ isUploadingFiles: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to upload file'
      set({ uploadFileError: message, isUploadingFiles: false, error: message })
      throw error
    }
  },

  setClaimsFilters: (newFilters) => {
    set((state) => ({
      claimsFilters: { ...state.claimsFilters, ...newFilters },
      claimsPage: 1,
    }))
  },

  setClaimsPage: (page) => {
    set({ claimsPage: page })
  },

  clearCoveragePreview: () => {
    set({ coveragePreview: null, coverageError: null })
  },

  clearClaims: () => {
    set({
      claims: [],
      claimsTotal: 0,
      claimsPage: 1,
      claimsHasMore: false,
      claimsError: null,
    })
  },
}))

// ----- Clinic Clients Store -----

interface ClinicClientsState {
  clients: ClinicClientVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
  search: string
  isLoading: boolean
  error: string | null
  detail: ClinicClientDetailVM | null
  isLoadingDetail: boolean
  detailError: string | null

  fetchClients: (params?: ListClinicClientsParams) => Promise<void>
  fetchClientDetail: (id: number) => Promise<void>
  setSearch: (q: string) => void
  setPage: (page: number) => void
  clearDetail: () => void
  clearClients: () => void
}

export const useClinicClientsStore = create<ClinicClientsState>((set, get) => ({
  clients: [],
  total: 0,
  page: 1,
  perPage: 20,
  hasMore: false,
  search: '',
  isLoading: false,
  error: null,
  detail: null,
  isLoadingDetail: false,
  detailError: null,

  fetchClients: async (params?: ListClinicClientsParams) => {
    set({ isLoading: true, error: null })
    try {
      const data = await listClinicClients({
        q: params?.q ?? (get().search || undefined),
        page: params?.page ?? get().page,
        per_page: params?.per_page ?? get().perPage,
      })
      set({
        clients: data.clients,
        total: data.total,
        page: data.page,
        perPage: data.perPage,
        hasMore: data.hasMore,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load clients'
      set({ error: message, isLoading: false })
    }
  },

  fetchClientDetail: async (id: number) => {
    set({ isLoadingDetail: true, detailError: null })
    try {
      const detail = await getClinicClientDetail(id)
      set({ detail, isLoadingDetail: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load client detail'
      set({ detailError: message, isLoadingDetail: false })
    }
  },

  setSearch: (q) => {
    set({ search: q, page: 1 })
  },

  setPage: (page) => {
    set({ page })
  },

  clearDetail: () => {
    set({ detail: null, detailError: null })
  },

  clearClients: () => {
    set({ clients: [], total: 0, page: 1, hasMore: false, error: null })
  },
}))

// ----- Clinic Patients Store -----

interface ClinicPatientsState {
  patients: ClinicPatientListVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
  search: string
  clientIdFilter: number | null
  isLoading: boolean
  error: string | null
  detail: ClinicPatientDetailVM | null
  isLoadingDetail: boolean
  detailError: string | null

  fetchPatients: (params?: ListClinicPatientsParams) => Promise<void>
  fetchPatientDetail: (id: number) => Promise<void>
  setSearch: (q: string) => void
  setClientIdFilter: (clientId: number | null) => void
  setPage: (page: number) => void
  clearDetail: () => void
  clearPatients: () => void
}

export const useClinicPatientsStore = create<ClinicPatientsState>((set, get) => ({
  patients: [],
  total: 0,
  page: 1,
  perPage: 20,
  hasMore: false,
  search: '',
  clientIdFilter: null,
  isLoading: false,
  error: null,
  detail: null,
  isLoadingDetail: false,
  detailError: null,

  fetchPatients: async (params?: ListClinicPatientsParams) => {
    set({ isLoading: true, error: null })
    try {
      const data = await listClinicPatients({
        q: params?.q ?? (get().search || undefined),
        client_id: params?.client_id ?? (get().clientIdFilter ?? undefined),
        page: params?.page ?? get().page,
        per_page: params?.per_page ?? get().perPage,
      })
      set({
        patients: data.patients,
        total: data.total,
        page: data.page,
        perPage: data.perPage,
        hasMore: data.hasMore,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load patients'
      set({ error: message, isLoading: false })
    }
  },

  fetchPatientDetail: async (id: number) => {
    set({ isLoadingDetail: true, detailError: null })
    try {
      const detail = await getClinicPatientDetail(id)
      set({ detail, isLoadingDetail: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load patient detail'
      set({ detailError: message, isLoadingDetail: false })
    }
  },

  setSearch: (q) => {
    set({ search: q, page: 1 })
  },

  setClientIdFilter: (clientId) => {
    set({ clientIdFilter: clientId, page: 1 })
  },

  setPage: (page) => {
    set({ page })
  },

  clearDetail: () => {
    set({ detail: null, detailError: null })
  },

  clearPatients: () => {
    set({ patients: [], total: 0, page: 1, hasMore: false, error: null })
  },
}))

// ----- Clinic Reminders Store -----

interface ClinicRemindersState {
  reminders: HealthReminderVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
  activeTab: ReminderStatus
  counts: ReminderTabCounts
  isLoading: boolean
  error: string | null
  isFulfilling: boolean
  fulfillError: string | null

  fetchReminders: (params?: ListRemindersParams) => Promise<void>
  fulfillReminder: (id: number, fulfilledAt?: string) => Promise<void>
  setActiveTab: (tab: ReminderStatus) => void
  setPage: (page: number) => void
  clearReminders: () => void
}

export const useClinicRemindersStore = create<ClinicRemindersState>((set, get) => ({
  reminders: [],
  total: 0,
  page: 1,
  perPage: 20,
  hasMore: false,
  activeTab: 'overdue',
  counts: { overdue: 0, upcoming: 0, fulfilled: 0 },
  isLoading: false,
  error: null,
  isFulfilling: false,
  fulfillError: null,

  fetchReminders: async (params?: ListRemindersParams) => {
    set({ isLoading: true, error: null })
    try {
      const data = await listClinicReminders({
        status: params?.status ?? get().activeTab,
        page: params?.page ?? get().page,
        per_page: params?.per_page ?? get().perPage,
      })
      set({
        reminders: data.reminders,
        total: data.total,
        page: data.page,
        perPage: data.perPage,
        hasMore: data.hasMore,
        counts: data.counts,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load reminders'
      set({ error: message, isLoading: false })
    }
  },

  fulfillReminder: async (id: number, fulfilledAt?: string) => {
    set({ isFulfilling: true, fulfillError: null })
    try {
      await fulfillClinicReminder(id, fulfilledAt)
      await get().fetchReminders()
      set({ isFulfilling: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to mark reminder as done'
      set({ fulfillError: message, isFulfilling: false })
      throw error
    }
  },

  setActiveTab: (tab) => {
    set({ activeTab: tab, page: 1 })
  },

  setPage: (page) => {
    set({ page })
  },

  clearReminders: () => {
    set({ reminders: [], total: 0, page: 1, hasMore: false, error: null, fulfillError: null })
  },
}))
