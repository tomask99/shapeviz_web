import {visualizationService} from './visualization.js';
import {modelingService} from './modeling.js';
// One source for public routes, visible service copy, sitemap and structured data.
export const services = [
  modelingService,
  visualizationService,
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
