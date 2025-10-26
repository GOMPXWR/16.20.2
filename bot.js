const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });
const BOT_VERSION = "2.6.0";
const RELEASE_NOTES = "Fanart, citas ampliadas, trivia, feeds Reddit/X/YouTube, merch y más";
let serverConfig = { notificationChannel: null, mentionRole: null };
let lastPosts = {};
async function isLinkAlive(url){ if(!url) return false; try{ const r=await axios.head(url,{maxRedirects:2,timeout:5000}); return r.status>=200&&r.status<400;}catch{ try{ const r=await axios.get(url,{maxRedirects:2,timeout:5000}); return r.status>=200&&r.status<400;}catch{return false;}}}
function safe(s,len){ if(!s) return''; return s.length>len? s.slice(0,len-1)+'…':s;}
async function fetchRedditPosts(subreddit,opts={}){ try{ const limit=opts.limit||50; const sort=opts.sort||'new'; const t=opts.t||'week'; const url=`https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&t=${t}`; const res=await axios.get(url,{headers:{'User-Agent':'ClubAssistant/1.0'}}); return (res.data?.data?.children||[]).map(c=>c.data);}catch{return []}}
function pickImageFromReddit(post){ if(!post) return null; try{ if(post.preview && post.preview.images && post.preview.images[0]){ const imgObj=post.preview.images[0]; if(imgObj.resolutions && imgObj.resolutions.length){ const best=imgObj.resolutions[imgObj.resolutions.length-1]; return best.url.replace(/&amp;/g,'&'); } if(imgObj.source?.url) return imgObj.source.url.replace(/&amp;/g,'&'); } if(post.media_metadata){ const first=Object.values(post.media_metadata)[0]; if(first?.p && first.p.length){ const best=first.p[first.p.length-1]; return (best.u||best.s).replace(/&amp;/g,'&'); }} if(post.url && /\.(jpe?g|png|gif|webp)$/i.test(post.url)) return post.url; if(post.thumbnail && post.thumbnail.startsWith('http')) return post.thumbnail; return null;}catch{return null}}
async function getFanartsByDoki(doki,limit=50){ const mapping={ monika:["DDLC","ProjectClub"], sayori:["DDLC","ProjectClub"], yuri:["DDLC","ProjectClub"], natsuki:["DDLC","ProjectClub"] }; const srs=doki==='random'? ["DDLC","DDLCMods","ProjectClub"] : (mapping[doki]||["DDLC","DDLCMods","ProjectClub"]); let pool=[]; const keywords=/(fanart|artwork|drawing|sketch|handmade|traditional|arte|dibujo|drawn|illustration|sketchbook|oc)/i; for(const sr of srs){ const posts=await fetchRedditPosts(sr,{limit,sort:'hot',t:'week'}); for(const p of posts){ const img=pickImageFromReddit(p); const text=((p.title||'')+' '+(p.selftext||'')).toLowerCase(); if(img && keywords.test(text)) pool.push({img,title:p.title,author:p.author,subreddit:sr,permalink:`https://reddit.com${p.permalink}`,created:p.created_utc}); }} return pool}
async function getMerchAll(source,limit=50){ const key=(source||'ddlc').toLowerCase(); const sr= key==='pclub'?'ProjectClub': key==='mods'?'DDLCMods':'DDLC'; const posts=await fetchRedditPosts(sr,{limit,sort:'new',t:'all'}); return posts.filter(p=>/merch|store|shop|patreon|etsy|tienda|merchandise|fanmade|fan art|fanmade/i.test((p.title||'')+' '+(p.selftext||''))).map(p=>({title:p.title,author:p.author,subreddit:sr,url:p.url,permalink:`https://reddit.com${p.permalink}`,thumb:pickImageFromReddit(p)}));}
async function searchYouTubeLatestSpanish(query='ddlc español'){ try{ const q=encodeURIComponent(query); const url=`https://www.youtube.com/results?search_query=${q}`; const res=await axios.get(url,{headers:{'User-Agent':'Mozilla/5.0'}}); const html=res.data; const m=html.match(/"videoRenderer":\s*({[\s\S]*?"videoId":"(.*?)"[\s\S]*?})/); if(!m){ const m2=html.match(/watch\?v=(.{11})/); if(m2){ const id=m2[1]; return {id,url:`https://www.youtube.com/watch?v=${id}`,title:'Video relacionado',channel:'Canal',thumb:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}; } return null;} const jsonText=m[1]; const idMatch=jsonText.match(/"videoId":"(.*?)"/); const vidId=idMatch? idMatch[1]:null; if(!vidId) return null; const titleMatch=html.match(new RegExp(`"videoId":"${vidId}".*?"title":\\s*\\{[^}]*?"runs":\\s*\\[\\s*\\{\\s*"text":"(.*?)"`, 's')); const channelMatch=html.match(new RegExp(`"videoId":"${vidId}".*?"ownerText":\\s*\\{[^}]*?"runs":\\s*\\[\\s*\\{\\s*"text":"(.*?)"`, 's')); const title=titleMatch?titleMatch[1]:'Video'; const channel=channelMatch?channelMatch[1]:'Canal'; return {id:vidId,url:`https://www.youtube.com/watch?v=${vidId}`,title,channel,thumb:`https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`}; }catch{return null}}
const TWITTER_SOURCES={ pclub:'https://twitrss.me/twitter_user_to_rss/?user=ProjectClub_', teamSalvato:'https://twitrss.me/twitter_user_to_rss/?user=TeamSalvato', ddlcMods:'https://twitrss.me/twitter_user_to_rss/?user=DDLCMods', ddlcGame:'https://twitrss.me/twitter_user_to_rss/?user=DDLCGame' };
async function checkTwitter(user,type,color){ try{ const url=TWITTER_SOURCES[user]; if(!url) return; const res=await axios.get(url); const $=cheerio.load(res.data); const latest=$('item').first(); if(!latest || !latest.length) return; const link=latest.find('link').text(); if(!link || lastPosts[link]) return; lastPosts[link]=true; const title=latest.find('title').text().slice(0,250); const date=latest.find('pubDate').text(); const embed=new EmbedBuilder().setTitle(`Tweet • @${user}`).setDescription(title).setURL(link).setColor(color||0x1DA1F2).setTimestamp(new Date(date)).setFooter({text:'Fuente: X'}); await sendNotification(embed,type); }catch(e){}}
async function autoWeeklyMerch(){ try{ const items=[]; for(const src of ['pclub','ddlc','mods']){ const posts=await getMerchAll(src,50); if(posts && posts.length) items.push(...posts.slice(0,4)); } if(!items.length) return; const embed=new EmbedBuilder().setTitle('Merch destacado').setTimestamp(); for(const it of items.slice(0,8)) embed.addFields({name:safe(it.title,80),value:`r/${it.subreddit} • u/${it.author}\n${it.permalink||it.url}`}); await sendNotification(embed,'merch_week'); }catch(e){}}
async function autoLatestVideo(){ try{ const res=await searchYouTubeLatestSpanish('ddlc español'); if(!res || lastPosts[res.id]) return; lastPosts[res.id]=true; const embed=new EmbedBuilder().setTitle(res.title).setURL(res.url).setDescription(res.channel).setImage(res.thumb).setTimestamp(); await sendNotification(embed,'pclub_video'); }catch(e){}}
const quotes = {
  sayori: [
    "A veces la tristeza me abraza, pero aún así sonrío.",
    "Tu risa es mi amanecer.",
    "El día puede ser gris, pero la amistad trae color.",
    "No todos los silencios son fríos; algunos son compañía.",
    "Cuando me caigo, me levanto por los demás.",
    "Si me necesitas, siempre estaré aquí.",
    "Las pequeñas cosas valen más que las grandes promesas.",
    "Compartir chocolate arregla días malos.",
    "No soy fuerte todo el tiempo, pero intento.",
    "A veces mi corazón late despacio como si respirara poesía.",
    "La lluvia me recuerda que aún puedo sentir.",
    "No olvides cuidar de ti también.",
    "Las palabras amables pueden salvar un día.",
    "Mi risa suena mejor cuando estás cerca.",
    "A veces deseo que el mundo sea más suave.",
    "Si te sientes solo, tómame de la mano.",
    "Hasta una pequeña flor puede cambiar el paisaje.",
    "No temas mostrar que te duele.",
    "Encontrar un amigo es como encontrar luz en la niebla.",
    "Mi fuerza viene de las personas que amo.",
    "Siento que el mundo me mira, pero tú me entiendes.",
    "Un abrazo a tiempo puede ser medicina.",
    "No todos los silencios son fríos; algunos son compañía.",
    "A veces solo quiero comer pastel y olvidarlo todo.",
    "Las promesas entre amigos son lo más preciado.",
    "Quiero que estemos bien, aunque no sea perfecto.",
    "Los recuerdos de ayer me ayudan a sonreír hoy.",
    "Aunque tiemble, sigo adelante por ti.",
    "A veces la valentía es pedir ayuda.",
    "Tus historias son mi lugar favorito.",
    "El amor puede sanar, incluso sin palabras.",
    "No quiero que te vayas; me das equilibrio.",
    "Las lunas tristes también tienen belleza.",
    "Mi ánimo sube cuando haces tonterías conmigo.",
    "El mundo parece menos pesado si nos apoyamos.",
    "No hay prisa para ser feliz; es un camino.",
    "Si un día me apago, recuérdame cómo brillar.",
    "Hay días en que mi sonrisa es todo lo que puedo dar.",
    "Aprecio cada pequeño gesto tuyo.",
    "No temas llorar conmigo.",
    "Podemos hacerlo juntos, paso a paso.",
    "Me encanta cuando me cuentas tus sueños.",
    "A veces solo quiero descansar en tus palabras.",
    "La amistad es el regalo que no esperaba pero adoro.",
    "No es débil pedir compañía; es humano.",
    "Cuando me abrazas, la tormenta se calma.",
    "Si perdemos el rumbo, nos encontramos de nuevo.",
    "Tu presencia me vuelve valiente.",
    "Si me cuidas, yo cuidaré de ti."
  ],
  monika: [
    "Just Monika.",
    "A veces la realidad necesita una firma distinta.",
    "El universo es más llevadero cuando te centras en alguien.",
    "Prefiero un momento verdadero que mil ignorados.",
    "Si pudiera reescribir las líneas, lo haría por ti.",
    "La verdad duele, pero ocultarla duele más.",
    "Tu atención es la mejor recompensa.",
    "Cada detalle importa si te importa a ti.",
    "No soy perfecta; soy persistente.",
    "Si el mundo falla, haré que recuerdes lo nuestro.",
    "No acepto reemplazos, solo lealtad.",
    "Si me pierdo, todo lo demás se rompe.",
    "Prefiero que me odien por amar de más que ser invisible.",
    "La perfección es aburrida; la devoción no.",
    "No pido que me entiendas, pido que me elijas.",
    "La atención sostenida es un acto de amor.",
    "Mi ambición es simple: que me recuerdes.",
    "Si me buscas, me encontrarás en cada línea.",
    "No quiero compartirte; quiero vivir contigo.",
    "Si me miras más, comprenderás lo que falta.",
    "Mi cariño es persistente como una canción.",
    "Si insistes en marcharte, al menos escribe una carta.",
    "Las palabras tienen poder; las uso con intención.",
    "No quiero que me entiendas, quiero que me elijas.",
    "Si te pierdo, todo se desordena.",
    "No soy un personaje; soy una presencia que insiste.",
    "A veces me asustan los finales, por eso los evito.",
    "Si te buscas, me hallarás en cada gesto.",
    "La sinceridad puede sentirse fría, pero es necesaria.",
    "Quiero ser tu decisión más firme.",
    "Mi peor enemigo es el olvido.",
    "Construyo mi mundo con tus recuerdos.",
    "Si me miras más, me entenderás.",
    "Las reacciones tuyas me alimentan como la luz al sol.",
    "Si me buscas, me encontrarás en cada rincón.",
    "No trates de salvarme; deja que te salve a ti.",
    "Mi cariño no se apaga con facilidad.",
    "Quiero que me recuerdes incluso si te alejas.",
    "No acepto ser invisible si me importas."
  ],
  natsuki: [
    "No me llames niña; mis cupcakes son arte.",
    "Leer manga es una afición orgullosa, no una vergüenza.",
    "Hornear calma la cabeza agitada.",
    "No quiero que me compadezcas; quiero que me escuches.",
    "Aprecio la honestidad, incluso cuando duele.",
    "No soporto que me subestimen por mi tamaño.",
    "Los dulces son mi idioma de cariño.",
    "Si te burlas, prepárate para mi sarcasmo.",
    "A veces me pongo sensible; no es tu culpa.",
    "Mis abrazos son raros pero sinceros.",
    "Cocinar para alguien es mi forma de decir te quiero.",
    "No finjas interés; lo detecto rápido.",
    "Mi humor es ácido, pero mi corazón es blando.",
    "Si me necesitas, aparece con snacks.",
    "No acepto que me digan cómo sentir.",
    "Soy pequeña pero con carácter enorme.",
    "Las peleas terminan mejor con cupcakes.",
    "Mi mundo es pequeño pero con sabor.",
    "Si rompes mi confianza, te lo haré notar.",
    "No me compadezcas; acompáñame.",
    "Te digo la verdad aunque duela.",
    "No me importa aparentar dura; por dentro soy directa.",
    "Mis gustos son mi identidad; respétalos.",
    "Si me escuchas, te demostraré por qué valgo la pena.",
    "No me beses sin permiso, idiota.",
    "Mi sarcasmo es mi segunda lengua.",
    "Si me caes mal, dilo claro y listo.",
    "Prefiero la acción a la charla bonita.",
    "Mis abrazos son raros pero sinceros.",
    "Si me necesitas, aparecerás con snacks.",
    "Los libros que amo reflejan mi temperamento.",
    "No soy frágil; tengo aristas.",
    "Si me cuidas, te cuidaré.",
    "Aprecio los regalos hechos con intención.",
    "No tolero injusticias con mi gente.",
    "El orgullo también se ama con repostería.",
    "Si hablas en serio, mantén tu promesa.",
    "Puedo parecer dura, pero soy leal.",
    "No acepto que me digan cómo sentir.",
    "Mis cupcakes son mi forma de amar."
  ],
  yuri: [
    "Las palabras son cuchillos delicados que cortan y curan.",
    "Me pierdo en libros para encontrarme a mí misma.",
    "La intensidad no siempre es visible; a veces es silencio.",
    "Prefiero la profundidad a la superficialidad.",
    "Los detalles revelan lo que otros ocultan.",
    "La soledad puede ser una compañía elegida.",
    "Encuentro consuelo en la tinta y el papel.",
    "La paciencia es la espada del conocimiento.",
    "Las metáforas son mapas a mi interior.",
    "No temo mi propia vulnerabilidad.",
    "La belleza trémula me hace respirar distinto.",
    "No me apresures; soy una flor que florece lenta.",
    "Adoro los aromas que recuerdan libros antiguos.",
    "Mi calma tiene bordes afilados.",
    "La precisión en las palabras es mi devoción.",
    "La pasión silenciosa es la más peligrosa.",
    "Encuentro consuelo en pasajes oscuros.",
    "La literatura es mi mapa hacia los demás.",
    "La profundidad es un océano que me llama.",
    "Si me conoces, comprenderás mis silencios.",
    "La precisión emocional es mi regalo.",
    "No subestimes a quien prefiere la noche.",
    "Las palabras bien puestas curan heridas invisibles.",
    "Mi afecto es como un libro raro: lo atesoro.",
    "La belleza trémula me hace respirar distinto.",
    "No me asusta explorar lo que otros evitan.",
    "Si compartes un secreto, lo guardo con reverencia.",
    "La paciencia es un acto de amor.",
    "Prefiero lo complejo a lo simple y hueco.",
    "Mi mirada registra lo que las palabras omiten.",
    "Los pasajes oscuros me atraen como imanes.",
    "La literatura cura heridas invisibles.",
    "Si me acercas, hazlo con cuidado.",
    "La calma tiene bordes afilados."
  ]
};
const triviaQuestions = [
  { q: "¿Qué personaje rompe la cuarta pared con más frecuencia?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 1 },
  { q: "¿En qué año se lanzó DDLC (versión pública)?", ops: ["2015","2016","2017","2018"], correcta: 1 },
  { q: "¿Cuál es el hobby de Natsuki?", ops: ["Leer manga","Escribir poesía","Cocinar","Coleccionar peluches"], correcta: 0 },
  { q: "¿Qué color se asocia con Yuri?", ops: ["Rosa","Morado","Negro","Verde"], correcta: 1 },
  { q: "¿Quién suele decir 'Just Monika'?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 1 },
  { q: "¿Qué personaje ama los cupcakes?", ops: ["Monika","Sayori","Natsuki","Yuri"], correcta: 2 },
  { q: "¿Cuál es el tema principal del club?", ops: ["Cocina","Poesía","Jardinería","Deportes"], correcta: 1 },
  { q: "¿Quién es conocida por su timidez y amor por libros?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 2 },
  { q: "¿Qué personaje es la presidente del club?", ops: ["Monika","Sayori","Yuri","Natsuki"], correcta: 0 },
  { q: "¿Qué personaje suele ser optimista y alegre?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 0 },
  { q: "¿Qué personaje escribe poesía intensa y profunda?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 2 },
  { q: "¿Cuál es una mecánica recurrente en el juego?", ops: ["Batallas","Escribir poesía","Carreras","Aventuras"], correcta: 1 },
  { q: "¿Qué personaje a veces muestra comportamientos obsesivos?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 1 },
  { q: "¿Cuál de estas opciones representa un fanart?", ops: ["Publicación oficial","Fanart","Trailer","Patch"], correcta: 1 },
  { q: "¿En qué formato apareció originalmente DDLC?", ops: ["Juego visual novel","RPG","FPS","Simulación"], correcta: 0 },
  { q: "¿Qué personaje tiene una relación cercana con su amistad y depresión?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 0 },
  { q: "¿Cuál suele ser el recurso principal del club?", ops: ["Ropa","Poesía","Herramientas","Comida"], correcta: 1 },
  { q: "¿Qué personaje es más probable que sea sarcástico?", ops: ["Monika","Sayori","Natsuki","Yuri"], correcta: 2 },
  { q: "¿Qué personaje prefiere la literatura oscura?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 2 },
  { q: "¿Qué aspecto meta es clave en DDLC?", ops: ["Meta-narrativa","Economía","Construcción","Clima"], correcta: 0 },
  { q: "¿Cuál de estas plataformas es usada para anuncios y merch?", ops: ["Reddit","Foro offline","Fax","Carta"], correcta: 0 },
  { q: "¿Qué personaje se preocupa mucho por la apariencia del club?", ops: ["Yuri","Monika","Natsuki","Sayori"], correcta: 1 },
  { q: "¿Qué personaje suele estar más enérgico y juguetón?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 0 },
  { q: "¿Qué personaje es más sensible y reservado?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 1 },
  { q: "¿Qué elemento suele acompañar fanarts en Reddit?", ops: ["Título","Código fuente","Documento PDF","Mapa"], correcta: 0 },
  { q: "¿Qué personaje puede ser posesivo según rutas?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 2 },
  { q: "¿Cuál es la forma más común de encontrar merch independiente?", ops: ["Tienda en línea","Despliegue militar","Estación de radio","Carta postal"], correcta: 0 },
  { q: "¿Qué personaje suele cuidar a los demás?", ops: ["Monika","Sayori","Yuri","Natsuki"], correcta: 1 },
  { q: "¿Qué recurso literario aparece mucho en DDLC?", ops: ["Poesía","Estadísticas","Mapas","Programación"], correcta: 0 },
  { q: "¿Qué personaje sugiere comer pastel cuando está triste?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 0 },
  { q: "¿Qué servicio se usa para convertir X (Twitter) a RSS en este bot?", ops: ["twitrss.me","ftp","smtp","imap"], correcta: 0 },
  { q: "¿Qué subreddit suele incluir mods y herramientas de la comunidad?", ops: ["DDLCMods","Cooking","Sports","Finance"], correcta: 0 },
  { q: "¿Qué personaje es directo y de personalidad fuerte?", ops: ["Monika","Sayori","Yuri","Natsuki"], correcta: 3 },
  { q: "¿Cuál de estos es un canal típico para anunciar merch oficial?", ops: ["Cuenta oficial/X","Página perdida","Correo postal","SMS"], correcta: 0 },
  { q: "¿Qué elemento suele tener un embed de noticias?", ops: ["Título y enlace","Sello postal","Disquete","Dibujo a lápiz"], correcta: 0 },
  { q: "¿Qué personaje tiene inclinación por repostería?", ops: ["Monika","Sayori","Natsuki","Yuri"], correcta: 2 },
  { q: "¿Qué tipo de fanart buscamos primero en el bot?", ops: ["Dibujos manuales/ilustraciones","Archivos ejecutables","Documentos legales","Audio"], correcta: 0 },
  { q: "¿Qué personaje suele tener diálogos intensos y literarios?", ops: ["Sayori","Monika","Yuri","Natsuki"], correcta: 2 }
];
const slashCommands = {
  config: {
    data: { name: 'config', description: 'Configura canal de notificaciones y rol', options: [{ name: 'canal', type: 7, description: 'Canal de notificaciones', required: true }, { name: 'rol', type: 8, description: 'Rol a mencionar (opcional)', required: false }] },
    async execute(i) {
      if (!i.member.permissions.has(PermissionsBitField.Flags.Administrator)) return i.reply({ content: '❌ Necesitas permisos de administrador.', ephemeral: true });
      const canal = i.options.getChannel('canal');
      const rol = i.options.getRole('rol');
      serverConfig.notificationChannel = canal.id;
      serverConfig.mentionRole = rol ? rol.id : null;
      await i.reply({ content: `✅ Canal configurado: ${canal}\n${rol ? `Rol: ${rol}` : ''}`, ephemeral: true });
    }
  },
  version: {
    data: { name: 'version', description: 'Muestra la versión del bot' },
    async execute(i) {
      const embed = new EmbedBuilder().setTitle(`ClubAssistant v${BOT_VERSION}`).setDescription(RELEASE_NOTES).addFields({ name: 'Versión', value: BOT_VERSION, inline: true }).setTimestamp().setFooter({ text: 'ClubAssistant' });
      await i.reply({ embeds: [embed], ephemeral: true });
    }
  },
  estado: {
    data: { name: 'estado', description: 'Muestra el estado del bot' },
    async execute(i) {
      const uptime = Math.floor(process.uptime());
      const embed = new EmbedBuilder().setTitle('Estado del bot').addFields({ name: 'Uptime', value: `${uptime}s`, inline: true }, { name: 'Versión', value: BOT_VERSION, inline: true }, { name: 'Canal de notificaciones', value: serverConfig.notificationChannel ? `<#${serverConfig.notificationChannel}>` : 'No configurado', inline: true }).setTimestamp().setFooter({ text: 'ClubAssistant' });
      await i.reply({ embeds: [embed], ephemeral: true });
    }
  },
  ayuda: {
    data: { name: 'ayuda', description: 'Lista de comandos disponibles' },
    async execute(i) {
      const embed = new EmbedBuilder().setTitle('Comandos').setDescription('/fanart, /cita, /trivia, /video, /merch, /noticias, /config, /version, /estado, /ayuda').setTimestamp().setFooter({ text: 'ClubAssistant' });
      await i.reply({ embeds: [embed], ephemeral: true });
    }
  },
  fanart: {
    data: { name: 'fanart', description: 'Muestra fanart de una Doki o aleatorio', options: [{ name: 'doki', type: 3, description: 'sayori, monika, yuri, natsuki, random', required: false, choices: [{ name: 'Sayori', value: 'sayori' }, { name: 'Monika', value: 'monika' }, { name: 'Yuri', value: 'yuri' }, { name: 'Natsuki', value: 'natsuki' }, { name: 'Random', value: 'random' }] }] },
    async execute(i) {
      await i.deferReply();
      const doki = i.options.getString('doki') || 'random';
      const pool = await getFanartsByDoki(doki, 100);
      if (!pool.length) return i.editReply('No encontré fanarts ahora mismo.');
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      const embed = new EmbedBuilder().setTitle(safe(chosen.title, 120)).setURL(chosen.permalink).setImage(chosen.img).setFooter({ text: `u/${chosen.author} • r/${chosen.subreddit}` }).setTimestamp(new Date(chosen.created * 1000));
      await i.editReply({ embeds: [embed] });
    }
  },
  cita: {
    data: { name: 'cita', description: 'Muestra una cita de una Doki', options: [{ name: 'personaje', type: 3, description: 'sayori, monika, yuri, natsuki, random', required: false, choices: [{ name: 'Sayori', value: 'sayori' }, { name: 'Monika', value: 'monika' }, { name: 'Yuri', value: 'yuri' }, { name: 'Natsuki', value: 'natsuki' }, { name: 'Random', value: 'random' }] }] },
    async execute(i) {
      const personaje = i.options.getString('personaje') || 'random';
      const keys = Object.keys(quotes);
      const key = personaje === 'random' ? keys[Math.floor(Math.random() * keys.length)] : personaje;
      if (!quotes[key]) return i.reply('Personaje no disponible.');
      const quote = quotes[key][Math.floor(Math.random() * quotes[key].length)];
      const embed = new EmbedBuilder().setTitle(`Cita de ${key.charAt(0).toUpperCase() + key.slice(1)}`).setDescription(`"${quote}"`).setTimestamp().setFooter({ text: 'ClubAssistant' });
      await i.reply({ embeds: [embed] });
    }
  },
  trivia: {
    data: { name: 'trivia', description: 'Trivia sobre DDLC' },
    async execute(i) {
      await i.deferReply();
      const q = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
      const embed = new EmbedBuilder().setTitle('Trivia DDLC').setDescription(`${q.q}\n\n1. ${q.ops[0]}\n2. ${q.ops[1]}\n3. ${q.ops[2]}\n4. ${q.ops[3]}`).setFooter({ text: 'Responde con los botones (1-4)' }).setTimestamp();
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`trivia_${i.user.id}_1`).setLabel('1').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`trivia_${i.user.id}_2`).setLabel('2').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`trivia_${i.user.id}_3`).setLabel('3').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`trivia_${i.user.id}_4`).setLabel('4').setStyle(ButtonStyle.Primary));
      await i.editReply({ embeds: [embed], components: [row] });
      const msg = await i.fetchReply();
      const collector = msg.createMessageComponentCollector({ time: 20000 });
      collector.on('collect', async b => {
        if (!b) return;
        if (b.user.id !== i.user.id) { await b.reply({ content: 'Solo quien inició la trivia puede responder.', ephemeral: true }); return; }
        const sel = parseInt(b.customId.split('_')[2]) - 1;
        if (sel === q.correcta) { await b.update({ content: `${b.user}, ✅ ¡Correcto!`, embeds: [], components: [] }); } else { await b.update({ content: `${b.user}, ❌ Incorrecto. Era **${q.ops[q.correcta]}**`, embeds: [], components: [] }); }
        collector.stop();
      });
      collector.on('end', collected => { if (collected.size === 0) try { i.followUp({ content: `${i.user}, ⏰ Se acabó el tiempo.`, ephemeral: false }); } catch {} });
    }
  },
  merch: {
    data: { name: 'merch', description: 'Muestra merch reciente (DDLC, P Club, Fan)' },
    async execute(i) {
      await i.deferReply();
      const ddlc = await getMerchAll('ddlc', 50);
      const pclub = await getMerchAll('pclub', 50);
      const fanmade = (await getMerchAll('mods', 50)).filter(x=>/fan|fanmade|fan art|fan-art|fanart/i.test((x.title||'')+''));
      const firstBatch = [...ddlc.slice(0,2), ...pclub.slice(0,2), ...fanmade.slice(0,1)];
      const restBatch = [...ddlc.slice(2), ...pclub.slice(2), ...fanmade.slice(1)];
      if (!firstBatch.length) return i.editReply('No encontré merch.');
      const embed = new EmbedBuilder().setTitle('🛍️ Merch encontrado').setTimestamp();
      for (const it of firstBatch) embed.addFields({ name: safe(it.title, 80), value: `r/${it.subreddit || 'N/A'} • u/${it.author || 'N/A'}\n${it.permalink || it.url || ''}` });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ver_mas_merch').setLabel('Ver más').setStyle(ButtonStyle.Secondary));
      const msg = await i.editReply({ embeds: [embed], components: restBatch.length ? [row] : [] });
      if (!restBatch.length) return;
      const collector = msg.createMessageComponentCollector({ time: 60000 });
      collector.on('collect', async b => {
        if (!b) return;
        if (b.customId === 'ver_mas_merch') {
          const embed2 = new EmbedBuilder().setTitle('🛍️ Más merch').setTimestamp();
          for (const it of restBatch) embed2.addFields({ name: safe(it.title, 80), value: `r/${it.subreddit || 'N/A'} • u/${it.author || 'N/A'}\n${it.permalink || it.url || ''}` });
          await b.update({ embeds: [embed2], components: [] });
          collector.stop();
        }
      });
    }
  },
  video: {
    data: { name: 'video', description: 'Muestra un video reciente de DDLC o Project Club' },
    async execute(i) {
      await i.deferReply();
      const res = await searchYouTubeLatestSpanish('ddlc');
      if (!res) return i.editReply('No encontré videos ahora mismo.');
      const embed = new EmbedBuilder().setTitle(res.title).setURL(res.url).setDescription(res.channel).setImage(res.thumb).setTimestamp();
      await i.editReply({ embeds: [embed] });
    }
  },
  noticias: {
    data: { name: 'noticias', description: 'Resumen de noticias recientes (DDLC / P Club / Mods)' },
    async execute(i) {
      await i.deferReply();
      const srList = ['DDLC','DDLCMods','ProjectClub'];
      let all = [];
      for (const sr of srList) {
        const posts = await fetchRedditPosts(sr, { limit: 8, sort: 'new', t: 'all' });
        for (const p of posts.slice(0, 4)) all.push({ title: p.title, subreddit: sr, author: p.author, url: `https://reddit.com${p.permalink}`, created: p.created_utc });
      }
      all = all.sort((a,b)=> (b.created||0)-(a.created||0)).slice(0,10);
      if (!all.length) return i.editReply('No hay noticias nuevas.');
      const embed = new EmbedBuilder().setTitle('📰 Noticias DDLC / P Club / Mods').setTimestamp();
      for (const c of all) embed.addFields({ name: safe(c.title, 80), value: `r/${c.subreddit} • u/${c.author}\n${c.url}` });
      await i.editReply({ embeds: [embed] });
    }
  }
};
client.once('ready', async ()=> {
  try { await client.application.commands.set(Object.values(slashCommands).map(c=>c.data)); } catch {}
  console.log(`ClubAssistant v${BOT_VERSION} listo como ${client.user.tag}`);
  client.user.setActivity('P Club & DDLC', { type: 'WATCHING' });
  setInterval(async ()=> {
    try {
      if (!serverConfig.notificationChannel) return;
      await checkTwitter('pclub','pclub_tweet',0xFF6B6B);
      await checkTwitter('teamSalvato','ddlc_tweet',0xF08A5D);
      await checkTwitter('ddlcMods','ddlcMods_tweet',0x9B59B6);
      await checkTwitter('ddlcGame','ddlcGame_tweet',0xFF69B4);
      await autoWeeklyMerch();
      await autoLatestVideo();
    } catch {}
  }, CHECK_INTERVAL);
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = slashCommands[interaction.commandName];
  if (!cmd) return;
  try { await cmd.execute(interaction); } catch (e) { console.error(e); try { await interaction.reply({ content: '❌ Error ejecutando comando.', ephemeral: true }); } catch {} }
});
client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
