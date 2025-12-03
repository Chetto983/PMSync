import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Skeleton } from '@mui/material';

/**
 * Props for LazyImage component
 */
interface LazyImageProps {
  /**
   * Image source URL
   */
  src: string;

  /**
   * Alt text for accessibility
   */
  alt?: string;

  /**
   * Optional blur placeholder (base64 or URL)
   * Falls back to skeleton if not provided
   */
  placeholder?: string;

  /**
   * Optional width
   */
  width?: number | string;

  /**
   * Optional height (for aspect ratio)
   */
  height?: number | string;

  /**
   * CSS class name
   */
  className?: string;

  /**
   * Inline styles
   */
  style?: React.CSSProperties;

  /**
   * Root margin for Intersection Observer (preload distance)
   * @default '100px'
   */
  rootMargin?: string;

  /**
   * Callback when image loads successfully
   */
  onLoad?: () => void;

  /**
   * Callback when image fails to load
   */
  onError?: () => void;
}

/**
 * LazyImage - Image component with lazy loading and blur placeholder
 *
 * Uses Intersection Observer for efficient lazy loading.
 * Shows a skeleton or blur placeholder until the image is loaded.
 *
 * Best practices (2025):
 * - Uses native loading="lazy" as fallback
 * - Intersection Observer for precise control
 * - Skeleton placeholder for better UX
 * - Smooth fade-in transition
 *
 * @see https://web.dev/articles/lazy-loading-images
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API
 *
 * @example
 * ```tsx
 * <LazyImage
 *   src="https://example.com/image.jpg"
 *   alt="Email attachment"
 *   placeholder={blurhash}
 *   onLoad={() => console.log('Image loaded')}
 * />
 * ```
 */
export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt = '',
  placeholder,
  width,
  height,
  className,
  style,
  rootMargin = '100px',
  onLoad,
  onError,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer setup
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Check if IntersectionObserver is available
    if (!('IntersectionObserver' in window)) {
      // Fallback: load immediately
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            // Once in view, stop observing
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin,
        threshold: 0.01,
      }
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [rootMargin]);

  // Handle image load
  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  // Handle image error
  const handleError = useCallback(() => {
    setHasError(true);
    onError?.();
  }, [onError]);

  // Calculate container styles
  const containerStyles: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    width: width || '100%',
    height: height || 'auto',
    maxWidth: '100%',
    ...style,
  };

  // If error, show broken image placeholder
  if (hasError) {
    return (
      <Box
        ref={containerRef}
        className={className}
        sx={{
          ...containerStyles,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
          borderRadius: 1,
          minHeight: 100,
        }}
      >
        <Box
          component="span"
          sx={{
            color: 'text.disabled',
            fontSize: '0.75rem',
          }}
        >
          Image not available
        </Box>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      className={className}
      sx={{
        ...containerStyles,
        // Aspect ratio container if height specified
        ...(height && {
          aspectRatio: width && height ? `${width} / ${height}` : undefined,
        }),
      }}
    >
      {/* Skeleton/Placeholder - shown until image loads */}
      {!isLoaded && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            transition: 'opacity 0.3s ease',
            opacity: isLoaded ? 0 : 1,
          }}
        >
          {placeholder ? (
            // Blur placeholder image - using img since source is dynamic/unknown
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={placeholder}
              alt=""
              aria-hidden="true"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: 'blur(20px)',
                transform: 'scale(1.1)', // Prevent blur edges showing
              }}
            />
          ) : (
            // Skeleton placeholder
            <Skeleton
              variant="rectangular"
              animation="wave"
              sx={{
                width: '100%',
                height: '100%',
                minHeight: 100,
              }}
            />
          )}
        </Box>
      )}

      {/* Actual image - only start loading when in viewport */}
      {/* Using img since email images come from arbitrary external domains */}
      {isInView && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={handleLoad}
          onError={handleError}
          style={{
            width: '100%',
            height: height ? '100%' : 'auto',
            maxWidth: '100%',
            objectFit: 'contain',
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}
    </Box>
  );
};

export default LazyImage;
