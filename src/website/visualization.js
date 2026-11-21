const asset = (name, width, height) => ({src: `/media/visualization/${name}-1920.webp`, small: `/media/visualization/${name}-720.webp`, smallWidth: 720, width, height});
const images = {
  studio: asset('sofa-studio',1920,960),
  living: asset('living-room',1920,2133), interior: asset('kitchen-interior',1920,2133),
  kitchen: asset('kitchen',1920,2400), lifestyle: asset('kitchen-lifestyle',1920,2400), drawer: asset('kitchen-drawer',1792,2304),
  ceramics: asset('kitchen-ceramics',1920,3416), cat: asset('kitchen-cat',1792,2304),
  elixir: asset('hevi-elixir',1400,2000), magnesium: asset('hevi-magnesium',1400,2000),
};
const figure = (image, caption, alt) => ({image, caption, alt});

export const visualizationService = {
  id: 'visualization', image: images.studio,
  en: {
    slug: 'product-interior-visualization', name: 'Product & interior visualization', title: 'Product & Interior Visualization | SHAPEVIZ',
    description: 'CGI product renders, furniture visualization, interior scenes and campaign visuals. Studio lighting, materials and virtual sets for catalogues, e-commerce and advertising.',
    intro: 'I create CGI product renders and interior visualizations for catalogues, e-commerce and campaigns. The work includes materials, lighting, camera composition and post-production, from studio packshots to furnished interiors and product sets.',
    imageAlt: 'Studio render of a light upholstered sectional sofa on a white background',
    caption: 'Furniture / studio render',
    heroNote: 'Studio product rendering', heroLayout: 'wide',
    heroImages: [figure(images.studio,'Furniture / studio render','Light upholstered sectional sofa with cushions, rendered on a white studio background')],
    scopeTitle: 'CGI production',
    deliverables: [
      ['Studio product renders', 'Packshots, product details and material variants on a neutral background. Consistent cameras and lighting for product ranges, catalogues and e-commerce.'],
      ['Interior visualization', 'Furniture in a complete interior, including surrounding objects, finishes and lighting. Overall views and close-ups show the layout, materials and individual products.'],
      ['Campaign visuals', 'Product compositions in custom virtual sets. I prepare the environment, props and lighting to suit the product, brand references and required image formats.'],
    ],
    stories: [
      {id:'furniture-interiors', label:'Milenium / interior visualization', title:'Furniture in an interior', text:'The living room and kitchen are two views of the same space. The sofa remains the main subject in the living room; the second view focuses on the stone island, cabinetry and the adjoining dining area. Materials and lighting stay consistent across both views.', figures:[
        figure(images.living,'Living room / furniture and composition','Interior render with a light modular sofa, stone coffee table, pendant lights and kitchen in the background'),
        figure(images.interior,'Kitchen / materials and lighting','Interior render of a stone kitchen island, bar stools and dining area with a green wall'),
      ]},
      {id:'kitchen-visualization', label:'Kitchen visualization', title:'Interior, lifestyle & detail', text:'A kitchen scene shown as an interior view, a lifestyle composition with a person and a close-up of the drawer system. The series covers the furniture design, everyday use and product details within the same visual style.', layout:'triptych', figures:[
        figure(images.kitchen,'Kitchen / interior view','Minimal kitchen with a stone island, pale cabinetry, bronze taps and window blinds'),
        figure(images.lifestyle,'Kitchen / lifestyle view','The same kitchen with a woman holding a cup beside the worktop'),
        figure(images.drawer,'Kitchen / drawer detail','Close-up of a woman opening kitchen drawers with glass storage jars inside'),
      ]},
      {id:'kitchen-details', label:'Kitchen / close-ups', title:'Materials & scene details', text:'Close-ups bring atmosphere and a sense of everyday life to a scene. The texture of ceramic bowls, soft light or a cat resting in an open drawer give the viewer something to connect with emotionally, making the image more memorable.', layout:'details', figures:[
        figure(images.ceramics,'Ceramics / material detail','Close-up of stacked ceramic bowls on a kitchen shelf with a textured brown glaze and shallow depth of field'),
        figure(images.cat,'Kitchen / lifestyle detail','A ginger and white cat sleeping in an open kitchen drawer above glass storage jars'),
      ]},
      {id:'product-campaigns', label:'Hevi / product CGI', title:'Product campaign renders', text:'Two products from the same range in separate virtual sets. Natural Sleep Elixir uses moss, vegetation and green tones; Deep Sleep Magnesium+ uses pale rock formations and purple packaging. Both compositions use a floating jar, lid and capsules.', figures:[
        figure(images.elixir,'Hevi / Natural Sleep Elixir','CGI render of a glass Hevi Natural Sleep Elixir jar with green packaging and floating capsules in a moss-covered environment'),
        figure(images.magnesium,'Hevi / Deep Sleep Magnesium+','CGI render of a glass Hevi Deep Sleep Magnesium+ jar with purple packaging and floating capsules between pale rocks'),
      ]},
    ],
    process: [['Brief and references', 'We agree on the products, visual references, camera views and intended use of the images.'],['Scene and preview renders', 'I prepare the models, materials and lighting, then send previews for review of the composition and product details.'],['Rendering and post-production', 'After feedback, I render the approved views, finish the images and export the agreed sizes and formats.']],
    brief: 'Send existing 3D models or product photographs with dimensions, material references and examples of the visual style you need. For interiors, include plans or an existing scene. Specify the number of views, required formats and whether the images are for a catalogue, e-commerce, a website or a campaign.',
    questions: [
      ['Can you create the models as well?', 'Yes. I can include 3D modeling in the project. Photographs with measured dimensions, drawings or reference 3D scans help define the modeling work.'],
      ['Can one scene produce several views?', 'Yes. A prepared scene can be used for overall views, product details and different camera angles. We agree on the shots before production so the scene is prepared for each view.'],
      ['Can you prepare material and colour variants?', 'Yes. A prepared model can be rendered with different fabrics, finishes or packaging variants. Please supply the material references and the list of variants you need.'],
    ],
  },
  sk: {
    slug: 'produktove-interierove-vizualizacie', name: 'Produktové a interiérové vizualizácie', title: 'Produktové a interiérové vizualizácie | SHAPEVIZ',
    description: 'CGI produktové rendery, vizualizácie nábytku, interiérov a kampaní. Štúdiové osvetlenie, materiály a virtuálne sety pre katalógy, e-shopy a reklamu.',
    intro: 'Tvorím CGI produktové rendery a interiérové vizualizácie pre katalógy, e-shopy a kampane. Pripravujem materiály, osvetlenie, kompozíciu kamery aj postprodukciu, od štúdiových packshotov po zariadené interiéry a produktové sety.',
    imageAlt: 'Štúdiový render svetlej čalúnenej sedačky na bielom pozadí',
    caption: 'Nábytok / štúdiový render',
    heroNote: 'Štúdiové produktové rendery', heroLayout: 'wide',
    heroImages: [figure(images.studio,'Nábytok / štúdiový render','Svetlá čalúnená sedačka s vankúšmi vyrenderovaná na bielom štúdiovom pozadí')],
    scopeTitle: 'CGI produkcia',
    deliverables: [
      ['Štúdiové produktové rendery', 'Packshoty, produktové detaily a materiálové varianty na neutrálnom pozadí. Jednotné kamery a osvetlenie pre produktové kolekcie, katalógy a e-shopy.'],
      ['Interiérové vizualizácie', 'Nábytok v kompletnom interiéri vrátane okolitých objektov, materiálov a osvetlenia. Celkové zábery aj detaily zobrazia dispozíciu, povrchy a jednotlivé produkty.'],
      ['Vizuály pre kampane', 'Produktové kompozície vo virtuálnych setoch na mieru. Prostredie, rekvizity a osvetlenie pripravujem podľa produktu, referencií značky a požadovaných formátov.'],
    ],
    stories: [
      {id:'furniture-interiors', label:'Milenium / interiérová vizualizácia', title:'Nábytok v interiéri', text:'Obývacia izba a kuchyňa zachytávajú dva pohľady na rovnaký priestor. V obývačke je hlavným predmetom sedačka; druhý záber sa sústreďuje na kamenný ostrov, kuchynskú zostavu a nadväzujúcu jedáleň. Materiály a osvetlenie sú konzistentné v oboch pohľadoch.', figures:[
        figure(images.living,'Obývacia izba / nábytok a kompozícia','Render interiéru so svetlou modulárnou sedačkou, kamenným stolíkom, závesnými svietidlami a kuchyňou v pozadí'),
        figure(images.interior,'Kuchyňa / materiály a osvetlenie','Render kamenného kuchynského ostrova s barovými stoličkami a jedálňou so zelenou stenou'),
      ]},
      {id:'kitchen-visualization', label:'Vizualizácia kuchyne', title:'Interiér, lifestyle a detail', text:'Kuchynská scéna v celkovom pohľade, lifestyle kompozícii s postavou a detaile zásuvkového systému. Séria ukazuje dizajn nábytku, jeho používanie aj produktové detaily v jednotnom vizuálnom štýle.', layout:'triptych', figures:[
        figure(images.kitchen,'Kuchyňa / celkový pohľad','Minimalistická kuchyňa s kamenným ostrovom, svetlými skrinkami, bronzovými batériami a žalúziami'),
        figure(images.lifestyle,'Kuchyňa / lifestyle záber','Rovnaká kuchyňa s postavou ženy, ktorá drží šálku pri pracovnej doske'),
        figure(images.drawer,'Kuchyňa / detail zásuviek','Detail ženy otvárajúcej kuchynské zásuvky so sklenenými dózami'),
      ]},
      {id:'kitchen-details', label:'Kuchyňa / detailné zábery', title:'Materiály a detaily scény', text:'Detailné zábery dodávajú scéne atmosféru a pocit každodenného života. Textúra keramických misiek, mäkké svetlo či mačka odpočívajúca v otvorenej zásuvke dokážu v divákovi vyvolať emóciu. Práve vďaka takýmto detailom si obrázok ľahšie zapamätá.', layout:'details', figures:[
        figure(images.ceramics,'Keramika / detail materiálu','Detail keramických misiek na kuchynskej polici s hnedou štruktúrovanou glazúrou a malou hĺbkou ostrosti'),
        figure(images.cat,'Kuchyňa / lifestyle detail','Ryšavobiela mačka spiaca v otvorenej kuchynskej zásuvke nad sklenenými dózami'),
      ]},
      {id:'product-campaigns', label:'Hevi / produktové CGI', title:'Produktové vizuály pre kampane', text:'Dva produkty z jednej kolekcie v samostatných virtuálnych setoch. Natural Sleep Elixir pracuje s machom, vegetáciou a zelenými tónmi; Deep Sleep Magnesium+ so svetlými skalami a fialovým obalom. Obe kompozície využívajú levitujúcu dózu, viečko a kapsuly.', figures:[
        figure(images.elixir,'Hevi / Natural Sleep Elixir','CGI render sklenenej dózy Hevi Natural Sleep Elixir so zeleným obalom a levitujúcimi kapsulami v machovom prostredí'),
        figure(images.magnesium,'Hevi / Deep Sleep Magnesium+','CGI render sklenenej dózy Hevi Deep Sleep Magnesium+ s fialovým obalom a levitujúcimi kapsulami medzi svetlými skalami'),
      ]},
    ],
    process: [['Zadanie a referencie', 'Dohodneme produkty, vizuálne referencie, pohľady kamery a plánované použitie obrázkov.'],['Scéna a náhľadové rendery', 'Pripravím modely, materiály a osvetlenie. Pošlem náhľady na odsúhlasenie kompozície a produktových detailov.'],['Rendering a postprodukcia', 'Po zapracovaní pripomienok vyrenderujem schválené pohľady, dokončím obrázky a vyexportujem dohodnuté rozmery a formáty.']],
    brief: 'Pošlite existujúce 3D modely alebo fotografie produktov s rozmermi, materiálové referencie a ukážky požadovaného vizuálneho štýlu. Pri interiéroch priložte pôdorysy alebo existujúcu scénu. Uveďte počet pohľadov, potrebné formáty a použitie: katalóg, e-shop, web alebo kampaň.',
    questions: [
      ['Viete pripraviť aj 3D modely?', 'Áno. Súčasťou projektu môže byť aj 3D modelovanie. Fotografie s nameranými rozmermi, výkresy alebo referenčné 3D skeny pomôžu určiť rozsah modelovania.'],
      ['Dá sa z jednej scény vytvoriť viac pohľadov?', 'Áno. Pripravená scéna umožňuje celkové pohľady, produktové detaily aj rôzne uhly kamery. Zábery dohodneme pred produkciou, aby bola scéna pripravená na každý pohľad.'],
      ['Viete pripraviť materiálové a farebné varianty?', 'Áno. Pripravený model možno vyrenderovať s rôznymi látkami, povrchovými úpravami alebo variantmi obalu. Potrebujem materiálové referencie a zoznam požadovaných variantov.'],
    ],
  },
};
