import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store';
import { useNavigate } from 'react-router-dom';

const CATEGORIES = ['Gaming', 'Music', 'Education', 'Science', 'Entertainment', 'Technology', 'Art', 'Social'];

const CATEGORY_ICONS = {
  Gaming: '\uD83C\uDFAE',
  Music: '\uD83C\uDFB5',
  Education: '\uD83D\uDCDA',
  Science: '\uD83D\uDD2C',
  Entertainment: '\uD83C\uDFAC',
  Technology: '\uD83D\uDCBB',
  Art: '\uD83C\uDFA8',
  Social: '\uD83D\uDCAC',
};

export default function ServerDiscovery() {
  const { discoverServers, discoverLoading, discoverTotal, fetchDiscoverServers, toggleDiscover, fetchServers, selectServer } = useStore();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [sort, setSort] = useState('members');
  const [page, setPage] = useState(1);
  const [selectedServer, setSelectedServer] = useState(null);
  const [serverDetail, setServerDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const searchTimeout = useRef(null);

  const limit = 20;
  const totalPages = Math.ceil(discoverTotal / limit);

  // Fetch servers on mount and when filters change
  useEffect(() => {
    fetchDiscoverServers({ page, sort, category: activeCategory, q: search, limit });
  }, [page, sort, activeCategory]);

  // Debounced search
  const handleSearchChange = useCallback((value) => {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      fetchDiscoverServers({ page: 1, sort, category: activeCategory, q: value, limit });
    }, 400);
  }, [sort, activeCategory, fetchDiscoverServers]);

  const handleCategoryClick = (category) => {
    const newCategory = activeCategory === category ? '' : category;
    setActiveCategory(newCategory);
    setPage(1);
  };

  const handleSortChange = (newSort) => {
    setSort(newSort);
    setPage(1);
  };

  const handleServerClick = async (server) => {
    setSelectedServer(server);
    setLoadingDetail(true);
    setJoinError('');
    try {
      const detail = await useStore.getState().fetchDiscoverServerDetail(server.id);
      setServerDetail(detail);
    } catch {
      setServerDetail(null);
    }
    setLoadingDetail(false);
  };

  const handleJoin = async () => {
    if (!serverDetail) return;
    setJoining(true);
    setJoinError('');
    try {
      const result = await useStore.getState().joinDiscoverServer(serverDetail.id);
      if (result.joined || result.already_member) {
        await fetchServers();
        toggleDiscover();
        selectServer(serverDetail.id);
        navigate(`/channels/${serverDetail.id}`);
      }
    } catch (err) {
      setJoinError(err.message || 'Failed to join server');
    }
    setJoining(false);
  };

  const handleBackToList = () => {
    setSelectedServer(null);
    setServerDetail(null);
    setJoinError('');
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 32px 0',
        background: 'linear-gradient(135deg, #5865F2 0%, #EB459E 100%)',
        position: 'relative',
      }}>
        <button
          onClick={toggleDiscover}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(0,0,0,0.3)', border: 'none',
            color: 'white', fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Close"
        >
          X
        </button>

        <h1 style={{
          fontSize: 24, fontWeight: 700, color: 'white', marginBottom: 8,
        }}>
          {selectedServer ? '' : 'Find your community on Discord'}
        </h1>

        {!selectedServer && (
          <>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15, marginBottom: 16 }}>
              From gaming, to music, to learning, there's a place for you.
            </p>

            {/* Search Bar */}
            <div style={{ position: 'relative', marginBottom: -20 }}>
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Explore servers"
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 44px',
                  background: 'var(--bg-tertiary)',
                  border: 'none',
                  borderRadius: 8,
                  color: 'var(--text-normal)',
                  fontSize: 16,
                  outline: 'none',
                }}
              />
              <svg
                style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
                width="20" height="20" viewBox="0 0 24 24" fill="var(--text-muted)"
              >
                <path d="M21.707 20.293l-5.395-5.396A7.946 7.946 0 0018 10c0-4.411-3.589-8-8-8s-8 3.589-8 8 3.589 8 8 8a7.954 7.954 0 004.897-1.688l5.396 5.395a.998.998 0 001.414 0 1 1 0 000-1.414zM10 16c-3.309 0-6-2.691-6-6s2.691-6 6-6 6 2.691 6 6-2.691 6-6 6z" />
              </svg>
            </div>
          </>
        )}

        {selectedServer && (
          <div style={{ paddingBottom: 16 }}>
            <button
              onClick={handleBackToList}
              style={{
                background: 'none', border: 'none', color: 'white',
                cursor: 'pointer', fontSize: 14, display: 'flex',
                alignItems: 'center', gap: 6, padding: 0, marginBottom: 8,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
              Back to Discover
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: selectedServer ? '16px 32px 32px' : '36px 32px 32px',
      }}>
        {selectedServer ? (
          <ServerDetailView
            server={serverDetail}
            loading={loadingDetail}
            joining={joining}
            joinError={joinError}
            onJoin={handleJoin}
            onNavigate={(serverId) => {
              toggleDiscover();
              selectServer(serverId);
              navigate(`/channels/${serverId}`);
            }}
          />
        ) : (
          <>
            {/* Category Chips */}
            <div style={{
              display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap',
            }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => handleCategoryClick(cat)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 20,
                    border: 'none',
                    background: activeCategory === cat ? 'var(--brand-500)' : 'var(--bg-secondary)',
                    color: activeCategory === cat ? 'white' : 'var(--text-normal)',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (activeCategory !== cat) e.currentTarget.style.background = 'var(--bg-modifier-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = activeCategory === cat ? 'var(--brand-500)' : 'var(--bg-secondary)';
                  }}
                >
                  <span>{CATEGORY_ICONS[cat]}</span>
                  {cat}
                </button>
              ))}
            </div>

            {/* Sort Controls */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 16,
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                {discoverTotal} {discoverTotal === 1 ? 'server' : 'servers'} found
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleSortChange('members')}
                  style={{
                    padding: '4px 12px', borderRadius: 4, border: 'none',
                    background: sort === 'members' ? 'var(--brand-500)' : 'var(--bg-secondary)',
                    color: sort === 'members' ? 'white' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  }}
                >
                  Most Members
                </button>
                <button
                  onClick={() => handleSortChange('recent')}
                  style={{
                    padding: '4px 12px', borderRadius: 4, border: 'none',
                    background: sort === 'recent' ? 'var(--brand-500)' : 'var(--bg-secondary)',
                    color: sort === 'recent' ? 'white' : 'var(--text-muted)',
                    cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  }}
                >
                  Recently Created
                </button>
              </div>
            </div>

            {/* Server Grid */}
            {discoverLoading ? (
              <div style={{
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                padding: 60, color: 'var(--text-muted)', fontSize: 15,
              }}>
                Loading servers...
              </div>
            ) : discoverServers.length === 0 ? (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', padding: 60, color: 'var(--text-muted)',
              }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" style={{ marginBottom: 16, opacity: 0.5 }}>
                  <path d="M21.707 20.293l-5.395-5.396A7.946 7.946 0 0018 10c0-4.411-3.589-8-8-8s-8 3.589-8 8 3.589 8 8 8a7.954 7.954 0 004.897-1.688l5.396 5.395a.998.998 0 001.414 0 1 1 0 000-1.414zM10 16c-3.309 0-6-2.691-6-6s2.691-6 6-6 6 2.691 6 6-2.691 6-6 6z" />
                </svg>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>No servers found</div>
                <div style={{ fontSize: 14 }}>Try a different search or category</div>
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 16,
                }}>
                  {discoverServers.map(server => (
                    <ServerCard
                      key={server.id}
                      server={server}
                      onClick={() => handleServerClick(server)}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    gap: 8, marginTop: 24, paddingBottom: 16,
                  }}>
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      style={{
                        padding: '8px 16px', borderRadius: 4, border: 'none',
                        background: 'var(--bg-secondary)', color: 'var(--text-normal)',
                        cursor: page <= 1 ? 'not-allowed' : 'pointer',
                        opacity: page <= 1 ? 0.5 : 1, fontSize: 14,
                      }}
                    >
                      Previous
                    </button>
                    <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      style={{
                        padding: '8px 16px', borderRadius: 4, border: 'none',
                        background: 'var(--bg-secondary)', color: 'var(--text-normal)',
                        cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                        opacity: page >= totalPages ? 0.5 : 1, fontSize: 14,
                      }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ServerCard({ server, onClick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-secondary)',
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 8px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      {/* Banner / Color Header */}
      <div style={{
        height: 48,
        background: server.banner
          ? `url(${server.banner}) center/cover`
          : `hsl(${hashString(server.id) % 360}, 60%, 45%)`,
      }} />

      {/* Server Icon */}
      <div style={{ padding: '0 16px', marginTop: -24, position: 'relative', zIndex: 1 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 16,
          background: 'var(--bg-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', border: '4px solid var(--bg-secondary)',
          fontSize: 18, fontWeight: 700, color: 'var(--text-normal)',
        }}>
          {server.icon ? (
            <img src={server.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            server.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
          )}
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '8px 16px 16px' }}>
        <h3 style={{
          fontSize: 16, fontWeight: 700, color: 'var(--header-primary)',
          marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {server.name}
        </h3>

        <p style={{
          fontSize: 13, color: 'var(--text-muted)',
          marginBottom: 12, lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
          minHeight: 36,
        }}>
          {server.description || 'No description'}
        </p>

        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#3ba55c', display: 'inline-block',
            }} />
            {server.online_count || 0} Online
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#747f8d', display: 'inline-block',
            }} />
            {server.member_count || 0} Members
          </span>
        </div>
      </div>
    </div>
  );
}

function ServerDetailView({ server, loading, joining, joinError, onJoin, onNavigate }) {
  if (loading || !server) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: 60, color: 'var(--text-muted)',
      }}>
        {loading ? 'Loading server details...' : 'Server not found'}
      </div>
    );
  }

  return (
    <div>
      {/* Server Header */}
      <div style={{
        display: 'flex', gap: 20, marginBottom: 24, alignItems: 'flex-start',
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: 24,
          background: 'var(--bg-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', flexShrink: 0,
          fontSize: 28, fontWeight: 700, color: 'var(--text-normal)',
        }}>
          {server.icon ? (
            <img src={server.icon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            server.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h2 style={{
            fontSize: 24, fontWeight: 700, color: 'var(--header-primary)',
            marginBottom: 4,
          }}>
            {server.name}
          </h2>

          <div style={{
            display: 'flex', gap: 16, fontSize: 13, color: 'var(--text-muted)', marginBottom: 8,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#3ba55c', display: 'inline-block',
              }} />
              {server.online_count || 0} Online
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: '#747f8d', display: 'inline-block',
              }} />
              {server.member_count || 0} Members
            </span>
            <span>{server.channel_count || 0} Channels</span>
          </div>

          {server.description && (
            <p style={{
              fontSize: 14, color: 'var(--text-normal)', lineHeight: 1.5,
              marginBottom: 12,
            }}>
              {server.description}
            </p>
          )}

          {joinError && (
            <div style={{
              padding: '8px 12px', background: 'rgba(237, 66, 69, 0.15)',
              color: '#ED4245', borderRadius: 4, marginBottom: 12, fontSize: 13,
            }}>
              {joinError}
            </div>
          )}

          {server.is_member ? (
            <button
              onClick={() => onNavigate(server.id)}
              style={{
                padding: '10px 24px', borderRadius: 4, border: 'none',
                background: 'var(--brand-500)', color: 'white',
                cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--brand-560)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--brand-500)'}
            >
              Already Joined - Go to Server
            </button>
          ) : (
            <button
              onClick={onJoin}
              disabled={joining}
              style={{
                padding: '10px 24px', borderRadius: 4, border: 'none',
                background: joining ? 'var(--brand-560)' : 'var(--green-360)',
                color: 'white', cursor: joining ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600,
              }}
              onMouseEnter={(e) => { if (!joining) e.currentTarget.style.opacity = '0.9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              {joining ? 'Joining...' : 'Join Server'}
            </button>
          )}
        </div>
      </div>

      {/* Featured Channels */}
      {server.featured_channels && server.featured_channels.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{
            fontSize: 13, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', marginBottom: 12,
          }}>
            Featured Channels
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {server.featured_channels.map(ch => (
              <div key={ch.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', background: 'var(--bg-secondary)',
                borderRadius: 4,
              }}>
                <span style={{ color: 'var(--channel-icon)', fontSize: 20 }}>#</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-normal)', fontSize: 14 }}>
                    {ch.name}
                  </div>
                  {ch.topic && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {ch.topic}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Server Info */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', marginBottom: 12,
        }}>
          Server Info
        </h3>
        <div style={{
          padding: '12px 16px', background: 'var(--bg-secondary)',
          borderRadius: 8,
        }}>
          <div style={{
            display: 'flex', gap: 24, fontSize: 14, color: 'var(--text-normal)',
          }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>Created</div>
              {new Date(server.created_at).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>Members</div>
              {server.member_count}
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>Online</div>
              {server.online_count}
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>Channels</div>
              {server.channel_count}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < (str || '').length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}
