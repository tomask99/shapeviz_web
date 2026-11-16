// Shared profile validation fields and initial copy for profiles that have not been saved yet.
export const aboutFields = [
  {
    "key": "sectionLabel",
    "label": "Section label",
    "maxLength": 100,
    "multiline": false
  },
  {
    "key": "experience",
    "label": "Experience label",
    "maxLength": 100,
    "multiline": false
  },
  {
    "key": "name",
    "label": "Name",
    "maxLength": 100,
    "multiline": false
  },
  {
    "key": "role",
    "label": "Role",
    "maxLength": 120,
    "multiline": false
  },
  {
    "key": "imageAlt",
    "label": "Photo description",
    "maxLength": 200,
    "multiline": false
  },
  {
    "key": "heading",
    "label": "Heading",
    "maxLength": 100,
    "multiline": false
  },
  {
    "key": "headingAccent",
    "label": "Highlighted heading",
    "maxLength": 100,
    "multiline": false
  },
  {
    "key": "cta",
    "label": "Contact link label",
    "maxLength": 100,
    "multiline": false
  },
  {
    "key": "bio",
    "label": "About me text",
    "maxLength": 10000,
    "multiline": true
  }
];

export const defaultAbout = {
  "sk": {
    "sectionLabel": "03 / ZA ZNAČKOU SHAPEVIZ",
    "experience": "DEKÁDA V 3D GRAFIKE",
    "imageAlt": "Tomas Krajcovic, 3D grafik a zakladateľ Shapeviz",
    "name": "TOMAS KRAJCOVIC",
    "role": "3D GRAFIK / ZAKLADATEĽ",
    "heading": "ZA SHAPEVIZ",
    "headingAccent": "STOJÍM JA.",
    "cta": "VYTVORME NIEČO SPOLU",
    "bio": "Som Tomas Krajcovic a za značkou Shapeviz stojím ja. Už dekádu sa venujem 3D grafike a najviac ma na nej baví vytvárať realitu pomocou svetla, materiálov a detailov.\n\nŠpecializujem sa na high-end 3D modely a fotorealistické rendery. Blízka je mi aj architektúra a kreatívne projekty, v ktorých je priestor skúšať nové nápady a dať im konkrétnu podobu.\n\nPočas svojej tvorby som sa podieľal na projektoch pre značky Prada, Pucci, Mazda, Milenium či MCM — na priamych zákazkách aj v spolupráci s kreatívnymi partnermi."
  },
  "en": {
    "sectionLabel": "03 / BEHIND SHAPEVIZ",
    "experience": "A DECADE IN 3D",
    "imageAlt": "Tomas Krajcovic, 3D artist and founder of Shapeviz",
    "name": "TOMAS KRAJCOVIC",
    "role": "3D ARTIST / FOUNDER",
    "heading": "THE PERSON",
    "headingAccent": "BEHIND SHAPEVIZ.",
    "cta": "LET’S CREATE SOMETHING",
    "bio": "I’m Tomas Krajcovic, the person behind Shapeviz. I’ve spent the past decade working in 3D graphics, and what I enjoy most is creating a sense of reality through light, materials and detail.\n\nI specialise in high-end 3D models and photorealistic renders. Architecture is another passion of mine, and I’m drawn to creative projects that leave room to explore ideas and bring something new to life.\n\nOver the years, I’ve contributed to projects for brands including Prada, Pucci, Mazda, Milenium and MCM, through direct commissions and collaborations with creative partners."
  }
};
