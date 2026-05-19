/**
 * components/ReportPreviewModal.tsx — Full-screen report preview and export modal
 *
 * Opens a full-screen overlay that shows a formatted daily report in an <iframe>.
 * The report HTML is generated client-side by `generateReportHtml()` in reportPdf.ts
 * and loaded via a Blob URL rather than a server-rendered PDF.
 *
 * Features:
 *   - Live preview in an <iframe> (the generated HTML has its own styles)
 *   - Print button triggers the browser's print dialog on the iframe's content window
 *   - Download button renders a letter-sized PDF with a descriptive filename
 *   - Clicking the dark backdrop or the X button closes the modal
 *
 * Blob URL lifecycle:
 *   - Created once on mount via URL.createObjectURL()
 *   - Revoked on unmount via URL.revokeObjectURL() (cleanup in useEffect return)
 *   - The eslint-disable comment suppresses the exhaustive-deps warning — the blob
 *     is intentionally generated only once using the args at mount time.
 */

import { useEffect, useRef, useState } from 'react'
import html2pdf from 'html2pdf.js'
import { generateReportHtml } from '../lib/reportPdf'
import type { ReportPdfArgs } from '../lib/reportPdf'

const PDF_RENDER_WIDTH_PX = 816
const PDF_RENDER_HEIGHT_PX = 1056
type PdfOptions = {
  margin: number | [number, number] | [number, number, number, number]
  filename: string
  image: { type: 'jpeg' | 'png' | 'webp'; quality: number }
  pagebreak: { mode: string[]; before: string }
  html2canvas: Record<string, unknown>
  jsPDF: { unit: string; format: string; orientation: 'portrait' | 'landscape' }
}

function waitForFrameLoad(frame: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Timed out preparing report PDF')), 5000)

    frame.addEventListener(
      'load',
      () => {
        window.clearTimeout(timeout)
        resolve()
      },
      { once: true },
    )
  })
}

async function createPdfRenderFrame(html: string): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe')
  frame.title = 'Report PDF render frame'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.left = '-10000px'
  frame.style.top = '0'
  frame.style.width = `${PDF_RENDER_WIDTH_PX}px`
  frame.style.height = `${PDF_RENDER_HEIGHT_PX}px`
  frame.style.border = '0'
  frame.style.pointerEvents = 'none'

  document.body.appendChild(frame)
  const loaded = waitForFrameLoad(frame)
  frame.srcdoc = html
  try {
    await loaded
  } catch (error) {
    frame.remove()
    throw error
  }

  return frame
}

function waitForLayout(frame: HTMLIFrameElement): Promise<void> {
  return new Promise(resolve => {
    if (frame.contentWindow) {
      frame.contentWindow.requestAnimationFrame(() => resolve())
    } else {
      window.requestAnimationFrame(() => resolve())
    }
  })
}

export function ReportPreviewModal({ args, onClose }: { args: ReportPdfArgs; onClose: () => void }) {
  // Ref to the iframe so we can call contentWindow.print() on it
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Blob URL for the generated HTML — null until the effect runs
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  // Filename used when the user downloads the report (no extension — html2pdf appends .pdf)
  const filename = `report-${args.className.replace(/\s+/g, '-')}-${args.report.report_date}`

  useEffect(() => {
    // Generate the full HTML document and wrap it in a Blob for iframe src
    const html = generateReportHtml(args)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    // Clean up the blob URL when the modal unmounts to avoid memory leaks
    return () => URL.revokeObjectURL(url)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Triggers the browser's print dialog for the iframe's document.
   * This prints only the report content, not the surrounding modal chrome.
   */
  function handlePrint() {
    iframeRef.current?.contentWindow?.print()
  }

  /**
   * Renders the report HTML to a PDF using html2pdf.js (html2canvas + jsPDF)
   * and triggers a direct file download — no print dialog shown.
   * A temporary off-screen iframe keeps rendering dimensions independent of
   * the device viewport, which prevents narrow mobile PDFs.
   */
  async function handleDownload() {
    if (isDownloading) return

    setIsDownloading(true)
    const html = generateReportHtml(args)
    let frame: HTMLIFrameElement | null = null

    try {
      frame = await createPdfRenderFrame(html)
      const target =
        frame.contentDocument?.querySelector<HTMLElement>('.report-export-root') ??
        frame.contentDocument?.body

      if (!target) throw new Error('Unable to prepare report PDF')

      frame.contentDocument?.head.querySelectorAll('style').forEach(style => {
        target.insertBefore(style.cloneNode(true), target.firstChild)
      })

      const renderWidth = Math.max(PDF_RENDER_WIDTH_PX, target.scrollWidth)
      const renderHeight = Math.max(PDF_RENDER_HEIGHT_PX, target.scrollHeight)
      frame.style.width = `${renderWidth}px`
      frame.style.height = `${renderHeight}px`

      await waitForLayout(frame)

      const pdfOptions: PdfOptions = {
        margin: 0,
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        pagebreak: { mode: ['css', 'legacy'], before: '.page-break' },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          windowWidth: renderWidth,
          windowHeight: renderHeight,
          width: renderWidth,
          height: renderHeight,
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
      }

      await html2pdf()
        .set(pdfOptions)
        .from(target)
        .save()
    } catch (error) {
      console.error('Failed to download report PDF', error)
    } finally {
      frame?.remove()
      setIsDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40 dark:bg-black/60 animate-backdrop-in" onClick={onClose}>
      {/* Toolbar */}
      <div
        className="flex flex-col gap-2 bg-slate-50 px-3 py-3 flex-shrink-0 animate-modal-in dark:bg-gw-darkest sm:flex-row sm:items-center sm:justify-between sm:px-4"
        onClick={e => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-white">
          {args.className} — {args.report.report_date}
          {args.report.group_label ? ` · Group ${args.report.group_label}` : ''}
        </span>
        <div className="flex shrink-0 items-center justify-end gap-2 sm:ml-4">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-300 disabled:cursor-wait disabled:opacity-70 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {isDownloading ? 'Preparing' : 'Download'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-md bg-gw-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-gw-blue-hover"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded-md p-1.5 text-slate-500 dark:text-white/60 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* iframe preview */}
      <div className="flex-1 min-h-0 p-2 sm:p-4" onClick={e => e.stopPropagation()}>
        {blobUrl && (
          <iframe
            ref={iframeRef}
            src={blobUrl}
            className="h-full w-full rounded-md bg-white shadow-lg sm:rounded-lg"
            title="Report preview"
          />
        )}
      </div>
    </div>
  )
}
