update storage.buckets set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml',
  'video/mp4', 'video/webm', 'font/woff2', 'text/css', 'text/javascript', 'application/javascript'
] where id = 'presentation-media';
