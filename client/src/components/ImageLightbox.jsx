import React, { useState, useEffect, useCallback, useRef } from 'react';

export default function ImageLightbox({ src, filename, images, initialIndex, onClose }) {
  // images = [{ src, filename }] - all images in the channel/message for navigation
  // initialIndex = index of current image in images array
  // If images is not provided, just show single image (backward compatible)

  const allImages = images || [{ src, filename }];
  const [currentIndex, setCurrentIndex] = useState(initialIndex || 0);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const imgRef = useRef(null);

  const currentImage = allImages[currentIndex] || allImages[0];

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(i => i - 1);
        resetZoom();
      }
      if (e.key === 'ArrowRight' && currentIndex < allImages.length - 1) {
        setCurrentIndex(i => i + 1);
        resetZoom();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentIndex, allImages.length, onClose, resetZoom]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => {
      const newZoom = z + (e.deltaY > 0 ? -0.2 : 0.2);
      return Math.max(0.5, Math.min(5, newZoom));
    });
  }, []);

  // Pan when zoomed
  const handleMouseDown = (e) => {
    if (zoom > 1) {
      setDragging(true);
      dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    }
  };

  const handleMouseMove = (e) => {
    if (dragging) {
      setPosition({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
    }
  };

  const handleMouseUp = () => setDragging(false);

  // Double-click to toggle zoom
  const handleDoubleClick = () => {
    if (zoom > 1) {
      resetZoom();
    } else {
      setZoom(2);
    }
  };

  // Download
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = currentImage.src;
    a.download = currentImage.filename || 'image';
    a.click();
  };

  return (
    <div className="lightbox-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Top bar */}
      <div className="lightbox-topbar">
        <span className="lightbox-filename">{currentImage.filename || 'Image'}</span>
        <div className="lightbox-topbar-actions">
          <button className="lightbox-action-btn" onClick={() => { resetZoom(); }} title="Reset zoom">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
            </svg>
          </button>
          <button className="lightbox-action-btn" onClick={handleDownload} title="Download">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
          </button>
          <button className="lightbox-action-btn" onClick={onClose} title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Image container */}
      <div
        className="lightbox-image-container"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        style={{ cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        <img
          ref={imgRef}
          className="lightbox-image"
          src={currentImage.src}
          alt={currentImage.filename}
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            transition: dragging ? 'none' : 'transform 0.15s ease',
          }}
          draggable={false}
        />
      </div>

      {/* Navigation arrows */}
      {allImages.length > 1 && currentIndex > 0 && (
        <button className="lightbox-nav lightbox-nav-prev" onClick={(e) => { e.stopPropagation(); setCurrentIndex(i => i - 1); resetZoom(); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
        </button>
      )}
      {allImages.length > 1 && currentIndex < allImages.length - 1 && (
        <button className="lightbox-nav lightbox-nav-next" onClick={(e) => { e.stopPropagation(); setCurrentIndex(i => i + 1); resetZoom(); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
        </button>
      )}

      {/* Bottom image counter */}
      {allImages.length > 1 && (
        <div className="lightbox-counter">
          {currentIndex + 1} / {allImages.length}
        </div>
      )}

      {/* Zoom indicator */}
      {zoom !== 1 && (
        <div className="lightbox-zoom-indicator">{Math.round(zoom * 100)}%</div>
      )}
    </div>
  );
}
