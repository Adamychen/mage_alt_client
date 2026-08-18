import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const logs = []
page.on('console', msg => {
  const text = msg.text()
  logs.push(text)
  if (text.includes('[BoardScene]')) console.log('CONSOLE:', text)
})
page.on('pageerror', err => console.log('PAGE ERROR:', err.message))

console.log('1. Navegando a localhost:5173...')
await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 })

console.log('2. Esperando login screen...')
await page.waitForSelector('input', { timeout: 10000 }).catch(() => {
  console.log('   No se encontró input, posible estado:', page.url())
})

// Take screenshot of current state
await page.screenshot({ path: '/tmp/mage-step1.png' })
console.log('   Screenshot: /tmp/mage-step1.png')

// Check what's on the page
const bodyText = await page.textContent('body').catch(() => '')
console.log('   Page text preview:', bodyText.slice(0, 300))

// Try to find and fill login form
const inputs = await page.$$('input')
console.log('   Inputs found:', inputs.length)

if (inputs.length >= 2) {
  // Fill proxy host and click connect
  const proxyInput = inputs[0]
  const val = await proxyInput.inputValue()
  console.log('   Proxy input value:', val)
  
  // Find connect/submit button
  const buttons = await page.$$('button')
  for (const btn of buttons) {
    const text = await btn.textContent()
    if (text.toLowerCase().includes('connect') || text.toLowerCase().includes('conectar')) {
      console.log('   Clicking:', text)
      await btn.click()
      break
    }
  }
}

// Wait for lobby
console.log('3. Esperando lobby...')
await page.waitForTimeout(3000)
await page.screenshot({ path: '/tmp/mage-step2.png' })
console.log('   Screenshot: /tmp/mage-step2.png')

const lobbyText = await page.textContent('body').catch(() => '')
console.log('   Page text preview:', lobbyText.slice(0, 500))

// Look for demo/IA button
const allButtons = await page.$$('button')
for (const btn of allButtons) {
  const text = await btn.textContent()
  if (text.toLowerCase().includes('demo') || text.toLowerCase().includes('ia') || text.toLowerCase().includes('sim')) {
    console.log('4. Found demo button:', text.trim())
    await btn.click()
    break
  }
}

// Wait for game to start
console.log('5. Esperando juego...')
await page.waitForTimeout(5000)
await page.screenshot({ path: '/tmp/mage-step3.png' })
console.log('   Screenshot: /tmp/mage-step3.png')

// Check board
const boardHost = await page.$('.board-host')
if (boardHost) {
  const box = await boardHost.boundingBox()
  console.log('   Board host dimensions:', box)
} else {
  console.log('   NO board-host found!')
}

const canvas = await page.$('canvas')
if (canvas) {
  const box = await canvas.boundingBox()
  console.log('   Canvas dimensions:', box)
} else {
  console.log('   NO canvas found!')
}

// Check for board-error
const error = await page.$('.board-error')
if (error) {
  const text = await error.textContent()
  console.log('   Board error:', text)
}

// Print all BoardScene logs
const bsLogs = logs.filter(l => l.includes('[BoardScene]'))
console.log('\n6. BoardScene logs:', bsLogs.length ? bsLogs.join('\n') : 'NINGUNO')

await browser.close()
console.log('\nDone.')
