import React, { useEffect } from 'react';

export default function ImageLightbox({ src, filename, onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <img
        className="lightbox-image"
        src={src}
        alt={filename}
        onClick={e => e.stopPropagation()}
      />
      <button className="lightbox-close" onClick={onClose}>✕</button>
      {filename && <div className="lightbox-filename">{filename}</div>}
    </div>
  );
}
