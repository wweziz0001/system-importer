import { NextResponse } from 'next/server'

// Shared status between routes
let sharedStatus = {
  status: 'idle' as 'idle' | 'extracting' | 'success' | 'error',
  message: '',
  progress: 0,
  files: [] as Array<{ path: string; size: number; type: 'file' | 'directory' }>,
  totalFiles: 0,
  error: ''
}

export function updateStatus(newStatus: Partial<typeof sharedStatus>) {
  sharedStatus = { ...sharedStatus, ...newStatus }
}

export async function GET() {
  return NextResponse.json(sharedStatus)
}
