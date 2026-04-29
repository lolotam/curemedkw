-- Allow admins to upload/update/delete in branding-related public buckets.
-- Public read is already implicit (buckets are public), but writes need explicit policies.

CREATE POLICY "Public can read brands images"
ON storage.objects FOR SELECT
USING (bucket_id = 'brands-images');

CREATE POLICY "Admins can upload brands images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'brands-images' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update brands images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'brands-images' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete brands images"
ON storage.objects FOR DELETE
USING (bucket_id = 'brands-images' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read favicone"
ON storage.objects FOR SELECT
USING (bucket_id = 'favicone');

CREATE POLICY "Admins can upload favicone"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'favicone' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update favicone"
ON storage.objects FOR UPDATE
USING (bucket_id = 'favicone' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete favicone"
ON storage.objects FOR DELETE
USING (bucket_id = 'favicone' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Public can read buket images"
ON storage.objects FOR SELECT
USING (bucket_id = 'buket-images');

CREATE POLICY "Admins can upload buket images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'buket-images' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update buket images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'buket-images' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete buket images"
ON storage.objects FOR DELETE
USING (bucket_id = 'buket-images' AND has_role(auth.uid(), 'admin'));