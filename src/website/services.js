// One source for public routes, visible service copy, sitemap and structured data.
export const services = [
  {
    id: 'modeling',
    image: {src: '/media/gallery/studio_01-1920.webp', small: '/media/gallery/studio_01-640.webp', width: 1920, height: 1434},
    en: {
      slug: '3d-modeling', name: 'High-end 3D modeling', title: 'High-end 3D Modeling for Products & Furniture | SHAPEVIZ',
      description: 'Detailed 3D models for products, furniture and CGI campaigns. I create geometry, materials and textures for close-up renders and animation.',
      intro: 'A convincing image starts with a well-built model. I create detailed 3D products and furniture with attention to proportions, surface transitions and the small details that become visible in a close-up.',
      imageAlt: 'Terracotta modular sofa modeled and visualized against a neutral studio background',
      caption: 'Milenium / furniture visualization',
      deliverables: [
        ['Product and furniture models', 'Geometry built around the intended use: a hero product render, a furniture collection or an animated sequence. References and dimensions establish the shape before surface detail is added.'],
        ['Materials and textures', 'Fabric, wood, metal and other surfaces need to respond convincingly to light. I develop materials together with the model so that seams, edges and texture scale work in the final view.'],
        ['A model for your next visual', 'The agreed output may be rendered images, an animation-ready asset or a model for an existing production workflow. File format, software compatibility and the required level of detail are agreed before production.'],
      ],
      process: [['Reference and scale', 'I review drawings, measurements, photographs and the views you need.'], ['Shape and detail', 'Proportions and silhouette are reviewed before I refine geometry and materials.'], ['Output preparation', 'I prepare the model or renders for the agreed use and delivery format.']],
      brief: 'Send product photographs from several angles, dimensions or drawings, material references and examples of the intended visual style. Tell me whether you need finished images, animation or the 3D asset itself.',
      questions: [
        ['Can you work from photographs?', 'Yes. Photographs are useful references for shape and surface detail. Dimensions or drawings help establish accurate proportions; I review the available references before defining the modeling scope.'],
        ['Does a 3D model include finished renders?', 'Modeling and visualization are separate parts of production. Tell me which views or animations you need so the proposal can include the right materials, lighting and rendering work.'],
      ],
    },
    sk: {
      slug: '3d-modelovanie', name: 'High-end 3D modelovanie', title: 'High-end 3D modelovanie produktov a nábytku | SHAPEVIZ',
      description: 'Detailné 3D modely produktov a nábytku pre vizualizácie a CGI kampane. Tvorím geometriu, materiály a textúry pre detailné rendery aj animácie.',
      intro: 'Presvedčivý obraz sa začína kvalitným modelom. Tvorím detailné 3D modely produktov a nábytku s dôrazom na proporcie, prechody povrchov a drobnosti, ktoré vyniknú pri pohľade zblízka.',
      imageAlt: 'Terakotová modulárna sedačka vymodelovaná a vizualizovaná na neutrálnom štúdiovom pozadí',
      caption: 'Milenium / vizualizácia nábytku',
      deliverables: [
        ['Modely produktov a nábytku', 'Geometriu prispôsobujem použitiu: hlavnému produktovému renderu, kolekcii nábytku alebo animovanej sekvencii. Referencie a rozmery určia tvar ešte pred pridaním detailov povrchu.'],
        ['Materiály a textúry', 'Látka, drevo, kov aj ďalšie povrchy musia presvedčivo reagovať na svetlo. Materiály pripravujem spolu s modelom, aby švy, hrany a mierka textúr fungovali vo výslednom zábere.'],
        ['Model pre váš ďalší vizuál', 'Dohodnutým výstupom môžu byť rendery, model pripravený na animáciu alebo podklad do existujúcej produkcie. Formát súborov, kompatibilitu so softvérom a úroveň detailov dohodnem pred začatím práce.'],
      ],
      process: [['Referencie a mierka', 'Prejdem výkresy, rozmery, fotografie a pohľady, ktoré potrebujete.'], ['Tvar a detaily', 'Pred spracovaním detailov geometrie a materiálov si s vami odsúhlasím proporcie a siluetu.'], ['Príprava výstupov', 'Model alebo rendery pripravím na dohodnuté použitie a vo zvolenom formáte.']],
      brief: 'Pošlite fotografie produktu z viacerých uhlov, rozmery alebo výkresy, materiálové referencie a ukážky želaného vizuálneho štýlu. Napíšte, či potrebujete hotové obrázky, animáciu alebo samotný 3D model.',
      questions: [
        ['Viete modelovať podľa fotografií?', 'Áno. Fotografie pomáhajú zachytiť tvar a povrchové detaily. Rozmery alebo výkresy spresnia proporcie; dostupné podklady posúdim pred určením rozsahu modelovania.'],
        ['Zahŕňa 3D model aj hotové rendery?', 'Modelovanie a vizualizácia sú samostatné časti produkcie. Napíšte mi, aké pohľady či animácie potrebujete, aby ponuka zahŕňala potrebnú prípravu materiálov, osvetlenia aj renderovanie.'],
      ],
    },
  },
  {
    id: 'visualization',
    image: {src: '/media/milenium-interior-1440.webp', small: '/media/milenium-interior-720.webp', smallWidth: 720, width: 1440, height: 960},
    en: {
      slug: 'product-interior-visualization', name: 'Product & interior visualization', title: 'Product & Interior Visualization | SHAPEVIZ',
      description: 'I create photorealistic product renders and interior visualizations for campaigns, e-commerce and design presentations, capturing the character of your product or space.',
      intro: 'I show your product in the right light and capture the atmosphere of a space before it exists. I combine 3D models, materials, lighting and composition to create images with a clear purpose.',
      imageAlt: 'Terracotta Milenium sofa in a sunlit interior with soft curtains and natural materials',
      caption: 'Milenium / product in an interior setting',
      deliverables: [
        ['Product renders', 'Clean studio views focus attention on shape, finish and detail. They can support a product launch, an e-commerce page or a catalogue with a consistent visual treatment across a collection.'],
        ['Interior and lifestyle scenes', 'Furniture and products gain context in a designed environment. I work with room layout, surrounding materials and natural or studio lighting to create the intended mood.'],
        ['Images for the right channel', 'A campaign hero, a website banner and a product detail image need different compositions. I plan camera views, crops and resolution around where the final images will appear.'],
      ],
      process: [['Visual direction', 'I agree on references, the audience and the purpose of each image.'], ['Scene and preview', 'I build the scene and review composition, lighting and materials in preview renders.'], ['Final images', 'After feedback, I render and finish the selected views in the agreed sizes.']],
      brief: 'Share existing 3D models if available, product dimensions, material samples or photographs, and examples of the mood you want. Include the number of views and where you will use them.',
      questions: [
        ['What if I do not have a 3D model?', 'I can include 3D modeling in the project. Photographs, dimensions and drawings help me define the work needed before building the visualization scene.'],
        ['Can one scene produce several views?', 'Yes. A prepared scene can support different camera angles, details or compositions. Agreeing on the required views early helps me build the scene for all planned outputs.'],
      ],
    },
    sk: {
      slug: 'produktove-interierove-vizualizacie', name: 'Produktové a interiérové vizualizácie', title: 'Produktové a interiérové vizualizácie | SHAPEVIZ',
      description: 'Fotorealistické produktové rendery a vizualizácie interiérov pre kampane, e-shopy a prezentácie návrhov. Tvorím CGI vizuály, ktoré vystihnú charakter vášho produktu či priestoru.',
      intro: 'Ukážem váš produkt v správnom svetle a vystihnem atmosféru priestoru, ktorý ešte neexistuje. Spájam 3D modely, materiály, osvetlenie a kompozíciu do obrazov s jasným účelom.',
      imageAlt: 'Terakotová sedačka Milenium v slnečnom interiéri s jemnými závesmi a prírodnými materiálmi',
      caption: 'Milenium / produkt zasadený do interiéru',
      deliverables: [
        ['Produktové rendery', 'Čisté štúdiové pohľady upriamia pozornosť na tvar, povrch a detail. Využijete ich pri uvedení produktu, v e-shope či katalógu s jednotným vizuálnym štýlom celej kolekcie.'],
        ['Interiérové a lifestyle scény', 'Nábytok a produkty získajú kontext v navrhnutom prostredí. Pracujem s dispozíciou, okolitými materiálmi a prirodzeným či štúdiovým svetlom tak, aby obraz vystihoval želanú náladu.'],
        ['Obrázky pre konkrétne použitie', 'Hlavný vizuál kampane, webový banner a produktový detail potrebujú odlišnú kompozíciu. Pohľady kamery, výrezy a rozlíšenie plánujem podľa toho, kde budú obrázky použité.'],
      ],
      process: [['Vizuálny smer', 'Dohodnem si s vami referencie, cieľovú skupinu a účel jednotlivých obrázkov.'], ['Scéna a náhľady', 'Pripravím scénu a na náhľadoch si overím kompozíciu, osvetlenie a materiály.'], ['Finálne obrázky', 'Po zapracovaní pripomienok vyrenderujem a dokončím vybrané pohľady v dohodnutých rozmeroch.']],
      brief: 'Pošlite existujúce 3D modely, ak ich máte, rozmery produktov, vzorky alebo fotografie materiálov a ukážky požadovanej atmosféry. Doplňte počet pohľadov a ich plánované použitie.',
      questions: [
        ['Čo ak nemám 3D model?', 'Do projektu môžem zahrnúť aj 3D modelovanie. Fotografie, rozmery a výkresy mi pomôžu určiť rozsah práce pred prípravou vizualizačnej scény.'],
        ['Dá sa z jednej scény vytvoriť viac pohľadov?', 'Áno. Pripravenú scénu možno využiť na rôzne uhly kamery, detaily alebo kompozície. Ak si s vami potrebné pohľady dohodnem vopred, scénu pripravím pre všetky plánované výstupy.'],
      ],
    },
  },
  {
    id: 'architecture',
    image: {src: '/media/gallery/lifestyle_05-1664.webp', small: '/media/gallery/lifestyle_05-640.webp', width: 1664, height: 2224},
    en: {
      slug: 'architectural-modeling', name: 'Architectural 3D modeling', title: 'Architectural 3D Modeling & Visualization | SHAPEVIZ',
      description: '3D architectural models and visualizations of interiors, buildings and exterior spaces. I turn drawings and references into clear visual presentations.',
      intro: 'I make spatial ideas easier to understand. I turn architectural drawings and references into 3D models and visualizations that communicate proportions, materials and atmosphere before construction begins.',
      imageAlt: 'Interior visualization of a mustard chair in a light-filled room with tall windows',
      caption: 'Interior atmosphere / selected visualization',
      deliverables: [
        ['Buildings and spatial models', 'I develop the visible geometry from supplied plans, elevations and references. The modeling scope follows the intended views, from a room layout to the exterior form of a building.'],
        ['Interior visualization', 'Camera placement, furniture, surface finishes and lighting show how a proposed interior may feel. These visuals support discussion between architects, designers and their clients.'],
        ['Exterior presentation', 'Exterior views can explain form, facade materials and the relationship to the surrounding space. I agree on the amount of context, landscaping and detail needed for the presentation.'],
      ],
      process: [['Review the design', 'I identify the available drawings, missing dimensions and the views that best explain the project.'], ['Model and composition', 'I prepare the spatial model and review camera angles before refining materials and atmosphere.'], ['Presentation visuals', 'I incorporate agreed feedback and deliver images sized for the intended presentation.']],
      brief: 'Prepare floor plans, elevations or sections, the current design version, material references and the required viewpoints. Let me know which parts are fixed and which are still being developed.',
      questions: [
        ['Which architectural documents are useful?', 'Floor plans, elevations, sections and material references provide a strong starting point. An existing 3D model can also help; I review its suitability for visualization before confirming the scope.'],
        ['Is a visualization a construction document?', 'No. A visualization communicates appearance and spatial intent. It does not replace technical design, engineering checks or construction documentation.'],
      ],
    },
    sk: {
      slug: 'architektonicke-modelovanie', name: 'Architektonické 3D modelovanie', title: 'Architektonické 3D modelovanie a vizualizácie | SHAPEVIZ',
      description: '3D modely architektúry a vizualizácie interiérov, budov aj exteriérov. Premieňam výkresy a referencie na zrozumiteľnú vizuálnu prezentáciu návrhu.',
      intro: 'Pomáham ľuďom pochopiť priestorový návrh. Architektonické výkresy a referencie premieňam na 3D modely a vizualizácie, ktoré ukážu proporcie, materiály aj atmosféru ešte pred výstavbou.',
      imageAlt: 'Vizualizácia interiéru s horčicovým kreslom v presvetlenej miestnosti s vysokými oknami',
      caption: 'Atmosféra interiéru / vybraná vizualizácia',
      deliverables: [
        ['Budovy a priestorové modely', 'Viditeľnú geometriu pripravujem podľa dodaných pôdorysov, pohľadov a referencií. Rozsah modelovania vychádza z potrebných záberov, od dispozície miestnosti po vonkajší tvar budovy.'],
        ['Vizualizácie interiérov', 'Umiestnenie kamery, nábytok, povrchy a osvetlenie ukážu, ako môže navrhnutý interiér pôsobiť. Vizuály uľahčia diskusiu medzi architektmi, dizajnérmi a ich klientmi.'],
        ['Prezentácia exteriérov', 'Exteriérové pohľady môžu vysvetliť hmotu stavby, fasádne materiály a vzťah k okoliu. Mieru spracovania kontextu, zelene a detailov dohodnem podľa účelu prezentácie.'],
      ],
      process: [['Posúdenie návrhu', 'Prejdem dostupné výkresy, chýbajúce rozmery a pohľady, ktoré projekt najlepšie vysvetlia.'], ['Model a kompozícia', 'Pripravím priestorový model a overím uhly kamery pred doladením materiálov a atmosféry.'], ['Prezentačné vizuály', 'Zapracujem dohodnuté pripomienky a odovzdám obrázky vo veľkostiach vhodných pre prezentáciu.']],
      brief: 'Pripravte pôdorysy, pohľady alebo rezy, aktuálnu verziu návrhu, materiálové referencie a požadované zábery. Napíšte, ktoré časti sú už rozhodnuté a ktoré sa ešte vyvíjajú.',
      questions: [
        ['Aké architektonické podklady sú vhodné?', 'Dobrým základom sú pôdorysy, pohľady, rezy a materiálové referencie. Pomôcť môže aj existujúci 3D model; pred potvrdením rozsahu overím jeho vhodnosť na vizualizáciu.'],
        ['Je vizualizácia stavebnou dokumentáciou?', 'Nie. Vizualizácia približuje vzhľad a priestorový zámer. Nenahrádza technický projekt, inžinierske posúdenie ani realizačnú dokumentáciu.'],
      ],
    },
  },
  {
    id: 'video-production', video: '/media/milenium-motion.mp4',
    image: {src: '/media/milenium-motion-poster.webp', width: 640, height: 1138},
    en: {
      slug: 'video-production-animation', name: 'Video production & animation', title: 'Video Production, CGI & 3D Animation | SHAPEVIZ',
      description: 'Product videos, CGI animation and branded motion content. I develop concepts, storyboards, animation and edits for websites, campaigns and social media.',
      intro: 'I give your product movement, rhythm and a story. I create CGI animation and video content that bring together visual direction, camera motion and editing for the channels where your audience will see it.',
      imageAlt: 'Milenium furniture CGI animation preview', caption: 'Milenium / furniture in motion',
      deliverables: [
        ['Product animation', 'Camera movement, changing light and close-up details can explain a product in ways a single image cannot. I plan the sequence around the features and feeling you want to communicate.'],
        ['Campaign and brand content', 'CGI sequences and edited video can support launches, websites and social campaigns. Visual direction, pacing and transitions connect individual shots into a coherent piece.'],
        ['Formats for each placement', 'A vertical social clip and a widescreen website video need different framing. I agree on duration, aspect ratios, captions and export requirements before final production.'],
      ],
      process: [['Concept and storyboard', 'I define the main message, visual references and the order of shots.'], ['Animation and edit', 'I review movement and pacing before committing to final rendering and finishing.'], ['Delivery versions', 'I prepare the agreed edits and exports for your website, campaign or social channels.']],
      brief: 'Tell me the purpose of the video, the intended audience, approximate length and delivery channels. Share product references, existing assets, brand guidelines and any required text, voice or music direction.',
      questions: [
        ['Can existing 3D models be used?', 'Often yes. I first review geometry, materials and suitability for the planned close-ups and motion. Any model adjustments are included in the agreed production scope.'],
        ['What affects the production scope?', 'Duration, number of shots, modeling needs, animation complexity and the number of delivery versions all matter. A short storyboard helps define the work more accurately than duration alone.'],
      ],
    },
    sk: {
      slug: 'tvorba-videi-animacie', name: 'Tvorba videí a animácií', title: 'Tvorba videí, CGI a 3D animácie | SHAPEVIZ',
      description: 'Produktové videá, CGI animácie a video obsah pre značky. Tvorím koncepty, storyboardy, animácie a strih pre weby, kampane aj sociálne siete.',
      intro: 'Dávam vášmu produktu pohyb, rytmus a príbeh. Tvorím CGI animácie a video obsah, ktorý prepája vizuálny smer, pohyb kamery a strih pre kanály, kde ho uvidí vaše publikum.',
      imageAlt: 'Náhľad CGI animácie nábytku Milenium', caption: 'Milenium / nábytok v pohybe',
      deliverables: [
        ['Produktové animácie', 'Pohyb kamery, meniace sa svetlo a detailné zábery dokážu produkt priblížiť inak než jeden obrázok. Sekvenciu plánujem podľa vlastností a pocitu, ktoré chcete odovzdať.'],
        ['Obsah pre kampane a značky', 'CGI sekvencie a strihané video podporia uvedenie produktu, web aj sociálne kampane. Vizuálny smer, tempo a prechody spoja jednotlivé zábery do súdržného celku.'],
        ['Formáty pre jednotlivé kanály', 'Vertikálny klip na sociálne siete a širokouhlé video na web potrebujú odlišné rámovanie. Dĺžku, pomery strán, titulky a parametre exportu dohodnem pred finálnou produkciou.'],
      ],
      process: [['Koncept a storyboard', 'Určím hlavné posolstvo, vizuálne referencie a poradie záberov.'], ['Animácia a strih', 'Pred finálnym renderovaním a dokončením si overím pohyb aj tempo videa.'], ['Verzie na odovzdanie', 'Pripravím dohodnuté strihy a exporty pre web, kampaň alebo sociálne siete.']],
      brief: 'Napíšte účel videa, cieľové publikum, približnú dĺžku a kanály použitia. Priložte referencie produktu, dostupné podklady, pravidlá značky a požiadavky na text, hlas či hudobný smer.',
      questions: [
        ['Dajú sa použiť existujúce 3D modely?', 'Často áno. Najskôr posúdim geometriu, materiály a vhodnosť pre plánované detaily a pohyb. Potrebné úpravy modelu zahrniem do dohodnutého rozsahu produkcie.'],
        ['Čo ovplyvňuje rozsah produkcie?', 'Rozhoduje dĺžka, počet záberov, potreba modelovania, zložitosť animácie aj počet výstupných verzií. Krátky storyboard pomôže určiť rozsah presnejšie než samotná dĺžka videa.'],
      ],
    },
  },
];

export const servicePath = (service, locale) => `/${locale}/${locale === 'sk' ? 'sluzby' : 'services'}/${service[locale].slug}`;
export const findService = (locale, slug) => services.find(service => service[locale]?.slug === slug);
