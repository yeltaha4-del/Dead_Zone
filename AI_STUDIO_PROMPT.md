# AI Studio'ya ilk mesaj

Bu projedeki DEAD ZONE 3D: OUTBREAK oyununu Google AI Studio içinde geliştireceğiz.
Önce kaynak dosyalarını ve package.json'u incele, bağımlılıkları kur, npm run build
ve npm test komutlarını çalıştır. Sonra npm run dev ile canlı önizlemeyi aç.
Mevcut oyunu temel al; var olan özellikleri koruyarak bulduğun sorunları düzelt.

Teknoloji React + TypeScript + Three.js + Vite. Tüm 3D modeller geometrilerden
prosedürel üretiliyor. Oyuncu arayüzü Türkçe kalacak. Oyunun kendisi Gemini API,
API anahtarı, hesap, veritabanı veya ücretli servis gerektirmeyecek.

Mevcut kapsamı koru: FPS kamera ve Pointer Lock; WASD, Shift ve Space hareketi;
çarpışma ve yerçekimi; sisli gece şehri ve F ile el feneri; tabanca, sekiz saçmalı
pompalı ve otomatik tüfek; her silah için ayrı şarjör/yedek cephane, R ile doldurma,
silah sallanması ve tepme; duvarın durdurduğu raycast, kafadan iki kat hasar;
yürüyen, koşucu, tank ve patlayıcı zombiler; dalgalar, ganimet, market, hasar
yükseltmeleri ve en fazla üç otomatik taret; HUD, duraklatma, ölüm ve tekrar başlatma.

İlk işin oynanışı doğrulamak olsun: Başla ve Devam Et düğmelerini, gerçek fare
kilidini, hareket/çarpışmayı, üç silahı, isabetleri, dalga geçişini, marketi ve
yeniden başlatmayı tarayıcıda test et. Önizleme çerçevesi fare kilidini
engelliyorsa bunu açıkça belirt ve ayrı sekmedeki önizlemeyi test et.
Bu adımların daha önce tarayıcıda doğrulandığını varsayma.

Kontroller çalıştıktan sonra referans görseldeki sisli sokak, terk edilmiş araçlar,
low-poly zombiler ve okunaklı HUD görünümünü geliştir. Ryzen 7 5700U, 16 GB RAM
ve dahili Radeon için düşük/orta grafik seçeneklerini ve sınırlı parçacık/düşman
sayısını koru. Plan vermekle kalma; kodu düzenle, derle ve yaptığın testlerin
sonucunu bildir. Performans ölçmeden FPS garantisi verme.
