// src/lib/syncHub.ts
// Sync Hub reporter — fires events to Sync Hub's Supabase
// This file is identical across all 3 apps

import { createClient } from '@supabase/supabase-js'

// Sync Hub Supabase credentials (NOT the app's own Supabase)
// Add these to each app's .env and Vercel env vars:
//   VITE_SYNCHUB_SUPABASE_URL
//   VITE_SYNCHUB_SUPABASE_ANON_KEY
//   VITE_SYNCHUB_APP_ID  (one of: lifelink | vision-sync | aisales)

const syncHubUrl = import.meta.env.VITE_SYNCHUB_SUPABASE_URL
const syncHubKey = import.meta.env.VITE_SYNCHUB_SUPABASE_ANON_KEY
const appId = import.meta.env.VITE_SYNCHUB_APP_ID

// Only create client if env vars are configured
// App works perfectly fine without them — Sync Hub reporting is non-critical
const syncHub = (syncHubUrl && syncHubKey)
    ? createClient(syncHubUrl, syncHubKey)
    : null

// ── FIRE AN EVENT ──
// Call this whenever something important happens
export async function reportEvent(
    eventType: string,
    options?: {
        amount?: number        // in pence e.g. 999 = £9.99
        currency?: string      // default 'GBP'
        label?: string         // human readable description
        metadata?: Record<string, unknown>
    }
) {
    if (!syncHub) return   // silently skip if not configured
    try {
        await syncHub.from('app_events').insert({
            app: appId,
            event_type: eventType,
            amount: options?.amount,
            currency: options?.currency ?? 'GBP',
            label: options?.label,
            metadata: options?.metadata,
        })
    } catch (e) {
        // Never throw — Sync Hub reporting must never break the app
        console.warn('[SyncHub] Event report failed silently:', e)
    }
}

// ── UPDATE FINANCE SNAPSHOT ──
// Call this after any payment event to keep finance data current
export async function updateFinance(data: {
    mrrPence?: number
    arrPence?: number
    totalRevenuePence?: number
    revenueTodayPence?: number
    revenueMtdPence?: number
    revenueYtdPence?: number
    totalCustomers?: number
    activeSubscriptions?: number
    churnRate?: number
    arpuPence?: number
}) {
    if (!syncHub) return
    try {
        await syncHub.from('app_finance').upsert({
            app: appId,
            mrr_pence: data.mrrPence,
            arr_pence: data.arrPence,
            total_revenue_pence: data.totalRevenuePence,
            revenue_today_pence: data.revenueTodayPence,
            revenue_mtd_pence: data.revenueMtdPence,
            revenue_ytd_pence: data.revenueYtdPence,
            total_customers: data.totalCustomers,
            active_subscriptions: data.activeSubscriptions,
            churn_rate: data.churnRate,
            avg_revenue_per_user_pence: data.arpuPence,
            last_updated: new Date().toISOString(),
        }, { onConflict: 'app' })
    } catch (e) {
        console.warn('[SyncHub] Finance update failed silently:', e)
    }
}

// ── UPDATE DAILY METRICS ──
// Call this at end of day OR incrementally throughout the day
export async function updateDailyMetrics(data: {
    revenuePence?: number
    newSignups?: number
    newLeads?: number
    activeUsers?: number
    totalUsers?: number
    mrrPence?: number
}) {
    if (!syncHub) return
    try {
        // Upsert today's row — increments safely
        const today = new Date().toISOString().split('T')[0]
        await syncHub.from('app_daily_metrics').upsert({
            app: appId,
            date: today,
            revenue_pence: data.revenuePence,
            new_signups: data.newSignups,
            new_leads: data.newLeads,
            active_users: data.activeUsers,
            total_users: data.totalUsers,
            mrr_pence: data.mrrPence,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'app,date' })
    } catch (e) {
        console.warn('[SyncHub] Daily metrics update failed silently:', e)
    }
}
