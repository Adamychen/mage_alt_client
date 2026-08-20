import { test, expect } from './fixtures'
import { cleanupUser } from './cleanup'
import { login } from './support/start-game'
import { FakeServer } from '../fixtures/fake'
import { chatScenario } from '../fixtures/scenarios/chat'
import { BACKEND_PORT, FAKE_MODE } from './dual'

// Override the default fixture to use the chat scenario
const chatTest = test.extend<{ chatServer: FakeServer | null }>({
  chatServer: [
    async ({}, use) => {
      if (!FAKE_MODE) {
        await use(null)
        return
      }
      const server = await FakeServer.start(BACKEND_PORT, () => chatScenario())
      await use(server)
      await server.stop()
    },
    { scope: 'test' },
  ],
})

chatTest(
  'lobby chat: send and receive messages',
  { tag: '@chat' },
  async ({ page, chatServer }) => {
    void chatServer
    const username = `chat-${String(Date.now()).slice(-10)}`
    cleanupUser(username)

    await login(page, username)

    // lobby visible
    await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible({ timeout: 15_000 })

    // find the chat input in the lobby
    const chatInput = page.locator('.chat-input input')
    await expect(chatInput).toBeVisible({ timeout: 10_000 })

    // send a message
    await chatInput.fill('Hello from lobby!')
    await page.locator('.chat-input button[type="submit"]').click()

    // the message should appear in the chat list
    await expect(page.locator('.chat-list')).toContainText('Hello from lobby!', { timeout: 5_000 })
    await expect(page.locator('.chat-list')).toContainText('player-1:', { timeout: 5_000 })
  },
)

chatTest(
  'game chat: send and receive messages while watching a game',
  { tag: '@chat' },
  async ({ page, chatServer }) => {
    void chatServer
    const username = `gc-${String(Date.now()).slice(-10)}`
    cleanupUser(username)

    await login(page, username)

    // lobby visible
    await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible({ timeout: 15_000 })

    // watch the demo game — the table row has a "Ver" button
    const tableRow = page.locator('.table-row', { hasText: 'Chat Test' })
    await expect(tableRow).toBeVisible({ timeout: 15_000 })
    await tableRow.getByRole('button', { name: 'Ver' }).click()

    // game screen visible
    await expect(page.getByTestId('game-status')).toBeVisible({ timeout: 20_000 })

    // find the game chat input
    const chatInput = page.locator('.game-chat-input input')
    await expect(chatInput).toBeVisible({ timeout: 10_000 })

    // send a message
    await chatInput.fill('Hello from game!')
    await page.locator('.game-chat-input button[type="submit"]').click()

    // the message should appear in the game chat
    await expect(page.locator('.game-chat-messages')).toContainText('Hello from game!', {
      timeout: 5_000,
    })
    await expect(page.locator('.game-chat-player').first()).toContainText('player-1', { timeout: 5_000 })
  },
)

chatTest(
  'game chat: quick reaction appears in chat',
  { tag: '@chat' },
  async ({ page, chatServer }) => {
    void chatServer
    const username = `qr-${String(Date.now()).slice(-10)}`
    cleanupUser(username)

    await login(page, username)

    // lobby visible
    await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible({ timeout: 15_000 })

    // watch the demo game — the table row has a "Ver" button
    const tableRow = page.locator('.table-row', { hasText: 'Chat Test' })
    await expect(tableRow).toBeVisible({ timeout: 15_000 })
    await tableRow.getByRole('button', { name: 'Ver' }).click()

    // game screen visible
    await expect(page.getByTestId('game-status')).toBeVisible({ timeout: 20_000 })

    // click a quick reaction button
    const thumbsUp = page.locator('.quick-reaction-btn', { hasText: '👍' })
    await expect(thumbsUp).toBeVisible({ timeout: 10_000 })
    await thumbsUp.click()

    // the emoji should appear in the game chat
    await expect(page.locator('.game-chat-messages')).toContainText('👍', { timeout: 5_000 })
  },
)
