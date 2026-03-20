'use client'
import dynamic from 'next/dynamic'

const PopoutTimer = dynamic(() => import('@/components/task/PopoutTimer'), { ssr: false })

export default function TimerPage() {
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; border: none; outline: none; }
      `}</style>
      <PopoutTimer />
    </>
  )
}
