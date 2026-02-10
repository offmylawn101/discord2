export const PERMISSIONS = {
  ADMINISTRATOR:          1n << 3n,
  VIEW_CHANNEL:           1n << 10n,
  MANAGE_CHANNELS:        1n << 4n,
  MANAGE_ROLES:           1n << 28n,
  MANAGE_SERVER:          1n << 5n,
  CREATE_INVITE:          1n << 0n,
  CHANGE_NICKNAME:        1n << 26n,
  MANAGE_NICKNAMES:       1n << 27n,
  KICK_MEMBERS:           1n << 1n,
  BAN_MEMBERS:            1n << 2n,
  SEND_MESSAGES:          1n << 11n,
  MANAGE_MESSAGES:        1n << 13n,
  ATTACH_FILES:           1n << 15n,
  READ_MESSAGE_HISTORY:   1n << 16n,
  MENTION_EVERYONE:       1n << 17n,
  ADD_REACTIONS:           1n << 6n,
  CONNECT:                1n << 20n,
  SPEAK:                  1n << 21n,
  MUTE_MEMBERS:           1n << 22n,
  DEAFEN_MEMBERS:         1n << 23n,
  MOVE_MEMBERS:           1n << 24n,
};

export function hasPermission(perms, perm) {
  const p = BigInt(perms);
  if ((p & PERMISSIONS.ADMINISTRATOR) === PERMISSIONS.ADMINISTRATOR) return true;
  return (p & BigInt(perm)) === BigInt(perm);
}
