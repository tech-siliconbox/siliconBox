import { type ImageProps, getImageProps } from 'next/image';

/**
 * `next/image` optimisation without its inline `style` attribute, which the strict
 * style-src CSP blocks. Use this instead of `next/image` everywhere.
 */
export function CspImage(props: ImageProps) {
  const {
    props: { style: _style, alt, ...imageProps },
  } = getImageProps(props);
  // eslint-disable-next-line @next/next/no-img-element -- getImageProps already optimised it.
  return <img alt={alt} {...imageProps} />;
}
