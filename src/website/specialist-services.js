const media = (folder, name, width, height) => ({
  src: `/media/${folder}/${name}-1920.webp`,
  small: `/media/${folder}/${name}-720.webp`,
  smallWidth: 720,
  width,
  height,
});
const furniture = media('modeling', 'model-4', 1809, 964);
const furnitureMesh = media('modeling', 'model-5', 1770, 1006);
const living = media('visualization', 'living-room', 1920, 2133);
const kitchen = media('visualization', 'kitchen-interior', 1920, 2133);
const elixir = media('visualization', 'hevi-elixir', 1400, 2000);
const magnesium = media('visualization', 'hevi-magnesium', 1400, 2000);
const bedroom = media('modeling', 'bed-interior', 1920, 2133);

const photo = (image, caption) => ({image, caption, alt:caption});

export const specialistServices = [
  {
    id:'furniture-modeling', parent:'modeling', image:furniture,
    sk:{
      slug:'3d-modelovanie-nabytku', name:'3D modelovanie nábytku',
      title:'3D modelovanie nábytku na mieru | SHAPEVIZ',
      description:'3D modely nábytku podľa rozmerov, fotografií a výkresov. Modelujem sedačky, postele, čalúnenie aj kuchynské zostavy pre výrobcov a dizajnérov.',
      intro:'Modelujem sedačky, postele a kuchynské zostavy pre výrobcov nábytku, interiérové štúdiá a dodávateľov 3D vizualizácií. Podľa fotografií, výkresov a rozmerov vytvorím 3D model v skutočnej mierke, ktorý môžete použiť v katalógu, interiérovej scéne alebo animácii.',
      imageAlt:'Neotextúrovaný 3D model čalúnenej sedačky s tromi sedákmi a prešívaným operadlom',
      caption:'3D model sedačky s gombíkovým prešívaním',
      scopeTitle:'3D modely pre výrobcov a interiérové štúdiá',
      deliverables:[
        ['Čalúnený nábytok','Pri sedačkách a posteliach modelujem tvar výplne, napätie látky, švy aj prešívanie. Rozsah detailov dohodneme podľa toho, ako blízko bude kamera.'],
        ['Kuchyne a skriňové zostavy','Pri skrinkách a pracovných doskách vychádzam z rozmerov a členenia zostavy. Úchytky, spotrebiče a kovania pripravím v rozsahu potrebnom pre záber.'],
        ['Model pripravený na ďalšie použitie','Geometriu, UV mapovanie, materiály a formát odovzdania nastavím podľa vášho softvéru a toho, či model pôjde do vizualizácie, katalógu alebo animácie.'],
      ],
      stories:[{id:'topologia-calunenia',label:'Ukážka 3D modelu',title:'Topológia čalúnenia v detaile',text:'Drôtený náhľad ukazuje, ako sieť kopíruje prešívané čalúnenie. Tvar záhybov je súčasťou samotnej geometrie a ostáva čitateľný pri zmene svetla aj pri záberoch zblízka.',layout:'wide',figures:[photo(furnitureMesh,'Drôtený 3D model gombíkového prešívania a záhybov látky')]}],
      process:[
        ['Referencie a rozmery','Z fotografií a výkresov určím tvar, mierku, členenie dielov a potrebnú úroveň detailu.'],
        ['Náhľad geometrie','Pred prípravou finálnych materiálov odsúhlasíme proporcie, švy a dôležité výrobné detaily.'],
        ['Odovzdanie modelu','Model a dohodnuté textúry pripravím pre váš softvér. Podľa zadania nadviažem produktovými rendermi.'],
      ],
      brief:'Pošlite rozmery nábytku, fotografie spredu, zboku a zozadu, prípadne technický výkres alebo 3D sken. Uveďte, koľko variantov potrebujete, či chcete aj textúry a v akom softvéri budete model používať.',
      questions:[
        ['Je možné vytvoriť model sedačky z fotografií?','Áno. Fotografie z viacerých uhlov a aspoň základné rozmery pomôžu zachovať mierku aj proporcie. Detailné fotky látky, švov a nôh spresnia materiály a geometriu.'],
        ['Dá sa z jedného modelu pripraviť viac variantov?','Áno. Zmeny látky alebo farby sa dajú pripraviť na spoločnej geometrii. Odlišný tvar, modul či rozmer môže vyžadovať úpravu modelu.'],
      ],
    },
    en:{
      slug:'furniture-3d-modeling', name:'Furniture 3D modeling',
      title:'Custom 3D Furniture Modeling | SHAPEVIZ',
      description:'Custom 3D furniture models from photographs, measurements and drawings. Sofas, beds, upholstery and kitchen units for manufacturers and design studios.',
      intro:'I create true-scale 3D models of sofas, beds and fitted cabinetry for furniture makers, interior studios and visualization teams. I work from drawings, photographs and measurements so the asset can move into a catalogue, an interior scene or an animation.',
      imageAlt:'Untextured 3D model of a three-seat sofa with button-tufted upholstery',
      caption:'Upholstered sofa / shaded 3D model',
      scopeTitle:'Furniture assets for production workflows',
      deliverables:[
        ['Upholstered furniture','I model cushion volume, fabric tension, seams and button tufting. The closest planned camera views help determine how much surface detail to build.'],
        ['Fitted furniture and cabinetry','I follow the measured layout for cabinets, worktops and built-ins. Handles, fittings and appliances are detailed to suit the planned views.'],
        ['Geometry and material handoff','I agree on the target software and intended use before preparing the mesh, UVs, textures and file format.'],
      ],
      stories:[{id:'upholstery-topology',label:'Modeling example',title:'How the mesh follows upholstery',text:'The wireframe shows geometry around the buttons and folds. Building those forms into the mesh preserves their shape across different lighting setups and close-up camera angles.',layout:'wide',figures:[photo(furnitureMesh,'Wireframe detail of button tufting and upholstery folds')]}],
      process:[['Reference review','I check the dimensions, photographs and required product variants.'],['Geometry preview','We review proportions and construction details before final material work.'],['Handoff','I package the model and agreed textures for your target workflow.']],
      brief:'Send dimensioned drawings or measured photographs from several angles. Include close-ups of seams and materials, the number of variants and the software you plan to use.',
      questions:[
        ['Can you model a sofa from photos?','Yes. Measured dimensions and views from several angles help preserve scale. Close-ups make seams, fabric and hardware easier to reproduce.'],
        ['Can one model support several finishes?','Yes. Fabric and colour variants can share the base geometry. A new module, size or silhouette may need geometry changes.'],
      ],
    },
  },
  {
    id:'interior-rendering', parent:'visualization', image:living,
    sk:{
      slug:'3d-vizualizacie-interierov', name:'3D vizualizácie interiérov',
      title:'3D vizualizácie interiérov a rendering | SHAPEVIZ',
      description:'Fotorealistické 3D vizualizácie interiérov podľa pôdorysu alebo 3D modelu. Rendery bytov, kuchýň a obytných priestorov pre dizajnérov a developerov.',
      intro:'Pripravujem fotorealistické 3D vizualizácie interiérov pre dizajnérov, architektov a developerov. Z pôdorysu alebo existujúceho 3D modelu vytvorím zábery, ktoré ukážu dispozíciu, materiály, nábytok a svetlo ešte pred realizáciou.',
      imageAlt:'3D vizualizácia obývačky so svetlou modulárnou sedačkou a kuchyňou v pozadí',
      caption:'Milenium / vizualizácia obývacej časti',
      scopeTitle:'Interiérový rendering pre návrh a prezentáciu',
      deliverables:[
        ['Celkové pohľady','Kamery vyberiem podľa toho, čo má klient pochopiť. Pri otvorenom priestore zachytia spojenie obývačky, jedálne a kuchyne.'],
        ['Materiály a osvetlenie','Podlahy, textílie a povrchy pripravím podľa vzoriek alebo referencií. Denné a umelé osvetlenie môžu ukázať, ako sa atmosféra mení počas dňa.'],
        ['Detaily a varianty','Pripravím bližšie zábery nábytku alebo materiálu a dohodnuté varianty povrchov. Formát prispôsobím prezentácii, webu alebo tlači.'],
      ],
      stories:[{id:'kuchyna-milenium',label:'Milenium',title:'Obývačka a kuchyňa v jednej scéne',text:'Oba pohľady používajú rovnaké materiály a osvetlenie. V kuchynskom zábere preberá hlavnú úlohu kamenný ostrovček a vidno, ako kuchyňa nadväzuje na jedáleň.',layout:'wide',figures:[photo(kitchen,'Interiérová vizualizácia kuchyne s kamenným ostrovčekom a priľahlou jedálňou')]}],
      process:[['Podklady a zábery','Prejdeme pôdorys, výšky, materiály a pohľady, ktoré má projekt ukázať.'],['Náhľad priestoru','Pripravím scénu a pracovné rendery na odsúhlasenie kamery, zariadenia a osvetlenia.'],['Finálne rendery','Po zapracovaní spätnej väzby vyrenderujem schválené zábery v dohodnutom rozlíšení.']],
      brief:'Priložte pôdorys s rozmermi, výšku miestnosti, pohľady alebo existujúci 3D model. Pomôžu vzorky materiálov, referencie vybavenia a zoznam požadovaných záberov.',
      questions:[
        ['Dá sa spraviť vizualizácia podľa pôdorysu?','Áno. Na presnú geometriu potrebujem rozmery a výšky. Ak už existuje návrh zariadenia, priložte ho spolu s referenciami materiálov.'],
        ['Čo ovplyvní cenu interiérového renderingu?','Najmä stav podkladov, počet miestností a pohľadov, množstvo nábytku na mieru a počet materiálových či svetelných variantov.'],
      ],
    },
    en:{
      slug:'interior-3d-rendering', name:'Interior 3D rendering',
      title:'Photorealistic Interior 3D Rendering | SHAPEVIZ',
      description:'Photorealistic interior renders from floor plans or existing models. Furnished rooms, kitchens and material details for designers, architects and developers.',
      intro:'I create interior renders from floor plans or existing models for designers, architects and developers. Cameras, materials and lighting show how a room will look before construction, from the relationship between spaces to the details of a finish.',
      imageAlt:'Living room CGI with a pale modular sofa, stone table and adjoining kitchen',
      caption:'Milenium / living-room visualization',
      scopeTitle:'Interior renders for presentation and design review',
      deliverables:[
        ['Rooms and connected spaces','I plan views around the layout and the details the audience needs to understand, such as the transition between a kitchen, dining room and living area.'],
        ['Materials and lighting','I use finish references to develop surfaces and agree on an appropriate daylight or artificial lighting setup.'],
        ['Detail views and alternatives','The same scene supports closer views and agreed alternatives for materials or lighting. I prepare output dimensions for the intended presentation or publication.'],
      ],
      stories:[{id:'milenium-kitchen',label:'Milenium',title:'Two views of the same interior',text:'The living room and kitchen share a single lighting and material setup. A second camera gives the stone kitchen island and dining area the visual emphasis.',layout:'wide',figures:[photo(kitchen,'Kitchen render with a stone island, stools and an adjoining dining space')]}],
      process:[['Plans and cameras','We agree on which spaces and features to show.'],['Draft renders','I share working images to review layout, lighting, materials and composition.'],['Final images','I render the approved views and deliver them at the agreed sizes.']],
      brief:'Send a dimensioned plan, ceiling heights and elevations or an existing 3D scene. Include furniture references, finishes, the required views and how the images will be used.',
      questions:[
        ['Can you build a scene from a floor plan?','Yes. Measurements, heights and furniture or finish references help establish the interior accurately.'],
        ['What drives the cost of interior rendering?','The condition of the source material, room count, camera count, custom furniture and lighting or finish variations determine the production scope.'],
      ],
    },
  },
  {
    id:'product-rendering', parent:'visualization', image:elixir,
    sk:{
      slug:'produktove-3d-vizualizacie', name:'Produktové 3D vizualizácie',
      title:'Produktové 3D vizualizácie a CGI rendery | SHAPEVIZ',
      description:'Produktový rendering pre e-shopy, katalógy a reklamu. Štúdiové CGI packshoty, detaily materiálov a vizualizácie farebných variantov produktu.',
      intro:'Vytváram fotorealistické produktové rendery pre e-shopy, katalógy a reklamné kampane. Podľa dodaného modelu alebo fotografií s rozmermi pripravím štúdiové packshoty, detaily produktu aj zábery vo vlastnej CGI scéne.',
      imageAlt:'CGI vizualizácia zeleného balenia Hevi Natural Sleep Elixir v machovej scéne',
      caption:'Hevi / Natural Sleep Elixir v CGI scéne',
      scopeTitle:'Rendery od packshotu po kampaň',
      deliverables:[
        ['Packshoty pre e-shop','Produkt nasvietim na čistom pozadí a pripravím dohodnuté uhly a orez. Zjednotená kamera a svetlo pomáhajú, aby produktový rad pôsobil konzistentne.'],
        ['Detaily a materiálové varianty','Detailné zábery ukážu textúru, povrch alebo dôležité prvky balenia. Z pripraveného modelu môžu vzniknúť rendery s rôznymi farbami a etiketami.'],
        ['CGI záber do kampane','Pre banner, reklamu alebo prvý obrázok produktovej stránky navrhnem scénu s rekvizitami, nasvietením a kompozíciou podľa značky a formátu.'],
      ],
      stories:[{id:'hevi-produktova-kampan',label:'Hevi / produktové CGI',title:'Dva produkty s vlastným vizuálnym svetom',text:'Pre Natural Sleep Elixir som použil mach, rastliny a zelené tóny. Deep Sleep Magnesium+ má svetlú skalnatú scénu, v ktorej vynikne fialové balenie. Oba zábery prepája kompozícia s levitujúcou dózou, viečkom a kapsulami.',layout:'wide',figures:[photo(magnesium,'Produktový render Hevi Deep Sleep Magnesium+ medzi svetlými skalami')]}],
      process:[['Podklady k produktu','Skontrolujem model alebo rozmery, materiály a grafiku etikety.'],['Náhľad kompozície','Pripravím pracovný záber na schválenie kamery, materiálov a svetla.'],['Katalógové a reklamné formáty','Vyrenderujem odsúhlasené pohľady a varianty v pomeroch strán potrebných pre jednotlivé použitia.']],
      brief:'Pošlite model alebo fotografie s rozmermi, grafiku etikety a referencie materiálov. Uveďte počet produktov, variantov, záberov a kde sa budú používať.',
      questions:[
        ['Viete vyrobiť CGI aj pred spustením výroby?','Ak sú k dispozícii výkresy, rozmery, finálne materiálové referencie a dáta obalu, môžem pripraviť vizualizáciu ešte pred dostupnosťou fyzickej vzorky.'],
        ['Dajú sa odovzdať rendery s priehľadným pozadím?','Áno, pri štúdiových záberoch to môžeme zahrnúť do zadania. Vopred dohodneme formát, rozlíšenie a prípadný tieň.'],
      ],
    },
    en:{
      slug:'product-3d-rendering', name:'Product 3D rendering',
      title:'Product 3D Rendering and CGI Packshots | SHAPEVIZ',
      description:'Photorealistic CGI product renders for e-commerce, catalogues and advertising. Studio packshots, detail views and product variants from a shared 3D asset.',
      intro:'I create CGI product imagery for e-commerce, catalogues and campaigns. From a supplied model or measured photographs, I build studio packshots, close-ups and custom campaign sets with lighting and framing suited to the intended placement.',
      imageAlt:'CGI render of a Hevi Natural Sleep Elixir jar and capsules in a moss-covered set',
      caption:'Hevi / Natural Sleep Elixir campaign render',
      scopeTitle:'Product imagery for listings and campaigns',
      deliverables:[
        ['Studio packshots','Set up repeatable camera angles and lighting across a product range for images on plain or transparent backgrounds.'],
        ['Material and packaging variants','Reuse approved geometry to show different colours, finishes or labels and create detail crops for important features.'],
        ['Campaign sets','Build a scene around the product using props, surfaces and lighting tailored to its brand and intended format.'],
      ],
      stories:[{id:'hevi-product-campaign',label:'Hevi / product CGI',title:'A consistent concept across two product sets',text:'Natural Sleep Elixir uses moss and green tones. Deep Sleep Magnesium+ uses pale rocks to frame its purple packaging. The floating jar, lid and capsules connect the two compositions.',layout:'wide',figures:[photo(magnesium,'Hevi Deep Sleep Magnesium+ product render framed by pale rocks')]}],
      process:[['Product references','I check the model, finishes and packaging artwork.'],['Composition preview','We review the product look, lighting and camera position before rendering.'],['Final delivery','I export the approved versions for product pages, catalogues and campaign formats.']],
      brief:'Share product dimensions or a 3D model, packaging artwork, finish references, shot count and required formats. Include the channels where the imagery will appear.',
      questions:[
        ['Can you render a product before it is manufactured?','Yes, when reliable dimensions, drawings, finish references and packaging artwork are available.'],
        ['Can the final image use a transparent background?','Yes, for suitable studio views. Let me know the intended layout so we can agree on the format, dimensions and shadows.'],
      ],
    },
  },
  {
    id:'virtual-staging', parent:'visualization', image:bedroom,
    sk:{
      slug:'virtualny-home-staging', name:'Virtuálny home staging interiérov',
      title:'Virtuálny home staging pre nehnuteľnosti | SHAPEVIZ',
      description:'Digitálne zariadenie prázdnych interiérov pre realitné inzeráty a prezentácie nehnuteľností. Nábytok, dekorácie a kompozícia podľa fotiek a rozmerov.',
      intro:'Virtuálny home staging ukáže, ako môže pôsobiť prázdny byt po zariadení. Podľa fotografie a rozmerov digitálne doplním nábytok, textílie a dekorácie pre realitný inzerát, prezentáciu developera alebo porovnanie štýlov.',
      imageAlt:'Vizualizácia zariadenej spálne s čalúnenou posteľou, lavicou a textíliami',
      caption:'Zariadená CGI spálňa / ukážka kompozície a materiálov',
      scopeTitle:'Digitálne zariadenie pre realitnú prezentáciu',
      deliverables:[
        ['Prázdna miestnosť','Pre konkrétnu fotografiu navrhnem zariadenie v mierke. Pri kompozícii zachovám výhľad, okná a stavebné prvky priestoru.'],
        ['Štýl podľa cieľového kupujúceho','Nábytok a farby vyberiem podľa typu nehnuteľnosti a referencií. Ak potrebujete porovnať dva štýly, obidva pripravím pre rovnaký pohľad.'],
        ['Séria záberov do inzerátu','Pri viacerých pohľadoch zosúladím umiestnenie nábytku, perspektívu a charakter svetla. Výstupy pripravím tak, aby sa dali zverejniť s označením virtuálneho zariadenia.'],
      ],
      stories:[{id:'zariadenie-a-kompozicia',label:'Ukážka zariadeného priestoru',title:'Mierka nábytku a priechodnosť',text:'Táto kompletne renderovaná scéna ilustruje výber nábytku, zladenie materiálov a kompozíciu kamery. Pri stagingu z fotografie používam rovnaké princípy a rešpektujem perspektívu pôvodného záberu.',layout:'wide',figures:[photo(living,'Kompletne renderovaná obývacia časť so sedačkou, stolíkom a priechodom do kuchyne')]}],
      process:[['Fotografie a rozmery','Posúdim rozlíšenie, uhol a svetlo fotografií a dohodneme vhodné zábery.'],['Návrh zariadenia','Vopred zladíme štýl, funkciu miestnosti a umiestnenie hlavných kusov nábytku.'],['Hotové obrázky','Pripravím dohodnuté formáty na zverejnenie a odovzdám ich s informáciou o virtuálnom zariadení.']],
      brief:'Pošlite originálne fotografie prázdneho priestoru, pôdorys alebo základné rozmery, počet pohľadov a referencie štýlu. Pri viacerých miestnostiach uveďte, ktoré majú mať pri prezentácii prednosť.',
      questions:[
        ['V čom sa staging líši od 3D vizualizácie interiéru?','Staging zariadi konkrétny záber existujúceho priestoru. Interiérový rendering vychádza z pôdorysu alebo modelu a umožňuje vytvoriť aj nové pohľady.'],
        ['Aká fotografia sa hodí na staging?','Najlepšie funguje ostrá fotografia v plnom rozlíšení, z ktorej je zrejmý tvar miestnosti a smer svetla. Rozmery pomôžu zvoliť nábytok v správnej mierke.'],
      ],
    },
    en:{
      slug:'virtual-home-staging', name:'Virtual home staging',
      title:'Virtual Home Staging for Property Listings | SHAPEVIZ',
      description:'Digital furnishing for empty rooms in real estate listings and property presentations. Furniture and styling matched to photographs and room measurements.',
      intro:'Virtual home staging shows how an empty property could look when furnished. I work from room photographs and measurements to place furniture, textiles and accessories for property listings and development presentations.',
      imageAlt:'Furnished bedroom CGI showing an upholstered bed, bench and natural lighting',
      caption:'Furnished CGI bedroom / styling and material example',
      scopeTitle:'Digital furnishing for property marketing',
      deliverables:[
        ['Furnish an empty room','I match furniture to the measured room and the camera perspective while preserving the visible architecture and permanent features.'],
        ['Explore a style','I choose furniture and textiles based on the type of property and the visual references. If useful, we can agree on two options for the same image.'],
        ['Coherent listing images','For multiple views I keep furnishings consistent and match the lighting and perspective. I prepare the output for publication with a virtual staging label.'],
      ],
      stories:[{id:'styling-and-layout',label:'Furnished interior example',title:'Space for furniture and circulation',text:'This fully rendered room illustrates furniture placement, finish choices and camera composition. When staging a photograph, I apply the same principles within the dimensions and viewpoint of the existing room.',layout:'wide',figures:[photo(living,'Rendered living area with sofa, coffee table and open circulation towards the kitchen')]}],
      process:[['Photo review','I check source images, dimensions and which viewpoints work for the listing.'],['Furnishing proposal','We agree on the room function, style and placement of the main pieces.'],['Finished images','I deliver the agreed versions and identify the views that have been digitally staged.']],
      brief:'Send full-resolution photographs, a plan or basic room dimensions, the number of images and examples of the style you want. Identify the rooms that matter most to the listing.',
      questions:[
        ['How does staging differ from interior rendering?','Staging adds furnishings to an existing viewpoint. A full interior render starts from plans or a 3D model and can show new camera angles.'],
        ['What makes a good source photograph?','A sharp, original-size photo with readable room geometry and light works best. Basic room dimensions help keep furniture in scale.'],
      ],
    },
  },
];
