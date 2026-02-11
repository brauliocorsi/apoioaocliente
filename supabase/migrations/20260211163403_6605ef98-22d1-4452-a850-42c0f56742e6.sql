
-- Add color column to tags
ALTER TABLE tags ADD COLUMN color TEXT DEFAULT '#6b7280';

-- Add delivery type and pickup date to tickets
ALTER TABLE tickets ADD COLUMN delivery_type TEXT;
ALTER TABLE tickets ADD COLUMN pickup_date DATE;

-- RLS policies for tags update/delete by supervisors
CREATE POLICY "tags_update" ON tags FOR UPDATE USING (has_role(auth.uid(), 'supervisor'));
CREATE POLICY "tags_delete" ON tags FOR DELETE USING (has_role(auth.uid(), 'supervisor'));
