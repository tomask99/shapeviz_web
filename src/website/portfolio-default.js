import {portfolioProjects, portfolioHero} from './portfolio-projects.js';

const asset = (folder, name, width, height) => ({
  src: `/media/${folder}/${name}-1920.webp`,
  small: `/media/${folder}/${name}-720.webp`,
  width, height, smallWidth: 720,
});
const projects = [...portfolioProjects,
  {id:'architecture', name:['Architektúra','Architecture'], category:['Exteriéry / vizualizácie','Exteriors / visualization'], text:['Materiály, mierka a nálada miesta. Architektúra ešte pred realizáciou.','Materials, scale and a sense of place. Architecture before it is built.'], layout:'architecture', images:[
    [asset('architecture','brick-panorama',1920,640), 'Panoráma tehlovej vily s oblými fasádami a čiernym autom', 'Panoramic view of a curved brick villa with a black car'],
    [asset('architecture','apartments-entrance',1920,1920), 'Kamenný bytový komplex s drevenými lamelami', 'Stone apartment complex with timber screens'],
    [asset('architecture','forest-front',1920,2133), 'Dom zasadený do lesného prostredia', 'House set in a forest landscape'],
  ]},
  {id:'craft', name:['Za výsledným obrazom','Behind the image'], category:['Modelovanie / čalúnenie','Modeling / upholstery'], text:['Objem, záhyby a švy. Detail sa začína už v modeli.','Volume, folds and seams. Detail begins with the model.'], images:[
    [asset('modeling','model-6',1852,958), 'Modelované záhyby a prešívanie čalúnenia', 'Modeled upholstery folds and tufting'],
    [asset('modeling','model-5',1770,1006), 'Topológia čalúnenia v drôtenom náhľade', 'Upholstery topology in wireframe view'],
  ]},
];
const software = ['Blender', '3ds Max', 'Houdini', 'Substance Painter', 'Marvelous Designer', 'Adobe Photoshop', 'Adobe After Effects', 'Adobe Premiere Pro', 'Archicad', 'AutoCAD'].join('\n');
const engines = ['Cycles', 'V-Ray', 'Corona Renderer', 'Octane', 'Karma'].join('\n');

function localized(fields) {
  return Object.fromEntries(['sk', 'en'].map((lang, index) => [lang,
    Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value[index] : value])),
  ]));
}
function image([asset, sk = '', en = '']) {
  return {...asset, copy: localized({caption: [sk, en], alt: [sk, en]})};
}
function block(id, type, fields, images = [], layout) {
  return {id, type, copy: localized(fields), images: images.map(image), ...(layout ? {layout} : {})};
}

export const defaultPortfolio = {
  logo: image([{src:'/media/shapeviz-logo.webp', width:360, height:75}]),
  copy: localized({
    brand: 'Shapeviz', brandUrl: ['/sk','/en'],
    title: 'Tomáš Krajčovič / Portfolio / SHAPEVIZ',
    description: [
      '3D artist a zakladateľ Shapeviz. Vybrané projekty z produktového modelovania, vizualizácií nábytku, interiérov a architektúry.',
      '3D artist and founder of Shapeviz. Selected projects in product modeling, furniture visualization, interiors and architecture.',
    ],
    footer: '© {year} SHAPEVIZ', back: ['Späť na začiatok','Back to top'],
    skip: ['Prejsť na obsah','Skip to content'], menu: ['Navigácia portfólia','Portfolio navigation'],
    language: ['Jazyk','Language'], skLink:'SK', enLink:'EN', skName: 'Slovenčina', enName: 'English',
    enlarge: ['Zväčšiť obrázok','Enlarge image'], close: ['Zavrieť náhľad','Close enlarged image'],
    openLink: ['Otvoriť odkaz obrázka','Open image link'], projectIndex: ['Prejsť na projekt','Jump to project'],
    contribution: ['Moja práca','My contribution'], credit: ['Spolupráca','Collaboration'],
    gallery:['Otvoriť galériu','Open gallery'], projectDetails:['O projekte','Project details'],
    previousImage:['Predchádzajúci obrázok','Previous image'], nextImage:['Nasledujúci obrázok','Next image'],
  }),
  blocks: [
    block('intro', 'intro', {
      kicker:'3D ARTIST / SHAPEVIZ', title:'Tomáš', secondTitle:'Krajčovič.',
      text:['Tvorím objekty, priestory a obrazy,\nktoré vo vás niečo zanechajú.','I create objects, spaces and images\nthat leave an impression.'],
      button:['Vybrané práce','Selected work'], url:'#work',
    }),
    block('cover', 'cover', {}, [[portfolioHero,
      'MCM Worldwide / tvorba 3D prostredia v spolupráci s The New Face',
      'MCM Worldwide / 3D environment creation with The New Face',
    ]]),
    block('work', 'index', {title:['Projekty a spolupráce','Projects and collaborations'], nav:['Práce','Work']}),
    ...projects.map(project => block(project.id, 'project', {
      title: project.name, kicker: project.category, text: project.text, credit: project.collaboration || '',
      items: project.contributions?.map(items => items.join('\n')) || '',
      button: project.url ? ['Pozrieť video (nová karta)','Watch video (new tab)'] : '',
      url: project.url || '',
    }, project.images, project.layout || 'pair')),
    block('services', 'services', {
      sectionLabel:['Služby','Services'], kicker:['01 / GEOMETRIA','01 / GEOMETRY'],
      title:['Modelovanie','Modeling'],
      text:['Nábytok, produkty a prostredia. Od proporcií po posledný šev, s čistou topológiou a UV mapovaním.','Furniture, products and environments. From proportions to the last seam, with clean topology and UV mapping.'],
      secondKicker:['02 / ATMOSFÉRA','02 / ATMOSPHERE'], secondTitle:['Vizualizácie','Visualization'],
      secondText:['Produktové CGI, interiéry a architektúra. Materiály, svetlo a kompozícia, ktoré dávajú obrazu charakter.','Product CGI, interiors and architecture. Materials, light and composition that give an image its character.'],
    }),
    block('about', 'about', {
      nav:['O mne','About'], kicker:['Človek za obrazmi','The person behind the images'],
      title:['Viac než desať rokov\nvo svete 3D.','Over ten years\nin the world of 3D.'],
      text:[
        'Som Tomáš, 3D artist a zakladateľ Shapeviz. Mám vzdelanie v pozemnom staviteľstve a architektúre. Technickú presnosť spájam s citom pre materiál, svetlo a atmosféru.\n\nSpolupracujem s dizajnérmi, výrobcami nábytku a CGI štúdiami. Ako súčasť medzinárodných tímov som sa podieľal aj na projektoch pre Prada a Hugo Boss.',
        'I’m Tomáš, a 3D artist and founder of Shapeviz, with a background in building construction and architecture. I combine technical precision with a feel for materials, light and atmosphere.\n\nI work with designers, furniture manufacturers and CGI studios. As part of international teams, I have also contributed to projects for Prada and Hugo Boss.',
      ],
      itemsTitle:['Softvérové skúsenosti','Software experience'], items:software,
      secondItemsTitle:['Renderovacie enginy','Render engines'], secondItems:engines,
    }, [[{src:'/media/tomas-krajcovic-960.webp', small:'/media/tomas-krajcovic-480.webp', width:960, height:960, smallWidth:480},
      'Tomáš Krajčovič / Shapeviz', 'Tomáš Krajčovič / Shapeviz',
    ]]),
    block('contact', 'contact', {
      nav:['Kontakt','Contact'], kicker:['Ďalší projekt môže byť váš','The next project could be yours'],
      title:['Vytvorme niečo\nspolu.','Let’s create\nsomething together.'],
      button:'shapeviz3d@gmail.com', url:'mailto:shapeviz3d@gmail.com',
      secondButton:['Alebo mi pošlite zadanie cez formulár','Or send your brief using the contact form'],
      secondUrl:['/sk#project-form','/en#project-form'],
    }),
  ],
};
