-- DEMO DATA ONLY. These records are synthetic UI/test fixtures, not hazard
-- assessments and not sourced from BPBD, InaRISK, or a verified study.
insert into public.titik_rawan
  (nama, jenis, tingkat, latitude, longitude, keterangan, sumber, tanggal_data)
select seed.nama, seed.jenis, seed.tingkat, seed.latitude, seed.longitude,
       seed.keterangan, seed.sumber, seed.tanggal_data
from (values
  (
    'DEMO — contoh banjir (bukan titik rawan terverifikasi)',
    'banjir', 'rendah', -3.695400::numeric, 128.181400::numeric,
    'Data sintetis untuk mencoba tampilan peta. Bukan informasi kondisi lapangan.',
    'Data dummy pengujian; bukan data BPBD/InaRISK',
    date '2026-11-24'
  ),
  (
    'DEMO — contoh longsor (bukan titik rawan terverifikasi)',
    'longsor', 'rendah', -3.680000::numeric, 128.190000::numeric,
    'Data sintetis untuk mencoba tampilan peta. Bukan informasi kondisi lapangan.',
    'Data dummy pengujian; bukan data BPBD/InaRISK',
    date '2026-11-24'
  )
) as seed(nama, jenis, tingkat, latitude, longitude, keterangan, sumber, tanggal_data)
where not exists (
  select 1
  from public.titik_rawan existing
  where existing.nama = seed.nama
    and existing.sumber = seed.sumber
);

-- System-authored seed information has no profile author. User/admin-created
-- content is subject to RLS and must have dibuat_oleh set to the current user.
insert into public.informasi (judul, isi, kategori, dibuat_oleh)
select seed.judul, seed.isi, seed.kategori, null
from (values
  (
    'DEMO — Informasi awal Ambon Alert',
    'Konten ini hanya data contoh untuk pengujian tampilan. Bukan pengumuman resmi.',
    'pengumuman'
  ),
  (
    'DEMO — Verifikasi informasi kebencanaan',
    'Periksa informasi melalui kanal resmi. Peta kosong bukan bukti bahwa wilayah aman.',
    'edukasi'
  )
) as seed(judul, isi, kategori)
where not exists (
  select 1
  from public.informasi existing
  where existing.judul = seed.judul
);
