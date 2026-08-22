import { useState, useEffect } from 'react'

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  )
}

export async function toggleFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return
  try {
    if (!isFullscreen()) {
      const el = document.documentElement
      if (el.requestFullscreen) {
        await el.requestFullscreen()
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen()
      } else if ((el as any).mozRequestFullScreen) {
        await (el as any).mozRequestFullScreen()
      } else if ((el as any).msRequestFullscreen) {
        await (el as any).msRequestFullscreen()
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen()
      } else if ((document as any).mozCancelFullScreen) {
        await (document as any).mozCancelFullScreen()
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen()
      }
    }
  } catch (err) {
    console.warn('Error al cambiar pantalla completa:', err)
  }
}

/**
 * Hook para sincronizar el estado reactivo de pantalla completa con los eventos del navegador
 */
export function useFullscreen(): [boolean, () => Promise<void>] {
  const [fullscreenActive, setFullscreenActive] = useState<boolean>(() => isFullscreen())

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreenActive(isFullscreen())
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    document.addEventListener('MSFullscreenChange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    }
  }, [])

  return [fullscreenActive, toggleFullscreen]
}
