// Seed only: deployed content lives in the database and remains fully editable.
// Never use this file as a public fallback (that would resurrect an unpublished article).
const text = value => ({type:'text',text:value});
const p = (...parts) => ({type:'paragraph',content:parts.map(part=>typeof part==='string'?text(part):part)});
const h = title => ({type:'heading',attrs:{level:2},content:[text(title)]});
const h3 = title => ({type:'heading',attrs:{level:3},content:[text(title)]});
const strong = value => ({...text(value),marks:[{type:'bold'}]});
const link = (label,href) => ({...text(label),marks:[{type:'link',attrs:{href}}]});
const image = (name,alt,title,width=1600,height=1600) => ({type:'image',attrs:{src:`/media/articles/${name}.webp`,alt,title,width,height}});
const list = (...items) => ({type:'bulletList',content:items.map(item=>({type:'listItem',content:[p(item)]}))});
export const firstArticle = {
  slug:'how-to-create-pbr-maps',
  title:'How to create PBR maps: from a flat texture to a believable material',
  excerpt:'A practical introduction to base color, roughness, normal and height maps: what each one does, how to build a usable set, and how to get started in Blender with SV Textures.',
  seo_title:'How to Create PBR Maps: A Practical Beginner’s Guide | Shapeviz',
  seo_description:'Learn what PBR texture maps do and how to create them. Explore base color, roughness, normal and height, with a beginner-friendly SV Textures workflow in Blender.',
  status:'published',
  cover:{src:'/media/articles/wood-pbr-material.webp',alt:'Wood floor PBR material rendered on a sphere, showing the surface under studio lighting',title:'WoodFloor051 material preview by ambientCG, CC0. An example material, not an SV Textures output.',width:1600,height:1600},
  content:{type:'doc',content:[
    p('A photograph can show the grain of wood. On its own, it cannot tell a renderer which patches should reflect a sharp highlight or where a small groove should catch the light. PBR maps split those jobs into separate images, so a surface can respond to the lighting in your scene.'),
    p('This guide follows a common metallic/roughness workflow. You can use the same ideas for furniture visualization, product renders, game assets and reusable material libraries.'),
    h('What are PBR maps, and why use them?'),
    p('PBR stands for physically based rendering. A PBR material combines a shader with values or image maps that describe different surface properties. The aim is a material that behaves consistently as lighting and viewing angles change.'),
    p('Imagine a wooden tabletop. Its color tells you what kind of wood it is. Its finish controls the reflections. Fine grain affects the shading, while deeper joints may need actual geometry. Keeping these properties separate makes the material easier to adjust and reuse.'),
    p('PBR does not make every texture realistic automatically. The source image, map values, real-world scale and lighting still need to agree.'),
    h('The texture maps you actually need'),
    h3('Base color: the surface appearance'),
    p('Base color provides the visible color information. For a wood or stone surface, aim for even illumination with as little baked-in shadow and reflected glare as possible. Otherwise those highlights and shadows stay painted onto the surface when the scene light moves.'),
    image('wood-base-color','Base color map of narrow wooden floorboards with visible grain','Base color preview from ambientCG WoodFloor051 (CC0). This is color information, not a finished shader.'),
    h3('Roughness: how reflections spread'),
    p('Roughness controls the spread of reflections. In the common roughness convention, darker values produce sharper reflections and lighter values produce broader, softer ones. A glossiness map uses the opposite convention; check which input your renderer expects.'),
    p('Do not assume dark wood grain must be glossy. Color and roughness describe different properties. Use the surface finish as your reference.'),
    image('wood-roughness','Grayscale roughness map of the same wooden floorboards','Roughness preview from ambientCG WoodFloor051 (CC0). The pattern varies the finish independently of color.'),
    h3('Metallic: exposed metal or non-metal'),
    p('Wood, fabric and most painted surfaces are non-metallic. In a metallic/roughness workflow, start them at 0. Exposed metal typically uses 1; mixed surfaces need a mask. A shiny surface is not necessarily metallic.'),
    h3('Normal: small detail without extra geometry'),
    p('A normal map changes the surface direction used for shading. It can suggest pores, grain and fine scratches without adding polygons. It does not change the silhouette of the model.'),
    image('wood-normal','Purple and blue normal map encoding the grain and seams of wooden boards','Normal preview from ambientCG WoodFloor051 (CC0), supplied in DirectX convention. Blender normally uses OpenGL normals; match the convention when importing.'),
    h3('Height and ambient occlusion: relief and cavities'),
    p('A height map represents relative surface elevation. Used as bump, it changes shading; used for displacement in a compatible setup, it can move the surface. Real displacement needs enough geometric detail and suitable renderer settings.'),
    p('Ambient occlusion (AO) describes local occlusion around recesses. Use it where your target shader or asset pipeline expects it. Strong AO multiplied into the base color can create permanent dark patches, especially when the renderer already calculates occlusion.'),
    p('For the input definitions, see the ',link('Blender Principled BSDF documentation','https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html'),'. For normal direction and color-space requirements, see the ',link('Normal Map node documentation','https://docs.blender.org/manual/en/latest/render/shader_nodes/displacement/normal_map.html'),'.'),
    h('How to create a useful PBR texture set'),
    h3('1. Start with a clean source'),
    p('Choose an image you have permission to use. If you photograph a surface, frame it as square-on as practical and prefer soft, even lighting. Avoid heavy glare, strong cast shadows and obvious perspective distortion. Keep an untouched original.'),
    p('A photo is a starting point, not a measurement of every material property. Maps inferred from a single image are estimates. A dark mark might be pigment, a recess or a shadow; you still need to judge the result.'),
    h3('2. Correct the color and check repetition'),
    p('Reduce broad lighting differences before deriving other channels. If the texture needs to tile across a large object, repair the seams and inspect several repetitions. Look for repeated knots, dark corners and visible grid lines, not just the four edges.'),
    h3('3. Build and refine the channels'),
    p('Derive or author roughness, height and normal maps, then tune them independently. Start with subtle detail. Use a constant metallic value for a uniform non-metal surface rather than generating a noisy metallic map that has no physical reason to exist.'),
    p('A useful test is to temporarily replace the base color with a neutral value. If the material only looks convincing when a photographed shadow is visible, the other channels need more work.'),
    h3('4. Test under more than one light'),
    p('Preview the material on a simple object and on the intended model. Check it under a broad soft light and a smaller directional light. Rotate the view, inspect grazing angles, and compare the texture scale with the real object. Fix the material before compensating with dramatic lighting.'),
    h3('5. Export for the destination'),
    p('Keep channel names and dimensions consistent. Choose resolution for how close the camera will get, rather than exporting every asset at the largest size. Use lossless formats where precision matters; a height map may benefit from 16-bit output to reduce visible stepping.'),
    p('Check the target renderer’s roughness/glossiness convention, normal direction and any packed-channel layout. A texture set that looks correct in one preview can look wrong if another application interprets the files differently.'),
    h('A few Blender setup checks'),
    list('Use the intended color space for each image. Base color is usually sRGB; roughness, metallic, normal and height contain data and normally use Non-Color.','Feed a tangent-space normal texture into a Normal Map node, then connect that node to the shader’s Normal input. Do not treat the purple image as ordinary color.','Match the normal map to the model’s UVs and convention. Blender normally expects OpenGL; DirectX reverses the green-channel direction.','Keep height strength modest and verify the displacement setup before expecting the model’s silhouette to change.'),
    p('See Blender’s ',link('Image Texture node documentation','https://docs.blender.org/manual/en/latest/render/shader_nodes/textures/image.html'),' and ',link('displacement guidance','https://docs.blender.org/manual/en/latest/render/materials/components/displacement.html'),' when wiring the maps into a material.'),
    h('A simpler starting point with SV Textures'),
    p(strong('SV Textures brings this workflow into one Blender workspace.'),' Load a diffuse texture, balance broad lighting differences, make it seamless, and inspect the repeat. Generate and refine roughness, height and normal maps, then export the channels you need. You can also import an existing PBR set and improve individual maps.'),
    p('New to Blender? Start with the ready-made preview plane instead of building a scene. That gives you a manageable first workflow: load an image, inspect the material, adjust a channel and export. You do not need to begin by modeling an object or arranging a render scene.'),
    {type:'blockquote',content:[p('SV Textures is a Blender add-on, not a standalone application. You need Blender installed. The focused workspace makes it approachable for people who do not normally work in Blender, but there is still a short setup and learning step.')]},
    p('Before buying, check the current Blender, operating system and GPU requirements on the product page. The sample wood material shown here comes from ambientCG and is illustrative; it was not generated with SV Textures.'),
    p(link('Explore SV Textures and its features','/shop/sv-textures-blender-pbr-generator'),' to see whether the workflow fits your next material.'),
    {type:'horizontalRule'},
    p('Image credits: ',link('WoodFloor051 by ambientCG','https://ambientcg.com/a/WoodFloor051'),', licensed under ',link('CC0 1.0 Universal','https://docs.ambientcg.com/license/'),'. Images have been resized and optimized for this guide. These web previews are illustrations, not production-ready texture downloads.'),
  ]}
};
