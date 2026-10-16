// Short, checkable rules taken from the IESE style guides that matter in an
// email. The full guides live in /style-guides; sending them whole on every
// call was slow and the model could not tell which rules mattered.

export const GUIDE_VERSIONS = {
  es: "Guía de estilo del IESE de la A a la Z, junio del 2026",
  en: "The A to Z of IESE Style, August 2024",
};

export const RULES = {
  es: [
    "Sigue las normas de la RAE salvo las excepciones de esta lista.",
    "La primera mención de la escuela es «IESE Business School»; después, «el IESE» (siempre con artículo «el»), «la escuela» o «nuestra escuela de dirección». Nunca «el instituto» ni «escuela de negocios».",
    "IESE siempre en mayúsculas y sin puntos.",
    "Fechas: «7 de junio» o «7 de junio del 2026» (con «del» ante el año). Meses y días de la semana en minúscula.",
    "Horas: formato de 24 horas con dos puntos y «h» separada por un espacio, sin punto: «17:30 h». Nunca a. m. ni p. m.",
    "Formato de eventos en marketing: «IESE Madrid. 15 de marzo. 17:30 h.»",
    "Evita textos y titulares completos en mayúsculas y las mayúsculas innecesarias. Los titulares no llevan punto final y solo la primera palabra va en mayúscula (salvo nombres propios).",
    "Cargos en minúscula («el director general de la empresa»), excepto el Director General del IESE.",
    "No uses tratamientos de cortesía (Sr., Sra., D., Dña., Dr.) ante nombres de ponentes, profesores o alumnos.",
    "Nombres de personas: nombre de pila y primer apellido. Los antiguos alumnos se identifican con programa y año: «John Smith (MBA-02)».",
    "«Alumni» y «antiguos alumnos» se usan indistintamente, en redonda y minúscula. «Agrupación de Antiguos Alumnos del IESE» con mayúsculas como nombre propio.",
    "Alumni Learning Program y Programas Enfocados con mayúscula en cada término significativo.",
    "Programas: nombre propio con mayúsculas, pero la palabra «programa» en minúscula («el programa MBA»). MBA y EMBA siempre en siglas.",
    "Departamentos no académicos del IESE en inglés (Alumni Division, no División de Antiguos Alumnos).",
    "«campus» en minúscula y con «en»: «el campus del IESE en Madrid».",
    "Extranjerismos no recogidos en el DLE en cursiva (*networking*, *start-up*). Prefiere «cóctel» a *cocktail* y «correo electrónico» o *email*.",
    "Usa «pausa-café» y «pendiente de confirmación» en eventos.",
    "Formatos: «presencial», «live online» (en cursiva) u «online». Nunca «blended» ni «formación a distancia».",
    "Comillas inglesas (“ ”); el punto va fuera de las comillas.",
    "Números del uno al nueve con letras; a partir de 10 en cifras. Porcentajes pegados: «8%». Miles con punto: «6.000».",
    "«periodo», no «período»; «quizá», no «quizás»; «en relación con», nunca «en relación a».",
    "«este», «ese», «aquel» nunca llevan tilde.",
    "Listas con bolos: si un elemento es una oración, todos empiezan con mayúscula y llevan punto; si son frases sin verbo, sin punto final.",
    "Webs sin http:// ni www: «iese.edu».",
    "Negrita solo cuando sea necesaria; nunca negrita y subrayado a la vez.",
    "Trato de tú al lector, cercano y profesional. Frases claras y breves; nada de relleno ni superlativos vacíos.",
  ],
  en: [
    "Use American English spelling and AP style.",
    "First reference: IESE Business School; afterward IESE, the school or the business school.",
    "Dates: comma after the day with a year (Oct. 16, 2026). Abbreviate Jan., Feb., Aug., Sept., Oct., Nov., Dec. when used with a day; spell out March, April, May, June, July. No st, nd, rd or th.",
    "Times in invitations and marketing: 8 pm, 5:30 pm, without periods. Event format: «IESE Madrid. March 15. 5:30 pm (CET).»",
    "Avoid ALL CAPS in headlines and text. Use capitals only for proper nouns and official names.",
    "Job titles are capitalized only before a name (Executive Vice President John Roberts); otherwise lower case (John Roberts, executive vice president).",
    "No serial comma: «scholarships, grants and financial aid», unless needed for clarity.",
    "Use alumni for a mixed group, alumnus/alumna for one person; alum is fine in informal copy. Do not capitalize alumni on its own.",
    "Identify alumni with degree and year in parentheses: John Smith (MBA-02).",
    "IESE Alumni Association is capitalized as a name; association alone is lower case.",
    "Non-academic IESE departments keep their English names (Alumni Division).",
    "Spell out one through nine; numerals from 10. Use % with numerals (5%). Commas for thousands (3,450).",
    "Use an n-dash with spaces for an abrupt change of thought, and a closed n-dash for ranges (18–24 months).",
    "Formats: face to face (face-to-face as an adjective), live online, online. Never blended.",
    "Prefer reception or networking event to cocktail reception.",
    "email without a hyphen; e-commerce, e-learning with a hyphen.",
    "Websites without http:// or www: iese.edu.",
    "Address the reader as you. Warm, professional and concise; no filler or empty superlatives.",
  ],
};

// Names that are never translated or have an official translation.
export const GLOSSARY = [
  ["IESE Business School", "IESE Business School"],
  ["Agrupación de Antiguos Alumnos del IESE", "IESE Alumni Association"],
  ["División de Antiguos Alumnos", "Alumni Division"],
  ["Alumni Learning Program", "Alumni Learning Program"],
  ["Programas Enfocados", "Focused Programs"],
  ["Encuentros territoriales", "Alumni Regional Chapter Meetings"],
  ["Industry Meetings", "Industry Meetings"],
  ["claustro", "faculty"],
  ["antiguos alumnos", "alumni"],
  ["campus Norte", "North Campus"],
  ["campus Sur", "South Campus"],
  ["pausa-café", "coffee break"],
  ["pendiente de confirmación", "to be confirmed"],
  ["presencial", "face to face"],
  ["Director General", "Dean"],
];

export function rulesFor(language) {
  const lang = language === "en" ? "en" : "es";
  const glossary = GLOSSARY.map(([es, en]) => `${es} = ${en}`).join("; ");
  return [
    `Style guide: ${GUIDE_VERSIONS[lang]}. Follow every rule below.`,
    ...RULES[lang].map((rule, i) => `${i + 1}. ${rule}`),
    `Glossary (Spanish = English): ${glossary}.`,
    "Keep personalization fields such as {{Recipient.FirstName}} exactly as written. Never invent facts, dates, prices or names.",
  ].join("\n");
}
