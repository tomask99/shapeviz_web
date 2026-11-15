export const seoFields = [
  {name:'heading', label:'Product name', max:160, hint:'The main heading on your product page.'},
  {name:'slug', label:'Page address', max:100, hint:'Use descriptive words, for example sv-textures-blender-pbr-generator.'},
  {name:'title', label:'SEO title', max:120, hint:'Aim for around 50–60 characters. Include the product and its main use.'},
  {name:'description', label:'Meta description', max:320, multiline:true, hint:'Summarize the benefit in roughly 140–160 characters.'},
  {name:'focusPhrase', label:'Target search phrase', max:160, hint:'A writing guide for this page, for example Blender PBR texture generator.'},
  {name:'image', label:'Cover image URL', max:2048, hint:'Loaded from Gumroad. Used on the page and when sharing a link.'},
  {name:'imageAlt', label:'Cover image description', max:300, hint:'Describe what the image shows.'},
  {name:'body', label:'Product description', max:12000, multiline:true, hint:'Explain what it does, who it helps and how to use it. Separate paragraphs with a blank line.'},
  {name:'features', label:'Key features', max:4000, multiline:true, hint:'One feature per line. Include features available in the current release.'},
  {name:'compatibility', label:'Compatibility and requirements', max:2000, multiline:true, hint:'Supported software versions, operating systems and hardware requirements.'},
];

export function productPagePath(product) {
  return product.seo?.enabled && product.seo.slug ? '/shop/' + product.seo.slug : null;
}
