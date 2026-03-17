import { NextResponse } from 'next/server'

// Google Calendar sync is disabled. Use iCal / ICS feed instead.
export async function POST() {
  return NextResponse.json({ error: 'Google Calendar sync is disabled' }, { status: 410 })
}
