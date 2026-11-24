# Ambon Alert — kerangka awal

Antarmuka web GIS statis untuk berbagi informasi banjir dan tanah longsor di Kota Ambon. Dibangun dengan HTML, CSS, dan JavaScript murni; tidak memerlukan framework atau bundler.

## Struktur

- `index.html` — beranda dan peta situasi.
- `laporan.html` — laporan warga terautentikasi dengan pemilih lokasi dan unggahan foto.
- `daftar.html`, `masuk.html`, `akun.html` — alur akun warga dan ganti kata sandi.
- `riwayat.html` — daftar laporan akun yang sedang masuk.
- `panduan.html` — batasan penggunaan dan panduan warga.
- `css/style.css` — tema kontras tinggi, komponen kaca, dan layout responsif.
- `js/config.js` — konfigurasi publik awal Supabase.
- `js/supabase.js` — helper ESM Supabase JS v2 untuk Auth dan Storage.
- `js/auth-ui.js`, `js/auth-utils.js` — status sesi, logout, dan proteksi halaman.
- `js/register.js`, `js/login.js`, `js/account.js`, `js/history.js` — alur pengguna.
- `js/map.js` — peta Leaflet dan tile OpenStreetMap.
- `admin/index.html` — dashboard ringkasan administrator.
- `admin/laporan.html` — moderasi laporan, status, dan penghapusan foto.
- `admin/titik-rawan.html` — CRUD titik rawan dengan pemilih peta.
- `admin/informasi.html` — CRUD informasi publik.
- `js/admin/` — pemeriksaan role admin dan logika dashboard/CRUD.
- `informasi.html` — pengumuman, edukasi, dan kontak publik dari admin.
- `js/informasi.js` — pemuatan daftar informasi publik.
- `js/report-form.js` — form laporan terautentikasi, unggahan foto, dan pemilih lokasi.
- `js/ui.js` — perilaku navigasi seluler.
- `supabase/schema.sql` — tabel, constraint, trigger, RLS, view publik/admin, dan kebijakan Storage.
- `supabase/seed.sql` — data dummy yang ditandai jelas untuk pengujian antarmuka.
- `.env.example` — nama variabel contoh, bukan file konfigurasi browser.

## Menjalankan di VS Code

1. Buka folder proyek `ambon-alert` di VS Code.
2. Pasang ekstensi **Live Server** (Ritwick Dey), lalu klik kanan `index.html` dan pilih **Open with Live Server**. Alternatif: jalankan server statis lokal lain yang melayani folder ini.
3. Jangan membuka halaman langsung melalui `file://`; modul JavaScript ES modules, Auth redirect, dan Supabase memerlukan origin web.
4. Lengkapi konfigurasi Supabase di bawah sebelum menguji alur yang membutuhkan backend.

Halaman admin tersedia di `admin/index.html`; akses tanpa sesi dialihkan ke halaman login, sedangkan akun non-admin menerima penolakan akses.

Leaflet, tile OpenStreetMap, dan Supabase JS membutuhkan akses internet. Tanpa koneksi, halaman menampilkan pesan kegagalan data/peta yang sesuai.

Peta berpusat pada Kota Ambon (`[-3.6954, 128.1814]`) dengan zoom awal `12`. Tile OSM tunduk pada kebijakan penggunaan tile OpenStreetMap.

## Supabase

Untuk mengaktifkan koneksi client:

1. Isi `supabaseUrl` dan `supabaseAnonKey` pada `js/config.js` dengan URL proyek dan anon/publishable key publik.
2. Pada halaman yang akan memakai Supabase, muat config sebagai skrip biasa, lalu impor helper sebagai modul:

   ```html
   <script src="js/config.js"></script>
   <script type="module">
     import { createAmbonAlertClient, signInWithEmail } from "./js/supabase.js";
     const supabase = createAmbonAlertClient();
     // Panggil helper saat UI autentikasi tersedia.
   </script>
   ```

3. Terapkan `supabase/schema.sql`, lalu `supabase/seed.sql`. Buat akun administrator melalui halaman daftar seperti akun lain, lalu naikkan rolenya secara manual melalui lingkungan tepercaya (misalnya SQL Editor Supabase):

   ```sql
   update public.profiles set role = 'admin' where email = 'admin@example.com';
   ```

   4. Aktifkan provider Email di Supabase Auth. Tambahkan origin Live Server (umumnya `http://127.0.0.1:5500`) dan URL deployment ke **Site URL / Redirect URLs** sesuai kebutuhan konfirmasi email.
   5. Keluar lalu masuk kembali dengan akun admin. RLS adalah pengaman otoritatif; pemeriksaan role pada halaman hanya untuk alur antarmuka. Jangan mengubah atau menonaktifkan kebijakan demi mengatasi kegagalan UI.
   6. Tinjau RLS, proses moderasi, privasi, validasi, dan pembatasan penyalahgunaan sebelum operasional.

   Fitur administrator:

   - Dashboard menghitung status dan jenis laporan serta menampilkan laporan menunggu terbaru.
   - Moderasi mendukung filter jenis/status, verifikasi, penolakan dengan alasan wajib, pengembalian ke status menunggu, dan penghapusan. Foto dibersihkan melalui Storage sebelum baris laporan dihapus; kegagalan operasi ditampilkan dengan jelas.
   - Titik rawan dan informasi mendukung tambah, ubah, dan hapus. Aksi basis data tetap dibatasi kebijakan admin; titik rawan memerlukan sumber dan tanggal data.
   - Perubahan laporan tunduk pada trigger skema. Status yang telah diputuskan perlu dikembalikan ke `menunggu` sebelum dapat diputuskan kembali.

Frontend hanya boleh memakai anon/publishable key dengan kebijakan RLS yang tepat. Jangan pernah mengekspos service-role key atau rahasia melalui JavaScript, `.env`, atau repositori. File `.env` tidak dibaca langsung oleh browser statis.

Bucket `laporan-foto` tidak bersifat public, dibatasi ke JPG/PNG/WebP dan 3 MiB, serta memakai nama objek UUID acak tanpa UUID pengguna. Foto yang terhubung ke laporan `menunggu` atau `terverifikasi` dapat diminta sebagai signed URL untuk popup publik; foto laporan `ditolak` tidak dapat dibaca publik. Sampaikan kepada pelapor bahwa foto yang dilampirkan dapat dilihat publik dan jangan unggah wajah atau data pribadi. Validasi MIME browser bukan pemeriksaan isi file penuh, sehingga deployment operasional perlu validasi tambahan.

`laporan_publik` hanya menampilkan laporan menunggu/terverifikasi tanpa identitas pelapor; laporan ditolak tidak disertakan. `laporan_saya` membatasi riwayat pada akun aktif tanpa memberikan izin baca kolom `user_id`; `laporan_admin` menyediakan identitas untuk moderasi dan hanya dapat dibaca admin. Foto laporan menunggu/terverifikasi ditampilkan via signed URL dan menggunakan nama objek acak yang tidak memuat identitas. Jika sebelumnya menyimpan path foto dengan UUID pengguna, migrasikan file dan nilai `foto` terlebih dahulu sebelum menerapkan constraint path UUID acak. Data di `seed.sql` seluruhnya sintetis, bukan data BPBD/InaRISK atau penilaian bahaya yang tervalidasi. Role `admin` tidak pernah diberikan dari metadata pendaftaran pengguna.

## Skenario uji Black Box utama

Jalankan setelah skema/seed diterapkan serta akun warga dan admin tersedia. Periksa tampilan publik dan database Supabase untuk memastikan hasil.

| Area | Langkah uji | Hasil yang diharapkan |
|---|---|---|
| Proteksi admin | Buka tiap halaman `admin/` tanpa login | Dialihkan ke login dan kembali ke halaman admin setelah berhasil login |
| Pembatasan role | Masuk sebagai `warga`, buka halaman admin | Panel admin tidak terbuka; pesan akses ditolak tampil |
| Dashboard | Sebagai admin, muat dashboard dengan data laporan beragam status/jenis | Kartu jumlah status dan jenis cocok dengan data; laporan menunggu terbaru ditampilkan |
| Filter laporan | Pilih tiap status, jenis, lalu kombinasikan | Hanya laporan yang sesuai filter ditampilkan; laporan ditolak tidak hilang dari daftar admin |
| Verifikasi/penolakan | Verifikasi laporan menunggu; tolak laporan lain dengan alasan kosong, alasan valid, dan >255 karakter | Verifikasi berhasil; alasan kosong/panjang ditolak; alasan valid tersimpan dan terlihat di riwayat warga |
| Reset status | Kembalikan laporan terverifikasi/ditolak ke menunggu, lalu buka riwayat warga | Status kembali menunggu dan alasan penolakan serta data verifikasi dihapus |
| Hapus laporan/foto | Hapus laporan berfoto; ulangi saat Storage menolak penghapusan | Pada sukses laporan dan foto terhapus; bila foto gagal, laporan tetap ada dan kesalahan terlihat |
| Titik rawan | Tambah titik valid via klik peta, geser marker, serta koordinat manual | Titik tersimpan; marker/koordinat sinkron; publik melihat titik dengan sumber dan tanggal |
| Validasi titik | Kirim tanpa sumber/tanggal, format tanggal salah, atau koordinat di luar kisaran Indonesia | Validasi mencegah penyimpanan dan isian tetap tersedia |
| Edit/hapus titik | Ubah tiap field titik, simpan; lalu hapus | Nilai terbaru tampil di daftar dan peta publik; setelah hapus titik tidak tampil |
| Informasi publik | Tambah informasi pada ketiga kategori, ubah, lalu hapus | Konten tersimpan dan tampil/berubah/hilang pada halaman publik |
| Batas akses data | Coba operasi tulis dengan akun warga/anon serta putuskan koneksi | RLS menolak operasi; UI menampilkan kegagalan tanpa mengosongkan input form |

Hasil pengujian UI lokal tidak menggantikan pemeriksaan RLS dan kebijakan Storage pada proyek Supabase yang akan dipakai.

Halaman login menambahkan jeda lokal setelah lima kegagalan kata sandi, sebagai lapisan UX saja; hal ini dapat dilewati dengan menghapus penyimpanan browser dan bukan pengganti rate limit Supabase Auth. Pemilih lokasi menerima GPS yang tersedia di peramban (umumnya perlu HTTPS) dan menampilkan peringatan berdasarkan kotak koordinat indikatif Ambon, bukan batas wilayah administratif resmi. Pastikan titik sebelum mengirim.

## Batasan dan keselamatan

Ambon Alert adalah sarana pendukung/pelengkap, bukan pengganti SP4N-LAPOR!, layanan darurat resmi, atau sistem operasional BPBD. Aplikasi tidak menyediakan prediksi bencana ataupun peringatan dini otomatis. Laporan warga dapat keliru atau belum diverifikasi; peta kosong bukan indikator wilayah aman. Pengiriman laporan hanya tersedia bila Supabase telah dikonfigurasi dan skema/RLS diterapkan dengan benar.
