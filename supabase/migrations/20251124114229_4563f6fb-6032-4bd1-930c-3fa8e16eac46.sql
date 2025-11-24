-- Create storage bucket for policy documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('policy-documents', 'policy-documents', false);

-- Add documents column to policies table
ALTER TABLE public.policies
ADD COLUMN documents text[];

-- Create RLS policies for policy documents bucket
CREATE POLICY "Users can view documents in their company"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'policy-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.policies 
    WHERE company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Users can upload documents for their policies"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'policy-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.policies 
    WHERE company_id = get_user_company_id(auth.uid())
  )
);

CREATE POLICY "Users can delete documents from their policies"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'policy-documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.policies 
    WHERE company_id = get_user_company_id(auth.uid())
  )
);