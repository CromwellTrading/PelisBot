const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ================= CONFIGURACIÓN =================
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => parseInt(id.trim())) : [];
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBAPP_URL = process.env.WEBAPP_URL || 'https://localhost';
const WEBHOOK_URL = process.env.WEBHOOK_URL; // Opcional, si no se provee se construye

// Clientes Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Precios
const PRECIOS_TARJETA = { clasico: 200, premium: 350 };
const PRECIOS_SALDO = { clasico: 120, premium: 200 };

// Métodos de pago
const METODOS_PAGO = {
  BPA: "9248-1299-7027-1730\nNúmero de confirmación: 63806513",
  METRO: "9238959871181386\n63806513",
  monedero: "63806513 (mismos precios que tarjeta)",
  saldo: "63806513"
};

// ================= FUNCIONES AUXILIARES =================
function esAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

async function obtenerUsuario(telegramId) {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  return data;
}

async function usuarioActivo(telegramId) {
  const user = await obtenerUsuario(telegramId);
  if (!user || !user.fecha_expiracion) return false;
  const expiracion = new Date(user.fecha_expiracion);
  return expiracion > new Date();
}

// Caché simple en memoria (opcional, se puede mejorar)
const busquedaCache = new Map();
function buscarPeliculasCached(query, limit = 10) {
  const key = query.toLowerCase();
  if (busquedaCache.has(key)) {
    const cached = busquedaCache.get(key);
    if (Date.now() - cached.timestamp < 60000) { // 1 minuto
      return cached.data;
    }
  }
  return null;
}

// ================= CONFIGURACIÓN DEL BOT =================
const bot = new TelegramBot(BOT_TOKEN);

// ================= EXPRESS APP =================
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'webapp')));

// Endpoint para el webhook de Telegram
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ================= HANDLERS DEL BOT =================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name;

  const usuario = await obtenerUsuario(userId);
  const activo = await usuarioActivo(userId);

  if (usuario && activo) {
    const expiracion = new Date(usuario.fecha_expiracion);
    const diasRestantes = Math.ceil((expiracion - new Date()) / (1000 * 60 * 60 * 24));
    const keyboard = {
      inline_keyboard: [
        [{ text: '🎬 Buscar películas', callback_data: 'buscar' }],
        [{ text: '👤 Mi perfil', callback_data: 'perfil' }],
        [{ text: '❓ Ayuda', callback_data: 'ayuda' }]
      ]
    };
    if (esAdmin(userId)) {
      keyboard.inline_keyboard.push([{ text: '⚙️ Panel Admin (Web)', url: `${WEBAPP_URL}?tg_id=${userId}` }]);
    } else {
      keyboard.inline_keyboard.push([{ text: '🌐 Abrir WebApp', url: `${WEBAPP_URL}?tg_id=${userId}` }]);
    }
    bot.sendMessage(chatId, 
      `✨ ¡Bienvenido de nuevo, ${firstName}! ✨\n\n` +
      `🎬 Tu suscripción **${usuario.plan}** está activa.\n` +
      `📅 Días restantes: ${diasRestantes}\n\n` +
      '¿Qué deseas hacer?',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  } else {
    const keyboard = {
      inline_keyboard: [
        [{ text: '🎬 Plan Clásico', callback_data: 'plan_clasico' }],
        [{ text: '🌟 Plan Premium', callback_data: 'plan_premium' }],
        [{ text: '🌐 Abrir WebApp', url: `${WEBAPP_URL}?tg_id=${userId}` }]
      ]
    };
    bot.sendMessage(chatId,
      '🍿 **¡Bienvenido al CineBot!** 🍿\n\n' +
      'Para acceder al catálogo de películas debes suscribirte.\n\n' +
      '**Precios:**\n' +
      '• Tarjeta/Monedero: Clásico 200 CUP | Premium 350 CUP\n' +
      '• Saldo Móvil: Clásico 120 CUP | Premium 200 CUP\n\n' +
      'Puedes pagar desde el bot o desde la webapp.',
      { parse_mode: 'Markdown', reply_markup: keyboard }
    );
  }
});

bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const data = callbackQuery.data;
  const userId = callbackQuery.from.id;
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  if (data.startsWith('plan_')) {
    const plan = data.split('_')[1];
    if (!global.userPlans) global.userPlans = new Map();
    global.userPlans.set(userId, plan);

    const texto = 
      `📌 **Has elegido el plan ${plan}**\n\n` +
      '**Instrucciones de pago:**\n' +
      'Realiza el depósito a una de las siguientes cuentas:\n\n' +
      `🏦 **BPA:**\n${METODOS_PAGO.BPA}\n\n` +
      `🏧 **METRO:**\n${METODOS_PAGO.METRO}\n\n` +
      `📱 **Monedero:**\n${METODOS_PAGO.monedero}\n\n` +
      `📞 **Saldo Móvil:**\n${METODOS_PAGO.saldo}\n` +
      `   * Clásico: ${PRECIOS_SALDO.clasico} CUP\n` +
      `   * Premium: ${PRECIOS_SALDO.premium} CUP\n\n` +
      '✅ **Luego de pagar, envía una captura de pantalla del comprobante.**\n' +
      'El administrador verificará y activará tu suscripción.';

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔙 Volver al inicio', callback_data: 'volver_inicio' }]
      ]
    };
    bot.editMessageText(texto, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
  else if (data === 'buscar') {
    bot.editMessageText(
      '🔍 Escribe el nombre de la película que deseas buscar.\nEjemplo: `Avengers Endgame`',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown'
      }
    );
  }
  else if (data === 'perfil') {
    const usuario = await obtenerUsuario(userId);
    if (!usuario || !(await usuarioActivo(userId))) {
      bot.editMessageText('❌ No tienes una suscripción activa.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }
    const expiracion = new Date(usuario.fecha_expiracion);
    const diasRestantes = Math.ceil((expiracion - new Date()) / (1000 * 60 * 60 * 24));
    const keyboard = {
      inline_keyboard: [
        [{ text: '🎬 Buscar películas', callback_data: 'buscar' }],
        [{ text: '🔄 Renovar suscripción', callback_data: 'renovar' }],
        [{ text: '🔙 Volver al inicio', callback_data: 'volver_inicio' }]
      ]
    };
    bot.editMessageText(
      `👤 **Tu perfil**\n\n` +
      `Plan: **${usuario.plan}**\n` +
      `Fecha de expiración: ${expiracion.toLocaleDateString()}\n` +
      `Días restantes: ${diasRestantes}`,
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }
  else if (data === 'renovar') {
    const keyboard = {
      inline_keyboard: [
        [{ text: '🎬 Plan Clásico', callback_data: 'plan_clasico' }],
        [{ text: '🌟 Plan Premium', callback_data: 'plan_premium' }],
        [{ text: '🔙 Volver al inicio', callback_data: 'volver_inicio' }]
      ]
    };
    bot.editMessageText(
      'Selecciona el plan para renovar tu suscripción:',
      {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboard
      }
    );
  }
  else if (data === 'ayuda') {
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔙 Volver al inicio', callback_data: 'volver_inicio' }]
      ]
    };
    bot.editMessageText(
      '❓ **Ayuda**\n\n' +
      '• Para buscar películas, usa el botón \'Buscar\' y escribe el nombre.\n' +
      '• Si no tienes suscripción, elige un plan y sigue las instrucciones de pago.\n' +
      '• Envía la captura del comprobante y espera la aprobación.\n' +
      '• Una vez activo, podrás ver tu perfil y tiempo restante.\n\n' +
      'Si tienes problemas, contacta al administrador.',
      {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
  }
  else if (data === 'volver_inicio') {
    const usuario = await obtenerUsuario(userId);
    const activo = await usuarioActivo(userId);
    if (usuario && activo) {
      const expiracion = new Date(usuario.fecha_expiracion);
      const diasRestantes = Math.ceil((expiracion - new Date()) / (1000 * 60 * 60 * 24));
      const keyboard = {
        inline_keyboard: [
          [{ text: '🎬 Buscar películas', callback_data: 'buscar' }],
          [{ text: '👤 Mi perfil', callback_data: 'perfil' }],
          [{ text: '❓ Ayuda', callback_data: 'ayuda' }]
        ]
      };
      if (esAdmin(userId)) {
        keyboard.inline_keyboard.push([{ text: '⚙️ Panel Admin (Web)', url: `${WEBAPP_URL}?tg_id=${userId}` }]);
      } else {
        keyboard.inline_keyboard.push([{ text: '🌐 Abrir WebApp', url: `${WEBAPP_URL}?tg_id=${userId}` }]);
      }
      bot.editMessageText(
        `✨ ¡Bienvenido de nuevo! ✨\n\n` +
        `🎬 Tu suscripción **${usuario.plan}** está activa.\n` +
        `📅 Días restantes: ${diasRestantes}\n\n` +
        '¿Qué deseas hacer?',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    } else {
      const keyboard = {
        inline_keyboard: [
          [{ text: '🎬 Plan Clásico', callback_data: 'plan_clasico' }],
          [{ text: '🌟 Plan Premium', callback_data: 'plan_premium' }],
          [{ text: '🌐 Abrir WebApp', url: `${WEBAPP_URL}?tg_id=${userId}` }]
        ]
      };
      bot.editMessageText(
        '🍿 **Bienvenido al CineBot** 🍿\n\n' +
        'Elige un plan para comenzar:',
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );
    }
  }
  else if (data.startsWith('pagina_')) {
    // Manejo de paginación (pendiente de implementar completo)
    // Se puede implementar con un estado en memoria
    bot.answerCallbackQuery(callbackQuery.id, { text: 'Función en desarrollo' });
  }
  else if (data.startsWith('pelicula_')) {
    const peliculaId = data.split('_')[1];
    if (!(await usuarioActivo(userId))) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'No tienes suscripción activa', show_alert: true });
      return;
    }
    const { data: peli, error } = await supabase
      .from('peliculas')
      .select('*')
      .eq('id', peliculaId)
      .single();
    if (error || !peli) {
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Película no encontrada', show_alert: true });
      return;
    }
    const usuario = await obtenerUsuario(userId);
    const protect = usuario.plan === 'clasico';
    try {
      await bot.forwardMessage(userId, CHANNEL_ID, peli.message_id, { protect_content: protect });
      if (protect) {
        bot.sendMessage(userId,
          'ℹ️ Esta película tiene **protección de contenido**. No puedes reenviarla ni guardarla.\n' +
          'Para disfrutar de estas funciones, actualiza al plan Premium.',
          { parse_mode: 'Markdown' }
        );
      }
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Película enviada' });
    } catch (e) {
      console.error('Error al reenviar:', e);
      bot.answerCallbackQuery(callbackQuery.id, { text: 'Error al enviar', show_alert: true });
    }
  }
});

// Manejo de fotos (capturas de pago)
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const plan = global.userPlans?.get(userId);
  if (!plan) {
    bot.sendMessage(chatId, '⚠️ Primero debes elegir un plan con /start');
    return;
  }

  const photo = msg.photo[msg.photo.length - 1];
  const fileId = photo.file_id;
  const fileLink = await bot.getFileLink(fileId);
  const response = await fetch(fileLink);
  const buffer = await response.buffer();

  const fileName = `${userId}_${plan}_${uuidv4()}.jpg`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from('capturas')
    .upload(fileName, buffer, { contentType: 'image/jpeg' });
  if (uploadError) {
    console.error('Error subiendo captura:', uploadError);
    bot.sendMessage(chatId, '❌ Error al procesar la imagen. Intenta de nuevo.');
    return;
  }
  const { data: urlData } = supabaseAdmin.storage.from('capturas').getPublicUrl(fileName);
  const publicUrl = urlData.publicUrl;

  await supabaseAdmin.from('solicitudes_pago').insert({
    telegram_id: userId,
    plan_solicitado: plan,
    metodo_pago: 'desconocido',
    captura_url: publicUrl,
    estado: 'pendiente'
  });

  const keyboard = {
    inline_keyboard: [
      [{ text: '🔙 Volver al inicio', callback_data: 'volver_inicio' }]
    ]
  };
  bot.sendMessage(chatId,
    '✅ **¡Solicitud recibida!**\n\n' +
    'El administrador verificará el pago en breve. Te notificaremos cuando esté aprobado.\n' +
    'Gracias por tu paciencia 🙌',
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );

  for (const adminId of ADMIN_IDS) {
    try {
      bot.sendMessage(adminId,
        `📩 Nueva solicitud de pago de ${msg.from.first_name} (@${msg.from.username})\n` +
        `Plan: ${plan}\n` +
        `ID: ${userId}\n` +
        `Revisa en la webapp: ${WEBAPP_URL}?tg_id=${adminId}`
      );
    } catch (e) {
      console.warn(`No se pudo notificar al admin ${adminId}:`, e);
    }
  }

  global.userPlans?.delete(userId);
});

// Comandos de admin
bot.onText(/\/addpelicula (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!esAdmin(userId)) return;

  const titulo = match[1];
  if (!msg.reply_to_message) {
    bot.sendMessage(msg.chat.id, '❌ Debes responder al mensaje de la película en el canal con /addpelicula Título');
    return;
  }
  const replied = msg.reply_to_message;
  if (replied.chat.id.toString() !== CHANNEL_ID) {
    bot.sendMessage(msg.chat.id, '❌ El mensaje debe ser del canal de películas.');
    return;
  }

  await supabaseAdmin.from('peliculas').insert({
    titulo,
    message_id: replied.message_id,
    canal_id: CHANNEL_ID
  });

  bot.sendMessage(msg.chat.id, `✅ Película '${titulo}' agregada correctamente.`);
});

bot.onText(/\/panel/, async (msg) => {
  const userId = msg.from.id;
  if (!esAdmin(userId)) return;
  bot.sendMessage(msg.chat.id,
    `👨‍💼 **Panel de Administración**\n\n` +
    `Accede a la webapp: ${WEBAPP_URL}?tg_id=${userId}`,
    { parse_mode: 'Markdown' }
  );
});

// ================= API ENDPOINTS PARA LA WEBAPP =================
app.post('/api/user-status', async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id) return res.status(400).json({ error: 'Falta ID' });
  const usuario = await obtenerUsuario(parseInt(telegram_id));
  const activo = usuario ? await usuarioActivo(parseInt(telegram_id)) : false;
  res.json({
    existe: !!usuario,
    activo,
    plan: usuario?.plan || null,
    expiracion: usuario?.fecha_expiracion || null,
    es_admin: esAdmin(parseInt(telegram_id))
  });
});

app.post('/api/submit-payment', async (req, res) => {
  const { telegram_id, plan, metodo, imagen } = req.body;
  if (!telegram_id || !plan || !metodo || !imagen) {
    return res.status(400).json({ error: 'Faltan datos' });
  }
  try {
    const base64Data = imagen.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `${telegram_id}_${plan}_${uuidv4()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('capturas')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabaseAdmin.storage.from('capturas').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    await supabaseAdmin.from('solicitudes_pago').insert({
      telegram_id: parseInt(telegram_id),
      plan_solicitado: plan,
      metodo_pago: metodo,
      captura_url: publicUrl,
      estado: 'pendiente'
    });
    res.json({ success: true });
  } catch (e) {
    console.error('Error en submit-payment:', e);
    res.status(500).json({ error: 'Error al procesar imagen' });
  }
});

app.post('/api/pending-requests', async (req, res) => {
  const { telegram_id } = req.body;
  if (!telegram_id || !esAdmin(parseInt(telegram_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const { data, error } = await supabaseAdmin
    .from('solicitudes_pago')
    .select('*')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/approve-request', async (req, res) => {
  const { admin_id, solicitud_id } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const { data: sol, error: fetchError } = await supabaseAdmin
    .from('solicitudes_pago')
    .select('*')
    .eq('id', solicitud_id)
    .single();
  if (fetchError || !sol) return res.status(404).json({ error: 'No existe' });

  await supabaseAdmin
    .from('solicitudes_pago')
    .update({ estado: 'aprobado' })
    .eq('id', solicitud_id);

  const fechaExpiracion = new Date();
  fechaExpiracion.setDate(fechaExpiracion.getDate() + 30);

  await supabaseAdmin
    .from('usuarios')
    .upsert({
      telegram_id: sol.telegram_id,
      plan: sol.plan_solicitado,
      fecha_inicio: new Date().toISOString(),
      fecha_expiracion: fechaExpiracion.toISOString()
    }, { onConflict: 'telegram_id' });

  try {
    await bot.sendMessage(sol.telegram_id,
      `✅ **¡Pago aprobado!**\n\nTu suscripción **${sol.plan_solicitado}** está activa hasta el ${fechaExpiracion.toLocaleDateString()}.\n¡Disfruta del catálogo! 🍿`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    console.warn(`No se pudo notificar al usuario ${sol.telegram_id}:`, e);
  }
  res.json({ success: true });
});

app.post('/api/reject-request', async (req, res) => {
  const { admin_id, solicitud_id, motivo } = req.body;
  if (!admin_id || !esAdmin(parseInt(admin_id))) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  await supabaseAdmin
    .from('solicitudes_pago')
    .update({ estado: 'rechazado', motivo_rechazo: motivo })
    .eq('id', solicitud_id);

  const { data: sol } = await supabaseAdmin
    .from('solicitudes_pago')
    .select('*')
    .eq('id', solicitud_id)
    .single();

  if (sol) {
    try {
      await bot.sendMessage(sol.telegram_id,
        `❌ **Pago rechazado**\n\nMotivo: ${motivo}\n\nPuedes intentar nuevamente con otro comprobante.`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      console.warn(`No se pudo notificar al usuario ${sol.telegram_id}:`, e);
    }
  }
  res.json({ success: true });
});

app.post('/api/catalogo', async (req, res) => {
  const { telegram_id, page = 1, search = '' } = req.body;
  if (!telegram_id || !(await usuarioActivo(parseInt(telegram_id)))) {
    return res.status(403).json({ error: 'Suscripción no activa' });
  }
  const limit = 10;
  const offset = (page - 1) * limit;
  let query = supabaseAdmin
    .from('peliculas')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1)
    .order('titulo');
  if (search) {
    query = query.ilike('titulo', `%${search}%`);
  }
  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count, page });
});

app.post('/api/request-movie', async (req, res) => {
  const { telegram_id, pelicula_id } = req.body;
  if (!telegram_id || !(await usuarioActivo(parseInt(telegram_id)))) {
    return res.status(403).json({ error: 'Suscripción no activa' });
  }
  const { data: peli, error } = await supabaseAdmin
    .from('peliculas')
    .select('*')
    .eq('id', pelicula_id)
    .single();
  if (error || !peli) return res.status(404).json({ error: 'Película no encontrada' });

  const usuario = await obtenerUsuario(parseInt(telegram_id));
  const protect = usuario.plan === 'clasico';
  try {
    await bot.forwardMessage(parseInt(telegram_id), CHANNEL_ID, peli.message_id, { protect_content: protect });
    res.json({ success: true });
  } catch (e) {
    console.error('Error enviando película:', e);
    res.status(500).json({ error: 'Error al enviar' });
  }
});

// Ruta para la webapp (debe ir al final)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'webapp', 'index.html'));
});

// ================= INICIAR SERVIDOR Y CONFIGURAR WEBHOOK =================
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
  
  // Configurar webhook
  const webhookUrl = process.env.WEBHOOK_URL || `${WEBAPP_URL}/webhook`;
  try {
    await bot.setWebHook(webhookUrl);
    console.log(`✅ Webhook configurado en ${webhookUrl}`);
  } catch (error) {
    console.error('❌ Error configurando webhook:', error);
  }
});
