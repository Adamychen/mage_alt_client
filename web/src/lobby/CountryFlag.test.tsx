import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import CountryFlag, { cleanFlagCode } from './CountryFlag'

describe('CountryFlag Component & Utils', () => {
  afterEach(() => {
    cleanup()
  })

  it('cleans flag code strings correctly', () => {
    expect(cleanFlagCode('es.png')).toBe('es')
    expect(cleanFlagCode('ES.PNG')).toBe('es')
    expect(cleanFlagCode('us')).toBe('us')
    expect(cleanFlagCode('')).toBeNull()
    expect(cleanFlagCode(undefined)).toBeNull()
  })

  it('renders img with correct attributes for valid flag', () => {
    render(<CountryFlag flagName="es.png" className="custom-flag" />)
    const img = screen.getByRole('img')
    expect(img).toBeDefined()
    expect(img.getAttribute('src')).toBe('/flags/es.png')
    expect(img.getAttribute('alt')).toBe('ES')
    expect(img.classList.contains('custom-flag')).toBe(true)
  })

  it('renders empty fallback when flagName is missing and showTextFallback is true', () => {
    render(<CountryFlag flagName="" showTextFallback />)
    expect(screen.getByText('🌐')).toBeDefined()
  })
})
