const asset = (name, width, height) => ({src: `/media/modeling/${name}-1920.webp`, small: `/media/modeling/${name}-720.webp`, smallWidth: 720, width, height});
const images = {
  bag: asset('pucci-wireframe',1200,1200), detail: asset('pucci-detail',1200,1200),
  sofa: asset('model-4',1809,964), sofaWire: asset('model-3',1801,988),
  tuft: asset('model-6',1852,958), tuftWire: asset('model-5',1770,1006),
  bedWire: asset('model-1',1648,1017), bed: asset('model-2',1662,979),
  kitchen: asset('kitchen',1830,1046), interior: asset('bed-interior',1920,2133),
};
const figure = (image, caption, alt) => ({image, caption, alt});

export const modelingService = {
  id: 'modeling', image: images.detail,
  en: {
    slug: '3d-modeling', name: 'High-end 3D modeling', title: 'High-end 3D Modeling for Products & Furniture | SHAPEVIZ',
    description: 'High-end 3D modeling from photographs, measurements or 3D scans. Furniture and hard surface models with clean topology and UV mapping for renders and animation.',
    intro: 'I turn real objects into detailed 3D models. From soft upholstery and fabric folds to precise hard surfaces, I preserve the proportions, true scale and details that give each object its character.',
    imageAlt: 'Close-up CGI render of a Pucci bag with textured leather, fabric, stitching and gold hardware',
    caption: 'Pucci / materials and product detail',
    heroNote: 'Product modeling & texturing',
    scopeTitle: 'Model specifications',
    heroImages: [
      figure(images.bag,'Pucci / geometry & topology','Wireframe of the complete Pucci bag showing the topology of its body, handles and hardware'),
      figure(images.detail,'Pucci / materials & detail','Close-up render of the Pucci bag showing leather, patterned fabric, stitching and metal hardware'),
    ],
    deliverables: [
      ['True scale', 'Photographs and measured dimensions establish the shape and real-world scale. Reference 3D scans can also provide a starting point.'],
      ['Clean topology', 'I build geometry with a clear structure and carefully resolved surfaces, from upholstery folds and seams to precise edges and product details.'],
      ['Correct UV mapping', 'Every model has correct UV mapping for applying textures, so fabric, leather, wood and other surfaces can be prepared for the final render.'],
    ],
    stories: [
      {id:'upholstery', label:'Soft furniture', title:'Upholstered furniture modeling', text:'Sofas, beds, cushions and upholstered furniture. I model the volume and tension of fabric, its folds, seams and tufting. The shaded and wireframe views show the sofa as a complete model and in close-up.', figures:[
        figure(images.sofa,'Sofa / overall form','Untextured 3D model of a tufted sofa with rolled arms and three seat cushions'),
        figure(images.sofaWire,'Sofa / topology','Wireframe of the same tufted sofa showing the complete mesh'),
        figure(images.tuft,'Upholstery / folds & tufting','Close-up of the sofa upholstery with modeled folds and deep button tufting'),
        figure(images.tuftWire,'Upholstery / topology in detail','Close-up wireframe showing how the mesh follows the tufted upholstery'),
      ]},
      {id:'beds', label:'Fabric & upholstery', title:'Beds & bedding', text:'Modeling upholstered bed frames, pillows and duvets, including seams and fabric folds. These examples show different bed designs in wireframe and shaded views.', figures:[
        figure(images.bedWire,'Upholstered bed / wireframe','Wireframe of a rounded upholstered bed with pillows and a folded duvet'),
        figure(images.bed,'Bed & bedding / shaded model','Shaded model of a green upholstered bed with draped bedding and pillows'),
      ]},
      {id:'hard-surface', label:'Hard surface', title:'Products, props & environments', text:'I model furniture, products and props for VFX shots, as well as complete environments and the props within them. For MCM, I created an entire train station. I also have experience in detailed modeling of jewelry, perfume bottles and other products for product visualization. The kitchen below is an example of cabinetry modeling for an interior scene.', layout:'wide', figures:[
        figure(images.kitchen,'Kitchen / cabinetry & island','3D model of a kitchen with tall cabinetry, an island, worktops, sinks and taps'),
      ]},
      {id:'cgi', label:'Rendering & animation', title:'CGI visualization', text:'I use the finished models in virtual sets for product renders, interior visualizations and animation. Scene production includes materials, lighting and camera setup. This bedroom is an example of a final interior render.', layout:'final', figures:[
        figure(images.interior,'Milenium / finished interior visualization','Finished bedroom render with a red upholstered bed, matching bench, textiles and soft daylight'),
      ]},
    ],
    process: [['References and measurements', 'I review photographs from several angles and measured dimensions to preserve true scale. Reference 3D scans and dimensioned drawings can also be used.'],['Model, topology and UVs', 'I establish the proportions, refine the geometry and details, then prepare correct UV mapping for textures.'],['Ready for the next production', 'I prepare the model for the agreed workflow. Virtual sets, materials, lighting, renders and animation can follow as part of the project.']],
    brief: 'Send photographs from several angles together with measured dimensions or dimensioned drawings. Measurements are necessary to preserve real-world scale. You can also supply reference 3D scans and close-up material photographs. Include the intended use: a model, product renders, a virtual set or animation.',
    questions: [
      ['Can you model from photographs or 3D scans?', 'Yes. Photographs should include measured dimensions to preserve the real scale of the object. Reference 3D scans are also suitable; I review their detail and scale before starting.'],
      ['What types of models do you create?', 'I create soft furniture, upholstery and textiles, as well as hard surface products and props for VFX shots. I also build complete environments and the props within them; for MCM, I created an entire train station. My experience includes detailed modeling of jewelry, perfume bottles and other products for product visualization. The level of detail depends on the references and intended use.'],
      ['Do the models include topology and UV mapping?', 'Yes. Clean topology and correct UV mapping for applying textures are part of every model. The delivery format and compatibility with your software are agreed before production.'],
      ['Can you create renders or animation afterwards?', 'Yes. The model can be placed in a virtual set and used for CGI renders or animation. Scene design, materials, lighting and final outputs are agreed as part of the production scope.'],
    ],
  },
  sk: {
    slug: '3d-modelovanie', name: 'High-end 3D modelovanie', title: 'High-end 3D modelovanie produktov a nábytku | SHAPEVIZ',
    description: 'High-end 3D modelovanie podľa fotografií, rozmerov a 3D skenov. Nábytok aj hard surface modely s čistou topológiou a UV mapovaním pre CGI rendery a animácie.',
    intro: 'Prenášam reálne objekty do detailných 3D modelov. Od mäkkého čalúnenia a záhybov látky až po presné hard surface tvary. Zachovávam proporcie, skutočnú mierku a detaily, ktoré dávajú každému objektu jeho charakter.',
    imageAlt: 'Detailný CGI render kabelky Pucci s textúrou kože, látky, prešívaním a zlatým kovaním',
    caption: 'Pucci / materiály a produktový detail',
    heroNote: 'Produktové modelovanie a textúrovanie',
    scopeTitle: 'Technické spracovanie modelov',
    heroImages: [
      figure(images.bag,'Pucci / geometria a topológia','Drôtený náhľad celej kabelky Pucci s topológiou tela, rúčok a kovania'),
      figure(images.detail,'Pucci / materiály a detail','Detailný render kabelky Pucci s kožou, vzorovanou látkou, prešívaním a kovovými prvkami'),
    ],
    deliverables: [
      ['Skutočná mierka', 'Fotografie spolu s nameranými rozmermi určia tvar aj reálnu veľkosť objektu. Ako východiskový podklad môžu slúžiť aj referenčné 3D skeny.'],
      ['Čistá topológia', 'Geometriu tvorím s prehľadnou štruktúrou a dôsledne spracovanými povrchmi. Od záhybov a švov čalúnenia po presné hrany a produktové detaily.'],
      ['Korektné UV mapovanie', 'Každý model má korektné UV mapovanie na nanášanie textúr. Látku, kožu, drevo aj ďalšie povrchy tak možno pripraviť pre výsledný render.'],
    ],
    stories: [
      {id:'upholstery', label:'Soft furniture', title:'Modelovanie čalúneného nábytku', text:'Sedačky, postele, vankúše aj čalúnený nábytok. Modelujem objem a napätie látky, jej záhyby, švy aj hlboké prešívanie. Tienené a drôtené náhľady ukazujú celkový model sedačky aj detail jeho topológie.', figures:[
        figure(images.sofa,'Sedačka / celkový tvar','3D model prešívanej sedačky so zaoblenými opierkami a tromi sedacími vankúšmi bez textúr'),
        figure(images.sofaWire,'Sedačka / topológia','Drôtený náhľad rovnakej prešívanej sedačky s kompletnou polygonálnou sieťou'),
        figure(images.tuft,'Čalúnenie / záhyby a prešívanie','Detail čalúnenia sedačky s modelovanými záhybmi a hlbokým gombíkovým prešívaním'),
        figure(images.tuftWire,'Čalúnenie / topológia v detaile','Detail drôteného náhľadu so sieťou kopírujúcou záhyby prešívaného čalúnenia'),
      ]},
      {id:'beds', label:'Textílie a čalúnenie', title:'Postele a posteľná bielizeň', text:'Modelovanie čalúnených rámov postelí, vankúšov a prikrývok vrátane švov a záhybov látky. Ukážky zachytávajú rôzne typy postelí v drôtenom a tienenom náhľade.', figures:[
        figure(images.bedWire,'Čalúnená posteľ / drôtený náhľad','Drôtený náhľad zaoblenej čalúnenej postele s vankúšmi a preloženou prikrývkou'),
        figure(images.bed,'Posteľ a textílie / model','Tienený model zelenej čalúnenej postele s voľne položenou prikrývkou a vankúšmi'),
      ]},
      {id:'hard-surface', label:'Hard surface', title:'Produkty, props a environmenty', text:'Modelujem nábytok, produkty aj props pre VFX zábery. Tvorím tiež celé environmenty a rekvizity do nich. Pre MCM som napríklad vytvoril celú vlakovú stanicu. Mám skúsenosti aj s detailným modelovaním šperkov, flakónov parfumov a ďalších produktov pre produktové vizualizácie. Kuchyňa nižšie je ukážkou modelovania nábytkovej zostavy do interiérovej scény.', layout:'wide', figures:[
        figure(images.kitchen,'Kuchyňa / nábytková zostava a ostrov','3D model kuchyne s vysokými skrinkami, ostrovom, pracovnými doskami, drezmi a batériami'),
      ]},
      {id:'cgi', label:'Rendering a animácia', title:'CGI vizualizácia', text:'Hotové modely používam vo virtuálnych setoch pre produktové rendery, interiérové vizualizácie a animácie. Príprava scény zahŕňa materiály, osvetlenie a nastavenie kamery. Táto spálňa je ukážkou finálneho interiérového renderu.', layout:'final', figures:[
        figure(images.interior,'Milenium / finálna vizualizácia interiéru','Hotový render spálne s červenou čalúnenou posteľou, lavicou, textíliami a mäkkým denným svetlom'),
      ]},
    ],
    process: [['Referencie a rozmery', 'Prejdem fotografie z viacerých uhlov a namerané rozmery, aby model zachoval skutočnú mierku. Podkladom môžu byť aj referenčné 3D skeny a kótované výkresy.'],['Model, topológia a UV', 'Nastavím proporcie, spracujem geometriu a detaily a pripravím korektné UV mapovanie na nanášanie textúr.'],['Príprava na ďalšiu tvorbu', 'Model pripravím pre dohodnutý spôsob použitia. Nadviazať môže tvorba virtuálneho setu, materiálov, osvetlenia, renderov alebo animácie.']],
    brief: 'Pošlite fotografie z viacerých uhlov spolu s nameranými rozmermi alebo kótovanými výkresmi. Rozmery sú potrebné na zachovanie skutočnej mierky objektu. Dodať môžete aj referenčné 3D skeny a detailné fotografie materiálov. Uveďte plánované využitie: samotný model, produktové rendery, virtuálny set alebo animáciu.',
    questions: [
      ['Viete modelovať podľa fotografií alebo 3D skenov?', 'Áno. K fotografiám potrebujem aj namerané rozmery, aby bola zachovaná skutočná mierka objektu. Vhodným podkladom sú aj referenčné 3D skeny; pred začiatkom posúdim ich detailnosť a mierku.'],
      ['Aké druhy modelov tvoríte?', 'Tvorím soft furniture, čalúnenie a textílie, ale aj hard surface produkty a props pre VFX zábery. Modelujem tiež celé environmenty a rekvizity do nich; pre MCM som napríklad vytvoril celú vlakovú stanicu. Mám skúsenosti aj s detailným modelovaním šperkov, flakónov parfumov a ďalších produktov pre produktové vizualizácie. Úroveň detailov prispôsobujem referenciám a plánovanému použitiu.'],
      ['Majú modely pripravenú topológiu a UV mapovanie?', 'Áno. Súčasťou každého modelu je čistá topológia a korektné UV mapovanie na nanášanie textúr. Formát odovzdania a kompatibilitu s vaším softvérom dohodneme pred začiatkom práce.'],
      ['Môžu na modelovanie nadviazať rendery alebo animácie?', 'Áno. Model môžem zasadiť do virtuálneho setu a využiť ho pre CGI rendery aj animácie. Tvorbu scény, materiálov, osvetlenia a finálnych výstupov dohodneme v rámci rozsahu produkcie.'],
    ],
  },
};
