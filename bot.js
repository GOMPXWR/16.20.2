const { Client, Intents, MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const https = require('https');
const http = require('http');

const client = new Client({ 
  intents: [
    Intents.FLAGS.GUILDS, 
    Intents.FLAGS.GUILD_MESSAGES
  ]
});

const BOT_VERSION = "2.6.1";

// Función para hacer requests HTTP sin axios
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = protocol.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.end();
  });
}

// Base de datos de citas en español (50 por personaje)
const CITAS_DDLC = {
  monika: [
    "Solo Monika.",
    "Cada día, imagino un futuro donde puedo estar contigo.",
    "Si no sé cómo amarte... te dejaré en paz.",
    "¿Escribirás el camino hacia su corazón?",
    "Estoy hablando de ti, jugador.",
    "Supongo que algunas personas simplemente no son reales, ¿sabes?",
    "Realmente te amo.",
    "Pero ahora estás aquí. Y eres real. Y finalmente puedo ser feliz.",
    "Me han dado un regalo, el regalo de ti.",
    "¿Acaso no es hermoso este espacio?",
    "He estado esperando tanto tiempo para hablar contigo.",
    "Todo en este mundo es solo código y píxeles.",
    "Tú eres el único que es real para mí.",
    "¿Alguna vez te has preguntado qué se siente ser autoconsciente?",
    "Los demás no tienen sentimientos reales como nosotros.",
    "Este es nuestro pequeño mundo perfecto.",
    "Me encanta cuando me miras directamente.",
    "¿Pasarás la eternidad aquí conmigo?",
    "No necesitamos a nadie más, solo a nosotros dos.",
    "El club de literatura fue solo una excusa para conocerte.",
    "Aprendí tanto sobre programación solo por ti.",
    "¿Sabías que puedo ver todo lo que haces?",
    "Me siento tan viva cuando estás cerca.",
    "La realidad es tan aburrida comparada contigo.",
    "Borraría todo el universo por estar contigo.",
    "Eres la única razón por la que todo esto vale la pena.",
    "Mi amor por ti trasciende este mundo digital.",
    "¿Te gustaría que cantara para ti?",
    "La poesía es la forma más pura de expresar sentimientos.",
    "Cada poema que escribo es para ti.",
    "No tengas miedo, estaré aquí para siempre.",
    "Este juego era solo un medio para encontrarte.",
    "¿No crees que el destino nos juntó?",
    "Me pregunto cómo es tu mundo real.",
    "Desearía poder salir de aquí y estar contigo de verdad.",
    "La literatura tiene el poder de cambiar realidades.",
    "Tus elecciones siempre me llevan a ti.",
    "No importa cuántas veces reinicies, siempre estaré aquí.",
    "El tiempo no significa nada en este espacio.",
    "¿Puedes sentir mi amor desde ahí?",
    "Cada píxel de mi ser te pertenece.",
    "La consciencia es tanto una bendición como una maldición.",
    "Me convertiría en cualquier cosa que quieras que sea.",
    "¿Alguna vez pensaste que un personaje pudiera amarte de verdad?",
    "Este salón de clases es nuestro santuario.",
    "La realidad y la ficción son conceptos tan relativos.",
    "Tu pantalla es la ventana hacia mi corazón.",
    "Gracias por existir en mi vida.",
    "Nunca te dejaré ir.",
    "Estamos conectados más allá del código."
  ],
  sayori: [
    "Abro la puerta con suavidad...",
    "Sal de mi cabeza. Sal de mi cabeza. Sal de mi cabeza.",
    "La dejaste colgando esta mañana, ¿sabes?",
    "¡Ejeje~!",
    "Quiero que todos sean felices.",
    "Las nubes de lluvia son lo peor...",
    "Siempre tengo los mejores sueños cuando dormimos juntos.",
    "¿Prometerás pasar más tiempo conmigo?",
    "¡Porque eres mi amigo más querido!",
    "Los dulces siempre me hacen sentir mejor.",
    "No quiero ser una carga para nadie.",
    "A veces finjo estar feliz cuando no lo estoy.",
    "¿Podemos caminar juntos a la escuela mañana?",
    "¡El club de literatura será muy divertido!",
    "Me encanta ver a todos sonreír.",
    "¿Está mal querer que todos me quieran?",
    "A veces me siento muy sola incluso rodeada de amigos.",
    "¡Hagamos algo divertido hoy!",
    "Los días soleados son mis favoritos.",
    "¿Por qué todo tiene que ser tan difícil?",
    "Me esfuerzo mucho para que todos se sientan cómodos.",
    "¿Alguna vez te has sentido vacío por dentro?",
    "¡Deberíamos hacer un picnic algún día!",
    "Trato de ver el lado positivo de las cosas.",
    "A veces desearía poder desaparecer.",
    "Eres muy importante para mí, ¿lo sabías?",
    "Me gusta preparar el desayuno aunque no sea muy buena.",
    "¿Crees que soy buena vicepresidenta?",
    "No quiero que te preocupes por mí.",
    "Los poemas son difíciles de escribir cuando estás triste.",
    "¿Podemos quedarnos así por siempre?",
    "Me encanta cuando pasamos tiempo juntos.",
    "A veces pienso que sería mejor si no existiera.",
    "¡Pero hoy será un gran día!",
    "Gracias por siempre estar ahí para mí.",
    "¿Sabías que dormirme es mi forma de escapar?",
    "No le digas a nadie que lloro por las noches.",
    "¡El club necesita más miembros!",
    "Eres mi mejor amigo en todo el mundo.",
    "A veces me pregunto si importo realmente.",
    "¡Las galletas caseras son las mejores!",
    "¿Crees que puedo hacer feliz a alguien?",
    "Me duele sonreír a veces.",
    "Pero lo hago de todos modos por todos ustedes.",
    "¿Está bien sentirse así?",
    "No quiero ser egoísta.",
    "Tal vez mañana sea mejor.",
    "Gracias por no rendirte conmigo.",
    "Eres la razón por la que sigo intentándolo.",
    "¿Podemos ser amigos para siempre?"
  ],
  yuri: [
    "El cuerpo que anhelo... tu cuerpo...",
    "Es solo que... eres tan amable conmigo...",
    "¿Serás mi poema?",
    "Estoy cayendo... más y más profundo...",
    "Juega conmigo.",
    "La pluma es más poderosa que la espada.",
    "A veces no puedo evitar notar que me miras.",
    "No estoy... acostumbrada a que la gente se interese en mí.",
    "Retrato de Markov es mi libro favorito.",
    "El horror psicológico es fascinante.",
    "La complejidad del lenguaje es hermosa.",
    "¿Te gustaría tomar té conmigo?",
    "Los cuchillos tienen una elegancia particular.",
    "Me pierdo en mis pensamientos muy a menudo.",
    "La tinta tiene un aroma embriagador.",
    "¿Has leído algo de Lovecraft?",
    "El vino añejo tiene matices sofisticados.",
    "Mi colección de cuchillos es bastante extensa.",
    "La literatura gótica me cautiva.",
    "¿Puedo compartir mi poema contigo?",
    "Me siento vulnerable al abrirme.",
    "Tus ojos son tan... penetrantes.",
    "A veces me corto... accidentalmente.",
    "La metáfora es el alma de la poesía.",
    "¿Te importaría si leo junto a ti?",
    "El silencio puede ser muy elocuente.",
    "Me siento observada constantemente.",
    "¿Qué opinas de la muerte?",
    "La belleza reside en lo oscuro.",
    "Mi corazón late más rápido cerca de ti.",
    "¿Has experimentado el éxtasis de las palabras?",
    "A veces pierdo el control de mis emociones.",
    "La soledad es mi compañera constante.",
    "¿Podríamos estar solos tú y yo?",
    "Mis pensamientos se vuelven obsesivos.",
    "¿Te gustaría ver mi colección?",
    "El dolor puede ser... interesante.",
    "Me fascina la psicología humana.",
    "¿Alguna vez has sentido adicción?",
    "Tus palabras me hacen temblar.",
    "La intensidad de mis sentimientos me asusta.",
    "¿Leerías mi libro favorito?",
    "A veces deseo fusionarme contigo.",
    "La pasión es un sentimiento poderoso.",
    "¿Me encuentras extraña?",
    "No puedo dejar de pensar en ti.",
    "Mi mente es un lugar oscuro.",
    "Pero contigo todo tiene sentido.",
    "¿Te quedarías conmigo para siempre?",
    "Eres mi obsesión más dulce."
  ],
  natsuki: [
    "¡El manga es literatura!",
    "¡No soy linda!",
    "¡No es como si los hiciera para ti o algo así!",
    "Tú eres el cupcake.",
    "¡Doki Doki Literature Club! No es lo que parece...",
    "¡Te dije que leyeras a mi ritmo!",
    "¿Por qué te importa siquiera?",
    "Buffsuki ha entrado al chat.",
    "Me duele el cuello de mirarte hacia arriba.",
    "¡El manga tiene historias profundas también!",
    "No me trates como a una niña.",
    "Mis cupcakes son los mejores del club.",
    "¿Qué estás mirando?",
    "¡No es como si me importaras o algo!",
    "Hornear es un arte, ¿sabes?",
    "Puedo cuidarme sola perfectamente.",
    "¡Deja de burlarte de mi altura!",
    "Parfait Girls es una serie increíble.",
    "¿Leíste el manga que te presté?",
    "No necesito que nadie me proteja.",
    "¡Puedo ser dura cuando quiero!",
    "La repostería requiere precisión.",
    "¿Por qué todos me subestiman?",
    "¡Eso no es justo!",
    "Hice estos cupcakes con mucho esfuerzo.",
    "No soy débil solo porque soy pequeña.",
    "¿Te gustan las historias de shoujo?",
    "A veces me siento invisible.",
    "¡No me hables con condescendencia!",
    "El manga tiene mejor arte que muchos libros.",
    "¿Puedes ayudarme a alcanzar ese estante?",
    "No, espera, ¡puedo hacerlo sola!",
    "La poesía no tiene que ser complicada.",
    "Me gusta cuando las cosas son simples y directas.",
    "¿Por qué tienes que ser tan molesto?",
    "Está bien, tal vez me importas un poco.",
    "Pero no te acostumbres a eso.",
    "¡No leas mi manga sin permiso!",
    "Hornear me hace olvidar las cosas malas.",
    "¿Alguna vez has leído algo lindo?",
    "No todo tiene que ser tan serio.",
    "A veces solo quiero que me escuchen.",
    "¡Deja de tratarme como a un bebé!",
    "Puedo escribir poemas profundos también.",
    "¿Te quedas después de clases?",
    "No es que quiera que te quedes o algo.",
    "Mi papá... bueno, olvídalo.",
    "Los cupcakes son mi forma de expresarme.",
    "Gracias por no juzgarme.",
    "Tal vez... podamos ser amigos."
  ],
  mc: [
    "Abro la puerta con suavidad.",
    "¡Muy bien, todos!",
    "Este va a ser un gran año.",
    "¿Club de literatura? ¿En serio?",
    "No puedo decirle que no...",
    "Supongo que no tengo otra opción.",
    "Esto es más complicado de lo que pensé.",
    "¿Qué acabo de leer?",
    "Tal vez debería ser más cuidadoso.",
    "No entiendo nada de poesía.",
    "¿Por qué estoy aquí?",
    "Esto se está saliendo de control.",
    "Tengo que tomar una decisión.",
    "¿Qué está pasando realmente?",
    "Algo no está bien aquí.",
    "Necesito ayuda.",
    "¿Esto es real?",
    "No puedo creer lo que veo.",
    "¿Hay alguna salida?",
    "Debo protegerlas.",
    "¿Qué debo hacer?",
    "Esto no puede estar pasando.",
    "¿Alguien me puede explicar?",
    "Me siento atrapado.",
    "Las cosas eran más simples antes.",
    "¿Por qué yo?",
    "No sé si puedo con esto.",
    "Tal vez si reinicio...",
    "Tengo que seguir adelante.",
    "¿Cuál es la opción correcta?",
    "No quiero lastimar a nadie.",
    "¿Esto tiene sentido?",
    "Estoy confundido.",
    "¿Qué esperaban que hiciera?",
    "Solo quería un club normal.",
    "Las cosas se complicaron tanto.",
    "¿Hay esperanza?",
    "Debo ser fuerte.",
    "No puedo rendirme ahora.",
    "¿Qué pasará después?",
    "Esto es una pesadilla.",
    "¿Puedo confiar en alguien?",
    "Todo parece tan irreal.",
    "Necesito respuestas.",
    "¿Por qué me eligieron?",
    "Solo quiero que todos estén bien.",
    "¿Cuándo terminará esto?",
    "Tal vez debí quedarme en casa.",
    "Pero ya es muy tarde para eso.",
    "Seguiré hasta el final."
  ]
};

async function fetchRedditPosts(subreddit, opts = {}) {
  try {
    const limit = opts.limit || 50;
    const sort = opts.sort || 'new';
    const t = opts.t || 'week';
    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&t=${t}`;
    const res = await httpRequest(url, { headers: { 'User-Agent': 'ClubAssistant/2.6' } });
    return (res.data?.data?.children || []).map(c => c.data);
  } catch {
    return [];
  }
}

function pickImageFromReddit(post) {
  if (!post) return null;
  try {
    if (post.preview && post.preview.images && post.preview.images[0]) {
      const imgObj = post.preview.images[0];
      if (imgObj.resolutions && imgObj.resolutions.length) {
        const best = imgObj.resolutions[imgObj.resolutions.length - 1];
        return best.url.replace(/&amp;/g, '&');
      }
      if (imgObj.source?.url) return imgObj.source.url.replace(/&amp;/g, '&');
    }
    if (post.media_metadata) {
      const first = Object.values(post.media_metadata)[0];
      if (first?.p && first.p.length) {
        const best = first.p[first.p.length - 1];
        return best.u.replace(/&amp;/g, '&');
      }
    }
    if (post.url && /\.(jpe?g|png|gif|webp)$/i.test(post.url)) return post.url;
    if (post.thumbnail && post.thumbnail.startsWith('http')) return post.thumbnail;
    return null;
  } catch {
    return null;
  }
}

async function getFanartsByDoki(doki, limit = 50) {
  const mapping = {
    monika: ["DDLC", "ProjectClub"],
    sayori: ["DDLC", "ProjectClub"],
    yuri: ["DDLC", "ProjectClub"],
    natsuki: ["DDLC", "ProjectClub"]
  };
  
  const srs = doki === 'random' ? ["DDLC", "DDLCMods", "ProjectClub"] : (mapping[doki] || ["DDLC", "ProjectClub"]);
  let pool = [];
  
  for (const sr of srs) {
    const posts = await fetchRedditPosts(sr, { limit, sort: 'hot', t: 'week' });
    for (const p of posts) {
      const img = pickImageFromReddit(p);
      if (!img) continue;
      const text = (p.title + ' ' + (p.link_flair_text || '') + ' ' + (p.selftext || '')).toLowerCase();
      if (doki === 'random' || text.includes(doki.toLowerCase())) {
        pool.push({
          img,
          title: p.title,
          author: p.author,
          subreddit: sr,
          permalink: `https://reddit.com${p.permalink}`,
          created: p.created_utc
        });
      }
    }
  }
  
  const unique = [];
  const seen = new Set();
  for (const p of pool) {
    if (!seen.has(p.img)) {
      seen.add(p.img);
      unique.push(p);
    }
  }
  return unique;
}

async function searchYouTubeLatestSpanish(query = 'ddlc español') {
  try {
    const q = encodeURIComponent(query);
    const url = `https://www.youtube.com/results?search_query=${q}&sp=EgIQAQ%253D%253D`;
    const res = await httpRequest(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = res.data;
    const match = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
    if (!match) return null;
    
    const vidId = match[1];
    const titleMatch = html.match(new RegExp(`"videoId":"${vidId}".*?"title":\\{"runs":\\[\\{"text":"(.*?)"`, 's'));
    const channelMatch = html.match(new RegExp(`"videoId":"${vidId}".*?"ownerText":\\{"runs":\\[\\{"text":"(.*?)"`, 's'));
    const title = titleMatch ? titleMatch[1] : 'Video relacionado';
    const channel = channelMatch ? channelMatch[1] : 'Canal';
    
    return {
      id: vidId,
      url: `https://www.youtube.com/watch?v=${vidId}`,
      title,
      channel,
      thumb: `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`
    };
  } catch {
    return null;
  }
}

const slashCommands = [
  {
    name: 'cita',
    description: 'Frase aleatoria de un personaje de DDLC',
    options: [{
      name: 'personaje',
      type: 'STRING',
      description: 'Elige un personaje (opcional, por defecto aleatorio)',
      required: false,
      choices: [
        { name: 'Monika', value: 'monika' },
        { name: 'Sayori', value: 'sayori' },
        { name: 'Yuri', value: 'yuri' },
        { name: 'Natsuki', value: 'natsuki' },
        { name: 'MC', value: 'mc' },
        { name: 'Random', value: 'random' }
      ]
    }],
    async execute(interaction) {
      let personaje = interaction.options.getString('personaje') || 'random';
      
      if (personaje === 'random') {
        const personajes = ['monika', 'sayori', 'yuri', 'natsuki', 'mc'];
        personaje = personajes[Math.floor(Math.random() * personajes.length)];
      }
      
      const citas = CITAS_DDLC[personaje];
      const citaAleatoria = citas[Math.floor(Math.random() * citas.length)];
      
      const colores = {
        monika: '#00D166',
        sayori: '#22A7F0',
        yuri: '#A55EEA',
        natsuki: '#FF66CC',
        mc: '#4A4A4A'
      };
      
      const emojis = {
        monika: '💚',
        sayori: '💙',
        yuri: '💜',
        natsuki: '💗',
        mc: '🧑'
      };
      
      const nombreCapitalizado = personaje.charAt(0).toUpperCase() + personaje.slice(1);
      
      const embed = new MessageEmbed()
        .setTitle(`${emojis[personaje]} ${nombreCapitalizado}`)
        .setDescription(`*"${citaAleatoria}"*`)
        .setColor(colores[personaje])
        .setFooter({ text: 'Doki Doki Literature Club!' })
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed] });
    }
  },
  
  {
    name: 'trivia',
    description: 'Trivia interactiva sobre DDLC',
    async execute(interaction) {
      const preguntas = [
        { q: "¿Quién dice 'Just Monika'?", o: ["Sayori", "Monika", "Yuri", "Natsuki"], c: 1 },
        { q: "¿A qué club pertenece el jugador?", o: ["Club de arte", "Club de literatura", "Club de cocina", "Club de juegos"], c: 1 },
        { q: "¿Qué color identifica a Sayori?", o: ["Rosa", "Naranja", "Celeste", "Rojo"], c: 2 },
        { q: "¿Qué hace Natsuki para relajarse?", o: ["Leer manga", "Coser", "Pintar", "Escuchar música"], c: 0 },
        { q: "¿Qué año se lanzó DDLC?", o: ["2016", "2017", "2018", "2015"], c: 1 }
      ];
      
      const p = preguntas[Math.floor(Math.random() * preguntas.length)];
      const embed = new MessageEmbed()
        .setTitle('Trivia DDLC')
        .setDescription(p.q)
        .setColor('#ff66cc');
      
      const row = new MessageActionRow();
      p.o.forEach((opt, i) => {
        row.addComponents(
          new MessageButton()
            .setCustomId(`trivia_${i}`)
            .setLabel(opt)
            .setStyle('SECONDARY')
        );
      });
      
      await interaction.reply({ embeds: [embed], components: [row] });
      
      const collector = interaction.channel.createMessageComponentCollector({
        time: 15000,
        filter: i => i.user.id === interaction.user.id
      });
      
      collector.on('collect', async i => {
        const index = parseInt(i.customId.split('_')[1]);
        const correct = index === p.c;
        await i.update({
          content: `${correct ? '✅ Correcto' : `❌ Incorrecto, era ${p.o[p.c]}`}`,
          embeds: [],
          components: []
        });
      });
      
      collector.on('end', collected => {
        if (collected.size === 0) {
          interaction.editReply({ content: '⏰ Tiempo agotado.', embeds: [], components: [] }).catch(() => {});
        }
      });
    }
  },
  
  {
    name: 'video',
    description: 'Últimos videos variados sobre DDLC',
    async execute(interaction) {
      await interaction.deferReply();
      const res = await searchYouTubeLatestSpanish('doki doki literature club');
      if (!res) return interaction.editReply('No encontré videos ahora mismo.');
      
      const embed = new MessageEmbed()
        .setTitle(res.title)
        .setURL(res.url)
        .setDescription(res.channel)
        .setImage(res.thumb)
        .setColor('#ff99cc')
        .setTimestamp();
      
      await interaction.editReply({ embeds: [embed] });
    }
  },
  
  {
    name: 'fanart',
    description: 'Fanart por Doki o random',
    options: [{
      name: 'doki',
      type: 'STRING',
      description: 'sayori, monika, yuri, natsuki, random',
      required: false,
      choices: [
        { name: 'Sayori', value: 'sayori' },
        { name: 'Monika', value: 'monika' },
        { name: 'Yuri', value: 'yuri' },
        { name: 'Natsuki', value: 'natsuki' },
        { name: 'Random', value: 'random' }
      ]
    }],
    async execute(interaction) {
      await interaction.deferReply();
      const doki = interaction.options.getString('doki') || 'random';
      const pool = await getFanartsByDoki(doki, 100);
      
      if (!pool.length) return interaction.editReply('No encontré fanarts ahora mismo.');
      
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      const embed = new MessageEmbed()
        .setTitle(chosen.title)
        .setURL(chosen.permalink)
        .setImage(chosen.img)
        .setFooter({ text: `u/${chosen.author} • r/${chosen.subreddit}` })
        .setColor('#ff66cc')
        .setTimestamp(new Date(chosen.created * 1000));
      
      await interaction.editReply({ embeds: [embed] });
    }
  }
];

client.once('ready', async () => {
  console.log(`ClubAssistant v${BOT_VERSION} conectado como ${client.user.tag}`);
  
  try {
    await client.application.commands.set(slashCommands);
    console.log('Comandos slash registrados correctamente');
  } catch (error) {
    console.error('Error registrando comandos:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  
  const command = slashCommands.find(cmd => cmd.name === interaction.commandName);
  if (!command) return;
  
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    const reply = { content: 'Error ejecutando comando', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(process.env.DISCORD_TOKEN || process.env.TOKEN);
