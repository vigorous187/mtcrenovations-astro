// Gallery photos live under src/assets/img/<service>/our-work/ and are
// processed by astro:assets (S-06). portfolio.json references them by
// filename; this helper resolves a (service, filename) pair to the
// imported ImageMetadata. Lazy glob: only images actually resolved get
// processed and emitted.
import type { ImageMetadata } from 'astro';

const loaders = import.meta.glob<ImageMetadata>(
  '/src/assets/img/*/our-work/*.{jpg,jpeg,png,webp,JPG,JPEG}',
);

export async function findGalleryImage(
  service: string,
  filename: string,
): Promise<ImageMetadata | null> {
  const suffix = `/${service}/our-work/${filename}`;
  for (const [path, load] of Object.entries(loaders)) {
    if (path.endsWith(suffix)) return await load();
  }
  return null;
}
