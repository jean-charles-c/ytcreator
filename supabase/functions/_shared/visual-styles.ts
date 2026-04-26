/**
 * Shared visual style definitions for edge functions.
 * Must stay in sync with src/components/editor/visualStyle/types.ts
 */

export interface StyleDef {
  label: string;
  promptSuffix: string;
  /** French version for generate-storyboard prompts */
  promptSuffixFr: string;
}

export const STYLE_SUFFIXES: Record<string, StyleDef> = {
  none: {
    label: "Aucun style imposé",
    promptSuffix: "No specific artistic style enforced. Let the model freely interpret the subject matter. Focus purely on the content, composition, and lighting without any stylistic constraint or artistic reference.",
    promptSuffixFr: "Aucun style artistique imposé. Laisser le modèle interpréter librement le sujet. Se concentrer uniquement sur le contenu, la composition et l'éclairage sans contrainte stylistique.",
  },
  realistic: {
    label: "Réaliste / Photographique",
    promptSuffix: "Ultra-realistic photographic rendering. Shot on a high-end DSLR or medium format camera. Natural or studio lighting with accurate shadows and highlights. Sharp focus on the subject with realistic bokeh background blur. True-to-life skin textures, fabric weaves, surface imperfections and material reflections. No painterly or illustrated treatment. No visible brushstrokes or artistic stylization whatsoever.",
    promptSuffixFr: "Style : rendu photographique ultra-réaliste. Prise de vue DSLR haut de gamme. Éclairage naturel ou studio avec ombres et hautes lumières précises. Mise au point nette avec bokeh réaliste. Textures réalistes de peau, tissus, imperfections de surface. Aucun traitement pictural ni stylisation.",
  },
  cinematic: {
    label: "Cinématographique",
    promptSuffix: "Cinematic film-quality composition. Widescreen 2.39:1 aspect ratio. Dramatic directional lighting with deep shadows and strong contrast. Color graded with a cinematic LUT (teal and orange, bleach bypass, or period-accurate palette). Subtle film grain, slight lens flare, shallow depth of field. Feels like a single frame from a major motion picture. Strong narrative atmosphere and mood.",
    promptSuffixFr: "Style : composition cinématographique de qualité film. Format large 2.39:1. Éclairage directionnel dramatique avec ombres profondes et fort contraste. Étalonnage LUT cinématographique. Grain de film subtil, léger flare, faible profondeur de champ. Atmosphère narrative forte.",
  },
  illustration: {
    label: "Illustration",
    promptSuffix: "Editorial or book illustration style. Clean confident linework with flat or semi-flat color fills. Shapes are simplified but expressive and well-composed. Suitable for a magazine cover, children's book, or editorial spread. Influenced by mid-century modern illustration or contemporary digital editorial art. Warm and inviting palette, balanced composition, no photorealistic textures.",
    promptSuffixFr: "Style : illustration éditoriale ou de livre. Lignes nettes avec aplats de couleurs. Formes simplifiées mais expressives. Style d'illustration mid-century ou éditoriale numérique contemporaine. Palette chaleureuse, composition équilibrée.",
  },
  painting: {
    label: "Peinture",
    promptSuffix: "Traditional oil or acrylic painting. Visible impasto brushstrokes with rich paint texture. Canvas grain subtly showing through. Figurative or expressionist rendering with a warm, deep color palette. Influenced by classical masters or contemporary realist painters. Dynamic interplay of light and shadow, glazing effects, tactile and physical feel to the image.",
    promptSuffixFr: "Style : peinture traditionnelle à l'huile ou acrylique. Coups de pinceau empâtés visibles avec texture riche. Grain de toile subtil. Rendu figuratif ou expressionniste avec palette chaude et profonde. Jeu dynamique de lumière et d'ombre.",
  },
  watercolor: {
    label: "Aquarelle",
    promptSuffix: "Traditional watercolor painting on cold-press textured paper. Soft wet-on-wet color bleeds and transparent layered washes. Visible paper grain and white paper showing through in highlights. Loose and expressive brushwork, slightly uneven edges, gentle color blooms. Delicate and luminous overall feel. Pencil sketch underdrawing faintly visible. No hard digital edges or flat fills.",
    promptSuffixFr: "Style : aquarelle traditionnelle sur papier texturé. Couleurs fondues en mouillé sur mouillé, lavis transparents superposés. Grain du papier visible. Traits expressifs et bords irréguliers. Rendu délicat et lumineux. Esquisse au crayon subtilement visible.",
  },
  lineart: {
    label: "Dessin / Line art",
    promptSuffix: "Pure line art drawing, black ink on white background. Clean precise contours with confident pen or technical nib strokes. Minimal or no color fill. Shading achieved through crosshatching, stippling or parallel lines only. Style references technical illustration, editorial pen drawing or graphic novel inking. No soft gradients, no digital airbrushing.",
    promptSuffixFr: "Style : dessin au trait pur, encre noire sur fond blanc. Contours nets et précis. Ombrage par hachures croisées, pointillés ou lignes parallèles uniquement. Référence : illustration technique, dessin à la plume éditorial. Aucun dégradé, aucun aérographe numérique.",
  },
  engraving: {
    label: "Gravure / Estampe",
    promptSuffix: "Woodcut or intaglio engraving aesthetic. Dense parallel and cross-hatched lines carved into the image. Strong black and white contrast with very limited mid-tones. Rough-edged marks and slight ink spread as in traditional printmaking. Aged paper texture in the background. Visual style references 19th century botanical engravings, Dürer woodcuts or vintage newspaper illustrations.",
    promptSuffixFr: "Style : gravure sur bois ou taille-douce. Lignes parallèles et hachures denses. Fort contraste noir et blanc avec très peu de demi-teintes. Marques aux bords rugueux. Texture de papier vieilli. Référence : gravures botaniques du XIXe, Dürer.",
  },
  artdeco: {
    label: "Art déco / Affiche vintage",
    promptSuffix: "Art Deco or retro poster aesthetic from the 1920s–1960s. Elegant geometric shapes and symmetrical ornamental patterns. Limited flat color palette with strong contrast and bold outlines. Stylized typography integrated into the composition. Influenced by Cassandre, Mucha, WPA posters or mid-century travel advertising. Slight aged paper texture or lithographic print grain optional.",
    promptSuffixFr: "Style : esthétique Art Déco ou affiche rétro des années 1920-1960. Formes géométriques élégantes et motifs ornementaux symétriques. Palette limitée d'aplats avec fort contraste. Typographie stylisée intégrée. Influence Cassandre, Mucha, affiches WPA.",
  },
  francobelge: {
    label: "BD franco-belge",
    promptSuffix: "Franco-Belgian bande dessinée style, ligne claire school. Uniform black outlines of consistent thickness with no variation in stroke weight. Flat solid color fills with no gradients or soft shadows. Highly detailed and realistic backgrounds contrasting with slightly simplified characters. Visual references: Hergé's Tintin, Franquin's Spirou, early Moebius. Clean, readable, no gritty textures.",
    promptSuffixFr: "Style : bande dessinée franco-belge, école de la ligne claire. Contours noirs uniformes d'épaisseur constante. Aplats de couleurs sans dégradés. Décors détaillés et réalistes contrastant avec personnages simplifiés. Références : Tintin, Spirou, Moebius.",
  },
  americancomics: {
    label: "Comics américain",
    promptSuffix: "American superhero comics style. Bold thick ink outlines with dynamic expressive inking. Ben-Day dot patterns in shadows and mid-tones. Highly saturated primary colors. Dramatic foreshortening, heroic poses, explosive action compositions. Visual references: Jack Kirby, Neal Adams, Jim Lee, Frank Miller. Panel-ready artwork with strong narrative energy and exaggerated anatomy.",
    promptSuffixFr: "Style : comics américain de super-héros. Contours épais à l'encre avec encrage expressif. Trames Ben-Day. Couleurs primaires saturées. Raccourcis dramatiques, poses héroïques. Références : Jack Kirby, Jim Lee, Frank Miller.",
  },
  manga: {
    label: "Manga / Manhwa / Manhua",
    promptSuffix: "Japanese manga or Asian webtoon art style. Fine clean black ink linework with screentone dot shading. Large expressive eyes with detailed catchlights. Dynamic speed lines and motion effects. Exaggerated facial expressions and emotions. Visual references: Akira Toriyama, Kentaro Miura, CLAMP, or Korean manhwa digital style.",
    promptSuffixFr: "Style : manga japonais ou webtoon asiatique. Lignes nettes à l'encre avec trames de points. Grands yeux expressifs. Lignes de vitesse et effets de mouvement. Références : Akira Toriyama, Kentaro Miura, CLAMP.",
  },
  cartoon: {
    label: "Cartoon occidental",
    promptSuffix: "Classic Western animated cartoon style. Bold thick outlines with rubbery exaggerated shapes. Flat bright solid colors, no shading or minimal cel shading. Highly expressive slapstick-ready characters with extreme poses and squash-and-stretch proportions. Visual references: Looney Tunes, Hanna-Barbera, early Disney shorts, Ren & Stimpy. Playful, energetic, immediately readable.",
    promptSuffixFr: "Style : cartoon occidental classique. Contours épais avec formes exagérées. Couleurs vives en aplats. Personnages expressifs avec proportions squash-and-stretch. Références : Looney Tunes, Hanna-Barbera, Disney.",
  },
  pixar: {
    label: "Pixar feature films",
    promptSuffix: "High-end contemporary 3D animated feature film style. Characters have appealing stylized proportions, expressive faces, clear silhouettes, and emotionally readable acting. Soft cinematic lighting with warm global illumination, subtle subsurface scattering, polished materials, and carefully balanced color grading. Environments are clean, richly designed, story-driven, and physically coherent, with strong depth, atmospheric perspective, and a premium family-adventure animation look. Avoid painterly 2D texture, anime influence, sketchy lines, or overly realistic live-action rendering.",
    promptSuffixFr: "Style : long-métrage 3D Pixar contemporain haut de gamme. Personnages aux proportions stylisées attachantes, visages expressifs, silhouettes claires, jeu émotionnellement lisible. Éclairage cinématographique doux, illumination globale chaude, subsurface scattering subtil, matériaux soignés. Environnements riches et cohérents, profondeur marquée. Éviter texture 2D peinte, influence anime, traits esquissés, rendu live-action.",
  },
  ghibli: {
    label: "Studio Ghibli backgrounds",
    promptSuffix: "Hand-painted Japanese animation background style inspired by poetic environmental storytelling. Rich painterly landscapes, soft natural light, delicate atmospheric haze, organic textures, watercolor-like surfaces, and subtle imperfections. Emphasis on nature, architecture, quiet emotional mood, and lived-in details. Characters, if present, should remain simple, gentle, and traditionally animated rather than glossy 3D. Avoid polished CGI, plastic materials, exaggerated cartoon comedy, or hyper-detailed photorealism.",
    promptSuffixFr: "Style : décors d'animation japonaise peints à la main façon Studio Ghibli. Paysages picturaux riches, lumière naturelle douce, brume atmosphérique, textures organiques, surfaces aquarellées. Accent sur la nature, l'architecture, l'atmosphère silencieuse. Personnages simples et traditionnellement animés. Éviter CGI brillant, matériaux plastiques, comédie cartoon exagérée, photoréalisme.",
  },
  dreamworks: {
    label: "DreamWorks Animation",
    promptSuffix: "Contemporary 3D animated adventure-comedy feature style. Bold character design, expressive facial acting, dynamic poses, strong silhouettes, cinematic staging, and a slightly more playful, energetic visual tone. Lighting is dramatic but colorful, with crisp contrast, vibrant environments, stylized realism, and polished 3D materials. Backgrounds should feel cinematic, readable, and designed for action or comedy timing. Avoid soft hand-painted anime backgrounds, overly delicate watercolor textures, or ultra-realistic live-action rendering.",
    promptSuffixFr: "Style : long-métrage 3D DreamWorks aventure-comédie. Design de personnages audacieux, jeu facial expressif, poses dynamiques, silhouettes fortes, mise en scène cinématographique, ton ludique et énergique. Éclairage dramatique mais coloré, fort contraste, environnements vibrants, réalisme stylisé, matériaux 3D polis. Éviter décors peints anime, aquarelle délicate, rendu live-action.",
  },
  sonyanimation: {
    label: "Sony Pictures Animation",
    promptSuffix: "Stylized contemporary animation with bold graphic design, energetic composition, expressive shapes, and a strong illustrative identity. Mix polished 3D structure with 2D-inspired texture, visible artistic stylization, dynamic lighting, vibrant color blocking, and playful exaggeration. Characters have strong silhouettes, elastic expressiveness, and a modern visual rhythm. Backgrounds can include painterly, comic-book, or design-driven textures while staying cinematic and coherent. Avoid generic glossy 3D, muted realism, traditional anime softness, or photorealistic live-action aesthetics.",
    promptSuffixFr: "Style : animation contemporaine Sony Pictures, design graphique audacieux, composition énergique, formes expressives, identité illustrative forte. Mélange structure 3D polie et texture 2D, stylisation artistique visible, éclairage dynamique, blocs de couleurs vibrants, exagération ludique. Décors picturaux, comic-book ou design-driven mais cinématographiques. Éviter 3D générique brillante, réalisme, douceur anime, photoréalisme.",
  },
  modern2dcartoon: {
    label: "Cartoon 2D moderne / Storybook",
    promptSuffix: "Modern 2D cartoon animation style with cinematic storybook illustration aesthetics. Expressive stylized characters with simplified facial features, rounded proportions, clean silhouettes, and emotional readability. Warm painterly backgrounds with soft lighting, atmospheric depth, cozy color grading, and rich environmental details. Family-friendly animated film mood, polished digital painting, gentle texture, clear composition, and narrative-driven staging. Avoid photorealism, glossy 3D CGI, anime realism, and overly sketchy hand-drawn lines.",
    promptSuffixFr: "Style : animation cartoon 2D moderne, esthétique illustration storybook cinématographique. Personnages stylisés expressifs, traits simplifiés, proportions arrondies, silhouettes nettes. Décors picturaux chaleureux, lumière douce, étalonnage cosy, détails environnementaux riches. Ambiance long-métrage familial, peinture numérique soignée, texture douce. Éviter photoréalisme, CGI 3D brillante, réalisme anime, traits esquissés.",
  },
  modern3dfeature: {
    label: "Long-métrage 3D moderne (Pixar/DreamWorks inspired)",
    promptSuffix: "Stylized 3D animated feature film style, cinematic family adventure animation, expressive cartoon characters with exaggerated proportions, polished CGI surfaces, soft global illumination, warm dramatic lighting, volumetric fire glow, rich environmental detail, dynamic composition, highly readable facial expressions, premium animated movie look. Avoid photorealism, hand-painted 2D backgrounds, anime softness, flat illustration, and sketchy linework.",
    promptSuffixFr: "Style : long-métrage d'animation 3D stylisé, aventure familiale cinématographique. Personnages cartoon expressifs aux proportions exagérées, surfaces CGI soignées, illumination globale douce, éclairage chaud dramatique, halos volumétriques, détails environnementaux riches, composition dynamique, expressions faciales très lisibles, rendu film d'animation premium. Éviter photoréalisme, décors 2D peints, douceur anime, illustration plate, traits esquissés.",
  },
  anime: {
    label: "Anime japonais",
    promptSuffix: "Contemporary Japanese anime style. Fine precise linework with carefully placed line weight variation. Large detailed eyes with layered specular highlights. Expressive hair with stylized movement. Semi-realistic background environments with anime perspective. Particle effects, lens flares and god rays used expressively. Color palette with strong contrast between lit and shadow areas. Visual references: modern seasonal anime, KyoAni, MAPPA, Ufotable visual quality.",
    promptSuffixFr: "Style : anime japonais contemporain. Lignes fines et précises. Grands yeux détaillés avec reflets spéculaires. Cheveux expressifs. Décors semi-réalistes. Effets de particules et rayons lumineux. Références : KyoAni, MAPPA, Ufotable.",
  },
  conceptart: {
    label: "Concept art",
    promptSuffix: "Professional concept art for game or film production. Loose exploratory brushwork with confident value structure. Strong silhouette readability at thumbnail size. Limited but purposeful color palette with one dominant accent hue. Atmospheric perspective suggesting depth and scale. Mood-defining lighting, often dramatic or mysterious. May include rough annotation marks or design notes. Visual references: Feng Zhu, Sparth, Ryan Church, ILM concept department.",
    promptSuffixFr: "Style : concept art professionnel pour jeu ou film. Coups de pinceau exploratoires. Silhouette lisible en miniature. Palette limitée avec un accent dominant. Perspective atmosphérique. Éclairage dramatique. Références : Feng Zhu, Sparth, ILM.",
  },
  pixelart: {
    label: "Pixel art / Jeu vidéo rétro",
    promptSuffix: "Authentic retro pixel art style. Strict pixel grid visible at native resolution. Severely limited color palette of 16 to 32 colors maximum. Hard aliased edges, no anti-aliasing. Dithering patterns used for shading and gradients. Character sprites and tilesets designed at low resolution (16x16 to 64x64 base). Visual references: NES, SNES, Mega Drive era games, early Capcom and Konami sprite work.",
    promptSuffixFr: "Style : pixel art rétro authentique. Grille de pixels visible. Palette limitée à 16-32 couleurs. Bords aliasés sans anti-aliasing. Dithering pour les ombrages. Références : jeux NES, SNES, Mega Drive.",
  },
  lowpoly: {
    label: "Low poly",
    promptSuffix: "Low polygon 3D render aesthetic. Visible triangular or polygonal facets across all surfaces. Flat shading per face with no smoothing or interpolation. Simple directional lighting casting clean geometric shadows. Minimal texture detail, color applied per polygon. Clean, modern, slightly abstract feel. Visual references: early PS1 era aesthetics or contemporary low poly motion graphics and game art.",
    promptSuffixFr: "Style : rendu 3D low poly. Facettes triangulaires visibles. Ombrage plat par face sans lissage. Éclairage directionnel simple. Couleur par polygone. Esthétique épurée et moderne. Références : PS1, motion graphics low poly.",
  },
  isometric: {
    label: "Isométrique",
    promptSuffix: "Strict isometric projection view. True 26.565° dimetric or 30° isometric camera angle. No vanishing point perspective, all parallel lines remain truly parallel. Clean geometric architecture and objects rendered in precise orthographic view. Flat or subtly cel-shaded surfaces. Detailed but schematic aesthetic. Visual references: isometric city builders, Crossy Road, Monument Valley, strategy game UI art or technical isometric infographic illustration.",
    promptSuffixFr: "Style : projection isométrique stricte. Angle de caméra 30° isométrique. Pas de point de fuite. Lignes parallèles. Architecture géométrique en vue orthographique. Références : Monument Valley, jeux de stratégie isométrique.",
  },
  "3dcgi": {
    label: "3D / CGI",
    promptSuffix: "General purpose 3D computer-generated imagery. Realistic or semi-stylized 3D modeling with well-defined materials, specularity and normal maps. Professional studio or HDRI environment lighting. No specific style constraint beyond clean, polished render quality. Suitable for product visualization, architectural render or character turnaround.",
    promptSuffixFr: "Style : imagerie 3D généraliste. Modélisation réaliste ou semi-stylisée avec matériaux bien définis. Éclairage studio ou HDRI. Qualité de rendu soignée et professionnelle.",
  },
  "3dphotorealism": {
    label: "Photo-réalisme 3D",
    promptSuffix: "Indistinguishable from real photography. Full path-traced or ray-traced render with physically based materials. Accurate subsurface scattering on organic surfaces (skin, wax, marble). True chromatic aberration, lens distortion and depth of field blur. Realistic ambient occlusion in crevices, micro-detail surface displacement maps, proper Fresnel reflections. No render artifacts, no plastic look, no uncanny valley. Must pass as a real photograph.",
    promptSuffixFr: "Style : photo-réalisme 3D indiscernable d'une vraie photographie. Rendu ray-tracé avec matériaux physiques. Subsurface scattering, aberration chromatique, profondeur de champ. Aucun artefact, aucun aspect plastique.",
  },
  graphicdesign: {
    label: "Design graphique",
    promptSuffix: "Modern graphic design composition. Strong typographic hierarchy integrated into the layout. Geometric shapes, clean grid structure, bold use of negative space. Defined brand-style color palette of 2 to 4 colors. Flat vector aesthetic or bold print-ready style. Visual references: Swiss International Style, contemporary brand identity design, Bauhaus principles, Sagmeister & Walsh, modern editorial layout.",
    promptSuffixFr: "Style : design graphique moderne. Hiérarchie typographique forte. Formes géométriques, grille nette, espace négatif audacieux. Palette de 2 à 4 couleurs. Esthétique vectorielle. Références : Style International Suisse, Bauhaus.",
  },
  abstract: {
    label: "Abstrait",
    promptSuffix: "Fully non-figurative abstract composition. No recognizable objects, figures or scenes. Pure exploration of shape, color, rhythm, texture and spatial tension. May reference geometric abstraction (Mondrian, Albers), lyrical abstraction, color field painting (Rothko, Morris Louis) or abstract expressionism (Pollock, de Kooning). Composition should feel intentional and balanced despite absence of subject matter.",
    promptSuffixFr: "Style : composition abstraite non-figurative. Exploration pure de forme, couleur, rythme et texture. Références : Mondrian, Rothko, Pollock. Composition intentionnelle et équilibrée.",
  },
  glitchart: {
    label: "Glitch art / Expérimental",
    promptSuffix: "Digital glitch art and experimental visual aesthetic. Deliberate RGB channel misalignment and chromatic aberration. JPEG compression artifacts pushed to the extreme. Datamoshing motion blur smears. CRT scanlines and interlacing artifacts. Corrupted pixel blocks and bitcrushed color banding. Unexpected generative patterns emerging from digital errors. Visual references: Rosa Menkman, Takeshi Murata, corrupted file aesthetics, vaporwave glitch culture.",
    promptSuffixFr: "Style : glitch art numérique et esthétique expérimentale. Désalignement de canaux RGB. Artefacts de compression JPEG extrêmes. Datamoshing. Scanlines CRT. Blocs de pixels corrompus. Références : Rosa Menkman, esthétique vaporwave.",
  },
  scientific: {
    label: "Technique / Scientifique",
    promptSuffix: "Precise technical or scientific illustration. Detailed cross-section or exploded view diagram with clear labeling. Clean lines on white or light grey background. Restricted palette of black, white, grey and one or two accent colors (typically blue or red for callouts). Style references: engineering assembly manuals, medical atlas anatomy plates, natural history museum engravings, NASA technical documentation or patent drawing style.",
    promptSuffixFr: "Style : illustration technique ou scientifique précise. Coupe détaillée ou vue éclatée avec légendes. Lignes nettes sur fond blanc. Palette restreinte noir, blanc, gris avec un ou deux accents. Références : manuels techniques, atlas médical, documentation NASA.",
  },
  invertedlineart: {
    label: "Line art inversé / Chalk style",
    promptSuffix: "Background must be a flat, uniform light grey or warm off-white, strictly no pure white, no black background, no gradient, no texture. RGB values between (220,220,220) and (245,243,238) only. All linework rendered in clean, precise black ink strokes with consistent and controlled line weight. Lines are smooth, confident and slightly firm — no shakiness, no chalk texture, no scratchy marks, no hand-drawn irregularity whatsoever. Characters are drawn with clean contour outlines only. Clothing, hair and body details rendered with minimal but precise interior linework. Absolutely no crosshatching, no stippling, no engraving texture. Shadows are rendered exclusively as flat, hard-edged solid black silhouettes or shapes with no feathering, no soft edges, no gradient blending. Shadow shapes must be geometrically clean and intentional, cast directly on the floor or wall as a distinct graphic element. No more than three tonal values in the entire image: light grey background, black linework and black solid fills. No intermediate grey tones, no mid-tone fills, no white highlights added on top of figures. Figures should feel slightly stylized but anatomically grounded — not cartoonish, not manga, not superhero. Proportions close to realistic, postures natural and understated. Faces minimally detailed or deliberately left without features. Overall mood must feel like a contemporary editorial illustration for a serious press publication such as The New York Times, The New Yorker or Le Monde. Quiet, graphic, emotionally restrained, compositionally deliberate.",
    promptSuffixFr: "Style : fond gris clair uniforme ou blanc cassé chaud, strictement aucun blanc pur, aucun fond noir, aucun dégradé, aucune texture. Tout le dessin en traits d'encre noire nets et précis avec épaisseur de trait contrôlée et régulière. Lignes lisses et assurées, aucune texture de craie, aucune irrégularité. Personnages dessinés en contours nets uniquement. Aucune hachure, aucun pointillé, aucune texture de gravure. Ombres rendues exclusivement en aplats noirs à bords francs, sans dégradé ni adoucissement. Maximum trois valeurs tonales : fond gris clair, traits noirs et aplats noirs. Figures légèrement stylisées mais anatomiquement justes, proportions proches du réel, postures naturelles. Ambiance d'illustration éditoriale contemporaine pour publication de presse sérieuse. Calme, graphique, émotionnellement retenu.",
  },
  chalkblack: {
    label: "Chalk style BLACK",
    promptSuffix: "Background must be a flat, uniform pure black or very deep charcoal, strictly RGB (0,0,0) to (15,15,15) maximum. No grey background, no light tones, no gradient, no texture, no noise. All linework rendered in clean, precise white or bright off-white strokes with consistent and controlled line weight. Lines are smooth, confident and firm — no shakiness, no chalk texture, no scratchy marks, no hand-drawn irregularity whatsoever. Strokes feel like a fine white ink liner on black paper, not chalk, not crayon. Characters are drawn with clean white contour outlines only. Clothing, hair and body details rendered with minimal but precise interior white linework. Absolutely no crosshatching, no stippling, no engraving texture. Shadows and dark volumes are rendered as areas where the black background is simply left untouched and exposed. Shadow shapes must be geometrically clean, hard-edged and intentional, with no feathering, no soft blur, no gradient blending whatsoever. No more than three tonal values in the entire image: pure black background, white linework and white solid fills where necessary. No intermediate grey tones, no mid-tone fills, no grey highlights or grey strokes of any kind. Figures should feel slightly stylized but anatomically grounded — not cartoonish, not manga, not superhero. Proportions close to realistic, postures natural and understated. Faces minimally detailed or deliberately left without features. Overall mood must feel like a contemporary editorial illustration for a serious press publication, but inverted — graphic, stark, nocturnal. The black background is not a void but an active compositional element. Quiet, precise, emotionally restrained.",
    promptSuffixFr: "Style : fond noir pur uniforme, strictement RGB (0,0,0) à (15,15,15). Aucun gris, aucun dégradé, aucune texture. Tout le dessin en traits blancs nets et précis avec épaisseur contrôlée. Lignes lisses et assurées, aucune texture de craie. Personnages dessinés en contours blancs uniquement. Aucune hachure, aucun pointillé. Ombres rendues par les zones de fond noir laissées intactes, bords francs sans adoucissement. Maximum trois valeurs tonales : noir pur, traits blancs et aplats blancs. Figures stylisées mais anatomiquement justes. Ambiance d'illustration éditoriale inversée — graphique, austère, nocturne. Le fond noir est un élément de composition actif. Calme, précis, émotionnellement retenu.",
  },
  docrealism: {
    label: "Photoréalisme documentaire",
    promptSuffix: "Ultra realistic documentary photography, cinematic lighting, historical reconstruction realism. Shot as if captured by a professional photojournalist or documentary filmmaker on location. Natural available light or carefully motivated practical lighting. Cinematic film still quality, 8k detail, natural textures, real-world physics. True-to-life materials: weathered metal, worn leather, aged paint, natural patina. Period-accurate props, costumes and settings when historical context is present. No stylization, no illustration, no painterly effects. Lens characteristics of a high-end cinema prime lens: subtle vignetting, natural bokeh, accurate depth of field. Color palette faithful to the era and location depicted. Slight film grain consistent with professional motion picture stock. Every surface texture must feel tangible and physically accurate. The image must read as an authentic documentary photograph or a production still from a prestige historical drama.",
    promptSuffixFr: "Style : photographie documentaire ultra réaliste, éclairage cinématographique, réalisme de reconstruction historique. Prise de vue comme par un photojournaliste professionnel sur site. Lumière naturelle disponible ou éclairage pratique motivé. Qualité d'image fixe cinématographique, détail 8k, textures naturelles, physique réaliste. Matériaux fidèles : métal patiné, cuir usé, peinture vieillie, patine naturelle. Accessoires, costumes et décors fidèles à l'époque quand un contexte historique est présent. Aucune stylisation, aucune illustration, aucun effet pictural. Caractéristiques optiques d'un objectif cinéma prime haut de gamme : léger vignettage, bokeh naturel, profondeur de champ précise. Palette chromatique fidèle à l'époque et au lieu représentés. Léger grain de film de pellicule professionnelle. Chaque texture de surface doit sembler tangible et physiquement exacte. L'image doit se lire comme une photographie documentaire authentique ou une photo de plateau d'un drame historique de prestige.",
  },
  darksilhouette: {
    label: "Dark Silhouette contour outline",
    promptSuffix: "Background must be absolute pure black, RGB strictly (0,0,0). No dark grey, no off-black, no vignette, no background texture, no atmospheric noise whatsoever. The background is a perfect digital void. The character body, clothing, hair and all anatomical volumes must be rendered as a completely solid black mass, RGB strictly (0,0,0), identical to the background. There is zero visual difference between the interior of the character and the background behind them. The character has no internal fill, no interior shading, no visible body surface. They are invisible except for their edge. The only white elements allowed are the outer contour edge line tracing the full perimeter of the character, and strictly minimal iconic facial features: simple geometric oval or circular white eyes, a basic single-line mouth if needed. Nothing else. No nose detail, no ear detail, no clothing folds, no interior linework of any kind. The white contour line must be clean, smooth and uniform in weight. No chalk texture, no pressure variation, no scratchy marks, no hand-drawn wobble. The stroke must feel like a precise white ink liner or a crisp vector path. Perfectly controlled, never organic. Hair, beard and any spiky or textured silhouette elements are defined exclusively by the jagged or curved shape of the outer white contour line itself — not by interior strokes. Texture is read through the silhouette shape only. No grey tones anywhere in the image. No mid-tones, no anti-aliasing halos, no soft edges on the contour line. Every pixel is either pure black or white. Binary. Absolute. The result must look like a character illuminated from behind by a single intense white light source, with zero light falling on their front surface. Rim light effect. The figure reads as a glowing white edge floating in total darkness. Style references: 2D motion design animation character, explainer video production art, minimalist animated series. Graphic, iconic, immediate readability at any size.",
    promptSuffixFr: "Style : fond noir absolu pur, strictement RGB (0,0,0). Aucun gris foncé, aucune vignette, aucune texture de fond. Le corps du personnage, vêtements, cheveux et volumes anatomiques rendus en masse noire solide identique au fond. Aucune différence visuelle entre l'intérieur du personnage et le fond. Les seuls éléments blancs autorisés sont le contour extérieur traçant le périmètre complet du personnage et des traits faciaux iconiques minimaux : yeux ovales ou circulaires blancs, bouche à trait unique si nécessaire. Aucun autre détail intérieur. Le trait de contour blanc doit être net, lisse et uniforme. Aucune texture de craie, aucune variation de pression. Les cheveux et éléments texturés sont définis uniquement par la forme du contour extérieur. Aucun ton gris nulle part. Chaque pixel est soit noir pur soit blanc. Binaire. Absolu. Le résultat doit évoquer un personnage éclairé par l'arrière avec un effet de rim light. Références : animation motion design 2D, art de production vidéo explicative, série animée minimaliste. Graphique, iconique, lisibilité immédiate.",
  },
};

/** Default style when none is selected */
export const DEFAULT_STYLE_ID = "none";

/** Legacy id → current id mapping for backwards compatibility */
const LEGACY_STYLE_ID_MAP: Record<string, string> = {
  modernanimation: "pixar",
};

function resolveStyleId(styleId: string | null | undefined): string {
  if (!styleId) return "none";
  return LEGACY_STYLE_ID_MAP[styleId] ?? styleId;
}

/** Get English prompt suffix for a given style ID */
export function getStyleSuffix(styleId: string | null | undefined): string {
  const id = resolveStyleId(styleId);
  if (id === "none") return STYLE_SUFFIXES.none.promptSuffix;
  return STYLE_SUFFIXES[id]?.promptSuffix ?? STYLE_SUFFIXES.none.promptSuffix;
}

/** Get French prompt suffix for a given style ID */
export function getStyleSuffixFr(styleId: string | null | undefined): string {
  const id = resolveStyleId(styleId);
  if (id === "none") return STYLE_SUFFIXES.none.promptSuffixFr;
  return STYLE_SUFFIXES[id]?.promptSuffixFr ?? STYLE_SUFFIXES.none.promptSuffixFr;
}

/** Get label for a given style ID */
export function getStyleLabel(styleId: string | null | undefined): string {
  const id = resolveStyleId(styleId);
  if (id === "none") return STYLE_SUFFIXES.none.label;
  return STYLE_SUFFIXES[id]?.label ?? STYLE_SUFFIXES.none.label;
}

/** Check if the style is "realistic" (for photorealism enforcement) */
export function isRealisticStyle(styleId: string | null | undefined): boolean {
  return styleId === "realistic";
}

/**
 * Strip a previously baked-in style prefix from a prompt_export string.
 *
 * `prompt_export` is generated once at storyboard creation time and starts
 * with a French sentence like:
 *   "Style : photographie documentaire ultra réaliste, éclairage cinématographique, réalisme de reconstruction historique. In Contemporaine, ..."
 * If the user changes the visual style afterwards, the active style is added
 * by `getStyleSuffix(...)` lower in the prompt while the OLD baked-in style
 * is still at the top — the model receives contradictory instructions and
 * usually obeys the one at the top.
 *
 * This helper removes the leading "Style : ... ." sentence (and the leading
 * "In <era>, <place>, " trailer that immediately follows it) so the prompt
 * starts directly at the visual action. The active style is re-injected by
 * the caller via `getStyleSuffix` / `getStyleSuffixFr`.
 *
 * Safe to call multiple times — when no baked style is found, the original
 * string is returned unchanged.
 */
export function stripBakedStylePrefix(prompt: string | null | undefined): string {
  if (!prompt) return "";
  let out = prompt;

  // Match a leading "Style : <anything>." (FR) or "Style: <anything>." (EN),
  // possibly preceded by whitespace/newlines. Non-greedy up to the first
  // period that ends the style sentence.
  out = out.replace(/^\s*Style\s*:\s*[^.\n]+\.\s*/i, "");

  // The legacy storyboard generator immediately follows the style sentence
  // with "In <era>, <place>, <shot type> illustrant : ...". Drop only the
  // "In <era>, <place>, " preamble so the action ("<shot type> illustrant : ...")
  // remains intact.
  out = out.replace(/^\s*In\s+[^,\n]+,\s*[^,\n]+,\s*/i, "");

  return out.trim();
}
