import assert from 'node:assert/strict'
import test from 'node:test'

process.env.SUPABASE_URL ??= 'http://localhost:54321'
process.env.SUPABASE_SECRET_KEY ??= 'test-service-role-key'

test('class document helpers normalize upload metadata', async () => {
  const { normalizeContentType, safeDescription, safeUploadFileName } = await import('../src/lib/classDocuments')

  assert.equal(normalizeContentType('Image/JPEG; charset=binary'), 'image/jpeg')
  assert.equal(safeUploadFileName(encodeURIComponent('../floor sheet.pdf')), '..-floor sheet.pdf')
  assert.equal(safeDescription(encodeURIComponent('  Signed paperwork  ')), 'Signed paperwork')
})

test('class document storage paths stay class-scoped and preserve safe extension', async () => {
  const { buildStoragePath } = await import('../src/lib/classDocuments')

  const path = buildStoragePath('class-123', 'Floor Sheet.PDF')
  assert.match(path, /^class-123\/[0-9a-f-]+\.pdf$/)
})

