import express, { Router, type Request, type Response, type NextFunction } from 'express'
import { supabase } from '../lib/supabase'
import { logAudit } from '../lib/audit'
import { writeLimiter } from '../middleware/rateLimiter'
import {
  CLASS_DOCUMENT_MAX_BYTES,
  createClassDocument,
  deleteClassDocument,
  findClassDocument,
  listClassDocuments,
  normalizeContentType,
  safeDescription,
  safeUploadFileName,
  signedDocumentUrl,
  validateUploadRequest,
} from '../lib/classDocuments'

export const classDocumentsRouter = Router()

const rawDocumentUpload = express.raw({
  type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  limit: CLASS_DOCUMENT_MAX_BYTES,
})

async function ensureClassExists(classId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('classes')
    .select('id')
    .eq('id', classId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

classDocumentsRouter.get('/classes/:classId/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const classId = req.params.classId as string
    if (!await ensureClassExists(classId)) {
      res.status(404).json({ error: 'Class not found' })
      return
    }
    res.json(await listClassDocuments(classId))
  } catch (err) {
    next(err)
  }
})

classDocumentsRouter.post('/classes/:classId/documents', writeLimiter, rawDocumentUpload, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const classId = req.params.classId as string
    if (!await ensureClassExists(classId)) {
      res.status(404).json({ error: 'Class not found' })
      return
    }

    const file = validateUploadRequest(req, res)
    if (!file) return
    const fileName = safeUploadFileName(req.get('x-file-name'))
    const contentType = normalizeContentType(req.get('content-type'))
    const description = safeDescription(req.get('x-description'))

    const document = await createClassDocument({
      classId,
      userId: req.userId!,
      fileName,
      contentType,
      description,
      file,
    })

    await logAudit({
      userId: req.userId!,
      action: 'CREATE',
      tableName: 'class_documents',
      recordId: document.id,
      after: document as Record<string, unknown>,
      metadata: { class_id: classId, file_name: fileName, size_bytes: file.length },
      ipAddress: req.ip,
    })

    res.status(201).json(document)
  } catch (err) {
    next(err)
  }
})

classDocumentsRouter.get('/classes/:classId/documents/:documentId/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await findClassDocument(req.params.classId as string, req.params.documentId as string)
    if (!document) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json({ url: await signedDocumentUrl(document) })
  } catch (err) {
    next(err)
  }
})

classDocumentsRouter.delete('/classes/:classId/documents/:documentId', writeLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = await findClassDocument(req.params.classId as string, req.params.documentId as string)
    if (!document) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    await logAudit({
      userId: req.userId!,
      action: 'DELETE',
      tableName: 'class_documents',
      recordId: document.id,
      before: document as Record<string, unknown>,
      metadata: { class_id: req.params.classId as string, file_name: document.original_filename },
      ipAddress: req.ip,
    })
    await deleteClassDocument(document)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
})

