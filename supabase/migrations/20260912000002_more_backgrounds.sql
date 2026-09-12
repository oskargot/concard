-- Twelve spectrum backgrounds join the pastels and slate.
-- Mirrors BGS in src/lib/card-style.ts.

alter table public.cards drop constraint cards_style_shape;
alter table public.cards add constraint cards_style_shape check (
  jsonb_typeof(style) = 'object'
  and coalesce(style->>'frame', 'silver') in ('silver', 'gold', 'holo', 'ink')
  and coalesce(style->>'bg', 'paper') in (
    'paper', 'mint', 'sky', 'blush', 'butter',
    'red', 'orange', 'amber', 'lime', 'green', 'teal',
    'cyan', 'blue', 'indigo', 'violet', 'magenta', 'rose',
    'slate')
  and coalesce(style->>'shape', 'rounded') in ('rect', 'rounded', 'shaved')
  and coalesce(style->>'photo_shape', 'round') in ('square', 'round', 'arch', 'circle')
);
