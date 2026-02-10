import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '../store';

// Emoji data with searchable names
const EMOJI_LIST = [
  // Smileys
  ['😀','grinning face happy smile'], ['😃','grinning face big eyes happy'], ['😄','grinning face smiling eyes happy'],
  ['😁','beaming face grin'], ['😆','grinning squinting face laughing'], ['😅','grinning face sweat nervous'],
  ['🤣','rolling floor laughing rofl'], ['😂','face tears joy crying laughing lol'],
  ['🙂','slightly smiling face'], ['😊','smiling face blushing happy'],
  ['😇','smiling face halo angel'], ['🥰','smiling face hearts love'],
  ['😍','heart eyes love'], ['🤩','star struck excited amazed'],
  ['😘','face blowing kiss love'], ['😗','kissing face'], ['😚','kissing face closed eyes'],
  ['😙','kissing face smiling eyes'], ['🥲','smiling face tear sad happy'],
  ['😋','face savoring food yummy delicious'], ['😛','face tongue sticking out'],
  ['😜','winking face tongue'], ['🤪','zany face crazy wild'],
  ['😝','squinting face tongue'], ['🤑','money face rich'],
  ['🤗','hugging face hug'], ['🤭','face hand over mouth giggling'],
  ['🤫','shushing face quiet secret'], ['🤔','thinking face hmm wonder'],
  ['🤐','zipper mouth face shut up'], ['🤨','face raised eyebrow skeptical'],
  ['😐','neutral face meh'], ['😑','expressionless face blank'],
  ['😶','face without mouth speechless'], ['😏','smirking face smug'],
  ['😒','unamused face'], ['🙄','rolling eyes face'],
  ['😬','grimacing face awkward'], ['😌','relieved face'],
  ['😔','pensive face sad thoughtful'], ['😪','sleepy face tired'],
  ['🤤','drooling face'], ['😴','sleeping face zzz'],
  ['😷','face mask sick'], ['🤒','face thermometer sick fever'],
  ['🤕','face head bandage hurt'], ['🤢','nauseated face sick gross'],
  ['🤮','face vomiting puke sick'], ['🥵','hot face sweating'],
  ['🥶','cold face freezing'], ['🥴','woozy face drunk'],
  ['😵','face spiral eyes dizzy'], ['🤯','exploding head mind blown'],
  ['🤠','cowboy hat face'], ['🥳','partying face celebration birthday'],
  ['🥸','disguised face'], ['😎','sunglasses cool face'],
  ['🤓','nerd face glasses'], ['🧐','monocle face'],
  ['😕','confused face'], ['😟','worried face'],
  ['🙁','slightly frowning face sad'], ['😮','face open mouth surprised'],
  ['😯','hushed face surprised'], ['😲','astonished face shocked'],
  ['😳','flushed face embarrassed'], ['🥺','pleading face puppy eyes'],
  ['😦','frowning face open mouth'], ['😧','anguished face'],
  ['😨','fearful face scared'], ['😰','anxious face sweat'],
  ['😥','sad face relieved'], ['😢','crying face tear sad'],
  ['😭','loudly crying face sob'], ['😱','screaming face fear'],
  ['😖','confounded face'], ['😣','persevering face'],
  ['😞','disappointed face'], ['😓','downcast face sweat'],
  ['😩','weary face tired'], ['😫','tired face exhausted'],
  ['🥱','yawning face boring'], ['😤','face steam nose angry huffing'],
  ['😡','pouting face angry red'], ['😠','angry face mad'],
  ['🤬','face symbols mouth swearing cursing'], ['😈','smiling face horns devil'],
  ['👿','angry face horns devil'], ['💀','skull dead death'],
  ['💩','pile poo poop'], ['🤡','clown face'],
  ['👻','ghost boo halloween'], ['👽','alien ufo extraterrestrial'],
  ['👾','alien monster space invader game'], ['🤖','robot face bot'],
  // Gestures
  ['👋','waving hand hello bye hi'], ['👍','thumbs up like good yes ok approve'],
  ['👎','thumbs down dislike bad no'], ['👏','clapping hands bravo'],
  ['🙌','raising hands celebration hooray'], ['🤝','handshake deal agreement'],
  ['🙏','folded hands prayer please thank you'],
  ['✊','raised fist power'], ['👊','fist bump punch'],
  ['✌️','victory peace sign v'], ['🤞','crossed fingers luck hope'],
  ['🤟','love you gesture sign'], ['🤘','rock on metal horns'],
  ['👈','pointing left'], ['👉','pointing right'],
  ['👆','pointing up'], ['👇','pointing down'],
  ['☝️','index pointing up'], ['✋','raised hand stop high five'],
  ['🤚','raised back hand'], ['🖐️','hand fingers splayed'],
  ['🖖','vulcan salute spock'], ['👌','ok hand perfect fine'],
  ['🤌','pinched fingers italian'], ['✍️','writing hand'],
  ['💪','flexed biceps strong muscle'], ['🦾','mechanical arm prosthetic'],
  ['👀','eyes looking'], ['👁️','eye see watch'],
  ['👅','tongue lick taste'], ['👄','mouth lips kiss'],
  // Hearts & love
  ['❤️','red heart love'], ['🧡','orange heart'], ['💛','yellow heart'],
  ['💚','green heart'], ['💙','blue heart'], ['💜','purple heart'],
  ['🖤','black heart dark'], ['🤍','white heart'], ['🤎','brown heart'],
  ['💔','broken heart heartbreak'], ['❤️‍🔥','heart fire burning love passionate'],
  ['💕','two hearts love'], ['💞','revolving hearts love'],
  ['💓','beating heart love'], ['💗','growing heart love'],
  ['💖','sparkling heart love'], ['💘','heart arrow cupid love'],
  ['💝','heart ribbon gift love'], ['💟','heart decoration love'],
  // Common objects & symbols
  ['🔥','fire hot lit flame'], ['💯','hundred points perfect score'],
  ['✅','check mark done complete yes'], ['❌','cross mark no wrong'],
  ['⭐','star'], ['🌟','glowing star sparkle'], ['💫','dizzy star'],
  ['✨','sparkles magic'], ['🎉','party popper celebration tada'],
  ['🎊','confetti ball celebration'], ['🎁','gift present wrapped'],
  ['🏆','trophy winner champion cup'], ['🥇','gold medal first'],
  ['🥈','silver medal second'], ['🥉','bronze medal third'],
  ['⚡','lightning bolt zap electric'], ['💡','light bulb idea'],
  ['🔔','bell notification alert'], ['🔕','bell slash muted no notification'],
  ['📌','pushpin pin'], ['🔗','link chain url'], ['📎','paperclip attach'],
  ['🎵','musical note music'], ['🎶','musical notes music'],
  ['💬','speech bubble chat message'], ['💭','thought bubble thinking'],
  ['👑','crown king queen royal'], ['💎','gem diamond jewel'],
  ['🚀','rocket launch ship space'], ['🌈','rainbow'],
  ['☀️','sun sunny'], ['🌙','crescent moon night'],
  ['⭕','circle'], ['🔴','red circle'], ['🟢','green circle'],
  ['🔵','blue circle'], ['🟡','yellow circle'],
  ['➕','plus add'], ['➖','minus subtract'], ['➗','division divide'],
  ['✖️','multiplication multiply times'],
  ['💲','dollar sign money'], ['💰','money bag rich'],
  ['📱','mobile phone cell'], ['💻','laptop computer'],
  ['🖥️','desktop computer monitor'], ['🎮','video game controller gaming'],
  ['🎬','clapper board movie film'], ['📷','camera photo'],
  ['🔊','speaker high volume loud'], ['🔇','muted speaker quiet'],
  ['⏰','alarm clock time'], ['📅','calendar date'],
  ['📝','memo note writing'], ['📧','email envelope mail'],
  ['🗑️','wastebasket trash delete'], ['🔒','locked secure'],
  ['🔓','unlocked open'], ['🔑','key password'],
  ['⚙️','gear settings'], ['🛠️','hammer wrench tools'],
  ['⚠️','warning caution alert'], ['🚫','prohibited forbidden no'],
  ['❓','question mark'], ['❗','exclamation mark'],
  ['💤','zzz sleep'], ['🏳️','white flag surrender'],
  ['🏁','checkered flag finish race'],
  // Food
  ['🍕','pizza'], ['🍔','hamburger burger'], ['🍟','french fries'],
  ['🌭','hot dog'], ['🍿','popcorn movie'], ['🍩','donut doughnut'],
  ['🍪','cookie'], ['🎂','birthday cake'], ['🍰','cake shortcake'],
  ['🍫','chocolate bar'], ['🍬','candy sweet'], ['🍭','lollipop'],
  ['☕','hot beverage coffee tea'], ['🍺','beer mug'],
  ['🍷','wine glass'], ['🍹','tropical drink cocktail'],
  ['🥤','cup straw drink soda'], ['🧋','bubble tea boba'],
  // Nature
  ['🐶','dog puppy'], ['🐱','cat kitty'], ['🐭','mouse'],
  ['🐰','rabbit bunny'], ['🦊','fox'], ['🐻','bear'],
  ['🐼','panda'], ['🐨','koala'], ['🐯','tiger'],
  ['🦁','lion'], ['🐮','cow'], ['🐷','pig'],
  ['🐸','frog'], ['🐵','monkey'], ['🐔','chicken'],
  ['🐧','penguin'], ['🦆','duck'], ['🦅','eagle'],
  ['🦋','butterfly'], ['🐛','bug caterpillar'], ['🐝','bee honeybee'],
  ['🌸','cherry blossom flower'], ['🌹','rose flower'], ['🌻','sunflower'],
  ['🌺','hibiscus flower'], ['🌷','tulip flower'], ['🌲','evergreen tree'],
  ['🌳','deciduous tree'], ['🍀','four leaf clover lucky'], ['🍁','maple leaf fall autumn'],
  ['🌊','wave ocean water'],
];

const CATEGORIES = {
  'Recently Used': [],
  'Smileys & People': EMOJI_LIST.filter(([e]) =>
    '😀😃😄😁😆😅🤣😂🙂😊😇🥰😍🤩😘😗😚😙🥲😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬😌😔😪🤤😴😷🤒🤕🤢🤮🥵🥶🥴😵🤯🤠🥳🥸😎🤓🧐😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀💩🤡👻👽👾🤖👋👍👎👏🙌🤝🙏✊👊✌️🤞🤟🤘👈👉👆👇☝️✋🤚🖐️🖖👌🤌✍️💪🦾👀👁️👅👄'.includes(e)
  ),
  'Hearts & Love': EMOJI_LIST.filter(([e]) =>
    '❤️🧡💛💚💙💜🖤🤍🤎💔❤️‍🔥💕💞💓💗💖💘💝💟'.includes(e)
  ),
  'Objects & Symbols': EMOJI_LIST.filter(([e]) =>
    '🔥💯✅❌⭐🌟💫✨🎉🎊🎁🏆🥇🥈🥉⚡💡🔔🔕📌🔗📎🎵🎶💬💭👑💎🚀🌈☀️🌙⭕🔴🟢🔵🟡➕➖➗✖️💲💰📱💻🖥️🎮🎬📷🔊🔇⏰📅📝📧🗑️🔒🔓🔑⚙️🛠️⚠️🚫❓❗💤🏳️🏁'.includes(e)
  ),
  'Food & Drink': EMOJI_LIST.filter(([e]) =>
    '🍕🍔🍟🌭🍿🍩🍪🎂🍰🍫🍬🍭☕🍺🍷🍹🥤🧋'.includes(e)
  ),
  'Nature': EMOJI_LIST.filter(([e]) =>
    '🐶🐱🐭🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🦆🦅🦋🐛🐝🌸🌹🌻🌺🌷🌲🌳🍀🍁🌊'.includes(e)
  ),
};

const CATEGORY_ICONS = {
  'Server': null, // Will be dynamically set based on server emojis
  'Recently Used': '🕐',
  'Smileys & People': '😀',
  'Hearts & Love': '❤️',
  'Objects & Symbols': '💡',
  'Food & Drink': '🍔',
  'Nature': '🐻',
};

// Recently/frequently used tracking in localStorage
function getRecentEmojis() {
  try {
    return JSON.parse(localStorage.getItem('recentEmojis') || '[]');
  } catch { return []; }
}

function addRecentEmoji(emoji) {
  const recent = getRecentEmojis().filter(e => e !== emoji);
  recent.unshift(emoji);
  localStorage.setItem('recentEmojis', JSON.stringify(recent.slice(0, 32)));
}

export default function EmojiPicker({ onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Smileys & People');
  const pickerRef = useRef(null);
  const gridRef = useRef(null);
  const serverEmojis = useStore(s => s.serverEmojis);
  const currentServer = useStore(s => s.currentServer);

  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const recentEmojis = useMemo(() => getRecentEmojis(), []);

  // Search results including custom emojis
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const standardResults = EMOJI_LIST.filter(([emoji, keywords]) =>
      keywords.toLowerCase().includes(q)
    ).map(([emoji]) => ({ type: 'standard', emoji }));

    const customResults = (serverEmojis || []).filter(e =>
      e.name.toLowerCase().includes(q)
    ).map(e => ({ type: 'custom', emoji: e }));

    return [...customResults, ...standardResults];
  }, [search, serverEmojis]);

  const handleSelect = (emoji) => {
    addRecentEmoji(emoji);
    onSelect(emoji);
    onClose();
  };

  const handleCustomSelect = (customEmoji) => {
    const emojiStr = `<:${customEmoji.name}:${customEmoji.id}>`;
    onSelect(emojiStr);
    onClose();
  };

  const scrollToCategory = (cat) => {
    setActiveCategory(cat);
    const el = gridRef.current?.querySelector(`[data-category="${cat}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hasCustomEmojis = serverEmojis && serverEmojis.length > 0;

  return (
    <div className="emoji-picker-full" ref={pickerRef}>
      <div className="emoji-picker-header">
        <input
          className="emoji-picker-search"
          placeholder="Search emoji..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      {!searchResults && (
        <div className="emoji-picker-categories">
          {hasCustomEmojis && (
            <button
              className={`emoji-picker-cat-btn ${activeCategory === 'Server' ? 'active' : ''}`}
              onClick={() => scrollToCategory('Server')}
              title={currentServer?.name || 'Server'}
              style={{ fontSize: 14, fontWeight: 600 }}
            >
              {currentServer?.icon ? (
                <img src={currentServer.icon} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 11 }}>{currentServer?.name?.[0]?.toUpperCase() || 'S'}</span>
              )}
            </button>
          )}
          {Object.entries(CATEGORY_ICONS).filter(([cat]) => cat !== 'Server').map(([cat, icon]) => (
            <button
              key={cat}
              className={`emoji-picker-cat-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => scrollToCategory(cat)}
              title={cat}
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      <div className="emoji-picker-grid" ref={gridRef}>
        {searchResults ? (
          <div>
            <div className="emoji-picker-category-label">
              Search Results ({searchResults.length})
            </div>
            <div className="emoji-grid">
              {searchResults.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>
                  No emojis found
                </div>
              ) : (
                searchResults.map((item, i) => (
                  item.type === 'custom' ? (
                    <button
                      key={`c-${item.emoji.id}`}
                      className="emoji-btn"
                      onClick={() => handleCustomSelect(item.emoji)}
                      title={`:${item.emoji.name}:`}
                    >
                      <img
                        src={item.emoji.image_url}
                        alt={item.emoji.name}
                        style={{ width: 22, height: 22, objectFit: 'contain' }}
                      />
                    </button>
                  ) : (
                    <button key={`s-${i}`} className="emoji-btn" onClick={() => handleSelect(item.emoji)}>
                      {item.emoji}
                    </button>
                  )
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Server custom emojis */}
            {hasCustomEmojis && (
              <div data-category="Server">
                <div className="emoji-picker-category-label">{currentServer?.name || 'Server'}</div>
                <div className="emoji-grid">
                  {serverEmojis.map(emoji => (
                    <button
                      key={emoji.id}
                      className="emoji-btn"
                      onClick={() => handleCustomSelect(emoji)}
                      title={`:${emoji.name}:`}
                    >
                      <img
                        src={emoji.image_url}
                        alt={emoji.name}
                        style={{ width: 22, height: 22, objectFit: 'contain' }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Recently used */}
            {recentEmojis.length > 0 && (
              <div data-category="Recently Used">
                <div className="emoji-picker-category-label">Recently Used</div>
                <div className="emoji-grid">
                  {recentEmojis.map((emoji, i) => (
                    <button key={`r-${i}`} className="emoji-btn" onClick={() => handleSelect(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Regular categories */}
            {Object.entries(CATEGORIES).filter(([cat]) => cat !== 'Recently Used').map(([category, emojis]) => (
              <div key={category} data-category={category}>
                <div className="emoji-picker-category-label">{category}</div>
                <div className="emoji-grid">
                  {emojis.map(([emoji], i) => (
                    <button key={`${category}-${i}`} className="emoji-btn" onClick={() => handleSelect(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
