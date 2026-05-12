-- Migration 012: Class-level attached documents and private storage bucket.
-- Run this in the Supabase SQL editor.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'class-documents',
  'class-documents',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS class_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  description text,
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_documents_class_created ON class_documents (class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_documents_uploaded_by ON class_documents (uploaded_by);

ALTER TABLE class_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_documents_select_coordinator ON class_documents;
CREATE POLICY class_documents_select_coordinator ON class_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'coordinator'
    )
  );

DROP POLICY IF EXISTS class_documents_select_trainer ON class_documents;
CREATE POLICY class_documents_select_trainer ON class_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM class_trainers t
      JOIN profiles p ON p.email = t.trainer_email
      WHERE p.id = auth.uid()
        AND t.class_id = class_documents.class_id
    )
  );

DROP POLICY IF EXISTS class_documents_select_trainee ON class_documents;
CREATE POLICY class_documents_select_trainee ON class_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM class_enrollments e
      JOIN profiles p ON p.email = e.student_email
      WHERE p.id = auth.uid()
        AND e.class_id = class_documents.class_id
        AND e.status = 'enrolled'
    )
  );

