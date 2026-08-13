# Deploy ke Render

1. Upload seluruh isi folder project ini ke repository GitHub.
2. Di Render pilih **New → Blueprint** dan pilih repository tersebut.
3. Render akan membaca `render.yaml`, membuat Node web service, dan memasang persistent disk di `/var/data`.
4. Tunggu deploy selesai, lalu buka URL `onrender.com` yang diberikan.
5. Login dengan akun demo dan ubah akun/password untuk penggunaan nyata.

## Kenapa persistent disk?
Database SQLite dan file upload harus berada di disk persisten. Render menjelaskan bahwa filesystem biasa bersifat ephemeral, sedangkan data di bawah persistent disk bertahan melewati deploy/restart.

## Catatan produksi
- Jangan gunakan password demo untuk penggunaan nyata.
- `SESSION_SECRET` dibuat otomatis oleh Blueprint.
- Backup database secara berkala.
- Project ini menggunakan SQLite + satu persistent disk, cocok untuk penggunaan kecil/satu instance. Untuk skala banyak instance, pindahkan database ke PostgreSQL dan upload ke object storage.
