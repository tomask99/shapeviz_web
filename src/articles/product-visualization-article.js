// Seed only. Published content remains editable in the article admin.
const text = value => ({type:'text',text:value});
const p = (...parts) => ({type:'paragraph',content:parts.map(part=>typeof part==='string'?text(part):part)});
const h = title => ({type:'heading',attrs:{level:2},content:[text(title)]});
const h3 = title => ({type:'heading',attrs:{level:3},content:[text(title)]});
const link = (label,href) => ({...text(label),marks:[{type:'link',attrs:{href}}]});
const list = (...items) => ({type:'bulletList',content:items.map(item=>({type:'listItem',content:[p(item)]}))});
const image = (name,alt,title,width,height) => ({type:'image',attrs:{src:`/media/articles/${name}.webp`,alt,title,width,height}});
export const productVisualizationArticle = {
  language:'sk',
  slug:'3d-vizualizacia-produktu-vs-produktova-fotografia',
  title:'3D vizualizácia produktu vs. produktová fotografia: čo sa oplatí pre vašu značku?',
  excerpt:'Nový produkt, viac farebných variantov alebo celá kolekcia nábytku? Pozrite sa, kedy dáva zmysel produktová fotografia, kedy 3D vizualizácia a čo si pripraviť pred zadaním výroby vizuálov.',
  seo_title:'3D vizualizácia produktu vs. fotografia | Shapeviz',
  seo_description:'Kedy zvoliť 3D vizualizáciu produktu a kedy fotografiu? Praktické porovnanie nákladov, variantov a prípravy vizuálov pre e-shop či kampaň.',
  status:'published',
  cover:{src:'/media/articles/product-lifestyle.webp',alt:'3D vizualizácia terakotovej modulárnej sedačky v presvetlenom interiéri',title:'Milenium — ukážka produktovej vizualizácie z portfólia Shapeviz.',width:1440,height:960},
  content:{type:'doc',content:[
    p('Predstavte si, že uvádzate novú kolekciu sedačiek. Potrebujete čisté obrázky do e-shopu, hlavný vizuál do kampane a niekoľko záberov v interiéri. Časť poťahov je ešte vo výrobe a marketing už pripravuje spustenie. Máte čakať na hotové kusy, organizovať fotenie alebo začať s 3D vizualizáciami?'),
    p('Rozhodnutie závisí od toho, čo už máte k dispozícii a koľko rôznych výstupov potrebujete. Pre jeden hotový produkt môže byť fotografia najpriamejšou cestou. Pri kolekcii s množstvom variantov alebo pri návrhu pred výrobou môže mať väčší zmysel 3D. Tu je spôsob, ako tieto možnosti porovnať pre vlastný projekt.'),
    h('Čím sa produktová fotografia a 3D vizualizácia líšia?'),
    p('Pri produktovej fotografii pracujete s fyzickým predmetom, reálnym svetlom a fotoaparátom. Výsledok ovplyvní príprava produktu, prostredie, osvetlenie, kompozícia aj následná retuš.'),
    p('Pri 3D vizualizácii vzniká obraz z digitálneho modelu. Jeho povrchy, osvetlenie a kamera sa nastavujú vo virtuálnej scéne a výsledný obrázok sa vyrenderuje. Práve takto opisujú virtuálnu fotografiu aj ',link('Adobe','https://www.adobe.com/products/substance3d/discover/virtual-photography.html'),' a ',link('Autodesk','https://www.autodesk.com/solutions/3d-commerce'),'. Model možno použiť pre viac pohľadov a rôzne spôsoby prezentácie.'),
    p('V oboch prípadoch potrebujete presné podklady a vizuálny zámer. Fotografia nemusí automaticky vystihnúť správnu farbu látky a 3D render nebude presný, ak má model nesprávne proporcie. Rozhodujúca je kontrola produktu aj výsledného obrazu.'),
    h('Kedy zvoliť produktovú fotografiu'),
    p('Fotografiu zvážte najmä vtedy, keď máte hotový výrobok a jeho skutočný povrch či používanie sú dôležitou súčasťou prezentácie. Pri jedinečnom ručne vyrábanom kuse potrebujete ukázať konkrétnu kresbu dreva alebo nepravidelnosť glazúry. Ak by sa mali tieto detaily presne modelovať, príprava 3D môže byť zbytočne náročná.'),
    list('Potrebujete niekoľko záberov jedného dostupného produktu a neočakávate veľa ďalších variantov.','Chcete zachytiť konkrétny kus, prirodzenú interakciu človeka s výrobkom alebo skutočné miesto používania.','Máte pripravené vzorky, priestor a produkciu; fotenie sa dá zorganizovať v požadovanom termíne.'),
    p('Do plánu zahrňte dopravu, čistenie a prípravu výrobkov, rekvizity, prípadné modely a retuš. Pri veľkom nábytku môže logistika ovplyvniť projekt rovnako ako samotný deň fotenia. Pri malom predmete v jednoduchom štúdiu môže byť naopak veľmi nenáročná.'),
    h('Kedy dávajú zmysel 3D vizualizácie produktov'),
    h3('Produkt ešte nie je vyrobený'),
    p('Ak máte schválený návrh, rozmery a materiálové podklady, vizuály sa dajú pripravovať pred dokončením fyzického produktu. To je užitočné pri plánovaní katalógu, prezentácii kolekcie alebo príprave kampane. Pred zverejnením treba skontrolovať, že obrázky zodpovedajú finálnemu výrobku. Ak ide o koncept, pomenujte ho ako koncept.'),
    h3('Potrebujete viac farieb, materiálov a pohľadov'),
    p('Predstavme si kreslo so šiestimi poťahmi a dvoma druhmi podnože. Najprv treba kvalitne pripraviť geometriu, materiály a osvetlenie. Potom možno vytvárať ďalšie kombinácie v rovnakej scéne. Zmena nie je vždy otázkou jedného kliknutia: napríklad zamat reaguje na svetlo inak než hladká koža a potrebuje vlastné nastavenie aj kontrolu.'),
    h3('Chcete jednotnú prezentáciu kolekcie'),
    p('Uložená kamera a svetlo pomáhajú držať rovnaký štýl medzi produktmi. Pre e-shop sa dá pripraviť čistý štúdiový pohľad, pre kampaň interiér s konkrétnou atmosférou. Pri ďalšom použití treba rátať s úpravou kompozície, materiálov či rozlíšenia podľa zadania.'),
    image('product-studio','Terakotová rohová sedačka na neutrálnom pozadí v produktovom 3D renderi','Štúdiový produktový render z portfólia Shapeviz. Neutrálne pozadie necháva vyniknúť tvar a členenie sedačky.',1600,1195),
    h('Čo rozhoduje o cene a čase výroby'),
    p('Bez konkrétneho zadania nie je poctivé tvrdiť, že 3D je vždy lacnejšie alebo rýchlejšie. Porovnávajte rovnaký rozsah: počet produktov, pohľadov a variantov, kvalitu detailov, finálne rozlíšenie, kolá úprav a spôsob použitia.'),
    p('Pri fotografii si nechajte naceniť prípravu, štúdio alebo lokalitu, dopravu, samotné fotenie a postprodukciu. Pri 3D oddeľte vytvorenie či úpravu modelu, materiály, prípravu scény, jednotlivé rendery a postprodukciu. Tak uvidíte, kde vzniká počiatočný náklad a koľko stoja ďalšie výstupy.'),
    p('Existujúci CAD model môže pomôcť, ale nemusí byť pripravený na detailný marketingový render. Môže vyžadovať čistenie geometrie, doplnenie švov, mäkkých hrán alebo materiálov. Naopak pri ďalšej kampani môže byť už schválený model užitočným základom. Dohodnite si preto aj podmienky jeho archivácie a opätovného použitia.'),
    {type:'blockquote',content:[p('Pýtajte si cenu za konkrétnu sériu výstupov. Samotná cena „za jeden obrázok“ nemusí zahŕňať prípravu produktu, modelovanie ani neskoršie úpravy.')]},
    h('Príklad zadania: sedačka pre e-shop a kampaň'),
    p('Pri sedačke by sme zadanie rozdelili podľa toho, čo má zákazník z obrázka pochopiť. Hlavný produktový záber ukáže proporcie a zostavu. Detail priblíži štruktúru poťahu a spracovanie. Interiérový vizuál pomôže predstaviť si výrobok v priestore. Každý záber má iný účel, preto nestačí iba trikrát zmeniť uhol kamery.'),
    image('product-detail','Detail zeleného čalúneného kresla s viditeľnou štruktúrou látky a zaoblenou hranou','Detail materiálu z portfólia Shapeviz. Pri blízkych záberoch záleží na mierke textúry, tvare hrán a reakcii povrchu na svetlo.',1197,1600),
    p('Na ukážkach vidíte rozdielne typy vizuálov z nášho portfólia: interiér, štúdiový render a detail materiálu. Slúžia ako príklad využitia obrázkov, nie ako porovnanie ceny fotenia a 3D pri rovnakom zadaní.'),
    h('Fotografiu a 3D môžete kombinovať'),
    p('Nemusíte vybrať jednu metódu pre celú značku. Fotografia môže zachytiť ľudí, remeselný proces alebo reálny showroom. 3D môže doplniť varianty produktov, štúdiové pohľady či prostredie pre kampaň. Aby spolu výstupy fungovali, dohodnite spoločný smer: svetlo, farebnosť, perspektívu a spôsob práce s detailom.'),
    h('Čo pripraviť pred oslovením 3D štúdia'),
    list('Účel obrázkov: e-shop, katalóg, webový banner, sociálna kampaň alebo veľkoformátová tlač.','Zoznam produktov, variantov a požadovaných záberov. Oddeľte nevyhnutné výstupy od voliteľných.','Rozmery, výkresy, fotografie zo všetkých dostupných strán a existujúce 3D alebo CAD súbory.','Materiálové referencie: vzorky alebo detailné fotografie látky, dreva, kovu a povrchovej úpravy.','Vizuálne referencie, pravidlá značky, formáty, rozlíšenie a priestor pre text v reklamných obrázkoch.','Termín, rozpočtový rámec a človeka, ktorý bude schvaľovať tvar, materiály a finálne náhľady.'),
    p('Ak podklady nemáte kompletné, pošlite to, čo je dostupné. Už na začiatku sa dá určiť, čo treba doplniť a ktoré rozhodnutia ovplyvnia rozsah práce. Pri modeli vytvorenom podľa fotografií sú rozmery obzvlášť dôležité.'),
    h('Ako sa rozhodnúť pre svoj produkt'),
    p('Pri jednom hotovom výrobku a niekoľkých jednoduchých záberoch začnite preverovaním možností fotenia. Pri nevyrábanom návrhu, množstve variantov alebo opakovaných kampaniach zvážte 3D vizualizáciu. Ak potrebujete oboje, rozdeľte výstupy podľa toho, kde má každá metóda najväčší prínos.'),
    p('Najlepší ďalší krok je krátke zadanie a porovnateľná cenová ponuka. Výber má vychádzať z vašich produktov a plánovaných obrázkov, nie z univerzálneho tvrdenia, že jedna technológia nahradí všetko.'),
    h('Ukážte svoj produkt so Shapeviz'),
    p('V Shapeviz pripravujeme 3D modely, produktové rendery aj vizualizácie v interiéri. Pošlite nám produkt, dostupné podklady a zoznam obrázkov, ktoré potrebujete. Spoločne určíme rozsah modelovania, vizuálny smer a výstupy pre vašu prezentáciu.'),
    p(link('Pozrieť produktové a interiérové vizualizácie','/sk/sluzby/produktove-interierove-vizualizacie')),
    p(link('Napíšte nám o svojom projekte','/sk#contact')),
  ]}
};
