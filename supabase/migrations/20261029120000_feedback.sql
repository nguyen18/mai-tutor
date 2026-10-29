-- Feedback from signed-in users (the 💬 button, web/src/components/FeedbackButton.tsx). The `feedback`
-- function saves each one here first, then makes it a ticket on the owner's Notion board ("user tickets"
-- on the mai tutor page) and records the ticket's link: if Notion fails, the feedback isn't lost.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  email text not null,
  summary text not null check (char_length(summary) between 1 and 200),
  details text not null default '' check (char_length(details) <= 5000),
  image_path text,                 -- in the `feedback-images` bucket, at `<user id>/<feedback id>.<ext>`
  context jsonb not null default '{}', -- the page, app version and browser it was sent from
  notion_url text,                 -- the ticket, once it's on the board
  notion_error text,               -- why it isn't, when making the ticket failed
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- The function acts as the signed-in user, so these are all it can do: add, read and update their own.
create policy "Users add their own feedback" on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users read their own feedback" on public.feedback
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users update their own feedback" on public.feedback
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Screenshots sent with feedback. Private: only the sender can read theirs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback-images', 'feedback-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

create policy "Users add their own feedback images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'feedback-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users read their own feedback images" on storage.objects
  for select to authenticated
  using (bucket_id = 'feedback-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
