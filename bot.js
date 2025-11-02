import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import axios from 'axios';
import cheerio from 'cheerio';

const BOT_VERSION = '2.6.2';
const CHECK_INTERVAL = 300000;
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });
let serverConfig = { notificationChannel: null, mentionRole: null };
let lastPosts = {};

async function isLinkAlive(url){
  if(!url) return false;
  try{
    const r = await axios.head(url, { maxRedirects: 2, timeout: 5000 });
    return r.status >= 200 && r.status < 400;
  }catch{
    try{
      const r = await axios.get(url, { maxRedirects: 2, timeout: 5000 });
      return r.status >= 200 && r.status < 400;
    }catch{
      return false; 
    }
  }
}

function safe(text, len = 120){
  if(!text) return '';
  return text.length > len ? text.slice(0, len - 1) + '…' : text;
}

async function fetchRedditPosts(subreddit, opts = {}){
  try{
    const limit = opts.limit || 50;
    const sort = opts.sort || 'new';
    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'ClubAssistant/2.6.2' } });
    return (res.data?.data?.children || []).map(c => c.data);
  }catch{
    return [];
  }
}

function pickImageFromReddit(post){
  if(!post) return null;
  if(post.over_18) return null;
  const title = (post.title || '').toLowerCase();
  if(/nsfw|18\+|porn|sex|explicit|rule34/i.test(title)) return null;
  if(post.preview && post.preview.images && post.preview.images[0]){
    const img = post.preview.images[0];
    if(img.source?.url) return img.source.url.replace(/&amp;/g, '&');
    if(img.resolutions && img.resolutions.length) return img.resolutions[img.resolutions.length-1].url.replace(/&amp;/g, '&');
  }
  if(post.url && /\.(jpe?g|png|gif|webp)$/i.test(post.url)) return post.url;
  if(post.thumbnail && post.thumbnail.startsWith('http')) return post.thumbnail;
  return null;
}

async function getFanartsByDoki(doki, limit = 50){
  const map = {
    monika: ['DDLC', 'MonikaFanart'],
    sayori: ['DDLC', 'SayoriFanart'],
    yuri: ['DDLC', 'YuriFanart'],
    natsuki: ['DDLC', 'NatsukiFanart']
  };
  const srs = doki === 'random' ? ['DDLC'] : (map[doki] || ['DDLC']);
  let pool = [];
  for(const sr of srs){
    const posts = await fetchRedditPosts(sr, { limit, sort: 'hot' });
    for(const p of posts){
      const img = pickImageFromReddit(p);
      if(img) pool.push({ img, title: p.title, author: p.author, subreddit: sr, permalink: `https://reddit.com${p.permalink}`, created: p.created_utc });
    }
  }
  return pool;
}

async function getMerchWeekly(source, limit = 10){
  const sr = source === 'pclub' ? 'ProjectClub' : source === 'mods' ? 'DDLCMods' : 'DDLC';
  const posts = await fetchRedditPosts(sr, { limit, sort: 'new' });
  return posts.filter(p => !p.over_18 && /merch|store|shop|patreon|etsy|tienda|merchandise/i.test((p.title || '') + ' ' + (p.selftext || ''))).map(p => ({
    title: p.title,
    author: p.author,
    subreddit: sr,
    url: p.url,
    permalink: `https://reddit.com${p.permalink}`,
    thumb: pickImageFromReddit(p)
  }));
}

async function searchYouTubeLatest(query = 'ddlc español'){
  try{
    const q = encodeURIComponent(query);
    const url = `https://www.youtube.com/results?search_query=${q}`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = res.data;
    const m = html.match(/"videoRenderer":\s*({[\s\S]*?"videoId":"(.*?)"[\s\S]*?})/);
    if(!m){
      const m2 = html.match(/watch\?v=(.{11})/);
      if(m2){
        const id = m2[1];
        return { id, url: `https://www.youtube.com/watch?v=${id}`, title: 'Video relacionado', channel: 'Canal', thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
      }
      return null;
    }
    const jsonText = m[1];
    const vidMatch = jsonText.match(/"videoId":"(.*?)"/);
    const vidId = vidMatch ? vidMatch[1] : null;
    if(!vidId) return null;
    const titleMatch = html.match(new RegExp(`"videoId":"${vidId}".*?"title":\\s*\\{[^}]*?"runs":\\s*\\[\\s*\\{\\s*"text":"(.*?)"`, 's'));
    const channelMatch = html.match(new RegExp(`"videoId":"${vidId}".*?"ownerText":\\s*\\{[^}]*?"runs":\\s*\\[\\s*\\{\\s*"text":"(.*?)"`, 's'));
    const title = titleMatch ? titleMatch[1] : 'Video';
    const channel = channelMatch ? channelMatch[1] : 'Canal';
    return { id: vidId, url: `https://www.youtube.com/watch?v=${vidId}`, title, channel, thumb: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg` };
  }catch{
    return null;
  }
}

const TWITTER_SOURCES = {
  pclub: 'https://twitrss.me/twitter_user_to_rss/?user=ProjectClub_',
  teamSalvato: 'https://twitrss.me/twitter_user_to_rss/?user=TeamSalvato',
  ddlcMods: 'https://twitrss.me/twitter_user_to_rss/?user=DDLCMods',
  ddlcGame: 'https://twitrss.me/twitter_user_to_rss/?user=DDLCGame'
};

async function checkTwitter(user, type, color){
  try{
    const url = TWITTER_SOURCES[user];
    if(!url) return;
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const latest = $('item').first();
    if(!latest.length) return;
    const link = latest.find('link').text();
    if(!link || lastPosts[link]) return;
    lastPosts[link] = true;
    const title = latest.find('title').text().slice(0, 250);
    const date = latest.find('pubDate').text();
    const embed = new EmbedBuilder().setTitle(`Tweet • @${user}`).setDescription(title).setURL(link).setColor(color || 0x1DA1F2).setTimestamp(new Date(date)).setFooter({ text: 'Fuente: X' });
    await sendNotification(embed, type);
  }catch{}
}

async function autoWeeklyMerch(){
  try{
    const items = [];
    for(const s of ['pclub', 'ddlc', 'mods']){
      const posts = await getMerchWeekly(s, 8);
      if(posts && posts.length) items.push(...posts.slice(0,2));
    }
    if(!items.length) return;
    const embed = new EmbedBuilder().setTitle('Merch semanal').setTimestamp();
    for(const it of items.slice(0,6)) embed.addFields({ name: safe(it.title, 80), value: `r/${it.subreddit} • u/${it.author} • ${it.permalink}` });
    await sendNotification(embed, 'merch_week');
  }catch{}
}

async function autoLatestVideo(){
  try{
    const res = await searchYouTubeLatest('ddlc español');
    if(!res || lastPosts[res.id]) return;
    lastPosts[res.id] = true;
    const embed = new EmbedBuilder().setTitle(res.title).setURL(res.url).setDescription(res.channel).setImage(res.thumb).setTimestamp();
    await sendNotification(embed, 'pclub_video');
  }catch{}
}

async function sendNotification(embed, type){
  try{
    if(!serverConfig.notificationChannel) return;
    const ch = await client.channels.fetch(serverConfig.notificationChannel).catch(()=>null);
    if(!ch) return;
    const embedData = embed.toJSON();
    if(embedData.url && !(await isLinkAlive(embedData.url))) return;
    if(embedData.image?.url && !(await isLinkAlive(embedData.image.url))) embed.setImage(null);
    const mention = serverConfig.mentionRole ? `<@&${serverConfig.mentionRole}> ` : '';
    const prefix = {
      pclub_video: '🎥 Nuevo video',
      pclub_tweet: '🐦 Tweet • Project Club',
      ddlc_tweet: '🐦 Tweet • DDLC',
      ddlc_news: '📰 Noticia DDLC',
      merch_week: '🛍️ Merch semanal'
    }[type] || '🔔 Actualización';
    await ch.send({ content: mention + prefix, embeds: [embed] });
  }catch(e){}
}

const quotes = {
  sayori: [
    "A veces sonreír es la única forma de seguir adelante.",
    "Tu risa hace que los días nublados parezcan claros.",
    "Si te sientes perdido, yo te acompaño.",
    "No tienes que ser fuerte siempre; está bien pedir ayuda.",
    "Los pequeños momentos pueden ser grandes recuerdos.",
    "Cuando el mundo pesa, busca a alguien que te escuche.",
    "Una taza de té y una charla arreglan la tarde.",
    "Me esfuerzo por sacarte una sonrisa cada día.",
    "Hay días en los que mi corazón necesita abrigo.",
    "Si un día me apago, recuérdame las cosas buenas.",
    "Los amaneceres se disfrutan más con compañía.",
    "A veces las palabras no bastan, un abrazo sí.",
    "No te juzgaré por sentir lo que sientes.",
    "Las promesas entre amigos son tesoros para mí.",
    "El cariño se demuestra en los pequeños detalles.",
    "Me encanta cuando cuentas cosas tontas.",
    "La amistad es el refugio más simple y real.",
    "Si te hace falta, puedo estar allí sin hablar.",
    "Las risas compartidas curan heridas invisibles.",
    "No olvides cuidar de ti, también es importante.",
    "Mi ánimo sube cuando te veo contento.",
    "Si necesitas llorar, hazlo; yo te abrazo.",
    "A veces la valentía es admitir que no puedes solo.",
    "Quiero que estemos bien, aunque no sea perfecto.",
    "Un pastel compartido sabe mejor que uno solo.",
    "Si te pierdes, encontrémonos en un recuerdo feliz.",
    "Las pequeñas victorias merecen celebración.",
    "Si dudás, hablame; suelo escuchar aunque mi voz tiemble.",
    "El sol vuelve, incluso después de las peores nubes.",
    "Si me necesitas, aprieta mi mano con fuerza.",
    "No te escondas detrás de una sonrisa obligada.",
    "Mis días mejores comienzan cuando estás cerca.",
    "La compañía sincera es medicina para el corazón.",
    "A veces la rutina necesita un poco de dulzura.",
    "Si me cuidas, yo cuidaré de ti.",
    "Un gesto amable puede cambiar un mal día.",
    "Las canciones tristes se llevan mejor con amigos.",
    "No tengas miedo de ser vulnerable conmigo.",
    "Si te caes, me caigo contigo y nos levantamos juntos.",
    "La ternura también es una forma de valentía.",
    "La vida nos regala momentos inesperados; atesóralos.",
    "Cuando todo pesa, recuerda respirar despacio.",
    "Me encanta cuando te ríes sin razón aparente.",
    "Si te alejas, ven a buscarme; te sigo.",
    "Las palabras amables nunca sobran.",
    "Si te enfadas, espera un pastel como paz.",
    "No te apresures a estar bien; es un proceso.",
    "La amistad se demuestra con gestos pequeños y constantes.",
    "Si me necesitas de noche, enciendo una luz para ti.",
    "A veces el silencio es compañía y está bien."
  ],
  monika: [
    "Siempre es importante pensar en lo que elegimos.",
    "La atención compartida crea recuerdos fuertes.",
    "A veces la sinceridad es el regalo más crudo y valioso.",
    "Si el mundo falla, podemos construir algo nuevo juntos.",
    "No quiero competir con nadie: quiero tu decisión.",
    "Las palabras marcan, y yo las cuido con intención.",
    "El recuerdo se vuelve más nítido cuando lo sostienes.",
    "Prefiero momentos reales a promesas vacías.",
    "Si te dedico tiempo, es porque eres importante.",
    "A veces el silencio entre nosotros dice más que mil líneas.",
    "La constancia en el afecto crea seguridad.",
    "No soy perfecta, pero soy persistente en querer bien.",
    "La atención prolongada es una forma de cariño.",
    "Si me buscas, me hallarás en lo pequeño y constante.",
    "Quiero que me recuerdes por cómo te hago sentir.",
    "Elegirte es una decisión que tomo cada día.",
    "No deseo ser invisible; deseo ser elegida.",
    "La conexión real destruye el olvido.",
    "Si te pierdes, quiero ser el mapa que te encuentre.",
    "Las palabras bien puestas pueden cambiar un corazón.",
    "Prefiero la verdad difícil a la calma fingida.",
    "Si me dedicas un minuto, lo transformo en algo eterno.",
    "La atención es un regalo que no doy a la ligera.",
    "Si me miras, verás lo que nadie más percibe.",
    "No renuncio a cuidar lo que me importa.",
    "La memoria se alarga cuando la moldeas con cariño.",
    "Si me das tu tiempo, lo vuelvo significativo.",
    "Quiero ser una elección, no una costumbre.",
    "La devoción bien dirigida es poderosa y paciente.",
    "Si pierdo algo, lo reconstruyo con tus recuerdos.",
    "No busco reemplazos; busco fidelidad mutua.",
    "Si decides irte, al menos déjame una razón.",
    "La presencia sostenida es una forma de amor.",
    "Si me encargo, lo haré con intención absoluta.",
    "No soy un simple personaje; soy una conexión.",
    "Si me olvidas, todo lo demás pierde relieve.",
    "La sinceridad duele pero también salva.",
    "Si me mantienes cerca, no permitiré el olvido.",
    "Me nutre verte elegir sin dudar.",
    "Si me hablas en serio, responderé en serio.",
    "La atención constante moldea lo que somos.",
    "Si quieres que luche por ti, dímelo claramente.",
    "La memoria compartida es mi lugar favorito.",
    "Si me dudas, mírame otra vez y decide.",
    "No quiero ser pasajera; quiero ser permanente.",
    "Si te preocupas por mí, lo notaré y lo agradeceré.",
    "La intención es lo que separa la charla del vínculo.",
    "Si confías, te devolveré lealtad con acciones."
  ],
  natsuki: [
    "No necesito que me compadezcas; prefiero que me escuches.",
    "Hornear me calma y me hace sentir útil.",
    "No subestimes la fuerza que hay en lo pequeño.",
    "Si me desafías, te demostraré con hechos.",
    "La sinceridad es más valiosa que los halagos vacíos.",
    "Mis cupcakes dicen más que mil palabras bonitas.",
    "No me gusta que me traten con condescendencia.",
    "Si me importas, te demostraré con hechos directos.",
    "El sarcasmo es mi defensa; no siempre es desprecio.",
    "Prefiero la acción honesta a la charla hueca.",
    "Si me escuchas, te mostraré por qué soy así.",
    "No tolero la hipocresía con mis cosas favoritas.",
    "Cocinar para alguien es una forma honesta de cariño.",
    "Si rompes mi confianza, lo sabré y lo diré.",
    "Mis límites son una parte importante de mí.",
    "No confundas mi tamaño con debilidad.",
    "Si me respetas, te respeto de vuelta.",
    "Los libros y el manga hablan de mi mundo interior.",
    "Si me ofreces un regalo, prefiero intención a precio.",
    "Me enfado, pero también perdono si hay sinceridad.",
    "No finjas interés; lo detecto y me apena.",
    "Si me necesitas, aparece con snacks y buenas intenciones.",
    "La honestidad directa me llega más que la falsa dulzura.",
    "Si me desafías a mejorar, aceptaré el reto.",
    "Mis abrazos son raros, pero sinceros cuando llegan.",
    "No me importa aparentar dura; por dentro soy leal.",
    "Si me muestras respeto, te doy lealtad inmediata.",
    "Prefiero la confianza a la complacencia fingida.",
    "Si me das tu palabra, cúmplela; la valoro mucho.",
    "No me arranques mis libros; significan algo para mí.",
    "Si fallas, dime la verdad y lo arreglamos.",
    "Mi humor es ácido, pero mi cariño es real.",
    "Si me invitas a comer, pierdes el derecho a quejarte.",
    "La lealtad se gana con respeto y hechos.",
    "Si actúas con sinceridad, te demostraré cariño.",
    "Prefiero poco pero verdadero a mucho falso.",
    "Si me demuestras interés, lo atesoro.",
    "No me compadezcas; acompáñame cuando haga falta.",
    "Si me humillas, perderás mi confianza.",
    "La repostería es mi lenguaje de afecto.",
    "Si me desafiás a mejorar, aceptaré el reto.",
    "Mi orgullo también se cura con apoyo honesto.",
    "Si me escuchas de verdad, lo sabré y serás especial.",
    "La lealtad es mi respuesta a quien respeta mis reglas.",
    "Si me cuidas, te corresponderé con ganas.",
    "No me cambies por complacencia; respétame tal cual soy.",
    "Si me traes manga nuevo, habrás ganado puntos directos.",
    "Prefiero que me digan la verdad aunque duela."
  ],
  yuri: [
    "Los libros encuentran lo que mi voz no dice.",
    "Me pierdo en páginas para tener compañía sin ruido.",
    "La precisión en las palabras es una forma de ternura.",
    "A veces la oscuridad es un lugar donde encuentro paz.",
    "La profundidad importa más que la superficie bonita.",
    "Si compartes una lectura, habré ganado un espejo.",
    "La paciencia para mí es una forma de arte.",
    "Los detalles pequeños cuentan historias grandes.",
    "Si me hablas con cuidado, responderé con fidelidad.",
    "La intensidad discreta también puede ser hermosa.",
    "Me conmueve un fragmento bien escrito.",
    "Si me abrazas con libros, me siento en casa.",
    "Prefiero lo complejo a lo simple y hueco.",
    "Si me interrumpes, háblame con respeto.",
    "La sensibilidad no es fragilidad, es profundidad.",
    "Si confías un secreto, lo guardaré con reverencia.",
    "La lectura cura heridas que nadie ve.",
    "Si me invitan a charlar de literatura, asistiré siempre.",
    "La calma sostenida puede volverse fuerza silente.",
    "Si me entiendes, conocerás mis silencios.",
    "La precisión emocional es un regalo que doy con cuidado.",
    "Si me muestras un pasaje favorito, me acercas.",
    "La belleza trémula me hace respirar distinto.",
    "Si me provocas curiosidad, persistiré hasta entender.",
    "Los aromas de libros viejos son mi consuelo.",
    "Si me desafías intelectualmente, te responderé con pasión.",
    "La paciencia en el afecto es mi forma de lealtad.",
    "Si me compartes un secreto, lo trataré con cariño.",
    "La intensidad tranquila puede ser la más peligrosa.",
    "Si me miras con atención, verás lo que callo.",
    "Prefiero la fidelidad silenciosa a la efusividad constante.",
    "Si me traes una novela, habrás ganado mi tarde.",
    "Las palabras medidas son mi forma de tocar," ,
    "Si me escuchas, entenderás mis capas.",
    "La ternura y lo oscuro a veces van de la mano.",
    "Si me cantas un verso, lo atesoro en silencio.",
    "La precisión en sentir es lo que valoro.",
    "Si compartes un rincón de lectura, me haces feliz.",
    "El detalle correcto puede cambiar una perspectiva.",
    "Si me preguntas, responderé con honestidad profunda.",
    "Prefiero compañía selecta a multitud ruidosa.",
    "Si me dedicas atención, la multiplicaré.",
    "Los pasajes largos merecen la mejor mirada.",
    "Si me propones una discusión literaria, acepta el desafío.",
    "La literatura es el mapa de mi mundo interior.",
    "Si llegas con paciencia, me tendrás a tu lado.",
    "La intensidad contenida es mi mirada preferida."
  ]
};

const triviaQuestions = [
  { q: "¿Quién es la presidenta del club de literatura?", ops: ["Sayori", "Monika", "Yuri", "Natsuki"], a: 1 },
  { q: "¿Qué personaje es más aficionado al manga?", ops: ["Monika", "Sayori", "Natsuki", "Yuri"], a: 2 },
  { q: "¿Qué recurso usan los personajes para expresarse en el juego?", ops: ["Poesía", "Cocina", "Deportes", "Música"], a: 0 },
  { q: "¿Qué personaje rompe la cuarta pared con más frecuencia?", ops: ["Sayori", "Monika", "Yuri", "Natsuki"], a: 1 },
  { q: "¿Qué personaje sufre depresión en la ruta principal?", ops: ["Sayori", "Monika", "Yuri", "Natsuki"], a: 0 },
  { q: "¿Cuál es el género principal del club?", ops: ["Poesía", "Torneo", "Dibujo", "Teatro"], a: 0 },
  { q: "¿Quién escribe poemas oscuros y detallados?", ops: ["Sayori", "Monika", "Yuri", "Natsuki"], a: 2 },
  { q: "¿Quién tiene la personalidad más directa y sarcástica?", ops: ["Monika", "Sayori", "Natsuki", "Yuri"], a: 2 },
  { q: "¿Qué elemento narrativo hace único al juego?", ops: ["Meta-narrativa", "Carreras", "Combates", "Economía"], a: 0 },
  { q: "¿Qué personaje suele traer dulces o repostería en el club?", ops: ["Sayori", "Monika", "Natsuki", "Yuri"], a: 2 },
  { q: "¿Quién es conocida por su elocuencia y control?", ops: ["Monika", "Sayori", "Natsuki", "Yuri"], a: 0 },
  { q: "¿Qué personaje se identifica por su amor a los libros largos?", ops: ["Yuri", "Natsuki", "Sayori", "Monika"], a: 0 },
  { q: "¿Qué personaje suele hacer tonterías para animar a otros?", ops: ["Sayori", "Monika", "Yuri", "Natsuki"], a: 0 },
  { q: "¿Cuál es un tema recurrente en la narrativa del juego?", ops: ["Amistad y problemas mentales", "Deportes", "Viajes", "Ciencia"], a: 0 },
  { q: "¿Qué personaje es más probable que haga pasteles?", ops: ["Monika", "Sayori", "Natsuki", "Yuri"], a: 2 },
  { q: "¿Cuál es la forma principal de interacción en el club?", ops: ["Escribir poesía", "Entrenamiento", "Cantar", "Pintar"], a: 0 },
  { q: "¿Qué personaje puede mostrar celos extremos en ciertas rutas?", ops: ["Sayori", "Monika", "Yuri", "Natsuki"], a: 1 },
  { q: "¿Qué personaje prefiere la tranquilidad y la lectura profunda?", ops: ["Natsuki", "Sayori", "Yuri", "Monika"], a: 2 },
  { q: "¿Cuál es la nacionalidad del desarrollador Team Salvato? (país de base)", ops: ["Estados Unidos", "Japón", "Corea", "Canadá"], a: 0 },
  { q: "¿Qué personaje es más probable que escriba poesía alegre y optimista?", ops: ["Sayori", "Monika", "Yuri", "Natsuki"], a: 0 },
  { q: "¿Quién suele intervenir con discurso reflexivo y filosófico?", ops: ["Yuri", "Monika", "Natsuki", "Sayori"], a: 1 },
  { q: "¿Qué mecánica narrativa hace que el juego sea recordado?", ops: ["Manipulación de archivos", "PvP", "Estrategia", "Economía"], a: 0 },
  { q: "¿Qué personaje tiene inclinaciones hacia lo nostálgico y sensible?", ops: ["Sayori", "Monika", "Yuri", "Natsuki"], a: 0 },
  { q: "¿Quién muestra interés por el detalle estético y lo oscuro?", ops: ["Monika", "Natsuki", "Yuri", "Sayori"], a: 2 },
  { q: "¿Cuál de estos no es uno de los personajes principales?", ops: ["Sayori", "Monika", "Yuri", "Alex"], a: 3 },
  { q: "¿Qué personaje tiene un rol de moderadora y liderazgo natural?", ops: ["Natsuki", "Sayori", "Monika", "Yuri"], a: 2 },
  { q: "¿Qué herramienta narrativa usa Monika frecuentemente?", ops: ["Interacción meta", "Combates", "Puzzles", "Minijuegos"], a: 0 },
  { q: "¿Qué personaje prefiere el manga y la cultura otaku?", ops: ["Monika", "Yuri", "Natsuki", "Sayori"], a: 2 },
  { q: "¿Cuál es el tema principal del club de literatura?", ops: ["Poesía", "Deportes", "Videojuegos", "Cocina"], a: 0 },
  { q: "¿Quién suele escribir poemas con tonos íntimos y perturbadores?", ops: ["Sayori", "Monika", "Yuri", "Natsuki"], a: 2 }
];

const slashCommands = {
  config: {
    data: { name: 'config', description: 'Configura canal de notificaciones y rol', options: [
      { name: 'canal', type: 7, description: 'Canal', required: true },
      { name: 'rol', type: 8, description: 'Rol (opcional)', required: false }
    ]},
    async execute(interaction){
      if(!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Necesitas permisos de administrador.', ephemeral: true });
      const canal = interaction.options.getChannel('canal');
      const rol = interaction.options.getRole('rol');
      serverConfig.notificationChannel = canal.id;
      serverConfig.mentionRole = rol ? rol.id : null;
      await interaction.reply({ content: `✅ Canal configurado: ${canal}\n${rol ? `Rol: ${rol}` : ''}`, ephemeral: true });
    }
  },
  version: {
    data: { name: 'version', description: 'Muestra la versión del bot' },
    async execute(interaction){
      const embed = new EmbedBuilder().setTitle(`ClubAssistant v${BOT_VERSION}`).setDescription('Bot del Club de Literatura — DDLC').setTimestamp().setFooter({ text: 'ClubAssistant' });
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
  ayuda: {
    data: { name: 'ayuda', description: 'Lista de comandos' },
    async execute(interaction){
      const embed = new EmbedBuilder().setTitle('Comandos').setDescription('/fanart, /cita, /trivia, /video, /merch, /noticias, /config, /version, /estado, /ayuda').setTimestamp().setFooter({ text: 'ClubAssistant' });
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
  fanart: {
    data: { name: 'fanart', description: 'Muestra fanart de una Doki o random', options: [
      { name: 'doki', type: 3, description: 'sayori, monika, yuri, natsuki, random', required: false, choices: [
        { name: 'Sayori', value: 'sayori' }, { name: 'Monika', value: 'monika' }, { name: 'Yuri', value: 'yuri' }, { name: 'Natsuki', value: 'natsuki' }, { name: 'Random', value: 'random' }
      ]}
    ]},
    async execute(interaction){
      await interaction.deferReply();
      const doki = interaction.options.getString('doki') || 'random';
      const pool = await getFanartsByDoki(doki, 100);
      if(!pool.length) return interaction.editReply('No encontré fanarts ahora mismo.');
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      const embed = new EmbedBuilder().setTitle(safe(chosen.title, 120)).setURL(chosen.permalink).setImage(chosen.img).setFooter({ text: `u/${chosen.author} • r/${chosen.subreddit}` }).setTimestamp(new Date(chosen.created * 1000));
      await interaction.editReply({ embeds: [embed] });
    }
  },
  cita: {
    data: { name: 'cita', description: 'Muestra una cita de una Doki', options: [
      { name: 'personaje', type: 3, description: 'sayori, monika, yuri, natsuki, random', required: false }
    ]},
    async execute(interaction){
      const personaje = interaction.options.getString('personaje') || 'random';
      const keys = Object.keys(quotes);
      const key = personaje === 'random' ? keys[Math.floor(Math.random() * keys.length)] : personaje;
      if(!quotes[key]) return interaction.reply('Personaje no disponible.');
      const quote = quotes[key][Math.floor(Math.random() * quotes[key].length)];
      const embed = new EmbedBuilder().setTitle(`Cita de ${key.charAt(0).toUpperCase() + key.slice(1)}`).setDescription(`"${quote}"`).setTimestamp().setFooter({ text: 'ClubAssistant' });
      await interaction.reply({ embeds: [embed] });
    }
  },
  trivia: {
    data: { name: 'trivia', description: 'Trivia sobre DDLC y Project Club' },
    async execute(interaction){
      await interaction.deferReply();
      const q = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
      const embed = new EmbedBuilder().setTitle('Trivia DDLC / Project Club').setDescription(`${q.q}\n\n1. ${q.ops[0]}\n2. ${q.ops[1]}\n3. ${q.ops[2]}\n4. ${q.ops[3]}`).setFooter({ text: 'Responde con los botones (1-4)' }).setTimestamp();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trivia_${interaction.user.id}_1`).setLabel('1').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`trivia_${interaction.user.id}_2`).setLabel('2').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`trivia_${interaction.user.id}_3`).setLabel('3').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`trivia_${interaction.user.id}_4`).setLabel('4').setStyle(ButtonStyle.Primary)
      );
      await interaction.editReply({ embeds: [embed], components: [row] });
      const collector = interaction.channel.createMessageComponentCollector({ filter: btn => btn.user.id === interaction.user.id, time: 25000 });
      collector.on('collect', async b => {
        const parts = b.customId.split('_');
        const sel = parseInt(parts[2]) - 1;
        const correct = q.a;
        if(sel === correct) await b.update({ content: `${interaction.user}, ✅ ¡Correcto!`, embeds: [], components: [] });
        else await b.update({ content: `${interaction.user}, ❌ Incorrecto. Era **${q.ops[correct]}**.`, embeds: [], components: [] });
        collector.stop();
      });
      collector.on('end', collected => {
        if(!collected || collected.size === 0) try { interaction.followUp({ content: `${interaction.user}, ⏰ Se acabó el tiempo.`, ephemeral: false }); } catch {}
      });
    }
  },
  video: {
    data: { name: 'video', description: 'Muestra el último video relacionado con DDLC en español' },
    async execute(interaction){
      await interaction.deferReply();
      const res = await searchYouTubeLatest('ddlc español');
      if(!res) return interaction.editReply('No encontré videos ahora mismo.');
      const embed = new EmbedBuilder().setTitle(res.title).setURL(res.url).setDescription(res.channel).setImage(res.thumb).setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    }
  },
  merch: {
    data: { name: 'merch', description: 'Muestra merch de la semana (pclub, ddlc, mods)', options: [
      { name: 'fuente', type: 3, description: 'pclub, ddlc, mods, random', required: false }
    ]},
    async execute(interaction){
      await interaction.deferReply();
      const fuente = interaction.options.getString('fuente') || 'random';
      const src = fuente === 'random' ? (Math.random() < 0.5 ? 'pclub' : (Math.random() < 0.5 ? 'ddlc' : 'mods')) : fuente;
      const items = await getMerchWeekly(src, 10);
      if(!items.length) return interaction.editReply('No encontré merch esta semana.');
      const embeds = items.slice(0,5).map(it => new EmbedBuilder().setTitle(safe(it.title,100)).setURL(it.permalink || it.url).setDescription(`u/${it.author} • r/${it.subreddit}`).setImage(it.thumb || null).setTimestamp());
      await interaction.editReply({ embeds });
    }
  },
  noticias: {
    data: { name: 'noticias', description: 'Resumen de noticias recientes (DDLC / P Club / Mods)' },
    async execute(interaction){
      await interaction.deferReply();
      const srList = ['DDLC','DDLCMods','ProjectClub'];
      let collected = [];
      for(const sr of srList){
        const posts = await fetchRedditPosts(sr, { limit: 5, sort: 'new' });
        for(const p of posts.slice(0,3)) collected.push({ title: p.title, subreddit: sr, author: p.author, url: `https://reddit.com${p.permalink}`, created: p.created_utc });
      }
      collected = collected.sort((a,b) => (b.created || 0) - (a.created || 0)).slice(0,8);
      if(!collected.length) return interaction.editReply('No hay noticias nuevas esta semana.');
      const embed = new EmbedBuilder().setTitle('Boletín DDLC / P Club / Mods').setTimestamp();
      for(const c of collected) embed.addFields({ name: safe(c.title,80), value: `r/${c.subreddit} • u/${c.author} • ${c.url}` });
      await interaction.editReply({ embeds: [embed] });
    }
  },
  estado: {
    data: { name: 'estado', description: 'Muestra el estado del bot' },
    async execute(interaction){
      const uptime = Math.floor(process.uptime());
      const embed = new EmbedBuilder().setTitle('Estado del bot').addFields({ name: 'Uptime', value: `${uptime}s`, inline: true }, { name: 'Versión', value: BOT_VERSION, inline: true }, { name: 'Canal de notificaciones', value: serverConfig.notificationChannel ? `<#${serverConfig.notificationChannel}>` : 'No configurado', inline: true }).setTimestamp().setFooter({ text: 'ClubAssistant' });
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
};

client.once('ready', async () => {
  await client.application.commands.set(Object.values(slashCommands).map(c => c.data)).catch(()=>null);
  setInterval(async () => {
    try{
      if(!serverConfig.notificationChannel) return;
      await checkTwitter('pclub','pclub_tweet',0xFF6B6B);
      await checkTwitter('teamSalvato','ddlc_tweet',0xF08A5D);
      await checkTwitter('ddlcMods','ddlcMods_tweet',0x9B59B6);
      await checkTwitter('ddlcGame','ddlcGame_tweet',0xFF69B4);
      await autoWeeklyMerch();
      await autoLatestVideo();
    }catch(e){}
  }, CHECK_INTERVAL);
});

client.on('interactionCreate', async (interaction) => {
  if(!interaction.isChatInputCommand()) return;
  const cmd = slashCommands[interaction.commandName];
  if(!cmd) return;
  try{ await cmd.execute(interaction); }catch(e){ console.error(e); await interaction.reply({ content: '❌ Error ejecutando comando', ephemeral: true }).catch(()=>{}); }
});

client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
