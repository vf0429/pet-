'use client'

import { create } from 'zustand'
import {
  getShopStats,
  getShopOrders,
  getShopOrderDetail,
  updateOrderStatus,
  getShopProducts,
  getInventoryAlerts,
  toShopProductVM,
  ShopStatsVM,
  ShopOrderVM,
  ShopOrdersResponseVM,
  ShopProductVM,
  InventoryAlertVM,
  ShopOrderStatus,
  ShopOrderStatusAction,
  UpdateOrderStatusParams,
  GetShopOrdersParams,
  GetShopProductsParams,
  ApiError,
} from '@/lib/api'

// ----- Dashboard Store -----

interface ShopDashboardState {
  stats: ShopStatsVM | null
  recentOrders: ShopOrderVM[]
  inventoryAlerts: InventoryAlertVM[]
  isLoadingStats: boolean
  isLoadingRecentOrders: boolean
  isLoadingAlerts: boolean
  statsError: string | null
  recentOrdersError: string | null
  alertsError: string | null

  fetchStats: () => Promise<void>
  fetchRecentOrders: () => Promise<void>
  fetchInventoryAlerts: () => Promise<void>
  fetchDashboardData: () => Promise<void>
  clearDashboard: () => void
}

export const useShopDashboardStore = create<ShopDashboardState>((set, get) => ({
  stats: null,
  recentOrders: [],
  inventoryAlerts: [],
  isLoadingStats: false,
  isLoadingRecentOrders: false,
  isLoadingAlerts: false,
  statsError: null,
  recentOrdersError: null,
  alertsError: null,

  fetchStats: async () => {
    set({ isLoadingStats: true, statsError: null })
    try {
      const stats = await getShopStats()
      set({ stats, isLoadingStats: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load stats'
      set({ statsError: message, isLoadingStats: false })
    }
  },

  fetchRecentOrders: async () => {
    set({ isLoadingRecentOrders: true, recentOrdersError: null })
    try {
      const response = await getShopOrders({ page: 1, perPage: 10 })
      set({ recentOrders: response.orders, isLoadingRecentOrders: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load recent orders'
      set({ recentOrdersError: message, isLoadingRecentOrders: false })
    }
  },

  fetchInventoryAlerts: async () => {
    set({ isLoadingAlerts: true, alertsError: null })
    try {
      const alerts = await getInventoryAlerts(5)
      set({ inventoryAlerts: alerts, isLoadingAlerts: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load inventory alerts'
      set({ alertsError: message, isLoadingAlerts: false })
    }
  },

  fetchDashboardData: async () => {
    await Promise.all([
      get().fetchStats(),
      get().fetchRecentOrders(),
      get().fetchInventoryAlerts(),
    ])
  },

  clearDashboard: () => {
    set({
      stats: null,
      recentOrders: [],
      inventoryAlerts: [],
      statsError: null,
      recentOrdersError: null,
      alertsError: null,
    })
  },
}))

// ----- Orders Store -----

interface ShopOrdersState {
  orders: ShopOrderVM[]
  total: number
  page: number
  perPage: number
  hasMore: boolean
  filters: {
    status: string
    search: string
    dateFrom: string
    dateTo: string
  }
  isLoading: boolean
  error: string | null

  // Selected order for detail view
  selectedOrderId: number | null
  selectedOrder: ShopOrderVM | null
  isLoadingDetail: boolean
  detailError: string | null

  // Status update
  isUpdatingStatus: boolean
  statusUpdateError: string | null

  fetchOrders: (params?: GetShopOrdersParams) => Promise<void>
  fetchOrderDetail: (id: number) => Promise<void>
  updateOrderStatus: (id: number, params: UpdateOrderStatusParams) => Promise<void>
  setFilters: (filters: Partial<ShopOrdersState['filters']>) => void
  clearOrders: () => void
  clearSelectedOrder: () => void
  setPage: (page: number) => void
  setPerPage: (perPage: number) => void
}

export const useShopOrdersStore = create<ShopOrdersState>((set, get) => ({
  orders: [],
  total: 0,
  page: 1,
  perPage: 20,
  hasMore: false,
  filters: {
    status: '',
    search: '',
    dateFrom: '',
    dateTo: '',
  },
  isLoading: false,
  error: null,
  selectedOrderId: null,
  selectedOrder: null,
  isLoadingDetail: false,
  detailError: null,
  isUpdatingStatus: false,
  statusUpdateError: null,

  fetchOrders: async (params?: GetShopOrdersParams) => {
    const currentFilters = get().filters
    set({ isLoading: true, error: null })

    try {
      const response = await getShopOrders({
        status: currentFilters.status as ShopOrderStatus | undefined,
        search: currentFilters.search || undefined,
        dateFrom: currentFilters.dateFrom || undefined,
        dateTo: currentFilters.dateTo || undefined,
        page: params?.page ?? get().page,
        perPage: params?.perPage ?? get().perPage,
      })

      set({
        orders: response.orders,
        total: response.total,
        page: response.page,
        perPage: response.perPage,
        hasMore: response.hasMore,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load orders'
      set({ error: message, isLoading: false })
    }
  },

  fetchOrderDetail: async (id: number) => {
    set({ selectedOrderId: id, isLoadingDetail: true, detailError: null, selectedOrder: null })

    try {
      const order = await getShopOrderDetail(id)
      set({ selectedOrder: order, isLoadingDetail: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load order detail'
      set({ detailError: message, isLoadingDetail: false })
    }
  },

  updateOrderStatus: async (id: number, params: UpdateOrderStatusParams) => {
    set({ isUpdatingStatus: true, statusUpdateError: null })

    try {
      await updateOrderStatus(id, params)

      // Refresh the order detail and list
      await get().fetchOrderDetail(id)
      await get().fetchOrders()

      set({ isUpdatingStatus: false })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to update order status'
      set({ statusUpdateError: message, isUpdatingStatus: false })
      throw error
    }
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      page: 1, // Reset to first page when filters change
    }))
  },

  clearOrders: () => {
    set({
      orders: [],
      total: 0,
      page: 1,
      hasMore: false,
      error: null,
    })
  },

  clearSelectedOrder: () => {
    set({
      selectedOrderId: null,
      selectedOrder: null,
      detailError: null,
    })
  },

  setPage: (page: number) => {
    set({ page })
  },

  setPerPage: (perPage: number) => {
    set({ perPage, page: 1 })
  },
}))

// ----- Products Store -----

interface ShopProductsState {
  products: ShopProductVM[]
  total: number
  page: number
  perPage: number
  categories: string[]
  filters: {
    search: string
    category: string
    isActive: boolean | null
    lowStockOnly: boolean
  }
  isLoading: boolean
  error: string | null

  fetchProducts: (params?: GetShopProductsParams) => Promise<void>
  setFilters: (filters: Partial<ShopProductsState['filters']>) => void
  clearProducts: () => void
  setPage: (page: number) => void
  setPerPage: (perPage: number) => void
}

export const useShopProductsStore = create<ShopProductsState>((set, get) => ({
  products: [],
  total: 0,
  page: 1,
  perPage: 20,
  categories: [],
  filters: {
    search: '',
    category: '',
    isActive: null,
    lowStockOnly: false,
  },
  isLoading: false,
  error: null,

  fetchProducts: async (params?: GetShopProductsParams) => {
    const currentFilters = get().filters
    set({ isLoading: true, error: null })

    try {
      const data = await getShopProducts({
        search: currentFilters.search || undefined,
        category: currentFilters.category || undefined,
        isActive: currentFilters.isActive ?? undefined,
        lowStockOnly: currentFilters.lowStockOnly,
        page: params?.page ?? get().page,
        perPage: params?.perPage ?? get().perPage,
      })

      set({
        products: data.products.map(toShopProductVM),
        total: data.total,
        page: data.page,
        perPage: data.per_page,
        categories: data.categories,
        isLoading: false,
      })
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Failed to load products'
      set({ error: message, isLoading: false })
    }
  },

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      page: 1, // Reset to first page when filters change
    }))
  },

  clearProducts: () => {
    set({
      products: [],
      total: 0,
      page: 1,
      error: null,
    })
  },

  setPage: (page: number) => {
    set({ page })
  },

  setPerPage: (perPage: number) => {
    set({ perPage, page: 1 })
  },
}))

// ----- Schedule Store (Mock Data for Phase 2) -----

export interface ScheduleItem {
  id: string
  title: string
  customerName: string
  petName: string
  service: string
  date: string
  time: string
  status: 'scheduled' | 'completed' | 'cancelled'
  notes?: string
}

interface ShopScheduleState {
  schedules: ScheduleItem[]
  isLoading: boolean
  error: string | null

  fetchSchedules: () => Promise<void>
  addSchedule: (item: Omit<ScheduleItem, 'id'>) => void
  updateSchedule: (id: string, updates: Partial<ScheduleItem>) => void
  cancelSchedule: (id: string) => void
}

// Mock data for Phase 2
const MOCK_SCHEDULES: ScheduleItem[] = [
  {
    id: '1',
    title: 'Grooming - Max',
    customerName: 'Chan Tai Man',
    petName: 'Max',
    service: 'Full Grooming',
    date: '2026-03-25',
    time: '10:00',
    status: 'scheduled',
    notes: 'Prefers warm water',
  },
  {
    id: '2',
    title: 'Boarding Check-in - Mochi',
    customerName: 'Lee Siu Yan',
    petName: 'Mochi',
    service: 'Pet Boarding',
    date: '2026-03-25',
    time: '14:00',
    status: 'scheduled',
  },
  {
    id: '3',
    title: 'Training Session - Lucky',
    customerName: 'Wong Mei Ling',
    petName: 'Lucky',
    service: 'Obedience Training',
    date: '2026-03-26',
    time: '09:00',
    status: 'scheduled',
  },
  {
    id: '4',
    title: 'Grooming - Bella',
    customerName: 'Ng Cheuk Kwan',
    petName: 'Bella',
    service: 'Bath & Brush',
    date: '2026-03-24',
    time: '11:00',
    status: 'completed',
  },
  {
    id: '5',
    title: 'Daycare - Charlie',
    customerName: 'Tang Hoi Ching',
    petName: 'Charlie',
    service: 'Daycare',
    date: '2026-03-23',
    time: '08:00',
    status: 'cancelled',
    notes: 'Customer rescheduled',
  },
]

export const useShopScheduleStore = create<ShopScheduleState>((set, get) => ({
  schedules: [],
  isLoading: false,
  error: null,

  fetchSchedules: async () => {
    set({ isLoading: true, error: null })

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    set({ schedules: MOCK_SCHEDULES, isLoading: false })
  },

  addSchedule: (item) => {
    const newItem: ScheduleItem = {
      ...item,
      id: Date.now().toString(),
    }
    set((state) => ({
      schedules: [...state.schedules, newItem],
    }))
  },

  updateSchedule: (id, updates) => {
    set((state) => ({
      schedules: state.schedules.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    }))
  },

  cancelSchedule: (id) => {
    set((state) => ({
      schedules: state.schedules.map((s) =>
        s.id === id ? { ...s, status: 'cancelled' as const } : s
      ),
    }))
  },
}))