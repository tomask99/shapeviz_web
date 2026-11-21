const asset = (name, width, height) => ({src: `/media/architecture/${name}-1920.webp`, small: `/media/architecture/${name}-720.webp`, smallWidth: 720, width, height});
const images = {
  apartments: asset('apartments-overview',1920,1005), entrance: asset('apartments-entrance',1920,1920),
  approach: asset('brick-approach',1080,1920), overview: asset('brick-overview',1080,1920),
  facade: asset('brick-facade',1080,1920), courtyard: asset('brick-courtyard',1080,1920), panorama: asset('brick-panorama',1920,640),
  forest: asset('forest-front',1920,2133), context: asset('forest-context',1920,2133), side: asset('forest-side',1920,2133),
};
const figure = (image, caption, alt) => ({image, caption, alt});

export const architectureService = {
  id: 'architecture', image: images.apartments,
  en: {
    slug: 'architectural-modeling', name: 'Architectural 3D modeling & rendering', title: 'Architectural 3D Modeling & Rendering | SHAPEVIZ',
    description: 'Architectural 3D modeling and rendering from drawings or Archicad models. Exterior and interior visualizations for architects and developers.',
    intro: 'I create architectural 3D models and render exterior and interior visualizations. I can work with existing Archicad models or build the model from your drawings. With a background in building construction and architecture, I understand technical documentation and can read floor plans, sections, elevations and construction details.',
    imageAlt: 'Architectural render of an apartment complex with stone facades, timber screens and glazed balconies in sunlight',
    caption: 'Apartment complex / exterior rendering',
    heroNote: 'Architectural visualization', heroLayout: 'wide',
    heroImages: [figure(images.apartments,'Apartment complex / overall view','Sunlit apartment complex with stone walls, timber screens, glass balconies and landscaped grounds')],
    scopeTitle: 'Modeling & rendering services',
    deliverables: [
      ['Existing models & Archicad', 'I work with supplied 3D models, including models from Archicad. I review the geometry and prepare the model for rendering, adding the materials, surroundings and detail needed for the agreed views.'],
      ['3D modeling from drawings', 'If you do not have a 3D model, I create one from your technical documentation. I read floor plans, sections, elevations, dimensions and construction details to model the building with the correct scale and proportions.'],
      ['Architectural rendering', 'I prepare exterior and interior visualizations, including materials, lighting, landscaping and camera composition. The finished renders can be used for architectural presentations, client approvals and property marketing.'],
    ],
    stories: [
      {id:'apartment-complex',label:'Apartment complex / exterior CGI',title:'Facades and exterior spaces',text:'Stone cladding, timber screens and glass balconies define the facade. Closer views show the entrance, terraces and planting, complementing the overall view of the development.',layout:'facade-details',figures:[
        figure(images.entrance,'Apartment complex / balcony detail','Detail of the stone facade, timber screens and glazed balconies'),
        figure(images.entrance,'Apartment complex / entrance and landscaping','Stone apartment facade with timber balcony screens, planted terraces and an exterior staircase'),
      ]},
      {id:'brick-villa',label:'Brick villa / exterior CGI',title:'Curved brick architecture',text:'A series of views of the same building: the approach, overall form, curved facade and sheltered courtyard. Consistent materials and soft light connect the images while each camera angle shows a different part of the architecture.',figures:[
        figure(images.overview,'Brick villa / overall view','Overall view of a low curved brick villa with glazing, gravel terrain and dark red trees'),
        figure(images.approach,'Brick villa / approach','Approach to a curved brick villa with a covered parking space and a black classic car'),
        figure(images.facade,'Brick villa / facade detail','Curved brick facade and overhang above full-height glazing and ornamental grasses'),
        figure(images.courtyard,'Brick villa / courtyard','Sheltered courtyard between curved brick walls with glazing, planting and circular stepping stones'),
      ]},
      {id:'brick-panorama',label:'Brick villa / panoramic view',title:'Facade and approach',text:'The wide view connects the covered parking area, curved brick volumes and glazed living spaces within one composition.',layout:'panorama',figures:[
        figure(images.panorama,'Brick villa / panoramic exterior','Panoramic view of a curved brick villa with a black classic car under the overhang and glazing facing a gravel landscape'),
      ]},
      {id:'forest-house',label:'Forest house / exterior CGI',title:'Architecture in its surroundings',text:'Three views place the house within its wooded site. The wider composition shows the terrain and mature trees; closer views focus on the glazed facade, terrace and warm interior lighting.',layout:'triptych',figures:[
        figure(images.context,'Forest house / site context','Modern two-storey house set in a grassy slope among tall conifers and rocks'),
        figure(images.forest,'Forest house / front elevation','Glazed front of a modern house with a long balcony, warm interior lighting and a dog resting on the lawn'),
        figure(images.side,'Forest house / terrace and glazing','Oblique exterior view of a forest house with glass balcony balustrades and illuminated living spaces'),
      ]},
    ],
    process: [['Technical documentation', 'I review the current drawings or existing model, clarify any missing dimensions and agree on the required views and material references.'],['3D model and preview renders', 'I prepare the supplied model or build it from the drawings, then send previews to review the architecture, camera positions, materials and lighting.'],['Final rendering', 'After incorporating feedback, I render the approved views, complete post-production and deliver the agreed image sizes and formats.']],
    brief: 'Send the current floor plans, sections, elevations and relevant construction details, or an existing 3D model, including an Archicad model. Add material references, site information, the required views and the intended use of the visualizations.',
    questions: [
      ['Can you work with an Archicad model?', 'Yes. I can use an existing Archicad model as the basis for visualization. After reviewing the project, we agree on the model handover and any geometry or material adjustments needed for rendering.'],
      ['Can you create the model if I only have drawings?', 'Yes. I can read the technical documentation and create a 3D model from floor plans, sections, elevations and details. I then prepare the materials, lighting and scene for the architectural renders.'],
      ['Can you render both interiors and exteriors?', 'Yes. I prepare exterior views with the surrounding landscape as well as interior visualizations. We agree on the views, level of detail and visual references before production.'],
    ],
  },
  sk: {
    slug: 'architektonicke-modelovanie', name: 'Architektonické 3D modelovanie a rendering', title: 'Architektonické 3D modelovanie a rendering | SHAPEVIZ',
    description: 'Architektonické 3D modelovanie a rendering podľa výkresov alebo Archicad modelov. Vizualizácie exteriérov a interiérov pre architektov a developerov.',
    intro: 'Tvorím 3D modely architektúry a architektonické vizualizácie exteriérov aj interiérov. Pracujem s existujúcimi Archicad modelmi alebo model vytvorím podľa vašich výkresov. Vďaka štúdiu pozemných stavieb a architektúry rozumiem technickej dokumentácii a viem čítať pôdorysy, rezy, pohľady aj konštrukčné detaily.',
    imageAlt: 'Architektonický render bytového komplexu s kamennou fasádou, drevenými lamelami a presklenými balkónmi v slnečnom svetle',
    caption: 'Bytový komplex / exteriérový rendering',
    heroNote: 'Architektonické vizualizácie', heroLayout: 'wide',
    heroImages: [figure(images.apartments,'Bytový komplex / celkový pohľad','Bytový komplex s kamennými stenami, drevenými lamelami, sklenenými balkónmi a upraveným okolím v slnečnom svetle')],
    scopeTitle: 'Modelovanie a rendering',
    deliverables: [
      ['Existujúce modely a Archicad', 'Pracujem s dodanými 3D modelmi vrátane modelov z Archicadu. Skontrolujem geometriu a pripravím model na rendering. Doplním materiály, okolie a detaily potrebné pre dohodnuté zábery.'],
      ['3D modelovanie podľa výkresov', 'Ak 3D model nemáte, vytvorím ho z technickej dokumentácie. Viem čítať pôdorysy, rezy, pohľady, kóty aj konštrukčné detaily a podľa nich vymodelovať stavbu v správnej mierke a proporciách.'],
      ['Architektonické vizualizácie', 'Pripravím vizualizácie exteriérov a interiérov vrátane materiálov, osvetlenia, zelene a kompozície kamery. Finálne rendery môžete použiť na prezentáciu návrhu, odsúhlasenie s klientom aj marketing nehnuteľností.'],
    ],
    stories: [
      {id:'apartment-complex',label:'Bytový komplex / exteriérové CGI',title:'Fasády a exteriérové priestory',text:'Kamenný obklad, drevené lamely a presklené balkóny určujú charakter fasády. Bližšie pohľady ukazujú vstup, terasy a výsadbu a dopĺňajú celkový pohľad na komplex.',layout:'facade-details',figures:[
        figure(images.entrance,'Bytový komplex / detail balkónov','Detail kamennej fasády, drevených lamiel a presklených balkónov'),
        figure(images.entrance,'Bytový komplex / vstup a okolie','Kamenná fasáda bytového domu s drevenými lamelami, vysadenými terasami a vonkajším schodiskom'),
      ]},
      {id:'brick-villa',label:'Tehlová vila / exteriérové CGI',title:'Architektúra s oblými fasádami',text:'Séria pohľadov na rovnakú stavbu: prístup, celková hmota, oblá fasáda a kryté átrium. Jednotné materiály a mäkké svetlo prepájajú zábery, pričom každý uhol kamery predstavuje inú časť architektúry.',figures:[
        figure(images.overview,'Tehlová vila / celkový pohľad','Celkový pohľad na nízku vilu s oblou tehlovou fasádou, presklením, štrkovým terénom a tmavočervenými stromami'),
        figure(images.approach,'Tehlová vila / prístup','Prístup k tehlovej vile s oblou fasádou, krytým parkovaním a čiernym veteránom'),
        figure(images.facade,'Tehlová vila / detail fasády','Oblá tehlová fasáda a presah nad veľkoformátovým presklením a okrasnými trávami'),
        figure(images.courtyard,'Tehlová vila / átrium','Kryté átrium medzi oblými tehlovými stenami s presklením, zeleňou a kruhovými nášľapmi'),
      ]},
      {id:'brick-panorama',label:'Tehlová vila / panoramatický pohľad',title:'Fasáda a prístup k domu',text:'Široký záber prepája kryté parkovanie, oblé tehlové hmoty a presklené obytné priestory do jednej kompozície.',layout:'panorama',figures:[
        figure(images.panorama,'Tehlová vila / panoramatický exteriér','Panoramatický pohľad na oblú tehlovú vilu s čiernym veteránom pod presahom a presklením orientovaným do štrkovej krajiny'),
      ]},
      {id:'forest-house',label:'Dom v lese / exteriérové CGI',title:'Architektúra v kontexte okolia',text:'Tri pohľady zasadzujú dom do lesného prostredia. Širšia kompozícia ukazuje terén a vysoké stromy, bližšie zábery sa sústreďujú na presklenú fasádu, terasu a teplé osvetlenie interiéru.',layout:'triptych',figures:[
        figure(images.context,'Dom v lese / zasadenie do terénu','Moderný dvojpodlažný dom v trávnatom svahu medzi vysokými ihličnanmi a skalami'),
        figure(images.forest,'Dom v lese / čelný pohľad','Presklená fasáda moderného domu s dlhým balkónom, teplým interiérovým osvetlením a psom odpočívajúcim na trávniku'),
        figure(images.side,'Dom v lese / terasa a presklenie','Bočný pohľad na dom v lese so skleneným zábradlím balkóna a osvetlenými obytnými priestormi'),
      ]},
    ],
    process: [['Technické podklady', 'Prejdem aktuálne výkresy alebo existujúci model, upresním chýbajúce rozmery a dohodneme požadované pohľady aj materiálové referencie.'],['3D model a náhľady', 'Upravím dodaný model alebo ho vytvorím podľa výkresov. Pošlem náhľady na kontrolu architektúry, kamier, materiálov a osvetlenia.'],['Finálny rendering', 'Po zapracovaní pripomienok vyrenderujem schválené pohľady, dokončím postprodukciu a odovzdám dohodnuté rozmery a formáty obrázkov.']],
    brief: 'Pošlite aktuálne pôdorysy, rezy, pohľady a relevantné konštrukčné detaily alebo existujúci 3D model vrátane modelu z Archicadu. Priložte materiálové referencie, informácie o pozemku, požadované zábery a účel vizualizácií.',
    questions: [
      ['Viete pracovať s modelom z Archicadu?', 'Áno. Existujúci Archicad model môžem použiť ako základ vizualizácie. Po prezretí projektu dohodneme spôsob odovzdania modelu a potrebné úpravy geometrie či materiálov pre rendering.'],
      ['Viete vytvoriť model, ak mám iba výkresy?', 'Áno. Rozumiem technickej dokumentácii a podľa pôdorysov, rezov, pohľadov a detailov vytvorím 3D model. Následne pripravím materiály, osvetlenie a scénu pre architektonické vizualizácie.'],
      ['Robíte vizualizácie interiérov aj exteriérov?', 'Áno. Pripravujem exteriérové pohľady s okolitou krajinou aj vizualizácie interiérov. Zábery, mieru detailu a vizuálne referencie dohodneme pred začiatkom práce.'],
    ],
  },
};
