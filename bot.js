<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CineBot · Plataforma VIP</title>
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet">
    <!-- Fuse.js para búsqueda difusa -->
    <script src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2"></script>
    <style>
        * { font-family: 'Inter', sans-serif; }
        body {
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            min-height: 100vh;
            color: #f1f5f9;
        }
        .glass-card {
            background: rgba(255, 255, 255, 0.05);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
            transition: all 0.3s ease;
        }
        .glass-card:hover {
            transform: translateY(-5px);
            border-color: rgba(255, 255, 255, 0.2);
            box-shadow: 0 30px 50px -15px rgba(0, 150, 255, 0.3);
        }
        .btn-primary {
            background: linear-gradient(135deg, #3b82f6, #8b5cf6);
            color: white;
            font-weight: 600;
            padding: 12px 24px;
            border-radius: 40px;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-primary:hover {
            transform: scale(1.02);
            box-shadow: 0 10px 25px -5px #8b5cf6;
        }
        .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(5px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            font-weight: 500;
            padding: 8px 16px;
            border-radius: 40px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-secondary:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        .plan-card {
            background: rgba(30, 41, 59, 0.7);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 24px;
        }
        .plan-card.clasico { border-top: 4px solid #60a5fa; }
        .plan-card.premium { border-top: 4px solid #fbbf24; }
        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 40px;
            font-size: 12px;
            font-weight: 600;
            background: rgba(255, 255, 255, 0.1);
        }
        .tab {
            padding: 10px 20px;
            border-radius: 40px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .tab.active {
            background: rgba(59, 130, 246, 0.3);
            border: 1px solid #3b82f6;
        }
        .view-toggle {
            display: flex;
            gap: 8px;
            background: rgba(0,0,0,0.3);
            backdrop-filter: blur(8px);
            padding: 8px 12px;
            border-radius: 40px;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .view-toggle button {
            padding: 6px 16px;
            border-radius: 40px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        .view-toggle button.active {
            background: #3b82f6;
            color: white;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.9);
            justify-content: center;
            align-items: center;
        }
        .modal-content {
            max-width: 90%;
            max-height: 90%;
            border-radius: 16px;
        }
        .close {
            position: absolute;
            top: 20px;
            right: 40px;
            color: white;
            font-size: 40px;
            font-weight: bold;
            cursor: pointer;
        }
        .close:hover { color: #ccc; }
        .letra-indice {
            display: inline-block;
            width: 36px;
            height: 36px;
            line-height: 36px;
            text-align: center;
            border-radius: 50%;
            background: rgba(255,255,255,0.1);
            margin: 0 4px 8px 0;
            cursor: pointer;
            transition: all 0.2s;
        }
        .letra-indice:hover, .letra-indice.active {
            background: #3b82f6;
            color: white;
        }
    </style>
</head>
<body class="p-4 md:p-8">
    <!-- Modal para imagen ampliada -->
    <div id="imageModal" class="modal" onclick="cerrarModal()">
        <span class="close">&times;</span>
        <img class="modal-content" id="modalImage">
    </div>

    <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="flex justify-between items-center mb-8">
            <h1 class="text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-400 to-purple-400 text-transparent bg-clip-text">
                🎬 CineBot VIP
            </h1>
            <div id="userDisplay" class="glass-card px-6 py-3 text-sm flex items-center gap-3">
                <i class="fas fa-spinner fa-pulse mr-2"></i>Cargando...
            </div>
        </div>

        <!-- Toggle de vista para admins -->
        <div id="viewToggleContainer" class="flex justify-end mb-4 hidden">
            <div class="view-toggle">
                <button id="viewAdminBtn" onclick="setViewMode('admin')" class="active">👑 Admin</button>
                <button id="viewUserBtn" onclick="setViewMode('user')">👤 Usuario</button>
            </div>
        </div>

        <!-- Contenido principal -->
        <div id="mainContent" class="space-y-8"></div>
    </div>

    <script>
        const API_BASE = window.location.origin;
        const urlParams = new URLSearchParams(window.location.search);
        const TELEGRAM_ID = urlParams.get('tg_id');

        let usuario = null;
        let viewMode = 'admin';
        let allPeliculas = [];
        let fuse = null;

        // ========== MODAL ==========
        function abrirModal(url) {
            document.getElementById('modalImage').src = url;
            document.getElementById('imageModal').style.display = 'flex';
        }
        function cerrarModal() {
            document.getElementById('imageModal').style.display = 'none';
        }
        window.onclick = function(event) {
            if (event.target == document.getElementById('imageModal')) {
                cerrarModal();
            }
        }

        // ========== IDENTIFICACIÓN ==========
        async function identificarUsuario() {
            if (!TELEGRAM_ID) {
                document.getElementById('mainContent').innerHTML = `
                    <div class="glass-card p-8 text-center max-w-md mx-auto">
                        <i class="fas fa-exclamation-triangle text-5xl text-yellow-400 mb-4"></i>
                        <h2 class="text-2xl font-bold mb-2">No se pudo identificar</h2>
                        <p class="mb-6">Para usar la webapp, ábrela desde el bot de Telegram.</p>
                        <a href="https://t.me/your_bot_username" target="_blank" class="btn-primary inline-block">Ir al bot</a>
                    </div>
                `;
                return;
            }

            try {
                const res = await fetch(API_BASE + '/api/user-status', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({telegram_id: TELEGRAM_ID})
                });
                const data = await res.json();
                usuario = { id: TELEGRAM_ID, ...data };
                
                if (usuario.es_admin) {
                    document.getElementById('viewToggleContainer').classList.remove('hidden');
                } else {
                    document.getElementById('viewToggleContainer').classList.add('hidden');
                }
                
                actualizarUI();
            } catch (e) {
                console.error(e);
                document.getElementById('mainContent').innerHTML = '<p class="glass-card p-8 text-center">Error de conexión</p>';
            }
        }

        function setViewMode(mode) {
            viewMode = mode;
            document.getElementById('viewAdminBtn').classList.toggle('active', mode === 'admin');
            document.getElementById('viewUserBtn').classList.toggle('active', mode === 'user');
            actualizarUI();
        }

        function actualizarUI() {
            const userDisplay = document.getElementById('userDisplay');
            if (usuario.activo) {
                userDisplay.innerHTML = `
                    <i class="fas fa-check-circle text-green-400 mr-2"></i>
                    <span class="font-medium">${usuario.plan === 'clasico' ? '⚜️ Clásico' : '💎 Premium'}</span>
                    <span class="badge ml-2">${new Date(usuario.expiracion).toLocaleDateString()}</span>
                `;
            } else {
                userDisplay.innerHTML = `
                    <i class="fas fa-clock text-yellow-400 mr-2"></i>
                    <span>Suscripción inactiva</span>
                `;
            }

            if (usuario.es_admin && viewMode === 'admin') {
                mostrarPanelAdmin();
            } else {
                if (usuario.activo) {
                    mostrarCatalogo();
                } else {
                    mostrarPlanes();
                }
            }
        }

        // ========== PLANES (para usuarios inactivos) ==========
        function mostrarPlanes() {
            document.getElementById('mainContent').innerHTML = `
                <div class="glass-card p-8">
                    <h2 class="text-3xl font-bold mb-8 text-center">Elige tu plan</h2>
                    <div class="grid md:grid-cols-2 gap-6">
                        <!-- Plan Clásico -->
                        <div class="plan-card clasico">
                            <div class="flex items-center gap-3 mb-4">
                                <span class="text-4xl">⚜️</span>
                                <h3 class="text-2xl font-bold">Clásico</h3>
                            </div>
                            <ul class="space-y-3 mb-6">
                                <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i> Catálogo completo</li>
                                <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i> Visualización sin límites</li>
                                <li class="flex items-center gap-2"><i class="fas fa-times-circle text-red-400"></i> No reenviar/guardar</li>
                            </ul>
                            <div class="bg-white/10 rounded-xl p-4 mb-4">
                                <p class="text-sm opacity-70">💳 Tarjeta: <span class="font-mono">200 CUP</span></p>
                                <p class="text-sm opacity-70">📱 Saldo: <span class="font-mono">120 CUP</span></p>
                            </div>
                            <button onclick="mostrarFormPago('clasico')" class="btn-primary w-full">Seleccionar</button>
                        </div>
                        <!-- Plan Premium -->
                        <div class="plan-card premium">
                            <div class="flex items-center gap-3 mb-4">
                                <span class="text-4xl">💎</span>
                                <h3 class="text-2xl font-bold">Premium</h3>
                            </div>
                            <ul class="space-y-3 mb-6">
                                <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i> Todo lo del plan Clásico</li>
                                <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i> Reenvío y guardado</li>
                                <li class="flex items-center gap-2"><i class="fas fa-check-circle text-green-400"></i> Prioridad en solicitudes</li>
                            </ul>
                            <div class="bg-white/10 rounded-xl p-4 mb-4">
                                <p class="text-sm opacity-70">💳 Tarjeta: <span class="font-mono">350 CUP</span></p>
                                <p class="text-sm opacity-70">📱 Saldo: <span class="font-mono">200 CUP</span></p>
                            </div>
                            <button onclick="mostrarFormPago('premium')" class="btn-primary w-full">Seleccionar</button>
                        </div>
                    </div>
                    <div id="formPagoContainer" class="mt-8"></div>
                </div>
            `;
        }

        function mostrarFormPago(plan) {
            const montoTarjeta = plan === 'clasico' ? 200 : 350;
            const montoSaldo = plan === 'clasico' ? 120 : 200;
            const container = document.getElementById('formPagoContainer');
            container.innerHTML = `
                <div class="glass-card p-6 max-w-2xl mx-auto">
                    <h3 class="text-2xl font-bold mb-6">Pago plan ${plan === 'clasico' ? '⚜️ Clásico' : '💎 Premium'}</h3>
                    
                    <div class="grid md:grid-cols-2 gap-4 mb-6">
                        <div class="bg-white/10 rounded-xl p-4">
                            <h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-university"></i> BPA</h4>
                            <p class="font-mono text-sm break-all">9248-1299-7027-1730</p>
                            <p class="text-xs mt-1">Confirmación: 63806513</p>
                            <p class="text-xs mt-1 font-bold">Monto: ${montoTarjeta} CUP</p>
                        </div>
                        <div class="bg-white/10 rounded-xl p-4">
                            <h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-university"></i> METRO</h4>
                            <p class="font-mono text-sm break-all">9238959871181386</p>
                            <p class="text-xs mt-1">Confirmación: 63806513</p>
                            <p class="text-xs mt-1 font-bold">Monto: ${montoTarjeta} CUP</p>
                        </div>
                        <div class="bg-white/10 rounded-xl p-4">
                            <h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-mobile-alt"></i> Monedero</h4>
                            <p class="font-mono text-sm">63806513</p>
                            <p class="text-xs mt-1">(mismos precios que tarjeta)</p>
                            <p class="text-xs mt-1 font-bold">Monto: ${montoTarjeta} CUP</p>
                        </div>
                        <div class="bg-white/10 rounded-xl p-4">
                            <h4 class="font-bold mb-2 flex items-center gap-2"><i class="fas fa-sim-card"></i> Saldo móvil</h4>
                            <p class="font-mono text-sm">63806513</p>
                            <p class="text-xs mt-1 font-bold">Monto: ${montoSaldo} CUP</p>
                        </div>
                    </div>

                    <select id="metodoPago" class="w-full p-3 rounded-xl bg-white/10 border border-white/20 mb-4">
                        <option value="tarjeta">Transferencia bancaria (BPA/METRO/Monedero)</option>
                        <option value="saldo">Saldo móvil</option>
                    </select>

                    <input type="file" id="captura" accept="image/*" class="w-full p-2 rounded-xl bg-white/10 border border-white/20 mb-4">

                    <button onclick="enviarCaptura('${plan}')" class="btn-primary w-full">
                        <i class="fas fa-upload mr-2"></i>Enviar comprobante
                    </button>
                </div>
            `;
        }

        async function enviarCaptura(plan) {
            const file = document.getElementById('captura').files[0];
            const metodo = document.getElementById('metodoPago').value;
            if (!file) return alert('Selecciona una captura');
            const reader = new FileReader();
            reader.onload = async function(e) {
                const res = await fetch(API_BASE + '/api/submit-payment', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        telegram_id: TELEGRAM_ID,
                        plan: plan,
                        metodo: metodo,
                        imagen: e.target.result
                    })
                });
                if (res.ok) {
                    alert('✅ Solicitud enviada. Espera la aprobación del administrador.');
                    document.getElementById('formPagoContainer').innerHTML = '';
                } else {
                    const error = await res.json();
                    alert('❌ Error al enviar: ' + (error.error || 'desconocido'));
                }
            };
            reader.readAsDataURL(file);
        }

        // ========== CATÁLOGO PARA USUARIOS ACTIVOS ==========
        function mostrarCatalogo() {
            document.getElementById('mainContent').innerHTML = `
                <div class="glass-card p-8">
                    <h2 class="text-3xl font-bold mb-6">🎥 Catálogo de películas</h2>
                    
                    <!-- Índice alfabético -->
                    <div class="mb-4 flex flex-wrap justify-center">
                        ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letra => 
                            `<span class="letra-indice" onclick="filtrarPorLetra('${letra}')">${letra}</span>`
                        ).join('')}
                        <span class="letra-indice" onclick="filtrarPorLetra('')">Todos</span>
                    </div>

                    <div class="flex gap-4 mb-6">
                        <input type="text" id="buscador" placeholder="Buscar por título... (acepta errores)" 
                               class="flex-1 p-3 rounded-xl bg-white/10 border border-white/20">
                        <button onclick="buscarPeliculas(1)" class="btn-primary">Buscar</button>
                    </div>
                    <div id="catalogoGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
                    <div id="paginacion" class="flex justify-center gap-2 mt-6"></div>
                </div>
            `;
            cargarTodasPeliculas();
        }

        async function cargarTodasPeliculas() {
            const res = await fetch(API_BASE + '/api/catalogo', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ telegram_id: TELEGRAM_ID, page: 1, search: '' })
            });
            if (!res.ok) return;
            const data = await res.json();
            allPeliculas = data.data;
            fuse = new Fuse(allPeliculas, {
                keys: ['titulo'],
                threshold: 0.4,
                includeScore: true
            });
            mostrarPagina(1, allPeliculas);
        }

        function filtrarPorLetra(letra) {
            document.querySelectorAll('.letra-indice').forEach(el => el.classList.remove('active'));
            if (letra) event.target.classList.add('active');
            const filtradas = letra ? allPeliculas.filter(p => p.titulo.toUpperCase().startsWith(letra)) : allPeliculas;
            mostrarPagina(1, filtradas);
        }

        async function buscarPeliculas(page = 1) {
            const search = document.getElementById('buscador')?.value || '';
            if (!search) {
                mostrarPagina(page, allPeliculas);
                return;
            }
            const results = fuse.search(search);
            const filtradas = results.map(r => r.item);
            mostrarPagina(page, filtradas);
        }

        function mostrarPagina(page, lista) {
            const limit = 10;
            const offset = (page - 1) * limit;
            const paginadas = lista.slice(offset, offset + limit);
            const grid = document.getElementById('catalogoGrid');
            if (!paginadas.length) {
                grid.innerHTML = '<p class="text-center col-span-full">No hay películas</p>';
                return;
            }
            grid.innerHTML = paginadas.map(p => `
                <div class="glass-card p-4 cursor-pointer hover:scale-105 transition" onclick="solicitarPelicula('${p.id}')">
                    <i class="fas fa-film text-3xl mb-2 text-blue-400"></i>
                    <h3 class="font-bold">${p.titulo}</h3>
                    <p class="text-xs opacity-60">ID: ${p.id.substring(0,8)}</p>
                </div>
            `).join('');
            const totalPages = Math.ceil(lista.length / limit);
            const pag = document.getElementById('paginacion');
            pag.innerHTML = '';
            for (let i = 1; i <= totalPages; i++) {
                pag.innerHTML += `<button onclick="buscarPeliculas(${i})" class="btn-secondary ${i === page ? 'bg-white/20' : ''}">${i}</button>`;
            }
        }

        async function solicitarPelicula(id) {
            if (!confirm('¿Enviar esta película a tu Telegram?')) return;
            const res = await fetch(API_BASE + '/api/request-movie', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ telegram_id: TELEGRAM_ID, pelicula_id: id })
            });
            if (res.ok) alert('✅ Película enviada a tu chat');
            else alert('❌ Error al enviar');
        }

        // ========== PANEL DE ADMIN ==========
        function mostrarPanelAdmin() {
            document.getElementById('mainContent').innerHTML = `
                <div class="glass-card p-8">
                    <h2 class="text-3xl font-bold mb-6 flex items-center gap-2">
                        <i class="fas fa-crown text-yellow-400"></i> Panel de Administración
                    </h2>
                    <div class="flex gap-4 mb-6 flex-wrap">
                        <button onclick="cargarSolicitudes()" class="btn-secondary" id="tabSolicitudes">📋 Solicitudes</button>
                        <button onclick="cargarUsuarios()" class="btn-secondary" id="tabUsuarios">👥 Usuarios</button>
                        <button onclick="cargarCatalogoAdmin()" class="btn-secondary" id="tabCatalogo">🎬 Catálogo</button>
                    </div>
                    <div id="adminContent" class="space-y-4"></div>
                </div>
            `;
            cargarSolicitudes();
        }

        function setActiveTab(tabId) {
            ['tabSolicitudes', 'tabUsuarios', 'tabCatalogo'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.classList.remove('bg-white/20');
            });
            const activeBtn = document.getElementById(tabId);
            if (activeBtn) activeBtn.classList.add('bg-white/20');
        }

        // Solicitudes
        async function cargarSolicitudes() {
            setActiveTab('tabSolicitudes');
            try {
                const res = await fetch(API_BASE + '/api/pending-requests', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ telegram_id: TELEGRAM_ID })
                });
                if (!res.ok) throw new Error('No autorizado');
                const solicitudes = await res.json();
                const adminDiv = document.getElementById('adminContent');
                if (!solicitudes.length) {
                    adminDiv.innerHTML = '<p class="text-center py-8">No hay solicitudes pendientes.</p>';
                    return;
                }
                adminDiv.innerHTML = solicitudes.map(s => `
                    <div class="glass-card p-4">
                        <div class="flex flex-wrap gap-4 items-start justify-between">
                            <div>
                                <p><strong>Usuario:</strong> ${s.telegram_id}</p>
                                <p><strong>Plan:</strong> ${s.plan_solicitado}</p>
                                <p><strong>Método:</strong> ${s.metodo_pago}</p>
                                <p><strong>Fecha:</strong> ${new Date(s.created_at).toLocaleString()}</p>
                            </div>
                            <img src="${s.captura_url}" class="h-24 rounded-lg object-cover cursor-pointer" onclick="abrirModal('${s.captura_url}')">
                        </div>
                        <div class="flex gap-2 mt-4">
                            <button onclick="aprobarSolicitud('${s.id}')" class="btn-primary">Aprobar</button>
                            <button onclick="rechazarSolicitud('${s.id}')" class="btn-secondary">Rechazar</button>
                        </div>
                    </div>
                `).join('');
            } catch (e) {
                document.getElementById('adminContent').innerHTML = '<p class="text-red-400">Error al cargar solicitudes</p>';
            }
        }

        async function aprobarSolicitud(id) {
            if (!confirm('¿Aprobar esta solicitud?')) return;
            const res = await fetch(API_BASE + '/api/approve-request', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ admin_id: TELEGRAM_ID, solicitud_id: id })
            });
            if (res.ok) {
                alert('Solicitud aprobada');
                cargarSolicitudes();
            } else {
                alert('Error al aprobar');
            }
        }

        async function rechazarSolicitud(id) {
            const motivo = prompt('Motivo del rechazo:');
            if (!motivo) return;
            const res = await fetch(API_BASE + '/api/reject-request', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ admin_id: TELEGRAM_ID, solicitud_id: id, motivo })
            });
            if (res.ok) {
                alert('Solicitud rechazada');
                cargarSolicitudes();
            } else {
                alert('Error al rechazar');
            }
        }

        // Usuarios
        async function cargarUsuarios() {
            setActiveTab('tabUsuarios');
            try {
                const res = await fetch(API_BASE + '/api/users', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ admin_id: TELEGRAM_ID })
                });
                if (!res.ok) throw new Error('No autorizado');
                const usuarios = await res.json();
                const adminDiv = document.getElementById('adminContent');
                if (!usuarios.length) {
                    adminDiv.innerHTML = '<p class="text-center py-8">No hay usuarios registrados.</p>';
                    return;
                }
                adminDiv.innerHTML = usuarios.map(u => {
                    const expiracion = u.fecha_expiracion ? new Date(u.fecha_expiracion).toLocaleDateString() : 'N/A';
                    const diasRestantes = u.fecha_expiracion ? Math.ceil((new Date(u.fecha_expiracion) - new Date()) / (1000*60*60*24)) : 0;
                    return `
                        <div class="glass-card p-4">
                            <div class="flex justify-between items-start">
                                <div>
                                    <p><strong>ID:</strong> ${u.telegram_id}</p>
                                    <p><strong>Plan:</strong> ${u.plan === 'clasico' ? '⚜️ Clásico' : '💎 Premium'}</p>
                                    <p><strong>Expira:</strong> ${expiracion}</p>
                                    <p><strong>Días restantes:</strong> ${diasRestantes}</p>
                                </div>
                                <span class="badge">${diasRestantes > 0 ? 'Activo' : 'Inactivo'}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            } catch (e) {
                document.getElementById('adminContent').innerHTML = '<p class="text-center py-8">Error al cargar usuarios.</p>';
            }
        }

        // Catálogo admin
        async function cargarCatalogoAdmin() {
            setActiveTab('tabCatalogo');
            try {
                const res = await fetch(API_BASE + '/api/catalogo-admin', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ admin_id: TELEGRAM_ID })
                });
                if (!res.ok) throw new Error('No autorizado');
                const data = await res.json();
                let html = '<div class="mb-4"><button onclick="mostrarFormAgregarPelicula()" class="btn-primary"><i class="fas fa-plus mr-2"></i>Agregar película</button></div>';
                html += '<div id="formAgregarPelicula" class="hidden mb-4"></div>';
                html += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
                data.data.forEach(p => {
                    html += `
                        <div class="glass-card p-4">
                            <h3 class="font-bold">${p.titulo}</h3>
                            <p class="text-xs opacity-60">Message ID: ${p.message_id}</p>
                            <p class="text-xs opacity-60">ID: ${p.id.substring(0,8)}</p>
                        </div>
                    `;
                });
                html += '</div>';
                document.getElementById('adminContent').innerHTML = html;
            } catch (e) {
                document.getElementById('adminContent').innerHTML = '<p class="text-center py-8">Error al cargar catálogo.</p>';
            }
        }

        function mostrarFormAgregarPelicula() {
            const formDiv = document.getElementById('formAgregarPelicula');
            formDiv.innerHTML = `
                <div class="glass-card p-4">
                    <h3 class="font-bold mb-4">Nueva película</h3>
                    <input type="text" id="nuevoTitulo" placeholder="Título" class="w-full p-2 rounded-xl bg-white/10 border border-white/20 mb-2">
                    <input type="number" id="nuevoMessageId" placeholder="Message ID" class="w-full p-2 rounded-xl bg-white/10 border border-white/20 mb-2">
                    <div class="flex gap-2">
                        <button onclick="agregarPelicula()" class="btn-primary">Guardar</button>
                        <button onclick="document.getElementById('formAgregarPelicula').innerHTML=''; document.getElementById('formAgregarPelicula').classList.add('hidden')" class="btn-secondary">Cancelar</button>
                    </div>
                </div>
            `;
            formDiv.classList.remove('hidden');
        }

        async function agregarPelicula() {
            const titulo = document.getElementById('nuevoTitulo').value;
            const message_id = document.getElementById('nuevoMessageId').value;
            if (!titulo || !message_id) return alert('Completa todos los campos');
            const res = await fetch(API_BASE + '/api/add-movie', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ admin_id: TELEGRAM_ID, titulo, message_id: parseInt(message_id) })
            });
            if (res.ok) {
                alert('Película agregada');
                cargarCatalogoAdmin();
            } else {
                alert('Error al agregar');
            }
        }

        // Iniciar
        identificarUsuario();
    </script>
</body>
</html>
