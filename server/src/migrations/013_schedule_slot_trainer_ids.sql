-- Migration 013: Allow multiple trainers on a schedule slot.

ALTER TABLE class_schedule_slots
  ADD COLUMN IF NOT EXISTS trainer_ids uuid[] NOT NULL DEFAULT '{}';

UPDATE class_schedule_slots
SET trainer_ids = ARRAY[trainer_id]
WHERE trainer_id IS NOT NULL
  AND (trainer_ids IS NULL OR array_length(trainer_ids, 1) IS NULL);
