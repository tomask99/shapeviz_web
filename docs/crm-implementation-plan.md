# Shapeviz CRM — postup implementácie

Stav: funkčné etapy 0 až 7 implementované a CRM migrácie aplikované. Záverečný rozsah, živé integračné overenie a stav nasadenia: `docs/crm-stage-7-completion.md`. Staršie stage dokumenty zachytávajú stav pri jednotlivých odovzdaniach.
Podklad: `briefs/brief.md`. Audit repozitára a produkčnej schémy: 22. september 2026.

## Existujúca architektúra

| Oblasť | Overený stav | Postup pre CRM |
| --- | --- | --- |
| Frontend | Statické HTML, CSS a JavaScript ES moduly; bez Reactu, Next.js a TypeScriptu | Zachovať technológiu, nové menšie CRM moduly a JSDoc dátové typy s runtime validáciou |
| Admin | `public/admin/index.html`, `studio.js`, `studio.css`; natívne dialogy | Zdieľať shell, navigáciu, formuláre, hlášky, tlačidlá a vizuálne tokeny |
| Routing | `/admin`, `/adminlogin`; prepínanie Overview/Templates cez `data-view`; server.js a Vercel rewrites | Doplniť explicitné CRM cesty a History API, vrátane reload/back/forward; nepresmerovať CSS/JS súbory |
| API | Vercel Functions; `/api/admin?action=...`, implementácia v `src/admin/handler.js` | Zachovať existujúci autentifikačný vstup, CRM business logiku oddeliť do `src/crm/` |
| Prihlásenie | Supabase Auth, overenie používateľa a role owner v `presentation_admins` | Nevytvárať nový login ani druhý workspace systém |
| Session | HttpOnly cookies `sv_access`/`sv_refresh`, SameSite Strict, Path `/api/admin`; kontrola origin pri zápisoch | CRM akcie ponechať pod existujúcim API; samostatné `/api/crm` by tieto cookies nedostalo |
| Databáza | Supabase Postgres, migrácie, RLS; momentálne bez CRM tabuliek | Pridávať schému po etapách, bez druhej databázy |
| Prezentácie | `presentation_projects`, PK `deck_slug`; HTML v private Storage, médiá oddelene | Zachovať `/p/:slug`, šablóny, upload, náhľad, mazanie a existujúce dáta |
| Analytika | `presentation_sessions`, `presentation_events`, RPC `record_presentation_event` a `presentation_admin_stats` | Čítať existujúce dáta; neduplikovať návštevy a slide eventy do nového analytického systému |
| Webová analytika | Samostatná `website_sessions` a jej RPC | Nemeniť pri zavádzaní CRM |
| E-mail | Kontaktný formulár podporuje Gmail SMTP cez Nodemailer; nie synchronizáciu mailboxu | V MVP manuálne záznamy odoslania a odpovede, bez nového e-mailového poskytovateľa |
| Testy | Node test runner, Playwright, SQL testy, build a validácia prezentácií | Rozšíriť súčasné testy; lint/typecheck skripty aktuálne neexistujú |

## Bezpečnostná podmienka pred prvou migráciou

Pri úvodnom audite sa lokálna história migrácií a produkčná `supabase_migrations.schema_migrations` nezhodovali (vyriešené v etape 0; podrobnosti v `docs/migration-reconciliation.md`):

- `presentation_audio_formats`: lokálne `20260921085314`, produkcia `20260921085329`.
- `telegram_visit_notifications`: lokálne `20260921112336`, produkcia `20260921112515`.
- `telegram_website_click_notifications`: lokálne `20260922132801`, produkcia `20260922133053`.
- `20260921144920_presentation_cta_clicks.sql` nemá zhodný produkčný záznam, hoci živá schéma aj RPC podporujú `website_clicked`.
- Lokálny `20260921082743_remove_all_presentation_data.sql` obsahuje `delete from public.presentation_projects;` a nemá zhodný produkčný záznam. Jeho spustenie by odstránilo prezentácie a cez kaskády aj analytiku.

Pred nasadením CRM porovnať skutočné definície s migračnými súbormi, zdokumentovať bezpečné zosúladenie histórie a overiť plán nasadenia. Nevykonať slepý `db push`, reset ani opätovné spustenie historického mazania. Označenie migrácie za aplikovanú sa smie opierať o overený stav, nie iba jej názov. Historické jednorazové mazanie musí dostať výslovné riešenie, ktoré ho nebude replayovať.

Audit žiadnu migráciu nespustil a nič v produkcii nezmenil.

## Rozhodnutia pre implementáciu

- CRM je súkromné. `owner_id` sa odvodzuje z overenej session, nikdy z údajov poslaných formulárom. RLS kontroluje vlastníctvo aj oprávnenie používať admin.
- Dnešné serverové volania často používajú secret key, ktorý obchádza RLS. Samotné pridanie politík preto nestačí: CRM musí používať používateľský autorizačný kontext a explicitné overenie vlastníctva pri všetkých operáciách a väzbách. Prípadné privilegované interné operácie musia byť úzko ohraničené.
- Existujúce prezentácie sú spravované rolou owner, nemajú vlastné `owner_id`. Pri prepojení na CRM treba overiť práva aj na prezentáciu; samotné poznanie slugu nie je oprávnenie.
- Žiadne automatické vytváranie firiem z názvov prezentácií. Firma má stabilné UUID, zobrazovaný názov ani verejný slug nie sú jej identitou.
- Navrhované nové entity: `crm_companies`, neskôr `crm_contacts`, `crm_notes`, `crm_activities`, `crm_followups`. Nevytvárať všetky tabuľky vopred bez príslušnej funkcie.
- Služby ukladať ako viac hodnôt, nie text oddelený čiarkami; pre prvú verziu postačuje validované `text[]`. Industry umožní vlastnú textovú hodnotu s ponukou predvolených možností.
- Krajinu a kategóriu SK/CZ/INT držať konzistentné. Priority LOW/MEDIUM/HIGH nemeniť podľa engagementu.
- Pipeline statusy, služby a zdroje centralizovať. JSDoc typy nenahrádzajú validáciu API a databázové constraints.
- Zmena stavu a jej activity event musia byť v jednej transakcii. Aktualizácie nesmú potichu prepisovať novšie zmeny z inej karty prehliadača.
- Prezentácie sa budú k firme pripájať explicitne; jedna firma môže mať viac prezentácií. Predbežne nullable `company_id` na existujúcej prezentácii, obchodné odoslania ako samostatné udalosti/metadáta. Nepoužiť `published_at` ako dátum odoslania ani `presentation_date` ako spoľahlivý timestamp vytvorenia.
- Reset analytiky a zmazanie prezentácie nesmú zmazať firmu, kontakty ani manuálnu obchodnú históriu. Pri väzbách navrhnúť primerané SET NULL/ochranu namiesto nekontrolovaných kaskád.
- Existujúce štatistiky sú obmedzené na 7/30/90 dní. Pri CRM ukazovať jasný časový rozsah; nesľubovať lifetime dáta z 30-dňového výsledku. `max_slide` nie je počet unikátne pozretých slidov.
- Automatický posun na VIEWED odložiť do integračnej etapy. Pred ním overiť odlíšenie admin náhľadov, testov a skutočných návštev. Posúvať len z READY/CONTACTED, nikdy z pokročilého alebo uzavretého stavu.
- CRM timeline eviduje obchodné udalosti; analytické udalosti zobrazovať cez existujúce zdroje, nie ukladať každý heartbeat aj do CRM. Jednorazové odvodené udalosti deduplikovať.
- CRM dátumy ukladať ako `timestamptz`, zobrazovať lokálne. Existujúce grafy explicitne používajú UTC; nemeníme ich význam vedľajším efektom.
- Zoznam leadov stránkovať a filtrovať bez načítania detailnej analytiky každej firmy. Žiadne N+1 volania pri riadkoch tabuľky.
- Zachovať čiernu/hnedú paletu, amber akcent, oblú rohovú geometriu a existujúcu typografiu. Žiadny nový UI framework alebo generický CRM redesign.

## Etapy a kontrolné body

Každú etapu dokončiť, otestovať a odovzdať samostatne. Nedávať do produkcie nefunkčné navigačné položky ani ukážkové CRM dáta.

### 0. Audit a bezpečná príprava

- [x] Prečítať brief, preveriť routing, auth, schému a analytiku.
- [x] Identifikovať znovupoužiteľné UI a migračné riziká.
- [x] Bezpečne zosúladiť migračnú históriu a overiť zoznam čakajúcich verzií bez deštruktívneho SQL. CLI dry-run vyžaduje prihlásenie; porovnanie prebehlo cez pripojený Supabase nástroj.

### 1. Použiteľná databáza firiem — prvý funkčný prírastok

Dokončené 22. 9. 2026; testy a limity overenia sú uvedené v `docs/crm-stage-1.md`.

Rozsah: Leads, pridanie/úprava firmy, základný detail, archív/obnovenie, názov, web/social links, krajina, odvetvie, služby, opis, priorita, zdroj a pipeline status. Hľadanie v údajoch firmy, kombinované základné filtre a stránkovanie. Zatiaľ bez kontaktov, Kanbanu a analytických automatizácií.

- Nová company tabuľka s vlastníctvom, RLS, constraints a základnými indexmi.
- Nové CRM moduly API/UI; opatrné oddelenie zdieľaných pomôcok namiesto zväčšovania `studio.js`.
- Funkčné `/admin/leads` a `/admin/leads/:id`; znovuotvorenie pri reload, back/forward a po prihlásení.
- Responzívny zoznam: desktop tabuľka/riadky, mobil karty. Prázdne/chybové/loading stavy.
- Základ histórie iba pre udalosti implementované v tejto etape (vznik, zmena stavu, archív), aby sa obchodné zmeny nestratili pred neskorším timeline UI.
- Kontrola: uloženie → refresh → znovuotvorenie → editácia → filtrovanie → archivácia; neprihlásený a iný používateľ nemajú prístup.

### 2. Kontakty, poznámky a activity detail

Dokončené 22. 9. 2026; rozsah, testy a limity overenia sú uvedené v `docs/crm-stage-2.md`.

Viac kontaktov, primárny kontakt, pridanie/úprava/odstránenie kontaktu bez zmazania firmy. Rozšírenie vyhľadávania o kontakty. Poznámky oddelené od histórie. Detail s funkčnými tabmi a manuálnou aktivitou.

### 3. Pipeline

Dokončené 22. 9. 2026; podrobnosti a overenie v `docs/crm-stage-3.md`.

Kanban nad tými istými firmami, presun drag-and-drop aj prístupný alternatívny ovládač. Persistencia so záznamom zmeny; návrat UI pri chybe. LOST cez filter, archivované mimo aktívneho zoznamu.

### 4. Follow-ups

Dokončené 22. 9. 2026; podrobnosti, aplikovaná migrácia a limity overenia v `docs/crm-stage-4.md`.

Plánovanie, dokončenie a preplánovanie; overdue/today/upcoming/completed podľa lokálnej zóny. Najbližšia nedokončená úloha ako Next action na firme a v pipeline. Kontroly polnoci a letného času.

### 5. Prepojenie prezentácií a engagement

5a dokončená 22. 9. 2026: priradenie/odpojenie existujúceho decku z detailu firmy, prvé ručne zaznamenané odoslanie, on-demand analytika 7/30/90 dní a história. Väzba je v súkromnej `crm_presentation_links`, nie vo verejnom registri. Detaily: `docs/crm-stage-5a.md`.

5b1 dokončená lokálne 22. 9. 2026: voliteľný výber firmy pri vytváraní zo šablóny, uploade hotového HTML a editácii nepriradenej prezentácie; bezpečné opakovanie priradenia po uložení decku. Existujúca väzba sa spravuje v detaile firmy. Bez novej migrácie. Detaily a limity: `docs/crm-stage-5b1.md`.

5b2 dokončená 22. 9. 2026: manuálne zaznamenanie prijatej odpovede s časom a kontaktom, odolnosť proti duplicitám pri opakovaní, história a posledná odpoveď v prehľade firmy. Bez automatickej zmeny pipeline. Migrácie `20260922181101` a `20260922181325` aplikované. Detaily: `docs/crm-stage-5b2.md`.

5b3 dokončená lokálne 22. 9. 2026: engagement v Overview firmy pre jednu zvolenú priradenú prezentáciu a obdobie 7/30/90 dní, bez agregácie celej firmy alebo nových analytických dát. Detaily: `docs/crm-stage-5b3.md`.

Automatický VIEWED a agregácia firmy doplnené v záverečnom rozšírení: serverová kontrola admina pred trackingom, podpísané návštevy, bezpečný posun len z READY/CONTACTED a 30-dňové COLD/ACTIVE/HOT. Detaily a obmedzenia v `docs/crm-stage-7-completion.md`.

Priradenie existujúcej/novo vytvorenej prezentácie k firme, ručné označenie odoslania a odpovede, prehľad existujúcej analytiky v detaile. Overenie oprávnení pri väzbách, žiadne zmeny verejných URL. Až potom bezpečný jednorazový automatický posun na VIEWED.

### 6. Overview CRM

Dokončené 22. 9. 2026: súhrny nearchivovaných leadov, aktuálne pipeline stavy, firmy so zaznamenanou odpoveďou a follow-ups podľa lokálneho dňa. Päť najbližších úloh a odkazy na filtrované leady; zachované existujúce grafy a Presentation performance. Jeden súhrnný RPC bez N+1, bez historických konverzií. Migrácia `20260922182648` aplikovaná; aplikácia lokálna. Podrobnosti: `docs/crm-stage-6.md`.

### 7. Rozšírenia až po stabilnom MVP

7a dokončená 22. 9. 2026: voliteľná odhadovaná hodnota firmy v EUR, jednorazová/mesačná/neurčená frekvencia, zadanie a zobrazenie v detaile. Migrácia `20260922183619` aplikovaná; aplikácia lokálna. Bez súčtov na dashboarde alebo WON/LOST metadát. Detaily: `docs/crm-stage-7a.md`.

7b dokončená 22. 9. 2026: oddelené EUR súhrny jednorazových a mesačných odhadov pre nearchivované REPLIED/MEETING/PROPOSAL firmy. Chýbajúce hodnoty a neurčená frekvencia sa nesčítavajú; UI uvádza ich počty. Migrácia `20260922184332` aplikovaná; aplikácia lokálna. Detaily: `docs/crm-stage-7b.md`.

7c1 dokončená 22. 9. 2026: voliteľný dôvod straty leadu, úprava/vymazanie a zachovanie pri opätovnom otvorení. Migrácia `20260922184933` aplikovaná; aplikácia lokálna. Detaily: `docs/crm-stage-7c1.md`.

Záverečné rozšírenie dopĺňa COLD/ACTIVE/HOT (pravidlá centralizované v SQL, bez nastavení v UI), WON metadáta, pokročilé filtre, zdrojový reporting, logo cez URL a prvý kontakt. Gmail integrácia ani hromadné oslovovanie nie sú súčasťou MVP.

## Overenie a odovzdávanie každej etapy

- `npm.cmd test`, príslušné Playwright testy, `npm.cmd run build`, podľa zásahu `npm.cmd run presentations:validate`.
- SQL testy politík/vlastníctva, neplatných väzieb, transakcií a deduplikácie pri relevantných migráciách.
- Regressions: login/refresh/logout, upload HTML a šablóny, variant klienta, mazanie/shared media, `/p/:slug`, CTA, návštevy a Telegram.
- Nedotýkať sa reálnych klientskych dát pri testoch; izolované fixture dáta a bezpečný cleanup.
- Pred produkciou preveriť migračný diff/plán, zachovanie dát a kompatibilitu starej aplikácie s rozšírenou schémou.
- Pri odovzdaní uviesť hotový rozsah, súbory, migrácie/tabuľky/cesty, výsledky kontrol, prípadné manuálne nastavenia a nasledujúcu etapu.

## Stav tohto odovzdania

Zostávajúce funkčné body do etapy 7 implementované; migrácie `20260922191132` a `20260922191133` aplikované. Živý integračný test prešiel cez skutočný Auth, API, RLS, uloženie firmy/kontaktu/WON, návštevu prezentácie a automatický VIEWED. Izolované testovacie údaje odstránené. Stav nasadenia a limity: `docs/crm-stage-7-completion.md`. Staršie záznamy etáp vyššie zachytávajú stav pri jednotlivých odovzdaniach.
