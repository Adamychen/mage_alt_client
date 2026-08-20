import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const username = `probe-${String(Date.now()).slice(-10)}`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.getByLabel('Servidor del proxy (host)').fill('localhost')
await page.getByLabel('Puerto del servidor XMage').fill('17171')
await page.getByLabel('Usuario').fill(username)
await page.getByLabel('Contraseña').fill('x')
await page.getByRole('button', { name: 'Conectar' }).click()
await page.getByRole('heading', { name: /Mesas/ }).waitFor({ timeout: 30_000 })
await page.getByRole('button', { name: /Demo IA vs IA/ }).click()
await page.locator('.board-wrap canvas').waitFor({ timeout: 60_000 })
await page.waitForTimeout(8000)

const report = await page.evaluate(() => {
  const canvas = document.querySelector('.board-wrap canvas')
  const host = document.querySelector('.board-host')
  const scene = globalThis.__mageScene
  const box = canvas ? canvas.getBoundingClientRect() : null
  const hostBox = host ? host.getBoundingClientRect() : null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0
  for (const c of Object.values(scene?.cards ?? {})) {
    minX = Math.min(minX, c.x); minY = Math.min(minY, c.y)
    maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y); count++
  }
  return {
    canvasCss: box ? { w: box.width, h: box.height, x: box.x, y: box.y } : null,
    hostCss: hostBox ? { w: hostBox.width, h: hostBox.height } : null,
    cards: { count, minX, minY, maxX, maxY },
    sceneGame: scene?.game ?? null,
    offTop: minY < 0,
    offBottom: maxY > (box?.height ?? 0),
    offLeft: minX < 0,
    offRight: maxX > (box?.width ?? 0),
  }
})
console.log(JSON.stringify(report, null, 2))
console.log('pageerrors:', errors)
await page.screenshot({ path: '/tmp/board-probe.png' })
await browser.close()
