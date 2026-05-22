import { useEffect } from 'react'

/**
 * Sets the document title for the current page.
 * Automatically appends " — Training Tool" as a suffix.
 * Restores the default title on unmount.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title
    document.title = title ? `${title} — Training Tool` : 'Training Tool'
    return () => { document.title = prev }
  }, [title])
}
