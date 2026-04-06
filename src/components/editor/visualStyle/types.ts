/**
 * VisualStyle — Types for the visual style system.
 *
 * Hierarchy: Global → Scene → Shot (most local override wins).
 */

export interface VisualStyleOption {
  id: string;
  label: string;
  promptSuffix: string;
}

export const VISUAL_STYLES: VisualStyleOption[] = [
  { id: "none", label: "Aucun style imposé", promptSuffix: "No specific artistic style enforced. Let the model freely interpret the subject matter. Focus purely on the content, composition, and lighting without any stylistic constraint or artistic reference." },
  { id: "realistic", label: "Réaliste / Photographique", promptSuffix: "Ultra-realistic photographic rendering. Shot on a high-end DSLR or medium format camera. Natural or studio lighting with accurate shadows and highlights. Sharp focus on the subject with realistic bokeh background blur. True-to-life skin textures, fabric weaves, surface imperfections and material reflections. No painterly or illustrated treatment. No visible brushstrokes or artistic stylization whatsoever." },
  { id: "cinematic", label: "Cinématographique", promptSuffix: "Cinematic film-quality composition. Widescreen 2.39:1 aspect ratio. Dramatic directional lighting with deep shadows and strong contrast. Color graded with a cinematic LUT (teal and orange, bleach bypass, or period-accurate palette). Subtle film grain, slight lens flare, shallow depth of field. Feels like a single frame from a major motion picture. Strong narrative atmosphere and mood." },
  { id: "illustration", label: "Illustration", promptSuffix: "Editorial or book illustration style. Clean confident linework with flat or semi-flat color fills. Shapes are simplified but expressive and well-composed. Suitable for a magazine cover, children's book, or editorial spread. Influenced by mid-century modern illustration or contemporary digital editorial art. Warm and inviting palette, balanced composition, no photorealistic textures." },
  { id: "painting", label: "Peinture", promptSuffix: "Traditional oil or acrylic painting. Visible impasto brushstrokes with rich paint texture. Canvas grain subtly showing through. Figurative or expressionist rendering with a warm, deep color palette. Influenced by classical masters or contemporary realist painters. Dynamic interplay of light and shadow, glazing effects, tactile and physical feel to the image." },
  { id: "watercolor", label: "Aquarelle", promptSuffix: "Traditional watercolor painting on cold-press textured paper. Soft wet-on-wet color bleeds and transparent layered washes. Visible paper grain and white paper showing through in highlights. Loose and expressive brushwork, slightly uneven edges, gentle color blooms. Delicate and luminous overall feel. Pencil sketch underdrawing faintly visible. No hard digital edges or flat fills." },
  { id: "lineart", label: "Dessin / Line art", promptSuffix: "Pure line art drawing, black ink on white background. Clean precise contours with confident pen or technical nib strokes. Minimal or no color fill. Shading achieved through crosshatching, stippling or parallel lines only. Style references technical illustration, editorial pen drawing or graphic novel inking. No soft gradients, no digital airbrushing." },
  { id: "engraving", label: "Gravure / Estampe", promptSuffix: "Woodcut or intaglio engraving aesthetic. Dense parallel and cross-hatched lines carved into the image. Strong black and white contrast with very limited mid-tones. Rough-edged marks and slight ink spread as in traditional printmaking. Aged paper texture in the background. Visual style references 19th century botanical engravings, Dürer woodcuts or vintage newspaper illustrations." },
  { id: "artdeco", label: "Art déco / Affiche vintage", promptSuffix: "Art Deco or retro poster aesthetic from the 1920s–1960s. Elegant geometric shapes and symmetrical ornamental patterns. Limited flat color palette with strong contrast and bold outlines. Stylized typography integrated into the composition. Influenced by Cassandre, Mucha, WPA posters or mid-century travel advertising. Slight aged paper texture or lithographic print grain optional." },
  { id: "francobelge", label: "BD franco-belge", promptSuffix: "Franco-Belgian bande dessinée style, ligne claire school. Uniform black outlines of consistent thickness with no variation in stroke weight. Flat solid color fills with no gradients or soft shadows. Highly detailed and realistic backgrounds contrasting with slightly simplified characters. Visual references: Hergé's Tintin, Franquin's Spirou, early Moebius. Clean, readable, no gritty textures." },
  { id: "americancomics", label: "Comics américain", promptSuffix: "American superhero comics style. Bold thick ink outlines with dynamic expressive inking. Ben-Day dot patterns in shadows and mid-tones. Highly saturated primary colors. Dramatic foreshortening, heroic poses, explosive action compositions. Visual references: Jack Kirby, Neal Adams, Jim Lee, Frank Miller. Panel-ready artwork with strong narrative energy and exaggerated anatomy." },
  { id: "manga", label: "Manga / Manhwa / Manhua", promptSuffix: "Japanese manga or Asian webtoon art style. Fine clean black ink linework with screentone dot shading. Large expressive eyes with detailed catchlights. Dynamic speed lines and motion effects. Exaggerated facial expressions and emotions. Visual references: Akira Toriyama, Kentaro Miura, CLAMP, or Korean manhwa digital style." },
  { id: "cartoon", label: "Cartoon occidental", promptSuffix: "Classic Western animated cartoon style. Bold thick outlines with rubbery exaggerated shapes. Flat bright solid colors, no shading or minimal cel shading. Highly expressive slapstick-ready characters with extreme poses and squash-and-stretch proportions. Visual references: Looney Tunes, Hanna-Barbera, early Disney shorts, Ren & Stimpy. Playful, energetic, immediately readable." },
  { id: "modernanimation", label: "Animation moderne (Pixar, Ghibli…)", promptSuffix: "Contemporary animation studio style, 2D or 3D. Soft wrap-around lighting with warm ambient occlusion. Richly detailed and painterly backgrounds. Characters stylized yet emotionally expressive with nuanced facial rigging. Lush color palette with careful attention to light temperature and atmospheric depth. Visual references: Pixar feature films, Studio Ghibli backgrounds, Dreamworks Animation, Sony Pictures Animation." },
  { id: "anime", label: "Anime japonais", promptSuffix: "Contemporary Japanese anime style. Fine precise linework with carefully placed line weight variation. Large detailed eyes with layered specular highlights. Expressive hair with stylized movement. Semi-realistic background environments with anime perspective. Particle effects, lens flares and god rays used expressively. Color palette with strong contrast between lit and shadow areas. Visual references: modern seasonal anime, KyoAni, MAPPA, Ufotable visual quality." },
  { id: "conceptart", label: "Concept art", promptSuffix: "Professional concept art for game or film production. Loose exploratory brushwork with confident value structure. Strong silhouette readability at thumbnail size. Limited but purposeful color palette with one dominant accent hue. Atmospheric perspective suggesting depth and scale. Mood-defining lighting, often dramatic or mysterious. May include rough annotation marks or design notes. Visual references: Feng Zhu, Sparth, Ryan Church, ILM concept department." },
  { id: "pixelart", label: "Pixel art / Jeu vidéo rétro", promptSuffix: "Authentic retro pixel art style. Strict pixel grid visible at native resolution. Severely limited color palette of 16 to 32 colors maximum. Hard aliased edges, no anti-aliasing. Dithering patterns used for shading and gradients. Character sprites and tilesets designed at low resolution (16x16 to 64x64 base). Visual references: NES, SNES, Mega Drive era games, early Capcom and Konami sprite work." },
  { id: "lowpoly", label: "Low poly", promptSuffix: "Low polygon 3D render aesthetic. Visible triangular or polygonal facets across all surfaces. Flat shading per face with no smoothing or interpolation. Simple directional lighting casting clean geometric shadows. Minimal texture detail, color applied per polygon. Clean, modern, slightly abstract feel. Visual references: early PS1 era aesthetics or contemporary low poly motion graphics and game art." },
  { id: "isometric", label: "Isométrique", promptSuffix: "Strict isometric projection view. True 26.565° dimetric or 30° isometric camera angle. No vanishing point perspective, all parallel lines remain truly parallel. Clean geometric architecture and objects rendered in precise orthographic view. Flat or subtly cel-shaded surfaces. Detailed but schematic aesthetic. Visual references: isometric city builders, Crossy Road, Monument Valley, strategy game UI art or technical isometric infographic illustration." },
  { id: "3dcgi", label: "3D / CGI", promptSuffix: "General purpose 3D computer-generated imagery. Realistic or semi-stylized 3D modeling with well-defined materials, specularity and normal maps. Professional studio or HDRI environment lighting. No specific style constraint beyond clean, polished render quality. Suitable for product visualization, architectural render or character turnaround." },
  { id: "3dphotorealism", label: "Photo-réalisme 3D", promptSuffix: "Indistinguishable from real photography. Full path-traced or ray-traced render with physically based materials. Accurate subsurface scattering on organic surfaces (skin, wax, marble). True chromatic aberration, lens distortion and depth of field blur. Realistic ambient occlusion in crevices, micro-detail surface displacement maps, proper Fresnel reflections. No render artifacts, no plastic look, no uncanny valley. Must pass as a real photograph." },
  { id: "graphicdesign", label: "Design graphique", promptSuffix: "Modern graphic design composition. Strong typographic hierarchy integrated into the layout. Geometric shapes, clean grid structure, bold use of negative space. Defined brand-style color palette of 2 to 4 colors. Flat vector aesthetic or bold print-ready style. Visual references: Swiss International Style, contemporary brand identity design, Bauhaus principles, Sagmeister & Walsh, modern editorial layout." },
  { id: "abstract", label: "Abstrait", promptSuffix: "Fully non-figurative abstract composition. No recognizable objects, figures or scenes. Pure exploration of shape, color, rhythm, texture and spatial tension. May reference geometric abstraction (Mondrian, Albers), lyrical abstraction, color field painting (Rothko, Morris Louis) or abstract expressionism (Pollock, de Kooning). Composition should feel intentional and balanced despite absence of subject matter." },
  { id: "glitchart", label: "Glitch art / Expérimental", promptSuffix: "Digital glitch art and experimental visual aesthetic. Deliberate RGB channel misalignment and chromatic aberration. JPEG compression artifacts pushed to the extreme. Datamoshing motion blur smears. CRT scanlines and interlacing artifacts. Corrupted pixel blocks and bitcrushed color banding. Unexpected generative patterns emerging from digital errors. Visual references: Rosa Menkman, Takeshi Murata, corrupted file aesthetics, vaporwave glitch culture." },
  { id: "scientific", label: "Technique / Scientifique", promptSuffix: "Precise technical or scientific illustration. Detailed cross-section or exploded view diagram with clear labeling. Clean lines on white or light grey background. Restricted palette of black, white, grey and one or two accent colors (typically blue or red for callouts). Style references: engineering assembly manuals, medical atlas anatomy plates, natural history museum engravings, NASA technical documentation or patent drawing style." },
  { id: "invertedlineart", label: "Line art inversé / Chalk style", promptSuffix: "White line art on pure black background. Single uniform stroke weight with no fill or color. Large black negative space used as shadow and volume. Minimal interior detail, expressive and loose contours. Chalkboard or inverted storyboard aesthetic. Clean, graphic and high contrast." },
];

export const DEFAULT_VISUAL_STYLE_ID = "none";

export function getVisualStyleById(id: string): VisualStyleOption | undefined {
  return VISUAL_STYLES.find((s) => s.id === id);
}

export type InheritanceState = "none" | "inherited" | "overridden";

export interface VisualStyleValue {
  localStyleId: string | null;
  inheritedStyleId: string | null;
}

export function computeEffective(value: VisualStyleValue): {
  effectiveStyleId: string | null;
  state: InheritanceState;
} {
  if (value.localStyleId != null) return { effectiveStyleId: value.localStyleId, state: "overridden" };
  if (value.inheritedStyleId != null) return { effectiveStyleId: value.inheritedStyleId, state: "inherited" };
  return { effectiveStyleId: null, state: "none" };
}

export interface VisualStyleStore {
  globalStyleId: string | null;
  sceneStyles: Map<string, string | null>;
  shotStyles: Map<string, string | null>;
}

export function resolveShotStyle(
  store: VisualStyleStore,
  sceneId: string,
  shotId: string,
): { effectiveStyleId: string | null; source: "shot" | "scene" | "global" | "none" } {
  const shotLocal = store.shotStyles.get(shotId) ?? null;
  if (shotLocal != null) return { effectiveStyleId: shotLocal, source: "shot" };
  const sceneLocal = store.sceneStyles.get(sceneId) ?? null;
  if (sceneLocal != null) return { effectiveStyleId: sceneLocal, source: "scene" };
  if (store.globalStyleId != null) return { effectiveStyleId: store.globalStyleId, source: "global" };
  return { effectiveStyleId: null, source: "none" };
}

export function resolveSceneStyle(
  store: VisualStyleStore,
  sceneId: string,
): { effectiveStyleId: string | null; source: "scene" | "global" | "none" } {
  const sceneLocal = store.sceneStyles.get(sceneId) ?? null;
  if (sceneLocal != null) return { effectiveStyleId: sceneLocal, source: "scene" };
  if (store.globalStyleId != null) return { effectiveStyleId: store.globalStyleId, source: "global" };
  return { effectiveStyleId: null, source: "none" };
}
