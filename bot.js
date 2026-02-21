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
const WEBHOOK_URL = process.env.WEBHOOK_URL || `${WEBAPP_URL}/webhook`;

// Clientes Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Precios (originales)
const PRECIOS = {
  tarjeta: { clasico: 200, premium: 350 },
  saldo: { clasico: 120, premium: 200 }
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

// ================= CONFIGURACIÓN DEL BOT =================
const bot = new TelegramBot(BOT_TOKEN);

// ================= EXPRESS APP =================
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'webapp')));

// Endpoint para el webhook
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ================= FUNCIÓN PARA TECLADO PRINCIPAL =================
function getMainKeyboard(userId, tieneSuscripcion) {
  const keyboard = {
    keyboard: [
      [{ text: '🎬 Ver planes' }, { text: '❓ Ayuda' }],
      [{ text: '👤 Mi perfil' }, { text: '🔐 Wireguard VPN' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };

  // Añadir botón de WebApp (solo texto, sin enlace visible)
  keyboard.keyboard.push([{ text: '🌐 Abrir WebApp' }]);

  // Si es admin, añadir panel (también abre webapp)
  if (esAdmin(userId)) {
    keyboard.keyboard.push([{ text: '⚙️ Panel Admin' }]);
  }

  return keyboard;
}

// ================= HANDLERS DEL BOT =================

// Comando /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const firstName = msg.from.first_name;

  const usuario = await obtenerUsuario(userId);
  const activo = await usuarioActivo(userId);

  const keyboard = getMainKeyboard(userId, activo);

  if (activo) {
    const expiracion = new Date(usuario.fecha_expiracion);
    const diasRestantes = Math.ceil((expiracion - new Date()) / (1000 * 60 * 60 * 24));
    const mensaje = 
      `✨ ¡Hola de nuevo, ${firstName}! ✨\n\n` +
      `Tu suscripción **${usuario.plan === 'clasico' ? '⚜️ Clásica' : '💎 Premium'}** está activa.\n` +
      `⏳ Días restantes: ${diasRestantes}\n\n` +
      `Usa los botones para explorar.`;

    bot.sendMessage(chatId, mensaje, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard 
    });
  } else {
    const mensaje = 
      `🍿 **CineBot - Tu cine personal** 🍿\n\n` +
      `Para acceder al catálogo necesitas una suscripción.\n\n` +
      `⚜️ **Clásico** — 200 CUP (tarjeta) / 120 CUP (saldo)\n` +
      `   ✅ Catálogo completo\n` +
      `   ✅ Visualización sin límites\n` +
      `   ❌ No permite reenviar/guardar\n\n` +
      `💎 **Premium** — 350 CUP (tarjeta) / 200 CUP (saldo)\n` +
      `   ✅ Todo lo del plan Clásico\n` +
      `   ✅ Reenvío y guardado de películas\n` +
      `   ✅ Prioridad en solicitudes\n\n` +
      `Presiona "🎬 Ver planes" para comenzar.`;

    bot.sendMessage(chatId, mensaje, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard 
    });
  }
});

// Manejo de mensajes de texto (botones del teclado)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userId = msg.from.id;
  const usuario = await obtenerUsuario(userId);
  const activo = await usuarioActivo(userId);

  if (text === '🎬 Ver planes') {
    const mensaje = 
      '📋 **Planes disponibles**\n\n' +
      '⚜️ **Clásico**\n' +
      '   • Acceso al catálogo completo\n' +
      '   • Visualización sin límites\n' +
      '   • No permite reenviar/guardar\n' +
      '   • Precio: 200 CUP (tarjeta) / 120 CUP (saldo)\n\n' +
      '💎 **Premium**\n' +
      '   • Todo lo del plan Clásico\n' +
      '   • Reenvío y guardado de películas\n' +
      '   • Prioridad en solicitudes\n' +
      '   • Precio: 350 CUP (tarjeta) / 200 CUP (saldo)\n\n' +
      'Elige uno para continuar:';
    
    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: '⚜️ Clásico', callback_data: 'plan_clasico' }],
        [{ text: '💎 Premium', callback_data: 'plan_premium' }]
      ]
    };
    bot.sendMessage(chatId, mensaje, { 
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard 
    });
  }
  else if (text === '👤 Mi perfil') {
    if (!activo) {
      bot.sendMessage(chatId, '❌ No tienes una suscripción activa. Usa "🎬 Ver planes" para adquirir una.');
      return;
    }
    const expiracion = new Date(usuario.fecha_expiracion);
    const diasRestantes = Math.ceil((expiracion - new Date()) / (1000 * 60 * 60 * 24));
    const mensaje = 
      `👤 **Tu perfil**\n\n` +
      `Plan: **${usuario.plan === 'clasico' ? '⚜️ Clásico' : '💎 Premium'}**\n` +
      `📅 Activo hasta: ${expiracion.toLocaleDateString()}\n` +
      `⏳ Días restantes: ${diasRestantes}\n\n` +
      `¿Quieres renovar? Usa "🎬 Ver planes".`;
    bot.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
  }
  else if (text === '🔐 Wireguard VPN') {
    bot.sendMessage(chatId, '🔐 El servicio Wireguard VPN estará disponible próximamente. Contacta a un administrador para más información.');
  }
  else if (text === '❓ Ayuda') {
    const ayuda = 
      '❓ **Ayuda**\n\n' +
      '• Para comprar un plan, usa "🎬 Ver planes".\n' +
      '• Luego de pagar, envía la captura.\n' +
      '• Los administradores aprobarán tu pago.\n' +
      '• Una vez activo, podrás buscar películas.\n' +
      '• Usa "👤 Mi perfil" para ver tu estado.\n\n' +
      '¿Dudas? Contacta a un administrador.';
    bot.sendMessage(chatId, ayuda, { parse_mode: 'Markdown' });
  }
  else if (text === '🌐 Abrir WebApp') {
    // Envía un mensaje con el botón de webapp (sin enlace visible)
    const webAppButton = {
      text: 'Abrir WebApp',
      web_app: { url: `${WEBAPP_URL}?tg_id=${userId}` }
    };
    const keyboard = {
      inline_keyboard: [[webAppButton]]
    };
    bot.sendMessage(chatId, 'Haz clic para abrir la webapp:', {
      reply_markup: keyboard
    });
  }
  else if (text === '⚙️ Panel Admin' && esAdmin(userId)) {
    const webAppButton = {
      text: 'Abrir Panel Admin',
      web_app: { url: `${WEBAPP_URL}?tg_id=${userId}` }
    };
    const keyboard = {
      inline_keyboard: [[webAppButton]]
    };
    bot.sendMessage(chatId, 'Panel de administración:', {
      reply_markup: keyboard
    });
  }
});

// Callbacks de botones inline (planes)
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

    const nombrePlan = plan === 'clasico' ? '⚜️ Clásico' : '💎 Premium';
    const montoTarjeta = plan === 'clasico' ? PRECIOS.tarjeta.clasico : PRECIOS.tarjeta.premium;
    const montoSaldo = plan === 'clasico' ? PRECIOS.saldo.clasico : PRECIOS.saldo.premium;

    const texto = 
      `**${nombrePlan}**\n\n` +
      `🎬 Acceso ilimitado por 30 días.\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `💳 **Transferencia bancaria**\n` +
      `   Tarjeta: \`9248-1299-7027-1730\`\n` +
      `   Confirmación: \`63806513\`\n` +
      `   Monto: **${montoTarjeta} CUP**\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📱 **Saldo móvil**\n` +
      `   Número: \`63806513\`\n` +
      `   Monto: **${montoSaldo} CUP**\n` +
      `━━━━━━━━━━━━━━━━━━\n\n` +
      `📷 **Envía la captura del comprobante y tu cuenta se activará en minutos.**`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔙 Volver a planes', callback_data: 'volver_planes' }]
      ]
    };
    bot.editMessageText(texto, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
  else if (data === 'volver_planes') {
    const mensaje = 
      '📋 **Planes disponibles**\n\n' +
      '⚜️ **Clásico** — 200 CUP (tarjeta) / 120 CUP (saldo)\n' +
      '   ✅ Catálogo completo\n' +
      '   ✅ Visualización sin límites\n' +
      '   ❌ No permite reenviar/guardar\n\n' +
      '💎 **Premium** — 350 CUP (tarjeta) / 200 CUP (saldo)\n' +
      '   ✅ Todo lo del plan Clásico\n' +
      '   ✅ Reenvío y guardado\n' +
      '   ✅ Prioridad en solicitudes\n\n' +
      'Selecciona:';
    const inlineKeyboard = {
      inline_keyboard: [
        [{ text: '⚜️ Clásico', callback_data: 'plan_clasico' }],
        [{ text: '💎 Premium', callback_data: 'plan_premium' }]
      ]
    };
    bot.editMessageText(mensaje, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard
    });
  }
});

// Manejo de fotos (capturas de pago)
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const plan = global.userPlans?.get(userId);
  if (!plan) {
    bot.sendMessage(chatId, '⚠️ Primero debes elegir un plan con "🎬 Ver planes".');
    return;
  }

  try {
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;
    const fileLink = await bot.getFileLink(fileId);
    const response = await fetch(fileLink);
    const buffer = Buffer.from(await response.arrayBuffer());

    const fileName = `${userId}_${plan}_${uuidv4()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('capturas')
      .upload(fileName, buffer, { contentType: 'image/jpeg' });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage.from('capturas').getPublicUrl(fileName);
    const publicUrl = urlData.publicUrl;

    await supabaseAdmin.from('solicitudes_pago').insert({
      telegram_id: userId,
      plan_solicitado: plan,
      metodo_pago: 'desconocido',
      captura_url: publicUrl,
      estado: 'pendiente'
    });

    bot.sendMessage(chatId,
      '✅ **¡Solicitud recibida!**\n\n' +
      'El administrador verificará el pago en breve. Te notificaremos cuando esté aprobado.\n' +
      'Gracias por tu paciencia 🙌',
      { parse_mode: 'Markdown' }
    );

    // Notificar a admins (sin enlaces visibles, solo texto)
    for (const adminId of ADMIN_IDS) {
      try {
        bot.sendMessage(adminId,
          `📩 Nueva solicitud de pago\n` +
          `👤 Usuario: ${msg.from.first_name} (@${msg.from.username})\n` +
          `📋 Plan: ${plan}\n` +
          `🆔 ID: ${userId}\n` +
          `🌐 Revisa en la webapp (abre el menú y presiona "Panel Admin")`
        );
      } catch (e) {}
    }

    global.userPlans?.delete(userId);
  } catch (error) {
    console.error('Error procesando captura:', error);
    bot.sendMessage(chatId, '❌ Ocurrió un error al procesar la imagen. Intenta de nuevo.');
  }
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
  const webAppButton = {
    text: 'Abrir Panel Admin',
    web_app: { url: `${WEBAPP_URL}?tg_id=${userId}` }
  };
  const keyboard = { inline_keyboard: [[webAppButton]] };
  bot.sendMessage(msg.chat.id,
    '👨‍💼 **Panel de Administración**\n\nHaz clic para abrir:',
    { parse_mode: 'Markdown', reply_markup: keyboard }
  );
});

// ================= API ENDPOINTS (para la webapp) =================

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
  } catch (e) {}

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
    } catch (e) {}
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

// ================= INICIAR SERVIDOR =================
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
  try {
    await bot.setWebHook(WEBHOOK_URL);
    console.log(`✅ Webhook configurado en ${WEBHOOK_URL}`);
  } catch (error) {
    console.error('❌ Error configurando webhook:', error);
  }
});
