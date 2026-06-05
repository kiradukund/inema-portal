import { createServerSupabaseClient } from './supabase'
import { redirect } from 'next/navigation'

export async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login?redirect=/admin')
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard?error=unauthorized')
  }
  
  return { user, profile }
}

export function formatRWF(n: number): string {
  return 'RWF ' + Math.round(n).toLocaleString('en-RW')
}

export function daysUntil(dateStr: string): number {
  const today = new Date()
  const target = new Date(dateStr)
  const diff = target.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    paid: 'text-green-700 bg-green-50 border-green-200',
    active: 'text-blue-700 bg-blue-50 border-blue-200',
    overdue: 'text-red-700 bg-red-50 border-red-200',
    partial: 'text-amber-700 bg-amber-50 border-amber-200',
    'not paid': 'text-red-700 bg-red-50 border-red-200',
  }
  return map[status.toLowerCase()] ?? 'text-slate-700 bg-slate-50 border-slate-200'
}
