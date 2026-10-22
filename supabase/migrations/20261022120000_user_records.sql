-- What a signed-in user's devices sync (web/src/lib/sync.ts): one row per journal entry, sticker or
-- setting. The app keeps its own copy on each device; this is where devices meet.
create table public.user_records (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('entry', 'sticker', 'setting')),
  id text not null,              -- the entry's or sticker's id, or the setting's localStorage key
  data jsonb,                    -- the record, with files replaced by { path } in the `user-files` bucket; null when deleted
  changed_at timestamptz not null, -- when a device last changed it (the device's clock); the later change wins
  deleted boolean not null default false,
  primary key (user_id, kind, id)
);

alter table public.user_records enable row level security;

create policy "Users manage their own records" on public.user_records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Photos, stickers and audio notes, at `<user id>/<sha-256 of the file>`: named by content, so a file is
-- uploaded once however many entries use it. Private: only its owner can read it.
insert into storage.buckets (id, name, public) values ('user-files', 'user-files', false);

create policy "Users read their own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users add their own files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
