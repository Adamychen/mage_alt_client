import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

page.on('pageerror', err => console.log('ERROR:', err.message))

await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 })

// Login
const buttons = await page.$$('button')
for (const btn of buttons) {
  const text = await btn.textContent()
  if (text.toLowerCase().includes('conectar') || text.toLowerCase().includes('connect')) {
    await btn.click()
    break
  }
}
await page.waitForTimeout(3000)

// Demo
const allButtons = await page.$$('button')
for (const btn of allButtons) {
  const text = await btn.textContent()
  if (text.toLowerCase().includes('demo')) { await btn.click(); break }
}
await page.waitForTimeout(5000)

// Check card positions
const info = await page.evaluate(() => {
  const scene = window.__mageScene
  if (!scene) return { error: 'no __mageScene' }
  const cards = scene.cards
  const entries = Object.entries(cards)
  const sample = entries.slice(0, 5).map(([id, pos]) => ({
    id, x: pos.x, y: pos.y
  }))
  return {
    totalCards: entries.length,
    sample,
    canvasSize: {
      w: document.querySelector('canvas')?.width,
      h: document.querySelector('canvas')?.height,
    }
  }
})
console.log('Card info:', JSON.stringify(info, null, 2))

await page.screenshot({ path: '/tmp/mage-debug.png' })
await browser.close()
