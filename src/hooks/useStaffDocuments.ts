import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_TIMES } from "@/config/constants";
import type { StaffDocument, StaffDocumentType } from "@/types/staff";
import { toast } from "sonner";

export function useStaffDocuments(staffId: string | undefined) {
  return useQuery({
    queryKey: ["staff-documents", staffId],
    queryFn: async () => {
      if (!staffId) return [];

      const { data, error } = await supabase
        .from("staff_documents")
        .select("*")
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as StaffDocument[];
    },
    enabled: !!staffId,
    staleTime: STALE_TIMES.MEDIUM,
  });
}

export function useUploadStaffDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      staffId,
      file,
      documentType,
      notes,
    }: {
      staffId: string;
      file: File;
      documentType: StaffDocumentType;
      notes?: string;
    }) => {
      // Upload file to storage
      const filePath = `${staffId}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("staff-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("staff-documents")
        .getPublicUrl(filePath);

      // Get current user's staff ID
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;

      let uploadedBy: string | null = null;
      if (userId) {
        const { data: staff } = await supabase
          .from("staff")
          .select("id")
          .eq("user_id", userId)
          .single();
        uploadedBy = staff?.id || null;
      }

      // Insert document record
      const { data, error } = await supabase
        .from("staff_documents")
        .insert({
          staff_id: staffId,
          document_type: documentType,
          file_name: file.name,
          file_url: urlData.publicUrl,
          uploaded_by: uploadedBy,
          notes: notes || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await supabase.from("staff_activity_log").insert({
        staff_id: staffId,
        action: "document_upload",
        details: {
          document_type: documentType,
          file_name: file.name,
        },
        performed_by: uploadedBy,
      });

      return data as StaffDocument;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staff-documents", data.staff_id] });
      queryClient.invalidateQueries({ queryKey: ["staff-activity", data.staff_id] });
      toast.success("Document uploaded successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload document");
    },
  });
}

export function useDeleteStaffDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      document,
    }: {
      document: StaffDocument;
    }) => {
      // Extract storage path from URL
      const url = new URL(document.file_url);
      const pathParts = url.pathname.split("/staff-documents/");
      const storagePath = pathParts[pathParts.length - 1];

      // Delete from storage
      if (storagePath) {
        await supabase.storage
          .from("staff-documents")
          .remove([decodeURIComponent(storagePath)]);
      }

      // Delete record
      const { error } = await supabase
        .from("staff_documents")
        .delete()
        .eq("id", document.id);

      if (error) throw error;

      // Log activity
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;

      let performerStaffId: string | null = null;
      if (userId) {
        const { data: staff } = await supabase
          .from("staff")
          .select("id")
          .eq("user_id", userId)
          .single();
        performerStaffId = staff?.id || null;
      }

      await supabase.from("staff_activity_log").insert({
        staff_id: document.staff_id,
        action: "document_delete",
        details: {
          document_type: document.document_type,
          file_name: document.file_name,
        },
        performed_by: performerStaffId,
      });

      return document;
    },
    onSuccess: (document) => {
      queryClient.invalidateQueries({ queryKey: ["staff-documents", document.staff_id] });
      queryClient.invalidateQueries({ queryKey: ["staff-activity", document.staff_id] });
      toast.success("Document deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete document");
    },
  });
}
