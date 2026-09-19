# SHAPEVIZ — Brand & Design System

**Verzia:** 1.0 · 19. 9. 2026  
**Referenčný dizajn:** Milenium HTML deck v28 — Designed to be desired.  
**Použitie:** budúce prezentácie Shapeviz, portfólio, nový web a digitálne prezentačné materiály.

## 1. Autorita dokumentu a pôvod pravidiel

Tento dokument vychádza z prečítania skutočného HTML, celej CSS kaskády a JavaScriptu súboru `milenium_artifact_presentation_v28_DESIGNED_TO_BE_DESIRED.html`. Nejde o odhad zo screenshotu ani zo slovného opisu.

Požadovaná cesta `/mnt/data/milenium_artifact_presentation_v28_DESIGNED_TO_BE_DESIRED.html` patrila pôvodnému prostrediu. Pri tejto analýze bola nájdená lokálna kópia s rovnakým názvom v `C:/Users/ASUS/Downloads/`. Jej veľkosť je **146 632 991 bajtov** a SHA-256 je `90CDBA481E52EB92D3CABD3843202BB3C19E537D33DDEBB4D8A10EF69FD01C2A`. Zdroj zostal nezmenený.

Rozlišujeme tri úrovne:

- **V28 / overené:** hodnoty a správanie priamo v zdrojovom kóde. Overenie je statickou analýzou, nie meraním vykreslených pixelov v prehliadači.
- **Pravidlo Shapeviz:** zámerne zovšeobecnený princíp referencie pre ďalšiu tvorbu.
- **Adaptácia pre web:** nové odporúčanie; nie tvrdenie, že daná funkcia už existuje vo v28.

Pri konflikte majú prednosť výsledná CSS kaskáda, inline štýly nastavované JavaScriptom a reálna HTML štruktúra pred komentármi typu „v12“ či „v24“. Staršie deklarácie nekopírovať ako samostatné platné pravidlá.

## 2. Identita a charakter

**Hlavná veta:** Designed to be desired.

**Opis Shapeviz:** Budujeme vizuálny obsah a identitu značiek a pomáhame firmám vyniknúť v online priestore.

Vizuálny charakter je tmavý, teplý, výrazný a pokojný. Veľká typografia dáva smer, obraz prináša emóciu a oranžová označuje význam alebo akciu. Veľkorysé prázdne plochy sú súčasťou kompozície.

Pravidlá Shapeviz:

- Každá sekcia má jednu dominantnú myšlienku a jasný vizuálny bod záujmu.
- Nadpisy sú krátke a sebavedomé. Text vysvetľuje hodnotu obrazu, atmosféry, materiálu a identity.
- Uprednostniť konkrétne vizuálne výsledky pred všeobecnými marketingovými frázami.
- Oranžovú používať na vybrané slová, kategórie, čísla, šípky a hlavné CTA.
- Zachovať kvalitné fotografie, CGI, makro detaily, lifestyle a motion; nedopĺňať dekorácie bez účelu.
- `SHAPEVIZ × MILENIUM` je podpis konkrétnej spolupráce. V nových prezentáciách použiť `SHAPEVIZ × [KLIENT]`; na vlastnom webe primárne `SHAPEVIZ`.
- Veta „Designed to be desired.“ je schválená pre welcome screen a vhodná ako hlavné posolstvo značky. Texty o sedačkách, showroomoch a počtoch príspevkov sú obsah klientského projektu, nie všeobecné záväzky Shapeviz.

## 3. Farby a povrchy

| Úloha | Presná hodnota | Stav / použitie |
|---|---|---|
| Finálne hlavné pozadie | `#000000` | `body { background:#000 !important; }` |
| Pôvodný token `--bg` | `#0d0a07` | Stále v CSS; nie výsledná farba body |
| Token `--bg2` | `#15100b` | Definovaný, bez použitia cez `var(--bg2)` v zdroji |
| Hlavný text `--text` | `#f1ede6` | Teplá lomená biela |
| Sekundárny text `--muted` | `#9f978d` | Odseky, popisy |
| Akcent `--accent` | `#d88739` | Oranžová: zvýraznenia a CTA |
| Hover hlavného CTA | `#e3954c` | Navyše zostáva aktívny `brightness(1.08)` |
| Text hlavného CTA | `#0b0805` | Aj šípka |
| Základné linky `--line` | `#2b2118` | Jemné oddeľovanie obsahu |
| Tmavý povrch mriežok | `#100c08` | `.word-grid`, `.deliverables` |
| Jemný callout povrch | `rgba(255,255,255,.025)` | Mesačný rytmus |
| Svetlá deliaca linka | `rgba(241,237,230,.13–.17)` | Hodnota podľa komponentu |
| Štítky | text `#c7b8a7`, border `#4b3520` | `.mini-tags b` |
| Pätička | `#6f675e` | Subtílne metadáta |

Welcome pozadie je presne:

```css
background: radial-gradient(circle at 70% 30%,
  #26190d 0, #0d0a07 43%, #090705 100%);
```

Pravidlo Shapeviz: čierna tvorí základ; hnedé a medené tóny vytvárajú atmosféru. Nepoužívať náhodnú druhú výraznú akcentovú farbu. Na webe nemeniť dôležitý text na veľmi nízku priehľadnosť iba kvôli estetike; nízkokontrastné podpisy z prezentácie nie sú automaticky vhodné pre funkčné rozhranie.

## 4. Typografia

**V28:** `Helvetica, Arial, sans-serif`. Font sa nenačítava z externého fontového súboru. Skutočný použitý rez závisí od dostupnosti fontu v operačnom systéme. Hodnoty `650` a `800` nemusia mať samostatný fyzický rez; prehliadač ich mapuje na dostupné váhy.

Nadpisy `h1`, `h2`, `h3` majú `text-transform:uppercase`. Preto sa aj text welcome nadpisu zapísaný ako „Designed to be desired.“ zobrazuje verzálkami. Bežný text zostáva v prirodzenej veľkosti písmen. Nadpisové `span` v `h1` a `h2` sú oranžové s váhou `800`, okrem explicitných výnimiek záverečného podpisu.

| Typ | Veľkosť | Váha | Riadkovanie | Tracking / ďalšie |
|---|---|---|---|---|
| H1 / cover | `clamp(46px,6.6vw,112px)` | 700 | .91 | `-.055em` |
| H2 / základ | `clamp(38px,5.2vw,84px)` | 650 | .98 | `-.045em`, max-width 1180px |
| Welcome H2 | `clamp(38px,5vw,72px)` | 650 | .98 | `-.045em` |
| Eyebrow | 12px | 700 | normal | `.16em`, oranžová |
| Body / lead | `clamp(16px,1.45vw,25px)` | normal | 1.5 | max-width 760px |
| Caption / grid body | 15px | normal | 1.45 | sekundárny text |
| H3 v základnej obsahovej mriežke | 22px | predvolená bold váha H3 | normal | margin `1.4vh 0 1vh` |
| Welcome opis | 16px | normal | 1.5 | max-width 560px |
| Hlavné CTA | 14px | 700 | normal | `.04em`; šípka 17px |
| Pätička | 12px | normal | normal | `.08em` |
| Počítadlo snímok | 11px | normal | normal | `.12em` |
| Záverečný podpis H1 | `clamp(64px,9.5vw,168px)` | 700 | .88 | `-.065em`; × oranžové, váha 400 |

Ďalšie overené varianty:

- Strategy H2: `clamp(46px,5.35vw,92px)`, max-width 1100px; body `clamp(15px,1.05vw,20px)/1.58`.
- Editorial H2: `clamp(48px,5.4vw,96px)`, max-width 900px; body `clamp(16px,1.13vw,21px)/1.62`.
- Benchmark H2: `clamp(42px,4.4vw,78px)`; body `clamp(14px,.98vw,18px)/1.58`.
- Studio H2: `clamp(34px,4.6vw,74px)`; intro `clamp(15px,1.18vw,21px)`.
- Monthly H2: `clamp(44px,5vw,86px)`; položky H3 18px, opis 13px/1.45.
- Veľké číslo calloutu: `clamp(54px,5.6vw,94px)/.85`, tracking `-.06em`, váha zdedená z `strong`.
- Záverečný opis: `clamp(12px,.82vw,15px)/1.5`, biela s opacity .48; label 10px/1, váha 700, tracking .16em, opacity .42.

Pravidlo Shapeviz: veľké tesné nadpisy, menší voľnejší sprievodný text, široko rozostúpené drobné kategórie. Nepreviesť celé odseky do verzálok. Nepoužívať dekoratívny serif ani automaticky nahradiť Helvetica iným populárnym fontom.

Adaptácia pre web: explicitne nastaviť `font-family:inherit` na tlačidlách a formulároch. V28 nastavuje rodinu na body a nadpisoch, ale základné CTA nemá vlastnú rodinu, takže do výsledku môže vstupovať štýl formulárov prehliadača. Jediný H1 na stránke môže používať rovnakú vizuálnu stupnicu ako welcome H2.

## 5. Layout a priestor

### Základ prezentácie — v28

- `#deck`: `100vw × 100vh`, relatívne pozicionovanie.
- `.slide`: absolútna poloha `inset:0`, padding `6.5vh 7vw 7vh`, `overflow:hidden`.
- Zobrazuje sa iba `.active`. Základný slide je block, statement flex, video grid.
- Eyebrow má spodný odstup 5vh, lead horný odstup 4vh.
- Pätička: `left:7vw; bottom:4vh`.
- Referencia je viewportová prezentácia, nie pevné plátno so zakódovaným pomerom 16:9.

| Vzor | Stĺpce / rozmery | Medzery a zarovnanie |
|---|---|---|
| Cover / text + obraz | `1.15fr .85fr`, výška 72vh | gap 6vw, align-start |
| Image-led | `.8fr 1.2fr`, výška 72vh | gap 6vw |
| Showcase | `.72fr 1.28fr`, výška 72vh | gap 5vw |
| Problem + phone | `.95fr .72fr`, výška 72vh | gap 4vw; obraz 68vh |
| Dvojica `.pair` | `1fr 1fr`, výška 70vh | gap 18px |
| `.safe-pair` | `1fr 1fr`, základ 66vh | gap 18px, margin-top -1vh; lokálne výnimky |
| Social showcase | 5 stĺpcov, základ 62vh | gap 16px |
| Poster row | flex, základ 59vh | gap 1.4vw; obrázky width 23%, height auto |
| Obsahová mriežka | 3 stĺpce | gap `3vw 4vw`, margin-top 6vh |
| Metrics | 3 stĺpce | gap 3vw, margin-top 8vh; v problem 4vh |
| Editorial | `minmax(0,1.12fr) minmax(360px,.88fr)` | gap 6.5vw, margin-top 8vh |
| Strategy copy | 2 rovnaké stĺpce | gap 4.8vw, max-width 1160px |
| Material trio | 3 rovnaké stĺpce, obrázky 51vh | gap 1.3vw, margin-top 3.3vh |
| Studio mosaic | `1.25fr 1fr 1fr`, 2 riadky, 54vh | gap 16px; hlavný obraz cez 2 riadky |
| Video | `.68fr 1.32fr` | gap 5vw, align-center; frame 76vh |

Statement slide vertikálne centruje hlavné posolstvo, eyebrow ponecháva absolútne pri `top:7vh`. Nadpis má max-width 1250px. Záverečný podpis je centrovaný horizontálne aj vertikálne; opis je dole pri `bottom:3.5vh`.

Pravidlo Shapeviz: striedať veľké obrazové sekcie, text + obraz a čisté typografické vyhlásenia. Zachovať asymetriu a spoločné okraje. Husté mriežky používať iba pre porovnania alebo systém výstupov.

### Responzivita — overené hranice

V28 má hlavný breakpoint **900px**. Základné dvojstĺpce sa menia na jeden stĺpec, padding slidu na `5vh 5vw`, metrics a content grid na dva stĺpce, social showcase na tri. Pair má 44vh, safe-pair 42vh, video frame 56vh. Studio mosaic sa mení na dva stĺpce a tri riadky s gap 10px; strategy a editorial na jeden stĺpec. Monthly note sa skrýva. Benchmark má samostatný breakpoint **1100px**: obrázky z 4 stĺpcov prejdú na 2, ich výška z 61vh na 30vh.

Tieto pravidlá nie sú kompletný mobilný webový systém. Napríklad neskoršie `.hero-img {height:66vh !important}` prebije pôvodný mobilný návrh 38vh; material trio nemá samostatný mobilný breakpoint. Pri tvorbe webu sa riadiť sekciou 10, nie slepo kopírovať tieto obmedzenia.

## 6. Obrázky, video a zaoblenie

### Výsledok kaskády a JavaScriptu

Zdroj obsahuje historické rádiusy 18, 24, 26, 28, 30 aj 32px. Nie sú to všetko rovnocenné finálne tokeny. `--img-radius:28px` a `--media-radius:24px` existujú súčasne. Pri aktivácii slidu, načítaní obrázka a resize volá JavaScript `applyVisibleImageRounding()`:

1. Pri `object-fit:contain` zistí reálne rozmery zobrazeného bitmapového obsahu a symetrické prázdne okraje.
2. Na viditeľnú plochu aplikuje inline `clip-path:inset(... round radius)` s `!important`.
3. Rádius vypočíta ako `min(28, max(14, min(renderedWidth,renderedHeight) × .055))` px.
4. Pri inom `object-fit` nastaví inline `border-radius:28px !important`. Existujúci clip-path tým automaticky neruší.

**Pravidlo Shapeviz:** médium musí byť zaoblené na skutočne viditeľnom okraji. Predvolený nový token je **28px**. Na malých contain náhľadoch používať overený rozsah **14–28px**. Pill má **999px**, procesné boxy **16px**, obal benchmark referencie **24px**. Zjednodušená nová implementácia môže používať wrapper prispôsobený pomeru média namiesto výpočtu clip-path.

Výnimky a presnosť:

- Cover wrapper vo finále nemá pozadie, tieň ani gradient; má `overflow:visible` a radius 0. Jeho obrázok má deklarovaný radius 30px, ale viditeľný contain obsah ďalej zaobľuje JavaScript.
- Bežné video má finálny clip-path 28px. Tretie demo video a frame deklarujú radius 30px, ale skorší dôležitý clip-path videa zostáva 28px; netvrdiť, že všetky jeho viditeľné rohy sú automaticky 30px.
- Material trio má deklaráciu 26px, no pri jeho `object-fit:cover` skript nastaví radius 28px. Benchmark obrázok takisto dostane radius 28px, zatiaľ čo jeho rodičovský figure zostáva 24px a orezáva obsah.
- Lightbox má radius 28px a skript ho z tejto úpravy vynecháva.

### Orezávanie a pomer strán

Všeobecný zámer je zachovať celý obraz a neorezať texty ani logá. Základ je `object-fit:contain`, stredové zarovnanie a transparentný podklad. Makro, studio mosaic a material trio majú výslovnú výnimku `cover`; benchmark používa `cover` s `top center`; demo video tiež `cover`.

Neskoršie pravidlá niektorých obrazov používajú `object-fit:fill` spolu s jedným automatickým rozmerom. To má zachovať prirodzený pomer, ale pri súbehu obmedzení šírky/výšky nie je deformácia vylúčená. Pre nový web používať explicitný pomer strán alebo prirodzené rozmery; nespoliehať sa na `fill` ako garanciu.

### Tiene a filter

- Základný tieň obrázkov: `0 22px 48px rgba(0,0,0,.18)`; neskorší všeobecný selector s `:not()` prepisuje mnohé staršie tiene.
- Video tieň: `0 30px 100px rgba(0,0,0,.35)`.
- Lightbox obraz: `0 36px 120px rgba(0,0,0,.62)`.
- Cover wrapper a hero majú základný filter `saturate(.92) contrast(1.03)`.
- V hover pravidle je deklarovaný tieň `0 28px 70px rgba(0,0,0,.28)`, ale pri obrázkoch ho neskorší `.slide img:not(#imageLightboxImage)` prepisuje základným tieňom. Pri videu ostáva hover tieň účinný.

## 7. Komponenty

### Welcome a hlavné CTA

Welcome je plný fixed overlay, z-index 100, centrovaný text. Vnútro má max-width 820px vrátane paddingu 40px. Eyebrow má margin-bottom 25px; opis margin-top 24px. Hlavné posolstvo: `Designed to be desired.` s oranžovým `desired.`.

`START JOURNEY →`:

- inline-flex, zarovnanie center, gap 14px;
- min-width 210px, padding `15px 24px`, margin-top 34px;
- border 1px, radius 999px, oranžová výplň aj border;
- text a šípka `#0b0805`; 14px/700, tracking .04em, šípka 17px;
- tieň `0 12px 38px rgba(216,135,57,.22)`;
- backdrop blur 12px ostáva v CSS, hoci za plnou výplňou má malý vizuálny význam;
- hover `translateY(-2px) scale(1.015)`, farba `#e3954c`, tieň `0 16px 48px rgba(216,135,57,.32)`, filter `brightness(1.08)`;
- šípka pri hover `translateX(4px)`;
- transition transform, background a border-color `.25s ease`; šípka transform `.25s ease`. Box-shadow ani filter nie sú zahrnuté do zoznamu transition.

Kliknutie odstráni overlay a otvorí prvý slide. Interné povolenie zvuku sa nekomunikuje ako hlavné posolstvo vstupu. Na webe CTA smeruje na konkrétny obsah alebo kontakt; welcome nesmie byť povinná bariéra pred celým webom.

### Navigácia prezentácie

Fixed spodný ovládač: left 50%, bottom 2.6vh, translateX(-50%), flex gap 12px, padding `8px 10px`, background `rgba(10,8,6,.78)`, blur 14px, border `1px solid #2c2118`, z-index 50. V28 pre tento obal **nedefinuje border-radius**. Tlačidlá majú 34 × 30px, transparentný podklad a 18px text `#d5cec4`. Počítadlo má min-width 58px, text `#8f877d` a formát `01 / 25`.

Progress je 2px vysoká oranžová linka na spodnom okraji, z-index 60, transition width `.35s ease`. Výpočet je `(currentIndex+1)/slideCount*100`; prvý slide preto nezačína na nule. Navigácia sa na konci cyklicky vracia na začiatok.

Klávesy: Right, PageDown, Space, Enter → ďalej; Left, PageUp → späť; Home → prvý; End → posledný. Pri otvorenom lightboxe je globálna navigácia pozastavená.

### Lightbox

Overlay: `rgba(5,4,3,.91)`, backdrop blur 16px, padding `4vh 4vw`, z-index 500. Obraz max-width 92vw, max-height 88vh, contain, radius 28px. Žiadny hover náklon; kurzor zoom-out.

Zatváranie: Escape, klik mimo obrázka, klik na obrázok alebo kruhové tlačidlo ×. Tlačidlo má 48 × 48px, top 3vh, right 3vw, radius 50%, border biela .15, background `rgba(12,10,8,.72)`, font `300 30px/1 Helvetica,Arial,sans-serif`. Hover scale 1.06, oranžová výplň .9, tmavý text; transition .2s ease. Spodný hint má 11px, tracking .12em, farbu `#918981`.

Obrázky na slidoch dostanú tabindex 0, role button a aria-label; funguje Enter/Space. Otvorenie lightboxu zastaví a resetuje videá, zatvorenie znovu spustí video aktuálneho slidu. Focus trap a obnova focusu nie sú implementované; na novom webe ich doplniť.

### Karty, štítky a proces

- Obsahové položky prevažne používajú iba hornú 1px linku, nie plný panel.
- Callout: radius 28px, border biela .13, jemný biely povrch .025, padding `2.7vh 2.1vw 2.5vh`.
- Procesné boxy: radius 16px, border `--line`, padding `16px 18px`, 15px/700, tracking .12em; šípky oranžové.
- Mini-tags: padding `10px 14px`, border `#4b3520`, 12px/700, tracking .08em. V28 nemá na `.mini-tags b` účinné všeobecné zaoblenie.
- Benchmark pill captions: radius 999px, padding `8px 10px 7px`, 9px/700, tracking .13em, blur 10px, background `rgba(7,6,5,.68)`.

## 8. Pohyb a kurzorová žiara

### Vstup a hover

Slide vstupuje za **.42s ease** z opacity 0 a `translateY(5px)` na opacity 1 a transform none. Nie je to animácia dvoch súčasne viditeľných slidov; starý slide sa skryje.

Obrázky a videá pri hover: `translateY(-8px) rotate(-2deg) scale(1.012)`, filter `saturate(1.03)`. Transform má `.32s cubic-bezier(.2,.8,.2,1)`, box-shadow a filter `.32s ease`. Obrázky majú cursor zoom-in. Tieňové výnimky sú uvedené v sekcii 6.

Pravidlo Shapeviz: krátky, mäkký pohyb s malou amplitúdou. Nepoužívať bounce, prudký zoom, trvalé nakláňanie textu ani blikajúce akcenty. Na webe hover na obrázku signalizuje skutočnú interakciu.

### Finálna žiara — presná mechanika v28

Aktívny systém je **`#fluidCursorGlow`**, nie starší `#cursorGlow` ani `#cursorSmoke`; tie sú vypnuté cez `display:none !important`. Je to dvojica živých CSS gradientov, nie kreslená stopa do canvasu. Systémový kurzor zostáva viditeľný.

| Parameter | Head | Tail |
|---|---|---|
| Rozmer | 2450 × 2450px | 2950 × 1700px |
| Vycentrovanie | margin -1225px na oboch osiach | margin-left -1475px, margin-top -850px |
| Opacity pri pohybe | .42 | .22 |
| Opacity po 900ms pokoja | .36 | .16 |
| Filter | blur 70px, saturate 1.06 | blur 90px, saturate 1.04 |
| Sledovanie za frame | 10.5% vzdialenosti k pointeru | 4.7% vzdialenosti k head |

Head gradient: stred 50% 50%; `rgba(225,145,72,.26)` 0%, `rgba(188,105,45,.19)` 18%, `rgba(128,66,25,.12)` 34%, `rgba(76,38,14,.055)` 52%, `rgba(22,11,5,0)` 72%.

Tail gradient: ellipse at 58% 50%; `rgba(217,132,61,.17)` 0%, `rgba(164,86,34,.115)` 24%, `rgba(98,48,17,.06)` 45%, `rgba(20,10,4,0)` 74%.

Obe plochy majú border-radius 50%, `mix-blend-mode:screen`, `pointer-events:none`, `will-change:transform,opacity`. Obal je fixed cez celý viewport, overflow hidden, z-index 1. Deck má z-index 2 a body isolation isolate.

Štartovacia pozícia je 72% šírky a 28% výšky viewportu. Po prvom pohybe myši alebo pera sa žiara riadi pointerom. Opacity gradientových stopov sa kombinuje s opacity celého elementu; hodnoty .42/.22 neznamenajú nepriehľadný oranžový kruh.

```text
speed = min(46, hypot(headX-prevHeadX, headY-prevHeadY))
headScaleX = 1 + min(.34, speed*.013)
headScaleY = 1 - min(.13, speed*.0048)
distance = hypot(headX-tailX, headY-tailY)
tailScaleX = 1.06 + min(.72, distance/340)
tailScaleY = .94 - min(.18, distance/1500)
```

Head sa otáča v smere svojej rýchlosti, tail v smere k head. Transform poradie: translate3d → rotate → scale. Animácia beží cez requestAnimationFrame a interpolácia vo v28 závisí od počtu snímok, nie od uplynutého času. Po zastavení sa oba tvary zlejú do mäkkej atmosféry bez trvalej stopy.

CSS systém vypína pri `(pointer:coarse)` alebo `(prefers-reduced-motion:reduce)`. JavaScript ho spustí iba pri `(pointer:fine)` a bez reduced-motion. Tieto JS podmienky kontroluje pri inicializácii.

Staré pravidlá `body.lightbox-open #cursorGlow` sa vzťahujú na vypnutý element. Finálny fluid glow sa pri lightboxe ani welcome explicitne nepozastavuje; prekrývajú ho vyššie vrstvy. Pri novom webe možno dekoratívnu animáciu pri zakrytí pozastaviť.

## 9. Použitie pri ďalšej prezentácii

Odporúčaná dramaturgia odvodená z v28:

1. Welcome s hlavnou vetou a oranžovým CTA.
2. Cover s názvom projektu a silným vizuálom.
3. Kontext, príležitosť a cieľ.
4. Vizuálny smer a systém obsahu.
5. Obrazové dôkazy: hero, detail, studio, variácie, social výstupy.
6. Motion alebo video s krátkym vysvetlením účinku.
7. Spôsob spolupráce a rozsah relevantný pre daného klienta.
8. Jednoznačný cieľ a záverečný podpis Shapeviz × klient.

Nie je povinný počet 25 slidov ani rovnaké poradie klientských tém. Zachovať mierku, rytmus a vizuálnu logiku. Veľké texty ručne deliť tam, kde je to významovo prirodzené. Všetky médiá musia mať dostatok priestoru od navigácie.

Video vo v28: `playsinline`, loop, automatické spustenie aktuálneho slidu cez `.autoplay-video`; odchod video zastaví a vráti na začiatok. Start nastaví interné audioEnabled; pri neúspešnom play sa zobrazí fallback. Pri novom použití rešpektovať nastavenia zvuku používateľa a podmienky prehliadača.

Pre PDF alebo statické slidy použiť čierny podklad, teplé texty a rovnaké rádiusy. Cursor glow a hover sa do statického výstupu neprenášajú ako animácia; prípadný statický glow je vedomá adaptácia. Videá nahradiť zvoleným posterom a funkčným odkazom.

## 10. Prenos na web Shapeviz

Táto sekcia je návrh adaptácie, nie extrakcia existujúceho webu.

### Čo zachovať

Čierne plátno, `#f1ede6` text, `#9f978d` sprievodný text, oranžovú `#d88739`, Helvetica/Arial, veľké tesné nadpisy, 28px média, plné pill CTA, jemný fluid glow a obrazovo orientované rozloženie.

### Čo prispôsobiť médiu

- Web používa prirodzený vertikálny scroll. Nekopírovať globálne `overflow:hidden`, absolútne full-screen slidy ani povinný welcome overlay.
- Hero môže prevziať „Designed to be desired.“, stručný opis Shapeviz a CTA na práce alebo kontakt. Nevyžaduje vstupné kliknutie na odomknutie stránky.
- Odporúčaný začiatok spacing systému: bočný gutter `clamp(20px,7vw,112px)`, vertikálny odstup sekcií `clamp(64px,8vw,144px)`. Sú to nové webové tokeny, nie hodnoty z v28.
- Začať pri max-width obsahu 1600px; upraviť podľa pomeru médií a čitateľnosti. Dlhé odseky obmedziť približne na 60–70 znakov na riadok.
- Pri 900px a menej prejsť na jeden hlavný stĺpec. Husté galérie môžu zostať dvojstĺpcové, ak sú čitateľné; na úzkom mobile jeden stĺpec. Výšku obrázkov odvodzovať od pomeru strán.
- Pre mobil navrhnúť samostatné veľkosti nadpisov podľa dĺžky textu. Záverečný desktopový podpis s minimom 64px sa nemá kopírovať bez úpravy.
- Použiť sémantické komponenty: Header, Hero, SectionLabel, SplitSection, ProjectGallery, MediaCard, PrimaryButton, Lightbox, ProcessRow, ContactSection, Footer.
- Súbory médií načítavať ako samostatné optimalizované assets s vhodnými rozmermi a lazy-loading mimo prvého viewportu. V28 obsahuje veľké inline base64 médiá; tento spôsob balenia nie je branding.
- Dekoratívne video na webe spúšťať bez zvuku; pre zvuk a prehrávanie ponúknuť ovládanie. Obsahové video musí byť použiteľné aj bez automatického spustenia.
- Zachovať prirodzený kurzor a vypnutie glow na dotykových zariadeniach. Pri výkonnostných problémoch znížiť rozlíšenie/rozsah dekoratívnych vrstiev; nemení sa tým základná identita.
- Reduced-motion musí vypnúť aj náklony, posuny a vstupné animácie, nielen glow. V28 to rieši iba pre glow.
- Pre interaktívne prvky navrhnúť viditeľný focus, dostatočnú dotykovú plochu, zmysluplné názvy a overiť kontrast. Pridať focus trap a návrat focusu do lightboxu. Nezávisieť od hoveru na dotyku.

Odporúčaná skladba webu: hero → vybrané práce → prístup a hodnota → služby → proces spolupráce → kontakt. Názvy služieb aj dôkazy musia zodpovedať reálnej ponuke Shapeviz; obsah Milenium nie je automaticky portfólio celej firmy.

## 11. Zjednotený východiskový token set

Nasledujúce názvy sú nová normalizácia pre budúci kód. Hodnoty farieb, typografie a hlavných rádiusov sú odvodené z referencie; tokeny nenahrádzajú komponentové výnimky uvedené vyššie.

```css
:root {
  --sv-bg: #000;
  --sv-bg-warm: #0d0a07;
  --sv-surface: #100c08;
  --sv-text: #f1ede6;
  --sv-muted: #9f978d;
  --sv-accent: #d88739;
  --sv-accent-hover: #e3954c;
  --sv-on-accent: #0b0805;
  --sv-line: #2b2118;
  --sv-font: Helvetica, Arial, sans-serif;
  --sv-radius-media: 28px;
  --sv-radius-frame: 24px;
  --sv-radius-process: 16px;
  --sv-radius-pill: 999px;
  --sv-shadow-media: 0 22px 48px rgba(0,0,0,.18);
  --sv-shadow-cta: 0 12px 38px rgba(216,135,57,.22);
  --sv-duration-control: .25s;
  --sv-duration-media: .32s;
  --sv-duration-slide: .42s;
  --sv-ease-media: cubic-bezier(.2,.8,.2,1);
}
```

## 12. Čo z pôvodnej implementácie nekopírovať

Tieto zistenia sú technické odchýlky, nie požadované vlastnosti značky:

- Záverečný `.final-brand-slide` je v HTML vložený do `#fluidCursorGlow`, mimo `#deck`. Globálny výber `.slide` ho síce zaradí medzi 25 slidov, ale dedí nevhodný kontext dekoratívnej vrstvy; jej skrytie na dotyku/reduced-motion skryje aj tento slide. V novej prezentácii musia všetky slidy patriť do decku.
- Pravidlo označené „slide 3 rounded bottom cards“ cieli `.metrics`, `.pill`, `.card` atď. na tretí DOM slide, kde sú v skutočnosti `.mini-tags b`. Číslovaný slide „03 — HLAVNÝ PROBLÉM“ je štvrtý DOM slide. Deklarácia preto nepotvrdzuje, že požadované boxy sú zaoblené. V novej implementácii použiť explicitnú triedu komponentu.
- Triedy `campaign-assets-slide` a `social-outputs-slide` sa dopĺňajú v obsluhe klávesu Home. Ich lokálne korekcie sa nemusia uplatniť pri bežnom prvom prejdení decku. Inicializovať ich priamo alebo vložiť do HTML.
- Globálne skratky Enter/Space nemajú všeobecnú výnimku pre focusované ovládacie prvky. Obrázok je chránený tým, že po otvorení lightboxu globálna obsluha skončí. Pri rozšírení rozhrania o formuláre alebo ďalšie tlačidlá doplniť explicitné pravidlá pre focus a propagáciu udalostí.
- Historické CSS vrstvy, `nth-of-type` korekcie a prepisovanie rádiusov nie sú systém komponentov. Nové riešenie má mať jeden zrozumiteľný štýl na komponent a pomenované výnimky.

## 13. Kontrola pred odovzdaním

- [ ] Pozadie je čierne, biela teplá a oranžová zodpovedá `#d88739`.
- [ ] Font, váhy, tracking a riadkovanie zachovávajú hierarchiu referencie.
- [ ] Hlavné CTA je plné oranžové pill tlačidlo s tmavým textom.
- [ ] Nadpis má jasnú myšlienku; akcent nezaberá náhodne celý text.
- [ ] Médium má zaoblené reálne viditeľné okraje, správny pomer a žiadny nechcený podklad.
- [ ] Text a logo v médiu nie sú náhodne orezané.
- [ ] Glow je mäkký, oneskorený, pod obsahom a nezanecháva stopu.
- [ ] Rozloženie funguje na širokom desktope, notebooku a úzkom mobile; text nekoliduje s ovládaním.
- [ ] Reduced-motion a dotykový režim majú plnohodnotný obsah.
- [ ] Lightbox, klávesnica, focus, navigácia a videá fungujú podľa kontextu.
- [ ] Klientské názvy, ponuka, termíny a počty výstupov sú aktualizované.
- [ ] Technické chyby uvedené vyššie sa nepreniesli do nového projektu.

## 14. Zadanie na opätovné použitie

> Vytvor [prezentáciu/web/sekciu] pre Shapeviz podľa tohto dokumentu. Zachovaj čierny základ, teplú bielu, oranžový akcent #d88739, Helvetica/Arial, výrazné tesné nadpisy, veľkorysé rozloženie, zaoblené médiá a oranžové pill CTA. Pre interaktívny desktop použi jemný fluid cursor glow podľa presnej špecifikácie. Odlišuj overené hodnoty v28 od odporúčaných webových adaptácií. Obsah prispôsob zadaniu; nepreberaj automaticky klientské názvy ani ponuku Milenium. Neprenášaj historické CSS chyby. Over mobil, focus, reduced-motion, pomer médií a funkčnosť ovládania. Ak niečo zámerne meníš, stručne to označ.
