import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import AvatarImage from './AvatarImage'
import AvatarPickerModal from './AvatarPickerModal'
import { resolveAvatarPath } from './avatars'

describe('Avatar System', () => {
  afterEach(() => {
    cleanup()
  })

  it('resolves standard and special avatar paths properly', () => {
    expect(resolveAvatarPath(10)).toBe('/avatars/10.jpg')
    expect(resolveAvatarPath(11)).toBe('/avatars/11.jpg')
    expect(resolveAvatarPath(1000)).toBe('/avatars/special/0.gif')
    expect(resolveAvatarPath(1001)).toBe('/avatars/special/1.gif')
    expect(resolveAvatarPath(undefined)).toBe('/avatars/10.jpg')
  })

  it('renders AvatarImage with correct src', () => {
    render(<AvatarImage avatarId={12} username="Liliana" size="medium" />)
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('/avatars/12.jpg')
    expect(img.alt).toBe('Liliana')
  })

  it('renders AvatarPickerModal and selects an avatar', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()

    render(
      <AvatarPickerModal
        selectedAvatarId={10}
        onSelect={onSelect}
        onClose={onClose}
      />
    )

    expect(screen.getByText(/Elige tu Avatar de Duelista/i)).toBeDefined()
    expect(screen.getByText('Chandra Nalaar')).toBeDefined()

    // Click Chandra (ID 11)
    fireEvent.click(screen.getByText('Chandra Nalaar'))
    expect(onSelect).toHaveBeenCalledWith(11)
    expect(onClose).toHaveBeenCalled()
  })
})
