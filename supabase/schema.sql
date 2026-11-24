-- Ambon Alert starter schema for Supabase (PostgreSQL 15+).
-- Apply to a fresh project or review as a migration before applying to existing data.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nama text not null check (char_length(btrim(nama)) between 1 and 100),
  email text not null,
  role text not null default 'warga' check (role in ('warga', 'admin')),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_uidx
  on public.profiles (lower(email));

create table if not exists public.laporan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  jenis text not null check (jenis in ('banjir', 'longsor')),
  judul text not null check (char_length(btrim(judul)) between 1 and 150),
  deskripsi text not null check (char_length(btrim(deskripsi)) >= 10),
  waktu_kejadian timestamptz not null,
  latitude numeric(9, 6) not null check (latitude between -11 and 6.5),
  longitude numeric(10, 6) not null check (longitude between 95 and 141),
  alamat text,
  foto text,
  status text not null default 'menunggu'
    check (status in ('menunggu', 'terverifikasi', 'ditolak')),
  alasan_penolakan text,
  diverifikasi_oleh uuid references public.profiles (id) on delete set null,
  diverifikasi_pada timestamptz,
  created_at timestamptz not null default now(),
  constraint laporan_rejection_reason check (
    (status = 'ditolak'
      and alasan_penolakan is not null
      and char_length(btrim(alasan_penolakan)) between 1 and 255
      and diverifikasi_pada is not null)
    or (status = 'terverifikasi'
      and alasan_penolakan is null
      and diverifikasi_pada is not null)
    or (status = 'menunggu'
      and alasan_penolakan is null
      and diverifikasi_oleh is null
      and diverifikasi_pada is null)
  )
);

alter table public.laporan drop constraint if exists laporan_photo_owner_path;
alter table public.laporan drop constraint if exists laporan_foto_path_format;
alter table public.laporan add constraint laporan_foto_path_format check (
  foto is null or foto ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
);

create table if not exists public.titik_rawan (
  id uuid primary key default gen_random_uuid(),
  nama text not null check (char_length(btrim(nama)) > 0),
  jenis text not null check (jenis in ('banjir', 'longsor')),
  tingkat text not null default 'sedang'
    check (tingkat in ('rendah', 'sedang', 'tinggi')),
  latitude numeric(9, 6) not null check (latitude between -11 and 6.5),
  longitude numeric(10, 6) not null check (longitude between 95 and 141),
  keterangan text,
  sumber text not null check (char_length(btrim(sumber)) > 0),
  tanggal_data date not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.informasi (
  id uuid primary key default gen_random_uuid(),
  judul text not null check (char_length(btrim(judul)) between 1 and 200),
  isi text not null check (char_length(btrim(isi)) >= 5),
  kategori text not null default 'pengumuman'
    check (kategori in ('pengumuman', 'edukasi', 'kontak')),
  -- Nullable for system-authored seed content; user-created content must name its author.
  dibuat_oleh uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists laporan_user_created_idx
  on public.laporan (user_id, created_at desc);
create index if not exists laporan_public_status_created_idx
  on public.laporan (status, created_at desc);
create index if not exists laporan_foto_idx
  on public.laporan (foto) where foto is not null;
create index if not exists titik_rawan_kind_idx
  on public.titik_rawan (jenis, tingkat);
create index if not exists informasi_category_created_idx
  on public.informasi (kategori, created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  if new.email is null or char_length(btrim(new.email)) = 0 then
    raise exception 'Ambon Alert requires an email address for each account';
  end if;

  profile_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nama'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    100
  );

  insert into public.profiles (id, nama, email)
  values (new.id, profile_name, new.email)
  on conflict (id) do update
    set email = excluded.email,
        nama = case
          when new.raw_user_meta_data ? 'nama'
            or new.raw_user_meta_data ? 'full_name'
          then excluded.nama
          else public.profiles.nama
        end;

  return new;
end;
$$;

revoke all on function public.handle_auth_user_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_profile_created on auth.users;
create trigger on_auth_user_profile_created
  after insert or update on auth.users
  for each row execute function public.handle_auth_user_profile();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists titik_rawan_set_updated_at on public.titik_rawan;
create trigger titik_rawan_set_updated_at
  before update on public.titik_rawan
  for each row execute function public.set_updated_at();

create or replace function public.validate_laporan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.waktu_kejadian > now() then
    raise exception 'waktu_kejadian tidak boleh berada di masa depan';
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.user_id <> auth.uid() then
      raise exception 'user_id laporan harus sama dengan pengguna yang sedang masuk';
    end if;
    if new.status <> 'menunggu'
      or new.diverifikasi_oleh is not null
      or new.diverifikasi_pada is not null
      or new.alasan_penolakan is not null then
      raise exception 'Laporan baru harus menunggu verifikasi';
    end if;
  elsif new.status is distinct from old.status then
    if not public.is_admin() then
      raise exception 'Hanya admin yang dapat mengubah status laporan';
    end if;
    if new.status = 'menunggu' then
      new.alasan_penolakan := null;
      new.diverifikasi_oleh := null;
      new.diverifikasi_pada := null;
    elsif old.status <> 'menunggu' then
      raise exception 'Status laporan yang telah diputuskan tidak dapat diubah';
    else
      new.diverifikasi_oleh := auth.uid();
      new.diverifikasi_pada := now();
      if new.status = 'terverifikasi' then
        new.alasan_penolakan := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_laporan() from public, anon, authenticated;

drop trigger if exists laporan_validate on public.laporan;
create trigger laporan_validate
  before insert or update on public.laporan
  for each row execute function public.validate_laporan();

alter table public.profiles enable row level security;
alter table public.laporan enable row level security;
alter table public.titik_rawan enable row level security;
alter table public.informasi enable row level security;

drop policy if exists profiles_read_self_or_admin on public.profiles;
create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists profiles_update_self_name on public.profiles;
create policy profiles_update_self_name on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists laporan_read_verified_or_owner on public.laporan;
create policy laporan_read_verified_or_owner on public.laporan
  for select to anon, authenticated
  using (status in ('terverifikasi', 'menunggu') or user_id = (select auth.uid()));

drop policy if exists laporan_admin_read on public.laporan;
create policy laporan_admin_read on public.laporan
  for select to authenticated
  using ((select public.is_admin()));

drop policy if exists laporan_insert_owner_or_admin on public.laporan;
create policy laporan_insert_owner_or_admin on public.laporan
  for insert to authenticated
  with check (
    (select public.is_admin())
    or (
      user_id = (select auth.uid())
      and status = 'menunggu'
      and diverifikasi_oleh is null
      and diverifikasi_pada is null
      and alasan_penolakan is null
    )
  );

drop policy if exists laporan_admin_update on public.laporan;
create policy laporan_admin_update on public.laporan
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists laporan_admin_delete on public.laporan;
create policy laporan_admin_delete on public.laporan
  for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists titik_rawan_public_read on public.titik_rawan;
create policy titik_rawan_public_read on public.titik_rawan
  for select to anon, authenticated
  using (true);

drop policy if exists titik_rawan_admin_insert on public.titik_rawan;
create policy titik_rawan_admin_insert on public.titik_rawan
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists titik_rawan_admin_update on public.titik_rawan;
create policy titik_rawan_admin_update on public.titik_rawan
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists titik_rawan_admin_delete on public.titik_rawan;
create policy titik_rawan_admin_delete on public.titik_rawan
  for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists informasi_public_read on public.informasi;
create policy informasi_public_read on public.informasi
  for select to anon, authenticated
  using (true);

drop policy if exists informasi_admin_insert on public.informasi;
create policy informasi_admin_insert on public.informasi
  for insert to authenticated
  with check (
    (select public.is_admin())
    and dibuat_oleh = (select auth.uid())
  );

drop policy if exists informasi_admin_update on public.informasi;
create policy informasi_admin_update on public.informasi
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists informasi_admin_delete on public.informasi;
create policy informasi_admin_delete on public.informasi
  for delete to authenticated
  using ((select public.is_admin()));

-- Public-facing view deliberately omits user_id and verifier identity.
drop view if exists public.laporan_publik;
create view public.laporan_publik
with (security_invoker = true)
as
select id, jenis, judul, deskripsi, waktu_kejadian,
       latitude, longitude, alamat, foto, status, created_at
from public.laporan
where status in ('terverifikasi', 'menunggu');

-- Admin-only view can expose reporter identity for moderation. It uses the
-- view owner's table privileges, and its predicate checks the caller's JWT.
create or replace view public.laporan_admin
with (security_barrier = true)
as
select id, user_id, jenis, judul, deskripsi, waktu_kejadian,
       latitude, longitude, alamat, foto, status, alasan_penolakan,
       diverifikasi_oleh, diverifikasi_pada, created_at
from public.laporan
where public.is_admin();

-- Authenticated users get their own history through this definer view, without
-- receiving SELECT permission on the reporter's user_id column.
create or replace view public.laporan_saya
with (security_barrier = true)
as
select id, jenis, judul, deskripsi, waktu_kejadian, latitude, longitude,
       alamat, status, alasan_penolakan, diverifikasi_pada, created_at
from public.laporan
where user_id = (select auth.uid());

-- A report photo becomes readable to the public only while its report is
-- pending or verified. The photo path is an opaque random UUID, not user_id.
create or replace function public.is_public_report_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.laporan as r
    where r.foto = object_name
      and r.status in ('menunggu', 'terverifikasi')
  );
$$;

revoke all on function public.is_public_report_photo(text) from public;
grant execute on function public.is_public_report_photo(text) to anon, authenticated;

revoke all on public.profiles, public.laporan, public.titik_rawan, public.informasi
  from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (nama) on public.profiles to authenticated;

grant select (id, jenis, judul, deskripsi, waktu_kejadian, latitude, longitude,
              alamat, foto, status, created_at)
  on public.laporan to anon, authenticated;
grant insert (jenis, judul, deskripsi, waktu_kejadian, latitude, longitude, alamat, foto)
  on public.laporan to authenticated;
grant update (jenis, judul, deskripsi, waktu_kejadian, latitude, longitude,
              alamat, foto, status, alasan_penolakan, diverifikasi_oleh, diverifikasi_pada)
  on public.laporan to authenticated;
grant delete on public.laporan to authenticated;
grant select on public.laporan_publik to anon, authenticated;
grant select on public.laporan_admin to authenticated;
grant select on public.laporan_saya to authenticated;

grant select on public.titik_rawan to anon, authenticated;
grant insert, update, delete on public.titik_rawan to authenticated;
grant select (id, judul, isi, kategori, created_at)
  on public.informasi to anon, authenticated;
grant insert, update, delete on public.informasi to authenticated;

-- Non-public bucket: opaque UUID object names allow signed URLs without exposing user IDs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'laporan-foto',
  'laporan-foto',
  false,
  3145728,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists laporan_foto_read_owner_or_admin on storage.objects;
create policy laporan_foto_read_owner_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'laporan-foto'
    and (
      owner_id = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

drop policy if exists laporan_foto_read_linked_public_report on storage.objects;
create policy laporan_foto_read_linked_public_report on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'laporan-foto'
    and storage.allow_any_operation(array[
      'storage.object.sign',
      'storage.object.sign_many'
    ])
    and (select public.is_public_report_photo(name))
  );

drop policy if exists laporan_foto_insert_owner on storage.objects;
create policy laporan_foto_insert_owner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'laporan-foto'
    and name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  );

drop policy if exists laporan_foto_update_owner_or_admin on storage.objects;
create policy laporan_foto_update_owner_or_admin on storage.objects
  for update to authenticated
  using (
    bucket_id = 'laporan-foto'
    and (
      owner_id = (select auth.uid())::text
      or (select public.is_admin())
    )
  )
  with check (
    bucket_id = 'laporan-foto'
    and (
      owner_id = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

drop policy if exists laporan_foto_delete_owner_or_admin on storage.objects;
create policy laporan_foto_delete_owner_or_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'laporan-foto'
    and (
      owner_id = (select auth.uid())::text
      or (select public.is_admin())
    )
  );
