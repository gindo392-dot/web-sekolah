# Portal Kelas Online

## Fitur
- Login Guru & Siswa
- Profil pengguna
- Materi + upload/download file
- Tugas + deadline
- Pengumpulan tugas siswa
- Perpustakaan online
- Data bersama melalui SQLite
- File upload disimpan di folder `uploads`

## Akun demo
Guru: `guru` / `guru123`
Siswa: `siswa` / `siswa123`

## Menjalankan di komputer
1. Install Node.js.
2. Buka terminal di folder project.
3. Jalankan `npm install`.
4. Jalankan `npm start`.
5. Buka `http://localhost:3000`.

## Agar benar-benar online
Upload project ini ke server/hosting yang mendukung Node.js dan penyimpanan persisten.
Atur environment variable `SESSION_SECRET` dengan nilai acak yang panjang.
Penting: untuk hosting yang filesystem-nya sementara, pindahkan SQLite dan folder uploads ke storage/database persisten sebelum dipakai sungguhan.

## Catatan
Ini adalah starter project full-stack. Jangan gunakan akun demo/password bawaan untuk produksi; buat akun dan password baru.
