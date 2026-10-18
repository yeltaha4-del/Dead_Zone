Bu klasor duzenlenebilir AI Studio kaynak projesidir. GitHub deposunun kokune bu klasorun ICINDEKI dosyalari yukleyin. Hazir oyunu denemek icin ZIP ana klasorundeki index.html dosyasini acin.

# DEAD ZONE 3D: OUTBREAK — Google AI Studio aktarım paketi

Bu paket, düzeltilmiş oyun kaynaklarını React + TypeScript + Three.js + Vite
projesi olarak düzenler. Hazır tek HTML yerine kaynak dosyaları üzerinden
geliştirme yapılır. Oyun mekanikleri önceki düzeltilmiş sürümden korunmuştur.

## AI Studio'ya aktar

1. ZIP'i çıkar. Bu klasörün içindeki dosyaları bir GitHub deposunun köküne koy:
   `package.json`, `index.html` ve `src/` doğrudan kökte olmalı. `node_modules`
   ve `dist` klasörlerini yükleme. GitHub'da dosya yüklerken .gitignore gibi
   gizli dosyaları da dahil et.
2. https://aistudio.google.com/ adresinde Build bölümünü aç.
3. İstem kutusundaki **+ / Add files → Import from GitHub** seçeneğinden depoyu seç.
4. Web uygulaması olarak aç ve `AI_STUDIO_PROMPT.md` içindeki ilk mesajı gönder.
5. Görsel yönlendirme için zombi oyunu referans görselini de sohbete ekleyebilirsin.

Resmî aktarım belgesi:
https://ai.google.dev/gemini-api/docs/aistudio-build-mode

## Komutlar

- `npm install` — bağımlılıklar
- `npm run dev` — geliştirme sunucusu, varsayılan port 3000
- `npm run build` — katı TypeScript kontrolü ve üretim derlemesi
- `npm test` — 13 oyun mantığı testi
- `npm run preview` — üretim çıktısını yerel olarak aç

Node.js 22.12 veya üstü önerilir. AI Studio kendi çalıştırma ortamında gerekirse
port ve başlatma komutunu uyarlayabilir. Gemini API anahtarı gerekmiyor.

## Kontroller

WASD hareket; fare bakış; sol tık ateş; Shift ileri koşu; Space zıplama;
1/2/3 tabanca/pompalı/tüfek; R şarjör; F fener; B/P market; Esc duraklatma.

## Doğrulama sınırı

Üretim derlemesi ve otomatik oyun mantığı testleri bu paket hazırlanırken
çalıştırılır. AI Studio hesabına gerçek içe aktarma ve WebGL/fare kilidi ile
uçtan uca oynanış bu ortamda doğrulanmış değildir. İlk AI Studio mesajı bu
kontrolleri yaptırmak için hazırlanmıştır.
