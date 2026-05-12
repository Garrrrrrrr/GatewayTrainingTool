import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { supabase } from './supabase'

export const CLASS_DOCUMENT_BUCKET = 'class-documents'
export const CLASS_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

export type ClassDocumentRow = {
  id: string
  class_id: string
  storage_path: string
  original_filename: string
  content_type: string
  size_bytes: number
  description: string | null
  uploaded_by: string | null
  created_at: string
}

export function normalizeContentType(value: string | undefined): string {
  return (value ?? '').split(';')[0].trim().toLowerCase()
}

export function safeUploadFileName(value: string | undefined): string {
  const decoded = (() => {
    try {
      return decodeURIComponent(value ?? '')
    } catch {
      return value ?? ''
    }
  })()
  const trimmed = decoded.trim()
  if (!trimmed) return 'document'
  return trimmed
    .replace(/[\\/]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 180) || 'document'
}

export function safeDescription(value: string | undefined): string | null {
  const decoded = (() => {
    try {
      return decodeURIComponent(value ?? '')
    } catch {
      return value ?? ''
    }
  })()
  const trimmed = decoded.trim().slice(0, 500)
  return trimmed || null
}

export function validateUploadRequest(req: Request, res: Response): Buffer | null {
  const buffer = req.body
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    res.status(400).json({ error: 'No file uploaded' })
    return null
  }
  if (buffer.length > CLASS_DOCUMENT_MAX_BYTES) {
    res.status(413).json({ error: 'Document is too large. Maximum size is 25 MB.' })
    return null
  }
  const contentType = normalizeContentType(req.get('content-type'))
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    res.status(400).json({ error: 'Only PDF, JPEG, PNG, WebP, HEIC, and HEIF documents are supported.' })
    return null
  }
  return buffer
}

export function buildStoragePath(classId: string, fileName: string): string {
  const extension = fileName.includes('.') ? fileName.split('.').pop() : ''
  const suffix = extension ? `.${extension.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase()}` : ''
  return `${classId}/${randomUUID()}${suffix}`
}

export async function listClassDocuments(classId: string): Promise<ClassDocumentRow[]> {
  const { data, error } = await supabase
    .from('class_documents')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ClassDocumentRow[]
}

export async function createClassDocument({
  classId,
  userId,
  fileName,
  contentType,
  description,
  file,
}: {
  classId: string
  userId: string
  fileName: string
  contentType: string
  description: string | null
  file: Buffer
}): Promise<ClassDocumentRow> {
  const storagePath = buildStoragePath(classId, fileName)
  const upload = await supabase.storage
    .from(CLASS_DOCUMENT_BUCKET)
    .upload(storagePath, file, {
      contentType,
      upsert: false,
    })
  if (upload.error) throw upload.error

  const { data, error } = await supabase
    .from('class_documents')
    .insert({
      class_id: classId,
      storage_path: storagePath,
      original_filename: fileName,
      content_type: contentType,
      size_bytes: file.length,
      description,
      uploaded_by: userId,
    })
    .select()
    .single()

  if (error) {
    await supabase.storage.from(CLASS_DOCUMENT_BUCKET).remove([storagePath])
    throw error
  }

  return data as ClassDocumentRow
}

export async function findClassDocument(classId: string, documentId: string): Promise<ClassDocumentRow | null> {
  const { data, error } = await supabase
    .from('class_documents')
    .select('*')
    .eq('id', documentId)
    .eq('class_id', classId)
    .maybeSingle()
  if (error) throw error
  return (data as ClassDocumentRow | null) ?? null
}

export async function signedDocumentUrl(document: ClassDocumentRow): Promise<string> {
  const { data, error } = await supabase.storage
    .from(CLASS_DOCUMENT_BUCKET)
    .createSignedUrl(document.storage_path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

export async function deleteClassDocument(document: ClassDocumentRow): Promise<void> {
  const storage = await supabase.storage.from(CLASS_DOCUMENT_BUCKET).remove([document.storage_path])
  if (storage.error) throw storage.error
  const { error } = await supabase
    .from('class_documents')
    .delete()
    .eq('id', document.id)
  if (error) throw error
}

