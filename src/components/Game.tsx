import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Engine, type BuyItem } from "@/game/engine";
import { HudStore } from "@/game/store";
import { LIMITS, PLAYER, PRICES, WEAPONS, WEAPON_ORDER, damageUpgradePrice } from "@/game/config";

const dummy = new HudStore({} as never);

export function Game() {
  const host = useRef<HTMLDivElement>(null);
  const cross = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLDivElement>(null);
  const vig = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches);
    if (!host.current) return;
    let e: Engine;
    try { e = new Engine(host.current); } catch (x) { setErr(String(x)); return; }
    e.bindElements({ cross: cross.current, hit: hit.current, vig: vig.current });
    setEngine(e);
    return () => e.dispose();
  }, []);

  const s = useSyncExternalStore((engine?.store ?? dummy).subscribe, (engine?.store ?? dummy).get, (engine?.store ?? dummy).get);

  useEffect(() => {
    engine?.bindElements({ cross: cross.current, hit: hit.current, vig: vig.current });
  }, [engine, s.phase]);

  if (err) return <Center><h1 className="dz-title text-5xl">DEAD ZONE</h1><p className="mt-4 text-muted-foreground">WebGL başlatılamadı. Donanım hızlandırmayı açıp modern bir tarayıcı deneyin.</p></Center>;

  const ready = engine && s.phase;
  const inGame = ready && (s.phase === "combat" || s.phase === "countdown");
  const a = ready ? s.ammo[s.weapon] : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-background select-none">
      <div ref={host} className="absolute inset-0" />
      <div ref={vig} className="dz-vignette pointer-events-none absolute inset-0 opacity-0" />
      {ready && s.phase !== "menu" && (
        <div className="pointer-events-none absolute inset-0 dz-hud">
          <div className="absolute left-1/2 top-5 -translate-x-1/2 text-center">
            <div className="dz-title text-5xl leading-none">DALGA {s.wave}</div>
            <div className="mt-1 text-xl tracking-widest text-foreground">KALAN ZOMBİ: {s.remaining}</div>
          </div>
          <div className="absolute right-6 top-5 text-right">
            <div className="text-3xl font-bold text-gold">ALTIN: {s.gold.toLocaleString("tr-TR")}</div>
            <div className="text-sm tracking-widest text-muted-foreground">SKOR {s.score.toLocaleString("tr-TR")} · {s.kills} LEŞ</div>
          </div>
          <div className="absolute bottom-6 left-6 w-72 space-y-1.5">
            <Bar label="SAĞLIK" v={s.hp} max={PLAYER.maxHp} tone="bg-destructive" />
            <Bar label="ZIRH" v={s.armor} max={PLAYER.maxArmor} tone="bg-armor" />
          </div>
          <div className="absolute bottom-6 right-6 text-right">
            <div className="text-sm tracking-[0.3em] text-muted-foreground">{WEAPONS[s.weapon].name}</div>
            <div className="text-6xl font-bold leading-none text-foreground">{a!.mag}<span className="text-3xl text-muted-foreground"> / {a!.reserve}</span></div>
            <div className="mt-1 h-5 text-sm tracking-widest text-gold">{s.reloading ? "ŞARJÖR DEĞİŞİYOR…" : a!.mag === 0 ? "R — DOLDUR" : ""}</div>
            <div className="mt-2 flex justify-end gap-1.5">
              {WEAPON_ORDER.map((id) => <div key={id} className={`dz-slot ${id === s.weapon ? "dz-slot-on" : ""}`}>{WEAPONS[id].slot} {WEAPONS[id].name}</div>)}
            </div>
          </div>
          <div ref={cross} className="dz-cross"><i /><i /><i /><i /></div>
          <div ref={hit} className="dz-hit" />
          <div className="absolute left-1/2 top-[30%] -translate-x-1/2 text-center">
            {s.phase === "countdown" && <div className="dz-title text-8xl">{s.countdown}</div>}
            {s.banner && <div key={s.bannerId} className="dz-banner mt-2 text-2xl tracking-[0.4em] text-foreground">{s.banner}</div>}
          </div>
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 space-y-1 text-center">
            {s.notices.map((n) => <div key={n.id} className={`dz-notice ${n.tone === "gold" ? "text-gold" : "text-foreground"}`}>{n.text}</div>)}
          </div>
          {inGame && s.wave === 1 && <div className="dz-fade absolute bottom-6 left-1/2 -translate-x-1/2 text-xs tracking-widest text-muted-foreground">WASD HAREKET · SHIFT KOŞ · SPACE ZIPLA · R DOLDUR · 1/2/3 SİLAH · F FENER · B MARKET · ESC DURAKLAT</div>}
        </div>
      )}
      {!ready && <Center><div className="dz-title text-4xl">YÜKLENİYOR…</div></Center>}
      {ready && s.phase === "menu" && <Menu e={engine!} best={s.best} touch={touch} settings={s.settings} />}
      {ready && s.phase === "paused" && (
        <Overlay>
          <h2 className="dz-title text-5xl">DURAKLATILDI</h2>
          {s.lockFallback && <p className="mt-4 max-w-sm text-center text-muted-foreground">Fare kilidi alınamadı. Oyunu ayrı sekmede açıp Devam Et düğmesine tıklayın.</p>}
          <button autoFocus className="dz-btn mt-6" onClick={() => engine!.resume()}>DEVAM ET</button>
          <button className="dz-btn-ghost mt-3" onClick={() => engine!.toMenu()}>ANA MENÜ</button>
          <Settings e={engine!} st={s.settings} />
        </Overlay>
      )}
      {ready && s.phase === "market" && <Market e={engine!} s={s} />}
      {ready && s.phase === "gameover" && (
        <Overlay>
          <h2 className="dz-title text-6xl">ÖLDÜN</h2>
          <div className="mt-4 grid grid-cols-3 gap-6 text-center">
            <Stat k="DALGA" v={s.wave} /><Stat k="SKOR" v={s.score} /><Stat k="LEŞ" v={s.kills} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">En iyi: Dalga {s.best.wave} · Skor {s.best.score} · Kafadan vuruş {s.headshots}</p>
          <button autoFocus className="dz-btn mt-6" onClick={() => engine!.start()}>TEKRAR OYNA</button>
          <button className="dz-btn-ghost mt-3" onClick={() => engine!.toMenu()}>ANA MENÜ</button>
        </Overlay>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-6 text-center">{children}</div>;
}
function Overlay({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center bg-overlay"><div className="dz-panel flex flex-col items-center">{children}</div></div>;
}
function Stat({ k, v }: { k: string; v: number }) {
  return <div><div className="text-xs tracking-widest text-muted-foreground">{k}</div><div className="text-4xl font-bold">{v}</div></div>;
}
function Bar({ label, v, max, tone }: { label: string; v: number; max: number; tone: string }) {
  return (
    <div className="relative h-9 overflow-hidden bg-card/80">
      <div className={`absolute inset-y-0 left-0 ${tone} transition-all`} style={{ width: `${(v / max) * 100}%` }} />
      <div className="relative flex h-full items-center justify-between px-3 text-xl font-bold"><span>{label}</span><span>{v}</span></div>
    </div>
  );
}

function Menu({ e, best, touch, settings }: { e: Engine; best: { wave: number; score: number }; touch: boolean; settings: import("@/game/store").Settings }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute inset-0 flex flex-col justify-center bg-menu px-[8vw]">
      <div className="text-sm tracking-[0.6em] text-primary">OUTBREAK</div>
      <h1 className="dz-title text-[clamp(4rem,10vw,9rem)] leading-[0.85]">DEAD ZONE</h1>
      <div className="mt-1 text-lg tracking-[0.4em] text-muted-foreground">3D · HAYATTA KALMA</div>
      {touch ? (
        <p className="mt-8 max-w-md border-l-2 border-primary pl-4 text-foreground">Bu oyun klavye ve fare gerektirir. Lütfen bir masaüstü bilgisayardan açın.</p>
      ) : (
        <>
          <div className="mt-8 flex gap-3">
            <button autoFocus className="dz-btn" onClick={() => e.start()}>OYUNA BAŞLA</button>
            <button className="dz-btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>AYARLAR</button>
          </div>
          {open && <div className="mt-4 max-w-sm"><Settings e={e} st={settings} /></div>}
          <div className="mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>WASD — hareket</span><span>Fare — nişan / ateş</span><span>Shift — koş</span><span>Space — zıpla</span>
            <span>R — doldur</span><span>1 / 2 / 3 — silah</span><span>F — fener</span><span>B / P — market</span>
          </div>
          {best.wave > 0 && <div className="mt-6 text-sm tracking-widest text-gold">EN İYİ: DALGA {best.wave} · {best.score} PUAN</div>}
        </>
      )}
    </div>
  );
}

function Settings({ e, st }: { e: Engine; st: import("@/game/store").Settings }) {
  return (
    <div className="mt-5 w-full space-y-3 border-t border-border pt-4 text-sm">
      <label className="flex items-center justify-between gap-4">Fare hassasiyeti {st.sensitivity.toFixed(1)}
        <input type="range" min={0.2} max={3} step={0.1} value={st.sensitivity} onChange={(x) => e.updateSettings({ sensitivity: Number(x.target.value) })} className="accent-primary" />
      </label>
      <label className="flex items-center justify-between">Ses
        <input type="checkbox" checked={st.sound} onChange={(x) => e.updateSettings({ sound: x.target.checked })} className="accent-primary" />
      </label>
      <label className="flex items-center justify-between">Grafik kalitesi
        <select value={st.quality} onChange={(x) => e.updateSettings({ quality: x.target.value as "low" | "medium" })} className="bg-card px-2 py-1">
          <option value="medium">Orta</option><option value="low">Düşük</option>
        </select>
      </label>
    </div>
  );
}

function Market({ e, s }: { e: Engine; s: ReturnType<HudStore["get"]> }) {
  const [msg, setMsg] = useState<string | null>(null);
  const w = WEAPONS[s.weapon];
  const items: { id: BuyItem; name: string; fx: string; price: number; disabled: string | null }[] = [
    { id: "health", name: "Sağlık Kiti", fx: "+50 sağlık", price: PRICES.health, disabled: s.hp >= PLAYER.maxHp ? "DOLU" : null },
    { id: "armor", name: "Zırh Plakası", fx: "+50 zırh", price: PRICES.armor, disabled: s.armor >= PLAYER.maxArmor ? "DOLU" : null },
    { id: "ammoCurrent", name: `Cephane: ${w.name}`, fx: "Yedek mermi tamamen dolar", price: PRICES.ammoCurrent, disabled: s.ammo[s.weapon].reserve >= w.maxReserve ? "DOLU" : null },
    { id: "ammoAll", name: "Tüm Cephane", fx: "Tüm silahların yedeği dolar", price: PRICES.ammoAll, disabled: WEAPON_ORDER.every((id) => s.ammo[id].reserve >= WEAPONS[id].maxReserve) ? "DOLU" : null },
    { id: "damage", name: `Hasar Yükseltmesi Sv.${s.damageLevel}`, fx: "+%15 silah hasarı (bu oyun)", price: damageUpgradePrice(s.damageLevel), disabled: s.damageLevel >= LIMITS.damageLevel ? "MAKS" : null },
    { id: "sentry", name: `Taret (${s.sentries}/${LIMITS.sentries})`, fx: "Önüne kurulur, düşmanlara ateş eder", price: PRICES.sentry, disabled: s.sentries >= LIMITS.sentries ? "MAKS" : null },
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-overlay">
      <div className="dz-panel w-[min(720px,92vw)]">
        <div className="flex items-end justify-between">
          <div><div className="text-xs tracking-[0.4em] text-primary">{s.marketAfterWave ? `DALGA ${s.wave} TEMİZLENDİ` : "OYUN DURAKLATILDI"}</div><h2 className="dz-title text-4xl">İKMAL & GELİŞTİRME</h2></div>
          <div className="text-2xl font-bold text-gold">{s.gold} ALTIN</div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {items.map((it) => {
            const poor = s.gold < it.price;
            return (
              <button key={it.id} disabled={!!it.disabled || poor} onClick={() => setMsg(e.buy(it.id) ?? `${it.name} alındı`)} className="dz-item">
                <div className="flex justify-between font-bold"><span>{it.name}</span><span className={poor ? "text-destructive" : "text-gold"}>{it.disabled ?? `${it.price}`}</span></div>
                <div className="text-xs text-muted-foreground">{it.fx}</div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 h-5 text-sm text-gold" role="status">{msg}</div>
        <div className="mt-3 flex justify-end gap-2">
          {!s.marketAfterWave && <button autoFocus className="dz-btn" onClick={() => e.closeMarket()}>KAPAT</button>}
          {s.marketAfterWave && <button autoFocus className="dz-btn" onClick={() => e.nextWave()}>SONRAKİ DALGA ▸</button>}
        </div>
      </div>
    </div>
  );
}
