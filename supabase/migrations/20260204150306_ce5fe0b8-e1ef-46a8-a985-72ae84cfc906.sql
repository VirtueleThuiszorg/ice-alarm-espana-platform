-- Update foreign key constraints to allow member deletion by setting NULL instead of blocking

-- internal_tickets: SET NULL on delete
ALTER TABLE internal_tickets 
  DROP CONSTRAINT IF EXISTS internal_tickets_member_id_fkey;
ALTER TABLE internal_tickets 
  ADD CONSTRAINT internal_tickets_member_id_fkey 
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;

-- leads: SET NULL on delete  
ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_converted_member_id_fkey;
ALTER TABLE leads
  ADD CONSTRAINT leads_converted_member_id_fkey
  FOREIGN KEY (converted_member_id) REFERENCES members(id) ON DELETE SET NULL;

-- registration_drafts: SET NULL on delete
ALTER TABLE registration_drafts
  DROP CONSTRAINT IF EXISTS registration_drafts_converted_member_id_fkey;
ALTER TABLE registration_drafts
  ADD CONSTRAINT registration_drafts_converted_member_id_fkey
  FOREIGN KEY (converted_member_id) REFERENCES members(id) ON DELETE SET NULL;

-- crm_contacts: SET NULL on delete
ALTER TABLE crm_contacts
  DROP CONSTRAINT IF EXISTS crm_contacts_linked_member_id_fkey;
ALTER TABLE crm_contacts
  ADD CONSTRAINT crm_contacts_linked_member_id_fkey
  FOREIGN KEY (linked_member_id) REFERENCES members(id) ON DELETE SET NULL;

-- crm_import_rows: SET NULL on delete
ALTER TABLE crm_import_rows
  DROP CONSTRAINT IF EXISTS crm_import_rows_imported_member_id_fkey;
ALTER TABLE crm_import_rows
  ADD CONSTRAINT crm_import_rows_imported_member_id_fkey
  FOREIGN KEY (imported_member_id) REFERENCES members(id) ON DELETE SET NULL;