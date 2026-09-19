update storage.buckets
set allowed_mime_types = array_append(array_append(allowed_mime_types, 'image/gif'), 'font/woff')
where id='presentation-media';
