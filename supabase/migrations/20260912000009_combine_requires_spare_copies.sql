-- combine_stickers() checked raw sticker_inventory.quantity, so it could
-- spend copies that were actually decorating a card: combine two placed
-- stars into a glitter star, and the card still shows two plain stars while
-- the pile backing them has quietly gone to zero. Same rule placing a
-- sticker already follows (sticker_available_count, quantity minus what's
-- placed elsewhere) now applies to combining too, so a sticker has to be
-- taken off its card before it can be combined away.
create or replace function public.combine_stickers(p_sticker_id text, p_foil public.sticker_foil default 'none')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_next public.sticker_foil;
  v_available int;
begin
  if v_owner is null then
    raise exception 'not_authenticated' using errcode = '28000', hint = 'Sign in to combine stickers.';
  end if;

  v_next := case p_foil
    when 'none' then 'glitter'
    when 'glitter' then 'holo'
    else null
  end;
  if v_next is null then
    raise exception 'max_tier' using errcode = 'P0001',
      hint = 'That sticker is already as shiny as it gets.';
  end if;

  -- serialise concurrent combines of the same pile so a double-tap can't spend one copy twice
  perform pg_advisory_xact_lock(hashtext(v_owner::text || ':' || p_sticker_id || ':' || p_foil::text));

  -- lock the pile before checking it, so two concurrent combines can't both
  -- read "2 spare" and each spend the same two copies
  perform 1 from public.sticker_inventory
   where owner_id = v_owner and sticker_id = p_sticker_id and foil = p_foil
     for update;

  v_available := public.sticker_available_count(v_owner, p_sticker_id, p_foil);
  if v_available < 2 then
    raise exception 'not_enough_copies' using errcode = 'P0001',
      hint = 'You need two spare copies of the same sticker, at the same tier — remove any that are on a card first.';
  end if;

  update public.sticker_inventory
     set quantity = quantity - 2
   where owner_id = v_owner and sticker_id = p_sticker_id and foil = p_foil;

  delete from public.sticker_inventory
   where owner_id = v_owner and sticker_id = p_sticker_id and foil = p_foil and quantity = 0;

  insert into public.sticker_inventory (owner_id, sticker_id, foil, quantity)
  values (v_owner, p_sticker_id, v_next, 1)
  on conflict (owner_id, sticker_id, foil)
  do update set quantity = public.sticker_inventory.quantity + 1;

  return jsonb_build_object('sticker_id', p_sticker_id, 'foil', v_next);
end;
$$;
