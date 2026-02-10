import React, { useEffect } from 'react';

const SHORTCUT_CATEGORIES = [
  {
    name: 'Navigation',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Quick Switcher' },
      { keys: ['Ctrl', '/'], description: 'Keyboard Shortcuts' },
      { keys: ['Escape'], description: 'Close popup / Cancel' },
    ],
  },
  {
    name: 'Messages',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line' },
      { keys: ['↑'], description: 'Edit last message' },
      { keys: ['@'], description: 'Mention a user' },
    ],
  },
  {
    name: 'Text Formatting',
    shortcuts: [
      { keys: ['Ctrl', 'B'], description: 'Bold' },
      { keys: ['Ctrl', 'I'], description: 'Italic' },
      { keys: ['Ctrl', 'U'], description: 'Underline' },
    ],
  },
];

export default function KeyboardShortcuts({ onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="keyboard-shortcuts-overlay" onClick={onClose}>
      <div className="keyboard-shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="keyboard-shortcuts-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="keyboard-shortcuts-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div className="keyboard-shortcuts-body">
          {SHORTCUT_CATEGORIES.map(category => (
            <div key={category.name} className="shortcut-category">
              <h3>{category.name}</h3>
              {category.shortcuts.map((shortcut, i) => (
                <div key={i} className="shortcut-row">
                  <span className="shortcut-description">{shortcut.description}</span>
                  <span className="shortcut-keys">
                    {shortcut.keys.map((key, ki) => (
                      <React.Fragment key={ki}>
                        {ki > 0 && <span className="shortcut-plus">+</span>}
                        <kbd className="shortcut-key">{key}</kbd>
                      </React.Fragment>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="keyboard-shortcuts-footer">
          <span>Pro tip: Most shortcuts use Cmd on Mac instead of Ctrl</span>
        </div>
      </div>
    </div>
  );
}
