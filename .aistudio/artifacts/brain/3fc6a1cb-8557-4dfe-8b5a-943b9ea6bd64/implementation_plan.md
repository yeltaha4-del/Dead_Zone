# DEAD ZONE 3D: OUTBREAK — Sağ Tık ile Nişan Alma (ADS) Sistemi

DEAD ZONE 3D: OUTBREAK oyununa sağ fare tuşuna basılı tutularak etkinleşen, birinci şahıs gez-arpacık nişan alma (Aim Down Sights - ADS) mekaniği, silah bazlı hassas konumlandırma, 0,2 saniyelik yumuşak kamera FOV daralması ve taktiksel mermi saçılması iyileştirmesi ekleniyor.

## Kullanıcı Tercihleri ve Kritik Kararlar

> [!IMPORTANT]
> Kullanıcı ile teyit edilen tercihler ve teknik kararlar:

- **Artı Gösterge (Crosshair) Davranışı**: Gez ve arpacık görünümünün net olması için nişan alındığında ekrandaki artı gösterge (crosshair) yumuşak şekilde gizlenecektir (`opacity: 0`).
- **Kamera Görüş Açısı (FOV)**: Nişan alma sırasında kamera görüş açısı 72 dereceden 60 dereceye (~0,2 saniyede) yumuşakça daralacak, odaklanma hissi güçlendirilecektir.
- **Tetikleme Biçimi**: Basılı tutma (Hold). Sağ fare tuşu basılıyken nişan alınır, tuş bırakıldığında hemen kalçadan atış (hip-fire) pozisyonuna dönülür.
- **Durum İptalleri**: Koşma (Sprint), şarjör doldurma (Reload), silah değiştirme, market açma, duraklatma ve ölüm durumlarında ADS otomatik olarak anında iptal edilir.
- **Sağ Tık Menüsü Engellemesi**: Oyun tuvalinde sağ tıklandığında tarayıcının yerel açılır bağlam menüsü (`contextmenu`) engellenir (`e.preventDefault()`).

---

## 1. Genel Bakış ve Deneyim (Overview & Core Concept)

- **İşlev**: Oyuncu sağ fare tuşuna bastığında silah ekranın merkezine kayar, silahın gez ve arpacığı göz hizasına hizalanır. Kamera FOV açısı hafifçe daralarak hedefe odaklanır.
- **Taktiksel Derinlik**: Nişan alırken hareket hızı %35 oranında düşer, silah sallantısı (bobbing) hafifler, mermi saçılması (spread) ve geri tepme dağılımı belirgin şekilde azalır. Böylece uzun menzilli zombi avlarında ve kafadan vuruşlarda (headshot) yüksek isabet elde edilir.
- **Hedef Kitle**: Hızlı zombi dalgalarında refleksleri kadar nişan kabiliyetini de kullanmak isteyen masaüstü FPS oyuncuları.

---

## 2. Kullanıcı Deneyimi ve Görsel Tasarım (UX & Visuals)

### 2.1 Silah Bazlı Gez-Arpacık Hizalama Konumları

Three.js `vCam` (gözlem kamerası) koordinat sisteminde her silahın geometrik nişangahına göre kalibre edilen hedefler:

1. **Tabanca (Pistol)**:
   - Kalça konumu: `(0.24, -0.24, -0.5)`
   - ADS hedef konumu: `(0.0, -0.068, -0.36)` — Ön arpacık pimi, arka gez çentiğinin tam ortasında ve görüş merkezinde hizalanır.
2. **Pompalı Tüfek (Shotgun)**:
   - Kalça konumu: `(0.24, -0.24, -0.5)`
   - ADS hedef konumu: `(0.0, -0.055, -0.40)` — Namlu ucundaki pirinç arpacık boncuğu ekranın tam merkezine oturur.
3. **Piyade Tüfeği (Rifle)**:
   - Kalça konumu: `(0.24, -0.24, -0.5)`
   - ADS hedef konumu: `(0.0, -0.096, -0.42)` — Kırmızı fosforlu gez noktası ile ön arpacık direği kusursuz tek hat üzerinde birleşir.

### 2.2 Dinamik Geçişler & Animasyon
- **Yumuşatma (Smooth Damping)**: Ani sıçramaları önlemek için `adsProgress` (0.0 → 1.0) değeri delta zamanına bağlı üstel yumuşatma ile ilerletilir (`k = 1 - Math.exp(-14 * dt)` veya ~0.2 saniyelik lineer lerp).
- **Kamera Zoom**: `camera.fov = THREE.MathUtils.lerp(72, 60, adsProgress)`. Projeksiyon matrisi yalnızca değer değiştiğinde güncellenir.
- **Silah Sallantısı (Weapon Bob)**: Nişan alırken adım atma sallantısının genliği %70 azaltılır.
- **Arayüz Bildirimi**: Menüdeki tuş açıklamalarına `Sağ tık — nişan al` eklenir; Dalga 1 alt ipucunda `SAĞ TIK NİŞAN` yer alır.

---

## 3. Ürün Kararları ve Mantığı (Decisions & Trade-offs)

1. **Ayrı Viewmodel ve Dünya Kamerası**:
   - *Yaklaşım*: Mevcut mimaride `camera` (ana sahne) ve `vCam` (silah viewmodel sahnesi) ayrılmıştır. ADS sırasında ana kameranın FOV'u 72°'den 60°'ye düşürülerek dünyaya optik yakınlaşma sağlanır, silahın kırpılmasını ve balıkgözü bozulmasını önlemek için viewmodel kamerası sabit ve dengeli kalır.
   - *Fayda*: Silah kaplamaları ve gez-arpacık orantısı bozulmadan dünya ölçeğinde net yakınlaşma elde edilir.

2. **Ateşleme Raycast Uyumu**:
   - *Yaklaşım*: Raycast ışınları ana kameranın dünya pozisyonu ve merkez yönü üzerinden çıkarılır. ADS devredeyken eklenen rastgele saçılma açısı `spread * 0.45` değerine indirilerek merminin doğrudan gez-arpacığın gösterdiği merkeze gitmesi güvenceye alınır.

3. **Otomatik İptal Güvenliği (State Guard)**:
   - *Yaklaşım*: Oyuncu `Shift` tuşuna basıp ileri koşmaya başladığında, şarjör doldurma butonuna bastığında veya silah değiştirdiğinde `adsTarget = 0` yapılarak nişan alma anında kesilir.

---

## 4. Teknik Mimari ve Durum Yönetimi (Technical Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DEAD ZONE 3D: INPUT                             │
│                                                                        │
│   Left Click (Fire)       Right Click (Hold ADS)     Keyboard (W,Shift)│
└──────────┬──────────────────────────┬─────────────────────────┬────────┘
           │                          │                         │
           ▼                          ▼                         ▼
┌──────────────────────┐   ┌──────────────────────┐  ┌──────────────────┐
│  Engine.fire()       │   │  Engine.step()       │  │ Engine.step()    │
│  - Bullet raycast    │   │  - adsProgress lerp  │  │ - Sprint check   │
│  - Spread calculation│   │  - FOV lerp (72->60) │  │   (cancels ADS)  │
│    (spread * 0.45)   │   │  - Speed scale (0.65)│  │ - Reload check   │
└──────────┬───────────┘   └──────────┬───────────┘  └─────────┬────────┘
           │                          │                         │
           ▼                          ▼                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        VIEWMODEL & HUD RENDER                          │
│                                                                        │
│  - vm.group lerps between Hip Position and Weapon ADS Offset           │
│  - Crosshair opacity: Math.max(0, 1 - adsProgress * 1.5)               │
│  - Camera FOV: 72 - 12 * adsProgress                                   │
└────────────────────────────────────────────────────────────────────────┘
```

### Uygulama Adımları
1. **Girdi Dinleyicileri (`src/game/engine.ts`)**:
   - `canvas.addEventListener("contextmenu", (e) => e.preventDefault())` eklenmesi.
   - `onDown` ve `onUp` metodlarında `e.button === 2` kontrolüyle `mouseRightDown` durumunun güncellenmesi.
   - `clearInput`, `onBlur`, `startReload`, `equip`, `openMarket`, `hurt` (ölüm) fonksiyonlarında ADS'nin sıfırlanması.
2. **ADS Durum Değişkenleri ve Güncelleme Döngüsü**:
   - `adsProgress` (0..1), `adsPositions: Record<WeaponId, THREE.Vector3>` tanımlanması.
   - `step(dt)` içinde hareket hızı çarpanının ADS durumuna göre uygulanması.
   - `visuals(dt)` içinde viewmodel pozisyonunun hip ve ADS koordinatları arasında yumuşakça süzülmesi.
3. **Mermi Saçılması & İsabet**:
   - `fire()` metodunda `spread` çarpanına ADS durumunun entegre edilmesi (`isAiming ? 0.45 : 1.0`).
4. **HUD & Arayüz Güncellemesi (`src/game/engine.ts` & `src/components/Game.tsx`)**:
   - Crosshair elementinin stilinde ADS sırasında `opacity` azaltılması.
   - Kontroller menüsüne `Sağ tık — nişan al` satırının eklenmesi.
5. **Testler ve Doğrulama**:
   - `npm test` çalıştırılarak mevcut 13 birim testin uyumluluğunun korunması.
   - Yeni ADS mantığı için test eklenmesi/güncellenmesi.
