import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
page.on('pageerror', err => errors.push(err.message))

console.log('Navegando a localhost:5173...')
await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 })

// Fill login and connect
const inputs = await page.$$('input')
if (inputs.length >= 2) {
  const buttons = await page.$$('button')
  for (const btn of buttons) {
    const text = await btn.textContent()
    if (text.toLowerCase().includes('conectar') || text.toLowerCase().includes('connect')) {
      await btn.click()
      break
    }
  }
}

await page.waitForTimeout(3000)

// Click demo button if in lobby
const allButtons = await page.$$('button')
for (const btn of allButtons) {
  const text = await btn.textContent()
  if (text.toLowerCase().includes('demo') || text.toLowerCase().includes('ia')) {
    console.log('Clicking demo:', text.trim())
    await btn.click()
    break
  }
}

// Wait for game
await page.waitForTimeout(5000)

// Check canvas
const canvas = await page.$('canvas')
if (canvas) {
  const box = await canvas.boundingBox()
  console.log('Canvas:', box.width, 'x', box.height)
}

// Check __mageScene for card count
const cardCount = await page.evaluate(() => {
  const scene = (globalThis).__mageScene
  return scene ? Object.keys(scene.cards).length : 0
})
console.log('Cards on scene:', cardCount)

// Take screenshot
await page.screenshot({ path: '/tmp/mage-test.png' })
console.log('Screenshot: /tmp/mage-test.png')

if (errors.length) console.log('Errors:', errors)
else console.log('No page errors.')

await browser.close()
