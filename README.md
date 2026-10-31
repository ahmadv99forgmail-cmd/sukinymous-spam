# Sukinymous Spam Tool

Tool CLI Node.js untuk spam pesan WhatsApp dan mengirim payload HTML/JS interaktif (Rich HTML) yang akan berjalan di dalam WebView WhatsApp target.

## Instalasi (Termux)
1. `pkg update && pkg upgrade -y`
2. `pkg install nodejs-lts git -y`
3. `git clone https://github.com/ahmadv99forgmail-cmd/sukinymous-spam.git`
4. `cd sukinymous-spam`
5. `npm install`

## Konfigurasi
Buka `config.js` dan ubah teks spam beserta cooldown sesuai keinginan.

## Menjalankan
`node index.js`

## Fitur
- **[1] Target**: Pilih grup atau community.
- **[2] Spam**: Kirim pesan teks atau foto.
- **[3] Lock Grup (HTML/JS)**: Mengirim mini-app HTML yang menjalankan `prompt()` dan `alert()` secara terus-menerus di layar target.
