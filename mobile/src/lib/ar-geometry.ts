export type Rect = { left: number; top: number; width: number; height: number };

/**
 * Where a face found in a photo sits on the live preview.
 *
 * `box` is x, y, width, height as fractions of the upright photo. The preview fills the view and crops the rest
 * ("cover"), so the photo is scaled until it covers the view and centred. The front camera's preview is mirrored
 * but its photos are not, so boxes are flipped horizontally for it.
 */
export function boxToView(
  box: [number, number, number, number],
  photoAspect: number, // width / height of the upright photo
  view: { width: number; height: number },
  mirrored: boolean,
): Rect {
  const [x, y, w, h] = box;
  const coverWidth = view.width / view.height > photoAspect ? view.width : view.height * photoAspect;
  const coverHeight = coverWidth / photoAspect;
  const offsetX = (view.width - coverWidth) / 2;
  const offsetY = (view.height - coverHeight) / 2;
  const left = mirrored ? 1 - x - w : x;
  return { left: offsetX + left * coverWidth, top: offsetY + y * coverHeight, width: w * coverWidth, height: h * coverHeight };
}
