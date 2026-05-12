import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/apiClient'
import { useToast } from '../contexts/ToastContext'
import { SkeletonTable } from './Skeleton'
import { EmptyState } from './EmptyState'
import type { ClassDocument } from '../types'

type DocumentAccess = 'coordinator' | 'trainer' | 'student'

interface ClassDocumentsSectionProps {
  classId: string
  access: DocumentAccess
  canUpload?: boolean
  canDelete?: boolean
  archived?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function documentKind(document: ClassDocument): string {
  if (document.content_type === 'application/pdf') return 'PDF'
  if (document.content_type.startsWith('image/')) return 'Photo'
  return 'Document'
}

export function ClassDocumentsSection({
  classId,
  access,
  canUpload = false,
  canDelete = false,
  archived = false,
}: ClassDocumentsSectionProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const [documents, setDocuments] = useState<ClassDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [description, setDescription] = useState('')
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null)

  const uploadDisabled = uploading || archived

  const apiMethods = useMemo(() => {
    if (access === 'coordinator') {
      return {
        list: () => api.classDocuments.list(classId),
        upload: (file: File, note?: string) => api.classDocuments.upload(classId, file, note),
        downloadUrl: (documentId: string) => api.classDocuments.downloadUrl(classId, documentId),
        delete: (documentId: string) => api.classDocuments.delete(classId, documentId),
      }
    }
    if (access === 'trainer') {
      return {
        list: () => api.selfService.classDocuments(classId),
        upload: (file: File, note?: string) => api.selfService.uploadClassDocument(classId, file, note),
        downloadUrl: (documentId: string) => api.selfService.classDocumentDownloadUrl(classId, documentId),
        delete: (documentId: string) => api.selfService.deleteClassDocument(classId, documentId),
      }
    }
    return {
      list: () => api.selfService.studentClassDocuments(classId),
      upload: null,
      downloadUrl: (documentId: string) => api.selfService.studentClassDocumentDownloadUrl(classId, documentId),
      delete: null,
    }
  }, [access, classId])

  async function refreshDocuments() {
    setLoading(true)
    try {
      setDocuments(await apiMethods.list())
    } catch (err) {
      toast((err as Error).message, 'error')
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshDocuments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiMethods])

  async function uploadFile(file: File | undefined) {
    if (!file || !apiMethods.upload || uploadDisabled) return
    setUploading(true)
    try {
      const uploaded = await apiMethods.upload(file, description.trim() || undefined)
      setDocuments(prev => [uploaded, ...prev])
      setDescription('')
      toast('Document uploaded', 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  async function openDocument(document: ClassDocument) {
    setBusyDocumentId(document.id)
    try {
      const { url } = await apiMethods.downloadUrl(document.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusyDocumentId(null)
    }
  }

  async function removeDocument(document: ClassDocument) {
    if (!apiMethods.delete) return
    setBusyDocumentId(document.id)
    try {
      await apiMethods.delete(document.id)
      setDocuments(prev => prev.filter(item => item.id !== document.id))
      toast('Document removed', 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusyDocumentId(null)
    }
  }

  return (
    <section className="bg-white dark:bg-gw-surface rounded-[10px] p-4">
      <header className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Documents
            {!loading && documents.length > 0 && <span className="ml-1.5 font-normal normal-case tracking-normal text-slate-500">({documents.length})</span>}
          </h3>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Attach PDFs or photos of class paperwork.</p>
        </div>

        {canUpload && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Note
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={500}
                placeholder="Optional description"
                className="mt-1 h-8 w-full min-w-[220px] rounded-md border border-slate-200 bg-slate-100 px-2.5 text-xs text-slate-800 outline-none focus:border-gw-blue/40 dark:border-white/10 dark:bg-gw-elevated dark:text-slate-200"
                disabled={uploadDisabled}
              />
            </label>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/*"
                onChange={e => void uploadFile(e.target.files?.[0])}
                className="hidden"
                disabled={uploadDisabled}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => void uploadFile(e.target.files?.[0])}
                className="hidden"
                disabled={uploadDisabled}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadDisabled}
                className="h-8 rounded-md bg-gw-blue px-3 text-xs font-semibold text-white transition-colors hover:bg-gw-blue/90 disabled:opacity-40"
              >
                {uploading ? 'Uploading...' : 'Add file'}
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploadDisabled}
                className="h-8 rounded-md border border-gw-teal/30 bg-gw-teal/10 px-3 text-xs font-semibold text-gw-teal transition-colors hover:bg-gw-teal/15 disabled:opacity-40"
              >
                Take photo
              </button>
            </div>
          </div>
        )}
      </header>

      {loading ? (
        <SkeletonTable rows={3} cols={4} />
      ) : documents.length === 0 ? (
        <div className="rounded-[10px] bg-slate-100 dark:bg-gw-elevated">
          <EmptyState title="No documents yet" description={canUpload && !archived ? 'Add a PDF or take a photo to attach class paperwork.' : 'No class paperwork has been attached.'} variant="neutral" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-slate-200 dark:border-white/[0.06]">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-white/[0.06] dark:bg-white/[0.02]">
                <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Document</th>
                <th className="hidden px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">Type</th>
                <th className="hidden px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500 md:table-cell">Uploaded</th>
                <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(document => (
                <tr key={document.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-white/[0.03] dark:hover:bg-white/[0.04]">
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-800 dark:text-slate-200">{document.original_filename}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                      {document.description || formatBytes(document.size_bytes)}
                      {document.description ? ` · ${formatBytes(document.size_bytes)}` : ''}
                    </p>
                  </td>
                  <td className="hidden px-3 py-2 text-slate-500 dark:text-slate-400 sm:table-cell">{documentKind(document)}</td>
                  <td className="hidden px-3 py-2 text-slate-500 dark:text-slate-400 md:table-cell">{new Date(document.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void openDocument(document)}
                        disabled={busyDocumentId === document.id}
                        className="rounded px-2 py-1 text-[11px] font-medium text-gw-blue transition-colors hover:bg-gw-blue/10 disabled:opacity-40"
                      >
                        Open
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void removeDocument(document)}
                          disabled={busyDocumentId === document.id || archived}
                          className="rounded px-2 py-1 text-[11px] font-medium text-rose-500 transition-colors hover:bg-rose-500/10 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

