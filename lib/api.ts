import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/types'

export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data, error: '' }, { status })
}

export function err(message: string, status = 400): NextResponse<ApiResponse<null>> {
  return NextResponse.json({ success: false, data: null, error: message }, { status })
}

export function unauthorized(): NextResponse<ApiResponse<null>> {
  return err('Not authenticated. Please log in.', 401)
}

export function forbidden(): NextResponse<ApiResponse<null>> {
  return err('You do not have permission to perform this action.', 403)
}

export function serverError(e: unknown): NextResponse<ApiResponse<null>> {
  console.error('[SERVER ERROR]', e)
  const message = e instanceof Error ? e.message : 'An unexpected error occurred'
  return err(message, 500)
}
