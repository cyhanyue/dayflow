import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.redirect(new URL('/login', req.url))

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/settings?google=error', req.url))
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
  })

  const tokens = await tokenRes.json()
  if (!tokens.refresh_token) {
    return NextResponse.redirect(new URL('/settings?google=error', req.url))
  }

  await prisma.user.update({
    where: { id: auth.userId },
    data: {
      googleRefreshToken: tokens.refresh_token,
      googleAccessToken: tokens.access_token,
      googleTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
    },
  })

  // Create a Google Calendar entry in our DB if it doesn't exist yet
  const existing = await prisma.calendar.findFirst({
    where: { userId: auth.userId, name: 'Google Calendar' },
  })
  if (!existing) {
    await prisma.calendar.create({
      data: {
        userId: auth.userId,
        name: 'Google Calendar',
        color: '#4285f4',
        isVisible: true,
        isDefault: false,
      },
    })
  }

  return NextResponse.redirect(new URL('/settings?google=connected', req.url))
}
