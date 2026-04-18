-- Make partner-presentations bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'partner-presentations';