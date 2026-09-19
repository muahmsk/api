# NormTag Presence API

> **ÖNEMLİ NOT:** Bu bir Minecraft server modu veya Bukkit/Spigot/Paper eklentisi (plugin) **DEĞİLDİR**.
> Minecraft sunucunuza hiçbir şey kurmanız gerekmez. Bu servis, internet üzerinde bağımsız çalışan ve NormTag client'larının birbirini anonim olarak bulmasını sağlayan harici bir web API'sidir.

---

## 📌 Ne İşe Yarar?

NormTag istemcileri, bağlandıkları Minecraft sunucusunun adresinden tek yönlü bir `serverId` hash'i (SHA-256) üretir. İstemciler bu API'ye:
1. `join`: Sunucuya bağlanıldığında oturum başlatır.
2. `heartbeat`: Her 20 saniyede bir oturumun canlı olduğunu bildirir.
3. `leave`: Sunucudan çıkıldığında oturumu kapatır.
4. `list`: Aynı Minecraft sunucusundaki diğer aktif NormTag oyuncularının nickname'lerini çeker.

---

## 🔒 Gizlilik ve Güvenlik İlkeleri

- **Minecraft UUID Asla Kullanılmaz:** Oyuncuların UUID'leri toplanmaz, iletilmez veya veritabanına kaydedilmez.
- **Kişisel Veri ve Token Toplanmaz:** Microsoft hesap bilgileri, oyun token'ları, e-postalar, Discord bilgileri, donanım kimlikleri (HWID) veya dosya sistemine ASLA erişilmez.
- **Anonim Server ID:** Ham sunucu IP adresi veya alan adı API'ye iletilmez. Yalnızca istemci tarafında SHA-256 ile özetlenmiş anonim `serverId` gönderilir.
- **Geçici Oturum:** `sessionId`, Minecraft oyuncu kimliği değildir; yalnızca o bağlantıyı ayırt eden geçici rastgele bir belirteçtir.
- **Otomatik Expiration (TTL):** İstemci beklenmedik şekilde kapansa bile 60 saniye boyunca `heartbeat` almayan kayıtlar otomatik olarak aktif listeden düşer.

---

## 🚀 Endpoint'ler

| Metot | Yol | Açıklama |
| :--- | :--- | :--- |
| `POST` | `/v1/presence/join` | Oyuncuyu aktif presence odasına ekler (`{ nickname, serverId, sessionId }`) |
| `POST` | `/v1/presence/heartbeat` | Oyuncunun son görülme (`lastSeen`) zamanını tazeler |
| `POST` | `/v1/presence/leave` | Oyuncuyu presence odasından anında kaldırır |
| `GET` | `/v1/presence/list?serverId=...` | İlgili sunucudaki son 60 saniyede aktif olan oyuncu nickname'lerini döndürür |

---

## 🛠️ Kurulum ve Test

Node.js v18+ yüklü bir ortamda testleri çalıştırmak için:

```bash
npm test
```

Tüm 8 ana test senaryosu (join, aynı server, farklı server izolasyonu, TTL zaman aşımı, leave, çoklu oturum, geçersiz JSON ve rate limiting) otomatik olarak doğrulanır.

---

## ☁️ Cloudflare Workers & Durable Objects Deploy Adımları

Bu API, Cloudflare Workers ve Durable Objects (SQLite depolamalı) mimarisine tam uyumlu olarak tasarlanmıştır.

1. Cloudflare hesabınıza giriş yapın:
   ```bash
   npx wrangler login
   ```
2. `wrangler.jsonc` dosyasını kontrol edin.
3. API'yi tek komutla canlıya alın:
   ```bash
   npx wrangler deploy
   ```
4. Deploy tamamlandığında Cloudflare size bir worker URL'si (örneğin: `https://normtag-presence-api.<your-subdomain>.workers.dev`) verecektir.
5. Bu URL'yi NormTag Minecraft modundaki `NormTagCommon.DEFAULT_API_URL` sabitine veya oyun içi config ekranına tanımlayın.
