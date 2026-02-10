import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

export default function InviteModal() {
  const { toggleInviteModal, currentChannel, currentServer, createInvite } = useStore();
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentChannel) {
      createInvite(currentChannel.id).then(invite => {
        setInviteCode(invite.code);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [currentChannel?.id]);

  const inviteUrl = `${window.location.origin}/invite/${inviteCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && toggleInviteModal()}>
      <div className="modal">
        <div className="modal-title" style={{ fontSize: 16, textAlign: 'left' }}>
          Invite friends to {currentServer?.name}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>
          Share this invite code with others:
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Generating invite...</div>
        ) : (
          <div className="invite-code">
            <input value={inviteCode} readOnly />
            <button className="btn btn-primary" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          This invite expires in 24 hours.
        </div>
      </div>
    </div>
  );
}
