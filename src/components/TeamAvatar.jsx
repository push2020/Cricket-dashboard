/**
 * Shared team avatar component used across all pages.
 * Generates a consistent, human-style cartoon face from DiceBear
 * using the team name as a stable seed — same name always produces the same avatar.
 */

const BG_PALETTE = [
  'b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf',
  'c9f0c4', 'fde68a', 'a7f3d0', 'ddd6fe', 'fed7aa',
  'bfdbfe', 'fca5a5', 'bbf7d0', 'fbcfe8', 'e9d5ff',
];

function stableHash(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h) + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Returns the DiceBear SVG URL for a given team name */
export function teamAvatarUrl(name) {
  const bg = BG_PALETTE[stableHash(name) % BG_PALETTE.length];
  return `https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=${encodeURIComponent(name)}&backgroundColor=${bg}&scale=85`;
}

/** Circular human-avatar img, consistent per team name across all pages */
export default function TeamAvatar({ name, size = 36, style = {} }) {
  if (!name || name === 'TBD') {
    return (
      <span
        className="team-av team-av-tbd"
        style={{ width: size, height: size, fontSize: size * 0.4, ...style }}
      >
        ?
      </span>
    );
  }
  return (
    <img
      src={teamAvatarUrl(name)}
      alt={name}
      className="team-av"
      style={{ width: size, height: size, ...style }}
      loading="lazy"
    />
  );
}
