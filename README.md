# Shapeviz Web

The private presentation studio is at `/adminlogin`. See
[`docs/admin-studio.md`](docs/admin-studio.md) for account setup, HTML uploads,
company variants and analytics.

The repository also contains the reusable Shapeviz Presentation System. The
Milenium deck and reusable introduction are delivered at `/p/milenium` and
`/p/shapeviz`. Production reads the registry and media from Supabase; new decks
and personalized template instances need no redeployment. Local source preview
remains available with `PRESENTATIONS_REMOTE=false`. See
`docs/presentation-system.md` for architecture and backend status and
`docs/adding-a-presentation.md` for the repeatable authoring workflow.

Repozitár projektu: https://github.com/tomask99/shapeviz_web

## Spustenie webu

Web je vytvorený v HTML, CSS a JavaScripte. Server používa priamo Node.js,
bez runtime závislostí. Potrebný je Node.js 22.9 alebo novší.

```powershell
npm.cmd ci
npm.cmd run dev
```

Náhľad: http://localhost:3000. Vo Windows používame `npm.cmd`, aby spustenie
neblokovala PowerShell execution policy. Po úprave súborov stačí obnoviť stránku.

```powershell
npm.cmd run build
npm.cmd start
```

Build skopíruje verejné súbory do `dist/`. Produkčný Node server obsluhuje tento
priečinok aj kontaktný endpoint. Na hostingu nastav `HOST=0.0.0.0`, príslušný
`PORT` a `SITE_URL` na presnú HTTPS adresu webu. Samotné GitHub Pages kontaktný
endpoint nespustia; web potrebuje Node hosting alebo samostatný backend formulára.

## Kontaktný formulár

Formulár má klientsku aj serverovú validáciu, honeypot a limit 5 pokusov za
10 minút na IP. Nepotvrdzuje úspech bez potvrdenia od e-mailovej služby.
Pri chybe zostáva správa vo formulári. Kontaktné údaje sa neukladajú do logov.

Skopíruj `.env.example` do `.env` a nastav:

- `CONTACT_TO_EMAIL`: adresa, na ktorú majú prichádzať správy.
- `CONTACT_FROM_EMAIL`: adresa odosielateľa na doméne overenej v Resend.
- `RESEND_API_KEY`: súkromný API kľúč služby Resend.
- `SITE_URL`: verejný pôvod webu, napríklad `https://tvoja-domena.sk`.

Implementácia používa [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email).
Bez nastavenia služba vráti stav 503 a návštevník dostane pravdivú informáciu,
že správa nebola odoslaná. Aktuálna lokálna verzia neobsahuje žiadne prihlasovacie
údaje ani vymyslený kontaktný e-mail.

Limit sa uchováva v pamäti jedného servera. Za reverzným proxy používa priamu
adresu spojenia, nie neoverené `X-Forwarded-For`. Pri produkčnom hostingu za
proxy nakonfiguruj limit návštevníkov aj na jeho vrstve; pri viacerých inštanciách
treba zdieľané počítadlo alebo limit na vstupnom proxy.

## Obsah a dizajn

- `public/index.html`: anglické texty, poradie sekcií a všetkých 10 značiek.
- `public/styles.css`: farby, typografia, layout a mobilná verzia.
- `public/app.js`: rozpúšťanie textu, fluid glow, video, lightbox a formulár.
- `public/media/`: optimalizované, samostatné médiá používané na webe.
- `src/contact.js`: serverové spracovanie formulára.
- `markdown files/SHAPEVIZ_BRAND_DESIGN_SYSTEM.md`: dodaný dizajnový systém.

Použité sú iba jeden interiérový obrázok, jedno video a dodané logo.
Obrázok sa načítava v dvoch veľkostiach ako WebP. Video je bez zvuku, v slučke,
načítava sa pri priblížení k sekcii a mimo záberu sa pozastaví. Pri obmedzení
pohybu je autoplay vypnutý; manuálne prehrávanie zostáva dostupné.
Lightbox podporuje klávesnicu, Escape a návrat focusu. Scroll zostáva prirodzený.

Použité zdrojové médiá: `assets/lifestyle_03.png`, `assets/video_creative_01.mp4`
a `assets/shapeviz logo.png`. Optimalizované kópie sú priamo verzované, takže
bežný build nepotrebuje pôvodné zdroje ani ich opätovnú konverziu.
`node scripts/prepare-media.js` ich z pôvodných súborov obnoví; poster videa
je samostatný uložený snímok.

## Overenie

```powershell
npm.cmd test
npm.cmd run test:browser
```

Testy prehliadača používajú nainštalovaný Google Chrome. Pokrývajú šírky
320–1920 px, scroll animáciu, reduced-motion, autoplay a ovládanie videa,
lightbox, navigáciu a formulár. Serverové testy overujú validáciu, chybové
stavy, obmedzenie požiadaviek, ochranu súborov a video range requesty.
E-mailová služba je v testoch simulovaná; testy neposielajú skutočné správy.

## Uloženie novej verzie

Každý commit uchováva jednu verziu projektu. Push ju odošle na GitHub.
Príkazy spúšťaj v priečinku projektu:

```powershell
git status
git diff
git add .
git diff --cached
git commit -m "Strucny popis zmeny"
git push origin main
```

Pred commitom skontroluj pripravené zmeny. Súbor `.gitignore` vynecháva
lokálne `.env` súbory, závislosti, logy a vygenerované výstupy.
Heslá a prístupové kľúče do zdrojových súborov nepatria.

## História a aktualizácia

```powershell
git log --oneline
git pull --ff-only
```

Pred prácou na inom počítači stiahni najnovšie zmeny cez `git pull --ff-only`.
História uložených verzií je dostupná aj v časti Commits na GitHube.

## Označenie vydania

Keď bude hotová prvá verzia na vydanie, môže dostať označenie:

```powershell
git tag -a v0.1.0 -m "Prva verzia"
git push origin v0.1.0
```

Pre ďalšie vydanie použi nové číslo, napríklad `v0.2.0`.
