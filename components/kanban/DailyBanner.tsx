'use client'
import { useState, useEffect } from 'react'
import { format, isToday } from 'date-fns'
import { RefreshCw } from 'lucide-react'

const QUOTES = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Your time is limited. Don't waste it living someone else's life.", author: "Steve Jobs" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.", author: "Stephen Covey" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Either you run the day, or the day runs you.", author: "Jim Rohn" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
  { text: "Opportunities don't happen. You create them.", author: "Chris Grosser" },
  { text: "Don't be afraid to give up the good to go for the great.", author: "John D. Rockefeller" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson" },
  { text: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh" },
  { text: "Energy and persistence conquer all things.", author: "Benjamin Franklin" },
  { text: "The difference between ordinary and extraordinary is that little extra.", author: "Jimmy Johnson" },
  { text: "What you do today can improve all your tomorrows.", author: "Ralph Marston" },
  { text: "Nothing is particularly hard if you divide it into small jobs.", author: "Henry Ford" },
  { text: "You are never too old to set another goal or to dream a new dream.", author: "C.S. Lewis" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James" },
  { text: "Perfection is not attainable. But if we chase perfection, we can catch excellence.", author: "Vince Lombardi" },
]

function getGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours()
  if (h < 5)  return { text: 'Working late', emoji: '🌙' }
  if (h < 12) return { text: 'Good morning', emoji: '☀️' }
  if (h < 17) return { text: 'Good afternoon', emoji: '🌤️' }
  if (h < 21) return { text: 'Good evening', emoji: '🌇' }
  return { text: 'Night owl', emoji: '🌙' }
}

// Pick a stable daily quote using date as seed, overrideable
function dailyIndex(): number {
  const today = new Date()
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()
  return seed % QUOTES.length
}

export default function DailyBanner() {
  const [quoteIdx, setQuoteIdx] = useState(dailyIndex())
  const [fading, setFading] = useState(false)
  const [greeting, setGreeting] = useState(getGreeting())
  const quote = QUOTES[quoteIdx]

  // Update greeting once per minute
  useEffect(() => {
    const interval = setInterval(() => setGreeting(getGreeting()), 60_000)
    return () => clearInterval(interval)
  }, [])

  function cycleQuote() {
    setFading(true)
    setTimeout(() => {
      setQuoteIdx(i => (i + 1) % QUOTES.length)
      setFading(false)
    }, 200)
  }

  const today = new Date()
  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const todayDow = today.getDay()

  return (
    <div className="relative flex items-center gap-6 px-5 py-3 overflow-hidden flex-shrink-0
      bg-gradient-to-r from-indigo-50 via-violet-50/60 to-white
      dark:from-indigo-950/50 dark:via-violet-950/30 dark:to-transparent
      border-b border-indigo-100/80 dark:border-indigo-900/40">

      {/* Decorative soft blob */}
      <div className="pointer-events-none absolute -top-6 -left-6 w-32 h-32 rounded-full bg-violet-200/30 dark:bg-violet-700/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-6 right-24 w-24 h-24 rounded-full bg-indigo-200/30 dark:bg-indigo-700/10 blur-2xl" />

      {/* Greeting + date */}
      <div className="flex-shrink-0 z-10">
        <p className="text-base font-semibold text-indigo-700 dark:text-indigo-300 leading-tight whitespace-nowrap">
          {greeting.emoji} {greeting.text}
        </p>
        <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 whitespace-nowrap">
          {format(today, 'EEEE, MMMM d')}
        </p>
        {/* Week dots */}
        <div className="flex items-center gap-1 mt-1.5">
          {weekDays.map((d, i) => (
            <div
              key={i}
              title={d}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold transition-all ${
                i === todayDow
                  ? 'bg-pink-400 text-white scale-110'
                  : i < todayDow
                  ? 'bg-pink-100 dark:bg-pink-900/40 text-pink-400 dark:text-pink-300'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px self-stretch bg-indigo-100 dark:bg-indigo-900/60 flex-shrink-0 z-10" />

      {/* Quote */}
      <div
        className="flex-1 min-w-0 z-10 transition-opacity duration-200"
        style={{ opacity: fading ? 0 : 1 }}
      >
        <div className="flex items-start gap-2">
          <span className="text-3xl leading-none text-indigo-300 dark:text-indigo-700 font-serif flex-shrink-0 -mt-1 select-none">
            "
          </span>
          <div className="min-w-0">
            <p className="text-sm italic text-stone-600 dark:text-stone-300 leading-snug line-clamp-2">
              {quote.text}
            </p>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 font-medium">
              — {quote.author}
            </p>
          </div>
        </div>
      </div>

      {/* Refresh button */}
      <button
        onClick={cycleQuote}
        title="Next quote"
        className="flex-shrink-0 z-10 p-1.5 rounded-lg text-stone-300 dark:text-stone-600
          hover:text-indigo-500 dark:hover:text-indigo-400
          hover:bg-indigo-50 dark:hover:bg-indigo-950/50
          transition-colors"
      >
        <RefreshCw size={13} />
      </button>
    </div>
  )
}
