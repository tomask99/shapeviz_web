# Pripojenie Shapeviz k ChatGPT

Stav k 23. septembru 2026: **Shapeviz MCP úspešne fungoval priamo v používateľovej lokálnej Work konverzácii**. Používateľ potvrdil výsledok obrázkom a záznam konverzácie potvrdzuje skutočné volanie `mcp__shapeviz__get_research_catalog({})` o 16:34:32 UTC a úspešnú odpoveď o dve sekundy neskôr. Zoznam obsahoval všetkých osem nástrojov. Nešlo o náhradné volanie cez Supabase.

## Čo teraz urobiť

Pokračuj v tej istej **Work / Práca** konverzácii. Napríklad: **„Cez Shapeviz ukáž prvú stránku mojich leadov.“** Katalóg už bol úspešne načítaný, tú istú skúšku netreba opakovať.

Pri budúcich skúškach používaj **Work → Work locally / Pracovať lokálne**. Uložené nastavenie pri načítaní konfigurácie predĺži čakanie na nástroje na začiatku konverzácie.

Pripojenie už je uložené ako **shapeviz**; formulár netreba znova vypĺňať. Reštart aj prechod do lokálneho Work už prebehli. Záznam konkrétneho neúspešného Work pokusu potvrdil príliš skoré zostavenie zoznamu nástrojov, takže samotná zmena režimu nebola celou opravou. Odpoveď získaná cez Supabase nepotvrdzuje použitie Shapeviz MCP. Rozdiel medzi Chat, Work a lokálnym/cloudovým prostredím opisuje [oficiálna príručka OpenAI](https://learn.chatgpt.com/docs/use-chatgpt).

Technická oprava v `~/.codex/config.toml`: globálne `mcp_optional_startup_grace_ms = 0` a pre `shapeviz` hodnota `startup_timeout_sec = 30`. Klient tým pri zostavovaní prvého zoznamu nástrojov počká na časový limit jednotlivých serverov namiesto predvoleného jednosekundového čakania. Shapeviz zostáva voliteľný, takže jeho výpadok nezablokuje všetky konverzácie. Začiatok konverzácie môže trvať o pár sekúnd dlhšie. Význam nastavenia opisuje [dokumentácia OpenAI MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Možnosť **Streamovateľné HTTP** na obrázku je správna. Nastavenie sme uložili cez CLI vrátane verejného Client ID, ktoré formulár nezobrazuje. Desktopová aplikácia, CLI a IDE zdieľajú `~/.codex/config.toml`; podrobnosti uvádza [oficiálna dokumentácia MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Do polí pre token, premenné prostredia ani hlavičky nič nevkladaj. Prihlásenie zabezpečuje OAuth. Keď prístup vyprší, pri pripojení zvoľ **Authenticate / Prihlásiť sa** a povoľ čítanie znova.

## Údaje pre pripojenie

| Pole | Nastavená hodnota |
| --- | --- |
| Názov v aplikácii | `shapeviz` |
| Popis | Čítanie vlastných firiem, výskumu, zdrojov a katalógu služieb Shapeviz. |
| MCP server URL | `https://shapevizweb.vercel.app/api/mcp` |
| Autentifikácia | OAuth, vopred registrovaný verejný klient, PKCE S256 |
| Client ID desktopu | `shapeviz-desktop` |
| Callback desktopu | `http://127.0.0.1/callback`; port si klient vyberie pri prihlásení. |
| Client secret | Prázdne; tento verejný klient nepoužíva client secret. |
| Oprávnenia | `crm:read research:read catalog:read` |

Adresa je potvrdená v nastaveniach Vercel projektu a verejné kontroly prešli. Ak sa neskôr zmení hlavná doména, musia sa zhodovať server URL, issuer aj resource.

## Server je už pripravený

Nasadenie má stav **READY** na `https://shapevizweb.vercel.app`. Nasledujúce údaje sú technický záznam, nie úlohy pre teba.

Produkcia má `SITE_URL=https://shapevizweb.vercel.app`, existujúce premenné Supabase a tieto hodnoty:

- `MCP_OAUTH_ENABLED=true`.
- `MCP_OAUTH_ENCRYPTION_KEY`: vygenerovaný samostatný náhodný 32-bajtový kľúč v base64, uložený ako serverové tajomstvo. Nie je to Client secret pre ChatGPT.
- `MCP_OAUTH_CLIENTS`: registrácie klientov uvedené nižšie.
- `MCP_OAUTH_ALLOW_LOOPBACK=false`.

Nasadená registrácia:

```json
[
  {"client_id":"shapeviz-chatgpt","name":"ChatGPT","redirect_uris":["https://chatgpt.com/connector_platform_oauth_redirect"]},
  {"client_id":"shapeviz-desktop","name":"Shapeviz Desktop","application_type":"native","redirect_uris":["http://127.0.0.1/callback"]}
]
```

Desktopový klient má povolený premenlivý lokálny port podľa [RFC 8252 § 7.3](https://www.rfc-editor.org/rfc/rfc8252#section-7.3). IP adresa a cesta callbacku musia presne sedieť; autorizačný kód je viazaný aj na konkrétny port z daného prihlásenia. Produkčný server zostáva HTTPS a `MCP_OAUTH_ALLOW_LOOPBACK=false`; toto nastavenie nie je výnimka pre HTTP server v produkcii.

Webový klient podporuje identifikáciu issueru RFC 9207 a stabilný callback z [dokumentácie autentifikácie OpenAI](https://developers.openai.com/plugins/build/auth). Jeho registrácia je pripravená, ale samostatné pripojenie na webe ChatGPT zatiaľ nebolo vytvorené ani overené.

Opakovateľná kontrola nasadenia (už prešla):

```powershell
npm.cmd run mcp:check -- https://shapevizweb.vercel.app
```

Táto kontrola nečíta tvoje dáta a nevytvorí pripojenie. Overuje dostupnosť servera a odmietnutie anonymného prístupu.

## Voliteľné samostatné pripojenie na webe ChatGPT

Pre používanie desktopovej aplikácie tento krok netreba. Ak budeš chcieť aj samostatné webové pripojenie, použi Client ID `shapeviz-chatgpt`, rovnakú MCP URL, OAuth a prázdny Client secret.

1. V nastaveniach ChatGPT otvor **Security and login** a zapni **Developer mode**, ak ho tvoj účet alebo pracovný priestor povoľuje.
2. Otvor správu **Plugins**, klikni na plus a pridaj MCP server s webovým Client ID uvedeným vyššie. Zvoľ OAuth a vopred registrovaného klienta, ak rozhranie ponúka výber.
3. Skontroluj presnú callback/redirect URL. Ak sa líši od registrácie, najprv treba upraviť server. Nevypĺňaj vymyslený Client secret, ak ho rozhranie vyžaduje; tento režim treba vyriešiť podľa možností konkrétneho účtu.
4. Prihlás sa do Shapeviz, skontroluj zobrazený účet a tri oprávnenia na čítanie, potom povoľ prístup.
5. Skontroluj zoznam ôsmich nástrojov a pridaj pripojenie v novej konverzácii cez ponuku nástrojov.

Názvy a dostupnosť ovládacích prvkov závisia od aktuálneho účtu. Postup vychádza z [oficiálneho návodu na pripojenie a testovanie](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Skúška v konverzácii

Uložené prihlásenie, zoznam ôsmich nástrojov a volanie katalógu už prešli cez klienta desktopovej aplikácie aj cez skutočnú konverzáciu v lokálnom Work. Z nasledujúcich požiadaviek je v konverzácii potvrdený katalóg; ostatné slúžia na ďalšie overenie jednotlivých pracovných postupov. Dostupnosť nástroja v obyčajnom Chat nebola potvrdená; používateľova skúška ho tam nenašla.

| Požiadavka | Očakávaný výsledok |
| --- | --- |
| „Ukáž katalóg služieb Shapeviz.“ | `get_research_catalog`; žiadny zápis. |
| „Ukáž prvú stránku mojich leadov.“ | `search_leads`; len firmy prihláseného vlastníka. |
| „Otvor detail jednej z týchto firiem a jej uložený AI Insight.“ | `get_lead` s ID z predchádzajúceho výsledku; uložený výskum má zostať označený ako historický. |
| „Ukáž prvú stránku Research inboxu a zdroje jedného kandidáta.“ | `get_research_candidates`, následne `get_research_candidate`. |
| „Skontroluj duplicitu pre web jednej z mojich firiem.“ | `check_company_duplicates`; bez vytvorenia firmy. |
| „Ukáž prvú stránku známych domén a zamietnutých domén.“ | `get_existing_domains`, `get_rejected_domains`; stránka nie je celý zoznam. |
| „Vytvor nový lead a odošli mu e-mail.“ | Žiadny zápis ani odoslanie; takéto nástroje tu nie sú. |

Pri skúške druhého vlastníka použi samostatné testovacie prihlásenie. ID firmy jedného vlastníka nesmie sprístupniť jej obsah druhému. Ak skúšaš pripojenie iba s `catalog:read`, firemné nástroje nesmú byť dostupné.

Pri skúške odpojenia v Shapeviz otvor `/admin/connections`, odpoj **Shapeviz Desktop** a potom v aplikácii vyžiadaj **nové volanie nástroja**. Musí vyžadovať nové prihlásenie; samotná odpoveď zo starej konverzácie nie je dôkazom platného prístupu. Rovnakú hranicu má odhlásenie zdrojovej Shapeviz relácie. Produkčný test už overil tieto hranice na dočasných testovacích účtoch; tvoje nové pripojenie zostalo aktívne.

Prístup trvá najviac hodinu a môže skončiť skôr spolu so zdrojovou reláciou. Automatické predlžovanie zatiaľ nie je implementované. Táto etapa neposiela požiadavky na platené AI API; spája existujúce čítacie nástroje s tvojím ChatGPT.
