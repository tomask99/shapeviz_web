const asset = (name, width = 1600, height = 2138) => ({src: `/media/marketing/${name}-1600.webp`, small: `/media/marketing/${name}-640.webp`, smallWidth: 640, width, height});
const images = {
  sierra: asset('sierra'), valentina: asset('valentina'), campaign: asset('zing-campaign',896,1200),
  interior: asset('sofa-interior'), closeup: asset('sofa-closeup'), touch: asset('sofa-touch'), boucle: asset('sofa-boucle'),
  cream: asset('fabric-cream'), brown: asset('fabric-brown',896,1200), grey: asset('fabric-grey',896,1200), blue: asset('fabric-blue',896,1200),
  shoe: asset('zing-catalog',896,1200), poster: asset('zing-poster',1328,1760), detail: asset('zing-detail',1328,1760), lifestyle: asset('zing-lifestyle',1328,1760),
  catalog: asset('sofa-catalog',1600,941),
};
const figure = (image, caption, alt) => ({image, caption, alt});

export const marketingService = {
  id: 'marketing', image: images.sierra,
  en: {
    slug: 'marketing-digital-presence', name: 'Marketing & digital presence', title: 'Visual Content & Product Campaigns for Brands | SHAPEVIZ',
    description: 'Visual content in your brand identity: product launch campaigns, fabric and colour variants, custom AI and 3D workflows, and web images prepared for SEO.',
    intro: 'I create visual content that reflects your brand identity. My goal is to make images that evoke a feeling and help people remember the brand behind them. From a product launch to an entire catalogue, I connect creative direction, 3D and custom AI workflows into a consistent series of visuals for your website, advertising and social media.',
    imageAlt: 'Sierra chair campaign visual featuring a close-up of textured upholstery', caption: 'Sierra / campaign visual',
    heroNote: 'Visual content for brands',
    heroImages: [
      figure(images.sierra,'Sierra / material and detail','Campaign poster with a close-up of a green upholstered Sierra chair'),
      figure(images.valentina,'Valentina / product campaign','Campaign poster with a mustard yellow Valentina chair and product typography'),
      figure(images.campaign,'Zing Denim / campaign visual','Denim sneakers on a dark blue background with Zing Denim campaign typography'),
    ],
    scopeTitle: 'From brand identity to campaign assets',
    deliverables: [
      ['Visual direction for your brand', 'I work with your colours, typography and visual language to create product images with a consistent character. Lighting, composition and material details support the emotion you want people to associate with your brand.'],
      ['Product launch campaigns', 'I can prepare the complete visual content for a launch: the main campaign image, product views, lifestyle scenes, close-ups and versions for web, advertising and social media. Fabric, colour and material variants can be part of the same production.'],
      ['Custom AI workflows and 3D', 'For faster production and larger image sets, I build my own AI workflows. I can produce visuals with AI or combine it with 3D to retain control over product shape, camera, materials and composition. I review and refine the outputs against the approved product references and visual direction.'],
    ],
    stories: [
      {id:'brand-emotion',label:'Furniture / lifestyle and details',title:'Images that leave a feeling',text:'A softly lit interior, a hand on a cushion or a close-up of woven fabric gives a product a human context. I use these details to communicate comfort and material character, with the aim of making the image and the brand more memorable.',layout:'compact',figures:[
        figure(images.interior,'Loft / lifestyle scene','Beige modular sofa in a sunlit interior with tall windows and parquet flooring'),
        figure(images.closeup,'Loft / shape and light','Close-up of a beige sofa arm and cushions in warm sunlight'),
        figure(images.touch,'Loft / touch and comfort','Hand resting on a cushion on a softly lit beige sofa'),
        figure(images.boucle,'Loft / upholstery detail','Hand touching the textured cream upholstery of a modular sofa'),
      ]},
      {id:'product-variants',label:'Product launch / material variations',title:'One product, more possibilities',text:'A new collection often needs more than one finish. I create colour and fabric variations in a consistent composition so customers can compare the options. The approved materials and reference samples guide the appearance of each variant.',layout:'compact',figures:[
        figure(images.cream,'Cream / woven fabric','Corner of a modular sofa with cream woven upholstery'),
        figure(images.brown,'Brown / material variation','The same sofa composition with a mottled brown upholstery finish'),
        figure(images.grey,'Grey / fabric variation','The same sofa composition with grey woven upholstery'),
        figure(images.blue,'Blue / fabric variation','The same sofa composition with blue woven upholstery'),
      ]},
      {id:'launch-content',label:'Zing Denim / visual series',title:'A coherent series for a launch',text:'A campaign can connect a clean product image with a typographic poster, close-up details and lifestyle views. I adapt the visual series to the brand and the planned placements, using custom AI workflows and 3D where they give the production the most useful control.',layout:'compact',figures:[
        figure(images.shoe,'Zing Denim / product view','Light denim sneaker in profile on a white background with Barebarics branding'),
        figure(images.poster,'Zing Denim / campaign poster','Sneaker worn on a raised foot with Zing Denim typography and Barebarics branding'),
        figure(images.detail,'Zing Denim / product detail','Front view of a light denim sneaker worn on a raised foot'),
        figure(images.lifestyle,'Zing Denim / lifestyle view','Light denim sneaker worn outdoors in directional sunlight'),
      ]},
      {id:'web-delivery',label:'Web and catalogue / image delivery',title:'Ready for your online presentation',text:'Alongside the renders, I can prepare web-sized exports, descriptive filenames, alt text and image descriptions, plus embedded metadata where the format and publishing system support it. These assets help your team publish accessible, clearly described product imagery as part of its SEO work.',layout:'wide',figures:[
        figure(images.catalog,'Loft / catalogue render','Cream modular corner sofa isolated on a white background'),
      ]},
    ],
    process: [['Brand and campaign brief','We define the audience, desired feeling, product references, brand guidelines and the full list of images and formats.'],['Visual direction and production','I prepare a sample image for approval, then develop the series with 3D, AI or a combination of both, including the agreed material variants.'],['Review and delivery','We review product details and consistency across the series. I deliver the final formats and agreed image metadata for your publishing team.']],
    brief: 'Send your brand guidelines, product photos or 3D models, material samples and campaign references. Include the launch date, required product variants, channels and approximate number of visuals. We can then define the visual direction and production scope.',
    questions: [
      ['Can you create the full visual campaign for a product launch?','Yes. I can develop the visual concept and create a coordinated set of campaign images, product views, lifestyle scenes and format adaptations. We agree on the deliverables and channels before production.'],
      ['Can you show different fabrics and colours?','Yes. I can prepare multiple material and colour versions of the same product. Reference samples and an approved image help keep the series consistent.'],
      ['How do you combine AI with 3D?','I choose the workflow for the product and the required level of accuracy. A 3D model can define geometry and camera views, while AI supports scene development and image variations. I check and refine the final visuals against the approved references.'],
      ['Can you prepare image metadata for SEO?','Yes. I can deliver descriptive filenames, alt text and image descriptions alongside the exports, and embed supported metadata. The website team can use these when publishing the images; search visibility also depends on the page and its implementation.'],
    ],
  },
  sk: {
    slug: 'marketing-online-prezentacia', name: 'Marketing a online prezentácia', title: 'Vizuálny obsah a produktové kampane pre značky | SHAPEVIZ',
    description: 'Vizuálny obsah v identite vašej značky: produktové kampane, varianty látok a farieb, vlastné AI a 3D workflowy aj obrázky a podklady pre SEO.',
    intro: 'Tvorím vizuálny obsah v identite vašej značky. Mojím cieľom sú obrazy, ktoré vyvolajú emóciu a pomôžu človeku zapamätať si značku, ktorá za nimi stojí. Od uvedenia produktu na trh až po celý katalóg prepájam kreatívny smer, 3D a vlastné AI workflowy do jednotnej série vizuálov pre web, reklamu a sociálne siete.',
    imageAlt: 'Kampaňový vizuál stoličky Sierra s detailom textúry čalúnenia', caption: 'Sierra / kampaňový vizuál',
    heroNote: 'Vizuálny obsah pre značky',
    heroImages: [
      figure(images.sierra,'Sierra / materiál a detail','Kampaňový plagát s detailom zelenej čalúnenej stoličky Sierra'),
      figure(images.valentina,'Valentina / produktová kampaň','Kampaňový plagát s horčicovožltou stoličkou Valentina a produktovou typografiou'),
      figure(images.campaign,'Zing Denim / kampaňový vizuál','Denimové tenisky na tmavomodrom pozadí s typografiou kampane Zing Denim'),
    ],
    scopeTitle: 'Od identity značky po vizuály kampane',
    deliverables: [
      ['Vizuálny smer vašej značky', 'Pracujem s vašimi farbami, typografiou a vizuálnym jazykom, aby produktové obrázky mali jednotný charakter. Svetlo, kompozícia a detaily materiálov podporujú emóciu, ktorú si má človek spojiť s vašou značkou.'],
      ['Kampane pri uvedení produktu', 'Pripravím kompletný vizuálny obsah pre launch: hlavný kampaňový vizuál, produktové pohľady, lifestyle scény, detaily aj verzie pre web, reklamu a sociálne siete. Súčasťou produkcie môžu byť farebné, látkové a materiálové varianty produktu.'],
      ['Vlastné AI workflowy a 3D', 'Pre rýchlejšiu tvorbu a produkciu väčšieho množstva obrázkov si vytváram vlastné AI workflowy. Vizuály viem tvoriť pomocou AI aj v kombinácii s 3D, ktoré umožňuje kontrolovať tvar produktu, kameru, materiály a kompozíciu. Výstupy kontrolujem a dolaďujem podľa schválených produktových referencií a vizuálneho smeru.'],
    ],
    stories: [
      {id:'brand-emotion',label:'Nábytok / lifestyle a detaily',title:'Vizuály, ktoré zanechajú emóciu',text:'Mäkké svetlo v interiéri, ruka na vankúši či detail štruktúry látky dávajú produktu ľudský rozmer. Týmito detailmi približujem pohodlie a charakter materiálu. Mojím cieľom je, aby si človek spolu s pocitom z obrázka lepšie zapamätal aj značku.',layout:'compact',figures:[
        figure(images.interior,'Loft / lifestyle scéna','Béžová modulárna sedačka v slnečnom interiéri s vysokými oknami a parketami'),
        figure(images.closeup,'Loft / tvar a svetlo','Detail podrúčky a vankúšov béžovej sedačky v teplom slnečnom svetle'),
        figure(images.touch,'Loft / dotyk a pohodlie','Ruka položená na vankúši jemne osvetlenej béžovej sedačky'),
        figure(images.boucle,'Loft / detail čalúnenia','Ruka sa dotýka štruktúrovaného krémového čalúnenia modulárnej sedačky'),
      ]},
      {id:'product-variants',label:'Uvedenie produktu / materiálové varianty',title:'Jeden produkt, viac možností',text:'Nová kolekcia často potrebuje viac než jedno vyhotovenie. Pripravím farebné a látkové varianty v rovnakej kompozícii, aby si zákazník vedel porovnať jednotlivé možnosti. Vzhľad každej verzie vychádza zo schválených materiálov a referenčných vzoriek.',layout:'compact',figures:[
        figure(images.cream,'Krémová / tkaná látka','Roh modulárnej sedačky s krémovým tkaným čalúnením'),
        figure(images.brown,'Hnedá / materiálový variant','Rovnaká kompozícia sedačky s hnedým čalúnením s patinovanou štruktúrou'),
        figure(images.grey,'Sivá / látkový variant','Rovnaká kompozícia sedačky so sivým tkaným čalúnením'),
        figure(images.blue,'Modrá / látkový variant','Rovnaká kompozícia sedačky s modrým tkaným čalúnením'),
      ]},
      {id:'launch-content',label:'Zing Denim / séria vizuálov',title:'Ucelená séria pre launch produktu',text:'Kampaň môže prepájať čistý produktový záber s typografickým plagátom, detailmi a lifestyle pohľadmi. Sériu prispôsobujem značke a plánovanému použitiu. Vlastné AI workflowy a 3D zapájam tam, kde umožnia dosiahnuť najlepší výsledok s kontrolou nad tvorbou.',layout:'compact',figures:[
        figure(images.shoe,'Zing Denim / produktový pohľad','Svetlá denimová teniska z profilu na bielom pozadí s logom Barebarics'),
        figure(images.poster,'Zing Denim / kampaňový plagát','Teniska na zdvihnutej nohe s typografiou Zing Denim a logom Barebarics'),
        figure(images.detail,'Zing Denim / detail produktu','Čelný detail svetlej denimovej tenisky na zdvihnutej nohe'),
        figure(images.lifestyle,'Zing Denim / lifestyle záber','Svetlá denimová teniska na nohe v exteriéri s výrazným slnečným svetlom'),
      ]},
      {id:'web-delivery',label:'Web a katalóg / odovzdanie obrázkov',title:'Pripravené pre online prezentáciu',text:'K renderom viem pripraviť exporty vo veľkostiach vhodných na web, popisné názvy súborov, alternatívne texty a popisy obrázkov. Doplním aj vložené metadáta tam, kde ich podporuje formát a publikačný systém. Váš tím tak dostane podklady na prístupné a zrozumiteľne popísané produktové obrázky v rámci práce na SEO.',layout:'wide',figures:[
        figure(images.catalog,'Loft / katalógový render','Krémová modulárna rohová sedačka na bielom pozadí'),
      ]},
    ],
    process: [['Značka a zadanie kampane','Dohodneme cieľovú skupinu, požadovanú emóciu, produktové referencie, pravidlá značky a zoznam obrázkov aj formátov.'],['Vizuálny smer a produkcia','Pripravím ukážkový vizuál na schválenie a následne vytvorím sériu pomocou 3D, AI alebo ich kombinácie vrátane dohodnutých materiálových variantov.'],['Kontrola a odovzdanie','Spoločne skontrolujeme detaily produktu a jednotnosť série. Odovzdám finálne formáty a dohodnuté metadáta k obrázkom pre tím, ktorý ich publikuje.']],
    brief: 'Pošlite pravidlá vizuálnej identity, fotografie alebo 3D modely produktov, vzorky materiálov a referencie kampane. Doplňte termín uvedenia produktu, potrebné varianty, kanály použitia a približný počet vizuálov. Podľa toho nastavíme vizuálny smer a rozsah produkcie.',
    questions: [
      ['Viete vytvoriť celú vizuálnu kampaň pre uvedenie produktu?','Áno. Pripravím vizuálny koncept a nadväzujúcu sériu kampaňových obrázkov, produktových pohľadov, lifestyle scén a formátových verzií. Výstupy a kanály použitia si dohodneme pred produkciou.'],
      ['Viete ukázať rôzne látky a farby?','Áno. Rovnaký produkt viem pripraviť vo viacerých materiálových a farebných verziách. Referenčné vzorky a schválený vizuál pomáhajú udržať celú sériu jednotnú.'],
      ['Ako kombinujete AI s 3D?','Postup volím podľa produktu a požadovanej presnosti. 3D model môže určiť geometriu a pohľady kamery, AI pomáha pri tvorbe scén a obrazových variácií. Finálne vizuály kontrolujem a dolaďujem podľa schválených referencií.'],
      ['Pripravíte aj metadáta obrázkov pre SEO?','Áno. K exportom viem dodať popisné názvy súborov, alternatívne texty a popisy a vložiť podporované metadáta. Správca webu ich použije pri publikovaní obrázkov; viditeľnosť vo vyhľadávaní závisí aj od samotnej stránky a jej spracovania.'],
    ],
  },
};
