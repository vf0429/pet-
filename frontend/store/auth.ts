'use client'

import { useState } from 'react'
import { create } from 'zustand'
import {
  login as apiLogin,
  getMe,
  switchBusiness as apiSwitchBusiness,
  BusinessType,
  LoginStatus,
  LoginResponseDTO,
  toUserVM,
  toTenantVM,
  setSessionCookie,
  clearSessionCookie,
  getSessionIdFromCookie,
  ApiError,
} from '@/lib/api'

interface User {
  id: number
  name: string
  email: string
  role: 'owner' | 'manager' | 'staff' | 'doctor' | 'frontdesk'
  canSwitch: boolean
  activeBusinessType: BusinessType
}

interface Tenant {
  id: number
  name: string
  type: 'shop' | 'clinic' | 'both'
  status: 'active' | 'suspended'
}

interface AuthStoreState {
  sessionId: string | null
  expiresAt: string | null
  user: User | null
  tenant: Tenant | null
  isAuthenticated: boolean
  isBootstrapping: boolean
  loginStatus: LoginStatus

  // Actions
  setSession: (payload: LoginResponseDTO) => void
  clearSession: () => void
  hydrateFromCookie: () => Promise<void>
  fetchMe: (businessType: BusinessType) => Promise<void>
  switchBusiness: (target: BusinessType) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  setLoginStatus: (status: LoginStatus) => void
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  sessionId: null,
  expiresAt: null,
  user: null,
  tenant: null,
  isAuthenticated: false,
  isBootstrapping: true,
  loginStatus: 'idle',

  setSession: (payload) => {
    const { session_id, expires_at, user, tenant } = payload

    // Store in cookie for middleware
    setSessionCookie(session_id, expires_at)

    set({
      sessionId: session_id,
      expiresAt: expires_at,
      user: toUserVM(user),
      tenant: toTenantVM(tenant),
      isAuthenticated: true,
      loginStatus: 'success',
      isBootstrapping: false,
    })
  },

  clearSession: () => {
    clearSessionCookie()
    set({
      sessionId: null,
      expiresAt: null,
      user: null,
      tenant: null,
      isAuthenticated: false,
      loginStatus: 'idle',
      isBootstrapping: false,
    })
  },

  hydrateFromCookie: async () => {
    const sessionId = get().sessionId || getSessionIdFromCookie()
    if (!sessionId) {
      set({ isBootstrapping: false })
      return
    }

    if (!get().sessionId) {
      set({ sessionId })
    }

    // We need business type to fetch /me
    // Default to active_business_type from store if available
    const user = get().user
    const businessType = user?.activeBusinessType || 'shop'

    try {
      await get().fetchMe(businessType)
    } catch {
      // Session invalid/expired
      get().clearSession()
    }
  },

  fetchMe: async (businessType: BusinessType) => {
    try {
      const response = await getMe(businessType)
      set({
        sessionId: response.session_id,
        expiresAt: response.expires_at,
        user: toUserVM(response.user),
        tenant: toTenantVM(response.tenant),
        isAuthenticated: true,
        isBootstrapping: false,
      })
    } catch (error) {
      if (error instanceof ApiError) {
        if (
          error.code === 'session_missing' ||
          error.code === 'session_expired'
        ) {
          get().clearSession()
        }
      }
      throw error
    }
  },

  switchBusiness: async (target: BusinessType) => {
    const response = await apiSwitchBusiness(target)
    const user = get().user
    if (user) {
      set({
        user: {
          ...user,
          activeBusinessType: response.active_business_type,
        },
      })
    }
  },

  login: async (email: string, password: string) => {
    set({ loginStatus: 'submitting' })
    try {
      const response = await apiLogin(email, password)
      get().setSession(response)
    } catch (error) {
      if (error instanceof ApiError) {
        switch (error.code) {
          case 'invalid_credentials':
            set({ loginStatus: 'error_invalid_credentials' })
            return
          case 'account_suspended':
            set({ loginStatus: 'error_account_suspended' })
            return
        }
      }
      set({ loginStatus: 'error_network' })
    }
  },

  setLoginStatus: (status: LoginStatus) => {
    set({ loginStatus: status })
  },
}))

// Hook for using auth state
export function useAuth() {
  const sessionId = useAuthStore((state) => state.sessionId)
  const user = useAuthStore((state) => state.user)
  const tenant = useAuthStore((state) => state.tenant)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  return {
    sessionId,
    user,
    tenant,
    activeBusinessType: user?.activeBusinessType || null,
    canSwitch: user?.canSwitch || false,
    isAuthenticated,
  }
}

// Hook for switching business
export function useSwitchBusiness() {
  const switchBusiness = useAuthStore((state) => state.switchBusiness)
  const user = useAuthStore((state) => state.user)
  const [isSwitching, setIsSwitching] = useState(false)

  const handleSwitch = async (target: BusinessType) => {
    if (isSwitching || !user) return
    if (user.activeBusinessType === target) return

    setIsSwitching(true)
    try {
      await switchBusiness(target)
    } finally {
      setIsSwitching(false)
    }
  }

  return {
    switchBusiness: handleSwitch,
    isSwitching,
  }
}
