# Sukinymous Spam Tool

Tool berbasis CLI (Command Line Interface) menggunakan Node.js dan library Baileys untuk mengirim pesan (spam) ke grup atau komunitas WhatsApp secara otomatis dengan jeda waktu tertentu.

## Fitur Utama
- **Custom Pairing Code**: Login tanpa perlu scan QR code. Cukup masukkan nomor dan kode pairing.
- **Target Fleksibel**: Bisa memilih grup spesifik, atau memilih Community (bot akan otomatis mengirim ke grup utama dan seluruh sub-grup di dalamnya).
- **Dukungan Teks Panjang**: Mendukung teks multi-baris (bisa di-Enter) berkat format *template literal*.
- **Cooldown 2 Hari**: Setelah mengirim pesan, bot akan beristirahat selama 2 hari sebelum mengirim lagi.
- **Stop Instan**: Tekan `Ctrl + X` kapan saja untuk menghentikan spam dan membersihkan log terminal secara otomatis.

## Persyaratan Sistem
- Android (Termux) / Windows / Linux VPS
- Node.js (Disarankan versi LTS 18+)

## Panduan Instalasi (Termux)

**1. Update & Install Dependensi**
```bash
pkg update && pkg upgrade -y
pkg install nodejs-lts git -y
