
/* ============================================================
   CONTROL_EQUIX
   PROYECTO ACADÉMICO - DISEÑO DE SOFTWARE

   Frontend multipágina conectado a PHP y MySQL.
   Los datos funcionales se consultan y guardan en la base de datos.
   ============================================================ */

(() => {
    'use strict';


    /* ============================================================
       01. CONFIGURACIÓN GENERAL
       ============================================================ */

    const API_BASE = 'api/';
    const APP_NAME = 'CONTROL_EQUIX';
    const UI_KEY = 'control-equix-ui-v1';


    /* ============================================================
       02. IMÁGENES DEL SISTEMA
       ============================================================ */
const HERO_IMAGE = 'assets/equix-hero-bg.jpg';

const EQUIPMENT_IMAGE_MAP = {
  camera: 'https://th.bing.com/th/id/OIP.Cg_q5iGIUYyodmLGTCvy0AHaFj?w=226&h=180&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3',
  microphone: 'https://th.bing.com/th/id/OIP.FwptqL2yw_Kp4qmLWVfbNwHaHa?w=178&h=180&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3',
  projector: 'https://th.bing.com/th/id/OIP.NFwDMZiHhiMb7QXmkMKA1AHaE8?w=274&h=181&c=7&r=0&o=7&dpr=1.3&pid=1.7&rm=3',
  screen: 'https://images.unsplash.com/photo-1527443154391-507e9dc6c5cc?auto=format&fit=crop&w=900&q=80',
  kit: 'https://www.amazon.com/images/I/61zhe4iW10L._AC_SL1480_._FMwebp_.jpg'
};


    /* ============================================================
       03. DATOS Y SESIÓN CARGADOS DESDE PHP / MYSQL
       ============================================================ */

    // Los datos funcionales se cargan desde MySQL mediante la API PHP.
    let db = {
        users: [],
        equipment: [],
        reservations: [],
        loans: [],
        inspections: [],
        events: [],
        notifications: []
    };

    const readStorage = (storage, key, fallback) => {
        try {
            return JSON.parse(storage.getItem(key) || 'null') ?? fallback;
        } catch {
            return fallback;
        }
    };

    const initialRoute =
        decodeURIComponent(
            window.location.pathname.split('/').pop() || 'index.html'
        ).replace(/\.html$/i, '') === 'index'
            ? 'login'
            : decodeURIComponent(
                window.location.pathname.split('/').pop() || 'inicio.html'
            ).replace(/\.html$/i, '');

    const storedUI = readStorage(sessionStorage, UI_KEY, {});

    let session = null;
    let route = initialRoute;
    let modal = null;
    let search = storedUI.search || '';
    let filterType = storedUI.filterType || '';
    let filterStatus = storedUI.filterStatus || '';
    let filterLocation = storedUI.filterLocation || '';
    let availability = storedUI.availability || { type: '', start: '', end: '' };
    let selected = storedUI.selected || [];
    let reserveDraft = {};
    let tab = storedUI.tab || 'Todos';
    let currentRole = storedUI.currentRole || 'Administrador';
    let toastTimeout;

    window._entityId = new URLSearchParams(window.location.search).get('id') || null;

    /* La sesión real se conserva en el servidor PHP. Aquí solo se guardan filtros y navegación. */
    const persistUI = () => {
        try {
            sessionStorage.setItem(UI_KEY, JSON.stringify({
                search, filterType, filterStatus, filterLocation,
                availability, selected, tab, currentRole
            }));
        } catch (err) {
            console.warn('No se pudo guardar el estado de navegación:', err);
        }
    };

    /* ============================================================
       05. FUNCIONES AUXILIARES
       ============================================================ */

    const esc = (v) =>
        String(v ?? '').replace(
            /[&<>"']/g,
            c => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[c])
        );

    const user = id =>
        db.users.find(x => x.id === id) || {
            name: 'Desconocido'
        };

    const eq = id =>
        db.equipment.find(x => x.id === id) || {
            name: id,
            id,
            type: 'Equipo',
            status: 'No encontrado',
            accessories: []
        };

    const reservation = id =>
        db.reservations.find(x => x.id === id);

    const loanFor = id =>
        db.loans.find(x => x.reservationId === id);


    /* Formato de fechas */

    const date = (v, withTime = true) => {
        if (!v) return 'Sin registrar';

        const d = new Date(v);

        if (Number.isNaN(d.getTime())) return v;

        return d.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }) + (
            withTime
                ? ' · ' + d.toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : ''
        );
    };

    const nowLocal = () => {
        let d = new Date();

        return new Date(
            d.getTime() - d.getTimezoneOffset() * 60000
        ).toISOString().slice(0, 16);
    };

    const plusDays = n => {
        let d = new Date();

        d.setDate(d.getDate() + n);

        return new Date(
            d.getTime() - d.getTimezoneOffset() * 60000
        ).toISOString().slice(0, 16);
    };

    const fmtN = n =>
        String(n).padStart(2, '0');



    /* Estilos según el estado */

    const statusClass = (s) =>
        /Disponible|Aprobada|Devuelto|Registrada|Completada|Conforme/i.test(s)
            ? 'ok'
            : /Rechazada|Dañado|Fuera|Vencido|Error|Retirado/i.test(s)
                ? 'bad'
                : /Pendiente|Activo|Prestado|Inspección|Mantenimiento|Ocupado/i.test(s)
                    ? 'warn'
                    : 'blue';

    const pill = (s) =>
        `<span class="pill ${statusClass(s)}">${esc(s)}</span>`;


    /* Imagen asociada al equipo */

    
/* IMÁGENES DE LOS EQUIPOS */

const img = (e) => {

    // Primero utiliza la fotografía guardada en MySQL
    if (e?.imagen_ruta) {
        return e.imagen_ruta;
    }

    // Si todavía no tiene fotografía, utiliza una imagen por tipo
    const imagenes = {
        'Cámara': 'camera',
        'Audio': 'microphone',
        'Proyector': 'projector',
        'Pantalla': 'screen',
        'Iluminación': 'kit'
    };

    const key = e?.image || imagenes[e?.type] || 'kit';

    return (/^(https?:|data:|api\/)/i.test(key) || key.startsWith('assets/'))
        ? key
        : (EQUIPMENT_IMAGE_MAP[key] || EQUIPMENT_IMAGE_MAP.kit);
};

// =====================================================
// CONEXIÓN GENERAL CON LA API PHP / MYSQL
// =====================================================

async function apiRequest(endpoint, options = {}) {
    const config = {
        method: options.method || 'GET',
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
    };

    if (options.body !== undefined) {
        config.headers['Content-Type'] = 'application/json';
        config.body = JSON.stringify(options.body);
    }

    const response = await fetch(API_BASE + endpoint, config);
    let resultado;
    try {
        resultado = await response.json();
    } catch {
        throw new Error('El servidor no devolvió una respuesta JSON válida.');
    }

    if (!response.ok || resultado.exito === false) {
        const error = new Error(resultado.mensaje || 'La operación no se pudo completar.');
        error.status = response.status;
        throw error;
    }

    return resultado;
}

async function cargarDatosDesdeAPI() {
    const resultado = await apiRequest('bootstrap.php');
    session = resultado.usuario;
    db = resultado.datos || {
        users: [], equipment: [], reservations: [], loans: [],
        inspections: [], events: [], notifications: []
    };
    db.notifications = db.notifications || [];
    console.log('Datos cargados desde MySQL:', db);
    return db;
}

async function actualizarDatos() {
    await cargarDatosDesdeAPI();
    render();
}


    /* ============================================================
       06. SESIÓN Y PERMISOS DE USUARIO
       ============================================================ */

    const auth = () => !!session;

    const role = () =>
        session ? session.role : currentRole;

    const isManager = () =>
        role() === 'Administrador' ||
        role() === 'Encargado audiovisual';

    const isAdmin = () =>
        role() === 'Administrador';

    const canSeeReservation = r =>
        isManager() || r.userId === session?.id;


    /* ============================================================
       07. DISPONIBILIDAD Y ESTADOS
       ============================================================ */

    const overlap = (a, b, c, d) =>
        new Date(a) < new Date(d) &&
        new Date(c) < new Date(b);


    function busy(equipmentId, start, end, excludeId) {
        if (['Fuera de servicio', 'Retirado'].includes(eq(equipmentId).status)) {
            return true;
        }

        return db.reservations.some(r =>
            r.id !== excludeId &&
            r.status === 'Aprobada' &&
            r.equipmentIds.includes(equipmentId) &&
            overlap(start, end, r.start, r.end)
        ) || db.loans.some(l =>
            !l.returnedAt &&
            l.reservationId !== excludeId &&
            reservation(l.reservationId)?.equipmentIds.includes(equipmentId) &&
            new Date(end) > new Date(l.deliveredAt)
        );
    }


    function availableEquip(e, start, end) {
        return !['Fuera de servicio', 'Retirado'].includes(e.status) &&
            (!start || !end || !busy(e.id, start, end));
    }


    function lendStatus(l) {
        if (l.returnedAt) return 'Devuelto';

        const r = reservation(l.reservationId);

        return r && new Date(r.end) < new Date()
            ? 'Vencido'
            : 'Activo';
    }


    const countAvailable = () =>
        db.equipment.filter(e =>
            !['Fuera de servicio', 'Retirado'].includes(e.status) &&
            !db.loans.some(l =>
                !l.returnedAt &&
                reservation(l.reservationId)?.equipmentIds.includes(e.id)
            )
        ).length;


    const counts = () => ({
        available: countAvailable(),

        pending: db.reservations.filter(
            x => x.status === 'Pendiente'
        ).length,

        active: db.loans.filter(
            x => !x.returnedAt
        ).length,

        late: db.loans.filter(
            x => lendStatus(x) === 'Vencido'
        ).length,

        inspection: db.equipment.filter(
            x => x.status === 'Fuera de servicio'
        ).length
    });


    /* ============================================================
       08. MENÚS Y MÓDULOS
       ============================================================ */

    const nav = [
        ['inicio', '⌂', 'Inicio'],
        ['catalogo', '▣', 'Equipos'],
        ['disponibilidad', '▦', 'Reservas'],
        ['prestamos', '◇', 'Préstamos'],
        ['seguimiento', '⌁', 'Seguimiento']
    ];

    const modules = [
        [
            'catalogo',
            '▣',
            '1 Equipos',
            'Catálogo y consulta · Usuarios y acceso'
        ],
        [
            'disponibilidad',
            '▦',
            '2 Reservas',
            'Disponibilidad y solicitudes · Aprobación y rechazo'
        ],
        [
            'prestamos',
            '◇',
            '3 Préstamos',
            'Entrega y control · Devolución y checklist'
        ],
        [
            'seguimiento',
            '⌁',
            '4 Seguimiento',
            'Historial e inspecciones · Estados y alertas'
        ]
    ];

    const moduleOf = r =>
        ['catalogo', 'ficha', 'usuarios'].includes(r)
            ? 'catalogo'
            : [
                'disponibilidad',
                'nueva-reserva',
                'mis-reservas',
                'pendientes',
                'detalle-reserva'
            ].includes(r)
                ? 'disponibilidad'
                : [
                    'prestamos',
                    'entrega',
                    'devolucion',
                    'checklist'
                ].includes(r)
                    ? 'prestamos'
                    : [
                        'historial',
                        'inspecciones',
                        'seguimiento',
                        'mensajes'
                    ].includes(r)
                        ? 'seguimiento'
                        : 'inicio';


    /* ============================================================
       09. RUTAS Y TÍTULOS DE LAS PÁGINAS
       ============================================================ */

    const pages = {
        inicio: [
            'Inicio',
            'Tu centro de control',
            'Panel principal'
        ],

        catalogo: [
            'Catálogo',
            'Equipos y accesorios',
            'Equipos'
        ],

        ficha: [
            'Ficha de equipo',
            'Registro y edición',
            'Equipos'
        ],

        usuarios: [
            'Usuarios y acceso',
            'Usuarios, perfiles y permisos',
            'Equipos'
        ],

        disponibilidad: [
            'Disponibilidad',
            'Consulta por periodo y tipo',
            'Reservas'
        ],

        'nueva-reserva': [
            'Nueva reserva',
            'Solicitud de equipos audiovisuales',
            'Reservas'
        ],

        'mis-reservas': [
            'Mis reservas',
            'Estado de solicitudes propias',
            'Reservas'
        ],

        pendientes: [
            'Pendientes',
            'Aprobación y rechazo',
            'Reservas'
        ],

        'detalle-reserva': [
            'Detalle de reserva',
            'Solicitud y decisión',
            'Reservas'
        ],

        prestamos: [
            'Préstamos',
            'Entregas y control',
            'Préstamos'
        ],

        entrega: [
            'Entrega',
            'Condición inicial y accesorios',
            'Préstamos'
        ],

        devolucion: [
            'Devolución',
            'Condición final y faltantes',
            'Préstamos'
        ],

        checklist: [
            'Checklist final',
            'Resumen de devolución',
            'Préstamos'
        ],

        historial: [
            'Historial',
            'Uso e intervenciones del equipo',
            'Seguimiento'
        ],

        inspecciones: [
            'Inspecciones',
            'Diagnóstico y mantenimiento',
            'Seguimiento'
        ],

        seguimiento: [
            'Seguimiento',
            'Estados y novedades',
            'Seguimiento'
        ],

        mensajes: [
            'Mensajes',
            'Avisos y confirmaciones',
            'Seguimiento'
        ]
    };


    /* ============================================================
       10. COMPONENTES REUTILIZABLES
       ============================================================ */

    const field = (
        label,
        name,
        value = '',
        type = 'text',
        opts = {}
    ) => `
        <div class="field ${opts.full ? 'full' : ''}">
            <label for="${esc(name)}">${esc(label)}</label>

            <input
                id="${esc(name)}"
                name="${esc(name)}"
                type="${type}"
                value="${esc(value)}"
                ${opts.required ? 'required' : ''}
                ${opts.min ? `min="${esc(opts.min)}"` : ''}
                placeholder="${esc(opts.placeholder || '')}"
                ${opts.readonly ? 'readonly' : ''}
            >
        </div>
    `;


    const select = (
        label,
        name,
        options,
        value = '',
        opts = {}
    ) => `
        <div class="field ${opts.full ? 'full' : ''}">
            <label for="${esc(name)}">${esc(label)}</label>

            <select name="${esc(name)}" id="${esc(name)}">
                ${options.map(v => {
                    let k = Array.isArray(v) ? v[0] : v;
                    let t = Array.isArray(v) ? v[1] : v;

                    return `
                        <option
                            value="${esc(k)}"
                            ${String(k) === String(value) ? 'selected' : ''}
                        >
                            ${esc(t)}
                        </option>
                    `;
                }).join('')}
            </select>
        </div>
    `;


    const textarea = (
        label,
        name,
        value = '',
        opts = {}
    ) => `
        <div class="field ${opts.full ? 'full' : ''}">
            <label for="${esc(name)}">${esc(label)}</label>

            <textarea
                id="${esc(name)}"
                name="${esc(name)}"
                ${opts.required ? 'required' : ''}
                placeholder="${esc(opts.placeholder || '')}"
            >${esc(value)}</textarea>
        </div>
    `;


    const panel = (s, title = '', cls = '') => `
        <section class="surface panel ${cls}">
            ${title ? `<h2 class="panel-title">${title}</h2>` : ''}
            ${s}
        </section>
    `;


    const btn = (
        label,
        action,
        id = '',
        cls = 'secondary'
    ) => `
        <button
            type="button"
            class="btn ${cls}"
            data-action="${esc(action)}"
            data-id="${esc(id)}"
        >
            ${label}
        </button>
    `;


    const subnav = entries => `
        <div class="subnav">
            ${entries.map(([r, label]) => `
                <button
                    class="${route === r ? 'active' : ''}"
                    data-route="${r}"
                >
                    ${label}
                </button>
            `).join('')}
        </div>
    `;


    /* ============================================================
       11. MENÚ LATERAL Y MENÚ MÓVIL
       ============================================================ */

    const navAside = () => `
        <aside class="sidebar">

            <div class="brand">
                <div class="brand-icon">◉</div>

                <div>
                    <div class="brand-title">
                        CONTROL_EQUIX
                    </div>

                    <div class="brand-sub">
                        Centro de préstamos audiovisuales
                    </div>
                </div>
            </div>

            <div class="menu-caption">Navegación</div>

            ${nav.map(([r, icon, label]) => `
                <button
                    data-route="${r}"
                    class="nav-btn ${moduleOf(route) === r ? 'active' : ''}"
                >
                    <span class="nav-icon">${icon}</span>
                    ${label}
                </button>
            `).join('')}

            <div class="menu-caption">Accesos</div>

            <button class="nav-btn" data-route="mis-reservas">
                <span class="nav-icon">▤</span>
                Mis reservas
            </button>

            ${isManager() ? `
                <button class="nav-btn" data-route="pendientes">
                    <span class="nav-icon">☑</span>
                    Aprobaciones
                </button>
            ` : ''}

            ${isAdmin() ? `
                <button class="nav-btn" data-route="usuarios">
                    <span class="nav-icon">♙</span>
                    Usuarios
                </button>
            ` : ''}

            <div class="side-bottom">
                <span class="role-chip">${esc(role())}</span>

                <div class="person-name">
                    ${esc(session.name)}
                </div>

                <div class="small-muted">
                    Demostración académica
                </div>

                <button class="text-btn" data-action="logout">
                    Cerrar sesión
                </button>

                <br>

                <button class="text-btn" data-action="refresh-data">
                    Actualizar datos del servidor
                </button>
            </div>

        </aside>
    `;


    const navMobile = () => `
        <nav class="mobile-nav" aria-label="Navegación principal">

            ${nav.map(([r, icon, label]) => `
                <button
                    data-route="${r}"
                    class="${moduleOf(route) === r ? 'active' : ''}"
                >
                    <span>${icon}</span>
                    ${label}
                </button>
            `).join('')}

        </nav>
    `;


    /* ============================================================
       12. INICIO DE SESIÓN
       ============================================================ */

    function loginView() {
        return `
            <main class="login-layout">
                <section class="login-left">
                    <div class="login-brand login-brand-inverse">
                        <div class="brand-icon">◉</div>
                        <div>
                            <strong>CONTROL<span>_EQUIX</span></strong>
                            <small>GESTIÓN AUDIOVISUAL</small>
                        </div>
                    </div>

                    <div class="login-copy">
                        <span class="login-kicker">CENTRO DE PRÉSTAMOS</span>
                        <h1>Gestión integral de equipos audiovisuales.</h1>
                        <p>
                            Administra cámaras, sonido, iluminación y equipos de producción.
                            Organiza reservas, préstamos, entregas y seguimiento desde un solo lugar.
                        </p>
                    </div>

                    <div class="login-feature-list" aria-label="Módulos principales">
                        <span><b>◉</b> Equipos</span>
                        <span><b>▦</b> Reservas</span>
                        <span><b>◇</b> Préstamos</span>
                        <span><b>⌁</b> Seguimiento</span>
                    </div>
                </section>

                <section class="login-right">
                    <form class="login-box" id="login-form">
                        <div class="login-brand login-brand-light">
                            <div class="brand-icon">◉</div>
                            <div>
                                <strong>CONTROL<span>_EQUIX</span></strong>
                                <small>PLATAFORMA DE GESTIÓN</small>
                            </div>
                        </div>

                        <div class="eyebrow">ACCESO AL SISTEMA</div>
                        <h2>Inicia sesión</h2>
                        <p class="muted">Selecciona tu perfil e ingresa con tus credenciales.</p>

                        ${field(
                            'Correo institucional',
                            'login-email',
                            currentRole === 'Solicitante'
                                ? 'diego@campus.edu'
                                : currentRole === 'Encargado audiovisual'
                                    ? 'luis@campus.edu'
                                    : 'camila@campus.edu',
                            'email',
                            { required: true }
                        )}

                        ${field(
                            'Contraseña',
                            'login-pass',
                            'demo123',
                            'password',
                            { required: true }
                        )}

                        <div class="field-label login-role-label">Perfil de acceso</div>
                        <div class="role-grid">
                            ${[
                                'Administrador',
                                'Encargado audiovisual',
                                'Solicitante'
                            ].map(r => `
                                <button
                                    type="button"
                                    class="role-option ${currentRole === r ? 'selected' : ''}"
                                    data-action="set-login-role"
                                    data-id="${esc(r)}"
                                >
                                    ${esc(r)}
                                </button>
                            `).join('')}
                        </div>

                        <p class="login-demo-note">
                            Clave de demostración: <strong>demo123</strong>.
                            El acceso se valida con usuarios registrados en MySQL.
                        </p>

                        <button class="btn block login-submit" type="submit">
                            Ingresar <span aria-hidden="true">→</span>
                        </button>

                        <p class="helper login-footnote">
                            CONTROL_EQUIX · Sistema de administración de equipos audiovisuales.
                        </p>
                    </form>
                </section>
            </main>
        `;
    }


    /* ============================================================
       13. PANEL PRINCIPAL
       ============================================================ */

    function homeView() {
        const c = counts();

        return `
            <div class="layout-grid">

                <div class="span-12">

                    <section class="surface hero">

                        <div class="hero-text">

                            <div class="eyebrow" style="color:#F2D8DA">
                                CONTROL_EQUIX
                            </div>

                            <h2>
                                Donde encontrarás los<br>
                                mejores equipos audiovisuales.
                            </h2>

                            <p>
                                Bienvenida, ${
                                    esc(session.name.split(' ')[0])
                                }. Consulta disponibilidad, organiza
                                reservas y administra tus recursos
                                desde un solo lugar.
                            </p>

                            ${btn(
                                'Consultar disponibilidad →',
                                'go',
                                'disponibilidad',
                                'secondary'
                            )}

                        </div>

                        <div class="hero-illustration">

                            <div
                                class="hero-photo-card"
                                style="background-image:
                                    linear-gradient(
                                        rgba(40,15,18,.30),
                                        rgba(40,15,18,.10)
                                    ),
                                    url('${HERO_IMAGE}')"
                                aria-label="Centro de producción audiovisual"
                            ></div>

                        </div>

                    </section>

                </div>

                ${[
                    [c.available, 'Disponibles'],
                    [c.pending, 'Pendientes'],
                    [c.active, 'Préstamos activos'],
                    [c.late, 'Vencidos']
                ].map(([n, l]) => `
                    <div class="span-3">
                        <div class="surface stat">
                            <div class="num">${fmtN(n)}</div>
                            <div class="cap">${l}</div>
                        </div>
                    </div>
                `).join('')}

                <div class="span-8">

                    ${panel(`
                        <div class="modules">

                            ${modules.map(([r, i, t, d]) => `
                                <button
                                    class="module-card"
                                    data-route="${r}"
                                >
                                    <span class="module-icon">
                                        ${i}
                                    </span>

                                    <span>
                                        <div class="module-title">
                                            ${t}
                                        </div>

                                        <div class="module-detail">
                                            ${d}
                                        </div>
                                    </span>
                                </button>
                            `).join('')}

                        </div>
                    `, 'Tu centro de control')}

                </div>

                <div class="span-4">

                    ${panel(`
                        <div class="notice">
                            <strong>
                                4 módulos · 8 submódulos
                            </strong>
                            <br>
                            Interfaz basada en el Enunciado 25.
                            ${c.inspection} equipo(s) fuera de servicio.
                        </div>

                        <p class="meta">
                            Sistema conectado a PHP y MySQL. Los registros se consultan y guardan en el servidor.
                        </p>

                        ${btn(
                            'Ver seguimiento',
                            'go',
                            'seguimiento',
                            'secondary'
                        )}
                    `, 'Novedades')}

                </div>

            </div>
        `;
    }


    /* ============================================================
       14. MÓDULO 1 - EQUIPOS Y ADMINISTRACIÓN
       ============================================================ */

    const equipoCard = e => `
        <article class="equip-card">

            <div class="equip-pic">
                <img
                    src="${img(e)}"
                    alt="Ilustración de ${esc(e.name)}"
                >
            </div>

            <div class="equip-body">

                <div class="split-line">
                    <div class="equip-name">
                        ${esc(e.name)}
                    </div>

                    ${pill(e.status)}
                </div>

                <div class="meta">
                    ${esc(e.id)} · ${esc(e.type)}
                </div>

                <div class="meta">
                    Ubicación: ${esc(e.location)}
                </div>

                <div class="equip-footer">

                    ${btn(
                        'Ver ficha →',
                        'equipment',
                        e.id,
                        'secondary sm'
                    )}

                    ${isAdmin()
                        ? btn('Editar', 'edit-equipment', e.id, 'ghost sm') +
                          (e.status === 'Retirado' ? '' : btn('Retirar', 'retire-equipment', e.id, 'red sm'))
                        : ''
                    }

                </div>

            </div>

        </article>
    `;


    /* Catálogo de equipos */

    function catalogView() {
        let arr = db.equipment.filter(e =>
            (!search ||
                (e.id + ' ' + e.name)
                    .toLowerCase()
                    .includes(search.toLowerCase())
            ) &&
            (!filterType || e.type === filterType) &&
            (!filterStatus || e.status === filterStatus) &&
            (!filterLocation ||
                e.location
                    .toLowerCase()
                    .includes(filterLocation.toLowerCase())
            )
        );

        return `
            ${subnav([
                ['catalogo', '1.1 Catálogo y consulta'],
                ['usuarios', '1.2 Usuarios y acceso']
            ])}

            ${panel(`
                <div class="toolbar">

                    <div class="field search-input">
                        <label>Buscar por código o nombre</label>

                        <input
                            id="catalog-search"
                            value="${esc(search)}"
                            placeholder="Ej. CAM-014 o Sony"
                        >
                    </div>

                    ${select(
                        'Tipo',
                        'filter-type',
                        ['', ...new Set(db.equipment.map(x => x.type))],
                        filterType,
                        {}
                    )}

                    ${select(
                        'Estado',
                        'filter-status',
                        [
                            '',
                            'Disponible',
                            'Prestado',
                            'Fuera de servicio',
                            'Retirado'
                        ],
                        filterStatus,
                        {}
                    )}

                    <div class="field filter-field">
                        <label>Ubicación</label>
                        <input
                            id="filter-location"
                            value="${esc(filterLocation)}"
                            placeholder="Bodega / sala"
                        >
                    </div>

                    ${btn(
                        'Aplicar filtros',
                        'apply-filters',
                        '',
                        'ghost'
                    )}

                    ${btn(
                        'Limpiar',
                        'clear-filters',
                        '',
                        'secondary'
                    )}

                </div>
            `, 'Buscar equipos')}

            <div class="section-header">

                <div>
                    <h2 class="panel-title">
                        Catálogo audiovisual
                    </h2>

                    <div class="meta">
                        ${arr.length} de ${
                            db.equipment.length
                        } equipos visibles
                    </div>
                </div>

                ${isAdmin()
                    ? btn('+ Crear equipo', 'new-equipment', '', '')
                    : ''
                }

            </div>

            ${arr.length
                ? `
                    <div class="equipment-grid">
                        ${arr.map(equipoCard).join('')}
                    </div>
                `
                : `
                    <div class="surface empty">
                        <strong>No encontramos equipos</strong>
                        Prueba con otros filtros.

                        ${btn(
                            'Limpiar búsqueda',
                            'clear-filters',
                            '',
                            'ghost'
                        )}
                    </div>
                `
            }
        `;
    }


    /* Administración de usuarios */

    function usersView() {
        return `
            ${subnav([
                ['catalogo', '1.1 Catálogo y consulta'],
                ['usuarios', '1.2 Usuarios y acceso']
            ])}

            ${panel(`
                <div class="section-header">

                    <span class="meta">
                        ${db.users.length} usuarios registrados
                    </span>

                    ${isAdmin()
                        ? btn('+ Invitar usuario', 'new-user', '', '')
                        : ''
                    }

                </div>

                <div class="list-stack">

                    ${db.users.map(u => `
                        <div class="item-card">

                            <div class="item-head">
                                <div>
                                    <div class="item-title">
                                        ${esc(u.name)}
                                    </div>

                                    <div class="meta">
                                        ${esc(u.email)}
                                    </div>
                                </div>

                                ${pill(u.role)}
                            </div>

                            <div class="item-detail">
                                ${
                                    u.role === 'Solicitante'
                                        ? 'Consultar catálogo, solicitar y consultar reservas propias.'
                                        : u.role === 'Encargado audiovisual'
                                            ? 'Revisar reservas, registrar entregas y devoluciones e inspeccionar equipos.'
                                            : 'Gestionar catálogo y usuarios, y consultar los procesos.'
                                }
                            </div>

                        </div>
                    `).join('')}

                </div>
            `, 'Usuarios y permisos')}
        `;
    }


    /* Ficha de equipo */

    function fichaView() {
        const e = eq(
            window._entityId || db.equipment[0]?.id
        );

        return `
            ${subnav([
                ['catalogo', '1.1 Catálogo y consulta'],
                ['usuarios', '1.2 Usuarios y acceso']
            ])}

            <div class="layout-grid">

                <div class="span-5">

                    ${panel(`
                        <img
                            class="inline-photo"
                            src="${img(e)}"
                            alt="${esc(e.name)}"
                        >

                        <h2>${esc(e.name)}</h2>

                        <div class="meta">
                            ${esc(e.id)} · ${esc(e.type)}
                        </div>

                        <p>${pill(e.status)}</p>

                        <p class="meta">
                            Ubicación: ${esc(e.location)}
                        </p>

                        <strong>Accesorios</strong>

                        ${e.accessories.map(a => `
                            <div class="check-row">
                                ✓ ${esc(a)}
                            </div>
                        `).join('')}

                        ${btn(
                            'Consultar historial',
                            'equipment-history',
                            e.id,
                            'ghost'
                        )}
                    `, 'Vista de equipo')}

                </div>

                <div class="span-7">

                    ${panel(
                        isAdmin()
                            ? `
                                <form
                                    id="equipment-form"
                                    class="form-grid"
                                >
                                    <input
                                        type="hidden"
                                        name="id-old"
                                        value="${esc(e.id)}"
                                    >

                                    ${field(
                                        'Código único',
                                        'code',
                                        e.id,
                                        'text',
                                        { required: true }
                                    )}

                                    ${field(
                                        'Nombre',
                                        'name',
                                        e.name,
                                        'text',
                                        { required: true }
                                    )}

                                    ${select(
                                        'Tipo',
                                        'type',
                                        [
                                            'Cámara',
                                            'Proyector',
                                            'Audio',
                                            'Pantalla',
                                            'Iluminación'
                                        ],
                                        e.type
                                    )}

                                    ${field(
                                        'Ubicación',
                                        'location',
                                        e.location,
                                        'text',
                                        { required: true }
                                    )}

                                    ${select(
                                        'Estado',
                                        'status',
                                        [
                                            'Disponible',
                                            'Prestado',
                                            'Fuera de servicio'
                                        ],
                                        e.status
                                    )}

                                    ${field(
                                        'Accesorios separados por coma',
                                        'accessories',
                                        e.accessories.join(', '),
                                        'text',
                                        { full: true }
                                    )}

                                    ${textarea(
                                        'Descripción del equipo',
                                        'description',
                                        e.description || '',
                                        { full: true, placeholder: 'Describe el uso, características o estado general del equipo.' }
                                    )}

                                    ${field(
                                        'URL de imagen (opcional)',
                                        'image_url',
                                        e.imagen_ruta || '',
                                        'text',
                                        {
                                            full: true,
                                            placeholder: 'https://sitio.com/imagen-del-equipo.jpg'
                                        }
                                    )}

                                    <div class="field full">
                                        <label for="image_file">O subir fotografía desde tu computador</label>
                                        <input id="image_file" name="image_file" type="file" accept="image/jpeg,image/png,image/webp">
                                        <small class="helper">JPG, PNG o WEBP · máximo 4 MB. La fotografía se almacena en MySQL.</small>
                                    </div>

                                    <label class="image-remove-option full">
                                        <input type="checkbox" name="quitar_imagen" value="1">
                                        Quitar la fotografía actual
                                    </label>


                                    <div class="full btn-row">
                                        <button
                                            type="submit"
                                            class="btn"
                                        >
                                            Guardar cambios
                                        </button>

                                        ${btn(
                                            'Volver al catálogo',
                                            'go',
                                            'catalogo',
                                            'secondary'
                                        )}
                                    </div>

                                </form>
                            `
                            : `
                                <p class="notice">
                                    Solo el perfil Administrador
                                    puede editar equipos.
                                </p>

                                ${btn(
                                    'Volver al catálogo',
                                    'go',
                                    'catalogo',
                                    'secondary'
                                )}
                            `,
                        'Ficha editable · RF-01'
                    )}

                </div>

            </div>
        `;
    }


    /* ============================================================
       15. MÓDULO 2 - RESERVAS Y DISPONIBILIDAD
       ============================================================ */

    function availabilityView() {
        const start = availability.start || plusDays(1);
        const end = availability.end || plusDays(2);

        const arr = db.equipment.filter(e =>
            !availability.type ||
            e.type === availability.type
        );

        return `
            ${subnav([
                ['disponibilidad', '2.1 Disponibilidad y solicitudes'],
                ['mis-reservas', 'Mis reservas'],
                ...(isManager()
                    ? [['pendientes', '2.2 Aprobación y rechazo']]
                    : []
                )
            ])}

            ${panel(`
                <form id="availability-form" class="toolbar">

                    ${select(
                        'Tipo de equipo',
                        'type',
                        ['', ...new Set(db.equipment.map(e => e.type))],
                        availability.type
                    )}

                    ${field(
                        'Desde',
                        'start',
                        start,
                        'datetime-local',
                        { required: true }
                    )}

                    ${field(
                        'Hasta',
                        'end',
                        end,
                        'datetime-local',
                        { required: true }
                    )}

                    <button class="btn" type="submit">
                        Consultar
                    </button>

                </form>

                <div class="legend-bar">
                    ${pill('Disponible')}
                    ${pill('Ocupado')}
                    ${pill('Fuera de servicio')}
                </div>

            `, 'Consulta de disponibilidad · RF-04')}

            <div class="section-header">

                <h2 class="panel-title">
                    Selecciona equipos
                </h2>

                ${btn(
                    `Continuar con ${selected.length} seleccionado(s) →`,
                    'go',
                    'nueva-reserva',
                    ''
                )}

            </div>

            <div class="equipment-grid">

                ${arr.map(e => {
                    const free = availableEquip(e, start, end);

                    return `
                        <article class="equip-card">

                            <div class="equip-pic">
                                <img
                                    src="${img(e)}"
                                    alt="${esc(e.name)}"
                                >
                            </div>

                            <div class="equip-body">

                                <div class="split-line">
                                    <strong>${esc(e.name)}</strong>

                                    ${pill(
                                        free
                                            ? 'Disponible'
                                            : e.status === 'Fuera de servicio'
                                                ? 'Fuera de servicio'
                                                : 'Ocupado'
                                    )}
                                </div>

                                <div class="meta">
                                    ${esc(e.id)} · ${esc(e.type)}
                                </div>

                                <div class="meta">
                                    ${esc(e.location)}
                                </div>

                                <div class="equip-footer">

                                    <label
                                        class="check-row"
                                        style="flex:1;cursor:${
                                            free ? 'pointer' : 'not-allowed'
                                        }"
                                    >
                                        <input
                                            type="checkbox"
                                            data-select-equip="${esc(e.id)}"
                                            ${selected.includes(e.id)
                                                ? 'checked'
                                                : ''
                                            }
                                            ${free ? '' : 'disabled'}
                                        >
                                        Seleccionar
                                    </label>

                                </div>
                            </div>
                        </article>
                    `;
                }).join('')}

            </div>
        `;
    }


    function newReserveView() {
        const start = availability.start || plusDays(1);
        const end = availability.end || plusDays(2);

        return `
            ${subnav([
                ['disponibilidad', '2.1 Disponibilidad y solicitudes'],
                ['mis-reservas', 'Mis reservas'],
                ...(isManager()
                    ? [['pendientes', '2.2 Aprobación y rechazo']]
                    : []
                )
            ])}

            ${panel(`
                <form id="reserve-form" class="form-grid">

                    <div class="full">
                        <div class="notice">
                            <strong>
                                Paso 2 de 2 · Datos de solicitud
                            </strong>
                            <br>
                            Selecciona uno o varios equipos e
                            indica el motivo y periodo.
                        </div>
                    </div>

                    <div class="full">

                        <div class="field-label">
                            Equipos elegidos (${selected.length})
                        </div>

                        <div class="list-stack">

                            ${selected.map(id => `
                                <div class="check-row">

                                    <img
                                        class="small-img"
                                        src="${img(eq(id))}"
                                        alt=""
                                    >

                                    <div style="flex:1">
                                        <strong>
                                            ${esc(eq(id).name)}
                                        </strong>

                                        <div class="meta">
                                            ${esc(id)}
                                        </div>
                                    </div>

                                    <button
                                        class="text-btn"
                                        type="button"
                                        data-action="remove-selected"
                                        data-id="${esc(id)}"
                                    >
                                        Quitar
                                    </button>

                                </div>
                            `).join('') || `
                                <div class="notice warn">
                                    No has seleccionado equipos.
                                    Vuelve a Disponibilidad para elegirlos.
                                </div>
                            `}

                        </div>

                        ${btn(
                            '+ Añadir equipo',
                            'go',
                            'disponibilidad',
                            'secondary sm'
                        )}

                    </div>

                    ${field(
                        'Solicitante',
                        'requester',
                        session.name,
                        'text',
                        { readonly: true }
                    )}

                    ${textarea(
                        'Propósito de la solicitud',
                        'purpose',
                        reserveDraft.purpose || '',
                        {
                            required: true,
                            full: true,
                            placeholder:
                                'Ej. Grabación de un evento institucional'
                        }
                    )}

                    ${field(
                        'Inicio',
                        'start',
                        start,
                        'datetime-local',
                        { required: true }
                    )}

                    ${field(
                        'Finalización',
                        'end',
                        end,
                        'datetime-local',
                        { required: true }
                    )}

                    <div class="full notice">
                        La solicitud se guardará inicialmente
                        con estado <strong>Pendiente</strong>.
                        El encargado decidirá su aprobación.
                    </div>

                    <div class="full btn-row">

                        <button class="btn" type="submit">
                            Enviar solicitud →
                        </button>

                        ${btn(
                            'Volver',
                            'go',
                            'disponibilidad',
                            'secondary'
                        )}

                    </div>

                </form>
            `, 'Nueva reserva · RF-05')}
        `;
    }


    function reservationsView() {
        let arr = db.reservations.filter(canSeeReservation);

        return `
            ${subnav([
                ['disponibilidad', '2.1 Disponibilidad y solicitudes'],
                ['mis-reservas', 'Mis reservas'],
                ...(isManager()
                    ? [['pendientes', '2.2 Aprobación y rechazo']]
                    : []
                )
            ])}

            <div class="section-header">

                <h2 class="panel-title">
                    Mis reservas · RF-06
                </h2>

                ${btn(
                    'Nueva reserva',
                    'go',
                    'disponibilidad',
                    ''
                )}

            </div>

            ${panel(`
                <div class="list-stack">

                    ${arr.map(r => `
                        <div class="item-card">

                            <div class="item-head">

                                <div>
                                    <div class="item-title">
                                        ${esc(r.id)}
                                    </div>

                                    <div class="meta">
                                        ${esc(
                                            r.equipmentIds
                                                .map(id => eq(id).name)
                                                .join(' + ')
                                        )}
                                    </div>
                                </div>

                                ${pill(r.status)}
                            </div>

                            <div class="item-detail">
                                ${date(r.start)} →
                                ${date(r.end)}
                                <br>
                                Propósito: ${esc(r.purpose)}
                            </div>

                            ${r.reason ? `
                                <div class="notice bad">
                                    Motivo: ${esc(r.reason)}
                                </div>
                            ` : ''}

                            ${btn(
                                'Ver solicitud',
                                'reservation',
                                r.id,
                                'secondary sm'
                            )}
                        </div>
                    `).join('') || `
                        <div class="empty">
                            <strong>Sin reservas todavía</strong>
                            Realiza la primera solicitud
                            desde Disponibilidad.
                        </div>
                    `}

                </div>
            `, 'Solicitudes registradas')}
        `;
    }


    function pendingView() {
        if (!isManager()) return denied();

        let arr = db.reservations.filter(r =>
            tab === 'Todos' || r.status === tab
        );

        return `
            ${subnav([
                ['disponibilidad', '2.1 Disponibilidad y solicitudes'],
                ['mis-reservas', 'Mis reservas'],
                ['pendientes', '2.2 Aprobación y rechazo']
            ])}

            ${panel(`
                <div
                    class="tabs btn-row"
                    style="margin-bottom:15px"
                >
                    ${[
                        'Todos',
                        'Pendiente',
                        'Aprobada',
                        'Rechazada'
                    ].map(t => `
                        <button
                            class="${tab === t ? 'active' : ''}"
                            data-action="tab"
                            data-id="${t}"
                        >
                            ${t}
                        </button>
                    `).join('')}
                </div>

                <div class="list-stack">

                    ${arr.map(r => `
                        <div class="item-card">

                            <div class="item-head">
                                <div class="item-title">
                                    ${esc(r.id)} ·
                                    ${esc(user(r.userId).name)}
                                </div>

                                ${pill(r.status)}
                            </div>

                            <div class="item-detail">
                                ${esc(
                                    r.equipmentIds
                                        .map(i => eq(i).name)
                                        .join(' + ')
                                )}
                                <br>
                                ${date(r.start)} → ${date(r.end)}
                                <br>
                                ${esc(r.purpose)}
                            </div>

                            <div class="item-actions">

                                ${btn(
                                    'Ver detalle',
                                    'reservation',
                                    r.id,
                                    'secondary sm'
                                )}

                                ${r.status === 'Pendiente' ? `
                                    ${btn(
                                        'Aprobar',
                                        'approve',
                                        r.id,
                                        'sm'
                                    )}

                                    ${btn(
                                        'Rechazar',
                                        'reject',
                                        r.id,
                                        'secondary sm'
                                    )}
                                ` : ''}

                            </div>

                        </div>
                    `).join('') || `
                        <div class="empty">
                            No hay solicitudes en este estado.
                        </div>
                    `}
                </div>
            `, 'Gestión de solicitudes · RF-07')}
        `;
    }


    function detailReservationView() {
        const r = reservation(window._entityId);

        if (!r || !canSeeReservation(r)) {
            return denied();
        }

        return `
            ${subnav([
                ['disponibilidad', '2.1 Disponibilidad y solicitudes'],
                ['mis-reservas', 'Mis reservas'],
                ...(isManager()
                    ? [['pendientes', '2.2 Aprobación y rechazo']]
                    : []
                )
            ])}

            <div class="layout-grid">

                <div class="span-7">

                    ${panel(`
                        <div class="split-line">
                            <h2 class="card-heading">
                                ${esc(r.id)}
                            </h2>

                            ${pill(r.status)}
                        </div>

                        <div class="data-table">

                            <div class="item-detail">
                                Solicitante:
                                <strong>
                                    ${esc(user(r.userId).name)}
                                </strong>
                            </div>

                            <div class="item-detail">
                                Equipos:
                                <strong>
                                    ${esc(
                                        r.equipmentIds
                                            .map(id => eq(id).name)
                                            .join(' + ')
                                    )}
                                </strong>
                            </div>

                            <div class="item-detail">
                                Periodo:
                                <strong>
                                    ${date(r.start)} → ${date(r.end)}
                                </strong>
                            </div>

                            <div class="item-detail">
                                Propósito:
                                <strong>${esc(r.purpose)}</strong>
                            </div>

                        </div>

                        ${r.reason ? `
                            <div class="notice bad">
                                Motivo del rechazo:
                                ${esc(r.reason)}
                            </div>
                        ` : ''}

                        ${r.status === 'Pendiente' && isManager() ? `
                            <div class="btn-row">
                                ${btn(
                                    'Aprobar reserva',
                                    'approve',
                                    r.id,
                                    ''
                                )}

                                ${btn(
                                    'Rechazar reserva',
                                    'reject',
                                    r.id,
                                    'secondary'
                                )}
                            </div>
                        ` : ''}

                        ${r.status === 'Aprobada' &&
                            isManager() &&
                            !loanFor(r.id)
                                ? btn(
                                    'Registrar entrega',
                                    'start-delivery',
                                    r.id,
                                    ''
                                )
                                : ''
                        }

                        ${loanFor(r.id)
                            ? btn(
                                'Ver préstamo',
                                'loan',
                                loanFor(r.id).id,
                                'secondary'
                            )
                            : ''
                        }

                    `, 'Detalle de reserva · RF-07')}

                </div>

                <div class="span-5">

                    ${panel(`
                        <div class="notice">
                            La aprobación confirma la disponibilidad
                            según las fechas y equipos solicitados.
                        </div>

                        ${r.equipmentIds.map(id => `
                            <div class="check-row">

                                <img
                                    class="small-img"
                                    src="${img(eq(id))}"
                                    alt=""
                                >

                                <strong>
                                    ${esc(eq(id).name)}
                                </strong>

                                ${pill(
                                    busy(id, r.start, r.end, r.id)
                                        ? 'Ocupado'
                                        : 'Disponible'
                                )}
                            </div>
                        `).join('')}
                    `, 'Equipos solicitados')}

                </div>
            </div>
        `;
    }


    /* ============================================================
       16. MÓDULO 3 - PRÉSTAMOS Y DEVOLUCIONES
       ============================================================ */

    function loansView() {
        if (!isManager()) return denied();

        const arr = db.loans;

        return `
            ${subnav([
                ['prestamos', '3.1 Entrega y control'],
                ['devolucion', '3.2 Devolución y checklist']
            ])}

            <div class="layout-grid">

                <div class="span-3">
                    <div class="surface stat">
                        <div class="num">
                            ${fmtN(
                                arr.filter(
                                    l => lendStatus(l) === 'Activo'
                                ).length
                            )}
                        </div>

                        <div class="cap">Activos</div>
                    </div>
                </div>

                <div class="span-3">
                    <div class="surface stat">
                        <div class="num">
                            ${fmtN(
                                arr.filter(
                                    l => lendStatus(l) === 'Vencido'
                                ).length
                            )}
                        </div>

                        <div class="cap">Vencidos</div>
                    </div>
                </div>

                <div class="span-6">
                    ${panel(
                        btn(
                            'Ver reservas aprobadas',
                            'go',
                            'pendientes',
                            'secondary'
                        ),
                        'Formalizar préstamos'
                    )}
                </div>

                <div class="span-12">

                    ${panel(`
                        <div class="list-stack">

                            ${arr.map(l => {
                                const r = reservation(l.reservationId);

                                return `
                                    <div class="item-card">

                                        <div class="item-head">

                                            <div>
                                                <div class="item-title">
                                                    ${esc(l.id)} ·
                                                    ${esc(user(r?.userId).name)}
                                                </div>

                                                <div class="meta">
                                                    ${esc(
                                                        r?.equipmentIds
                                                            .map(id => eq(id).name)
                                                            .join(' + ')
                                                    )}
                                                </div>
                                            </div>

                                            ${pill(lendStatus(l))}
                                        </div>

                                        <div class="item-detail">
                                            Entrega:
                                            ${date(l.deliveredAt)}
                                            <br>

                                            Retorno previsto:
                                            ${date(r?.end)}
                                            <br>

                                            Retorno real:
                                            ${date(l.returnedAt)}
                                        </div>

                                        <div class="item-actions">

                                            ${!l.returnedAt
                                                ? btn(
                                                    'Registrar devolución',
                                                    'start-return',
                                                    l.id,
                                                    ''
                                                )
                                                : ''
                                            }

                                            ${btn(
                                                'Ver préstamo',
                                                'loan',
                                                l.id,
                                                'secondary sm'
                                            )}

                                        </div>
                                    </div>
                                `;
                            }).join('') || `
                                <div class="empty">
                                    No hay préstamos registrados.
                                </div>
                            `}

                        </div>
                    `, 'Préstamos · RF-10')}

                </div>
            </div>
        `;
    }


    function deliveryView() {
        if (!isManager()) return denied();

        const r =
            reservation(window._entityId) ||
            db.reservations.find(
                r => r.status === 'Aprobada' && !loanFor(r.id)
            );

        if (!r) {
            return panel(
                'No hay reservas aprobadas pendientes de entrega.',
                'Sin entregas'
            );
        }

        let all = r.equipmentIds.flatMap(
            id => eq(id).accessories
        );

        return `
            ${subnav([
                ['prestamos', '3.1 Entrega y control'],
                ['devolucion', '3.2 Devolución y checklist']
            ])}

            ${panel(`
                <div class="notice ok">
                    ${esc(r.id)} · Reserva aprobada ·
                    ${esc(user(r.userId).name)}
                </div>

                <form id="delivery-form" class="form-grid">

                    <input
                        type="hidden"
                        name="reservationId"
                        value="${esc(r.id)}"
                    >

                    ${field(
                        'Responsable de la entrega',
                        'responsible',
                        session.name,
                        'text',
                        { required: true }
                    )}

                    ${field(
                        'Fecha de entrega',
                        'deliveredAt',
                        nowLocal(),
                        'datetime-local',
                        { required: true }
                    )}

                    ${textarea(
                        'Condición inicial del equipo',
                        'condition',
                        'Buen estado. Prueba funcional correcta.',
                        { full: true, required: true }
                    )}

                    <div class="full">
                        <div class="field-label">
                            Checklist de equipos y accesorios
                        </div>

                        ${r.equipmentIds.map(id => `
                            <div class="check-row">
                                <label>
                                    <input
                                        type="checkbox"
                                        name="checked-equip"
                                        checked
                                        required
                                    >
                                    ${esc(eq(id).name)} · ${esc(id)}
                                </label>
                            </div>
                        `).join('')}

                        ${all.map(a => `
                            <label class="check-row">

                                <input
                                    type="checkbox"
                                    name="delivered-accessory"
                                    value="${esc(a)}"
                                    checked
                                >

                                ${esc(a)}

                            </label>
                        `).join('')}
                    </div>

                    <div class="full btn-row">

                        <button class="btn" type="submit">
                            Confirmar entrega →
                        </button>

                        ${btn(
                            'Cancelar',
                            'go',
                            'pendientes',
                            'secondary'
                        )}

                    </div>

                </form>
            `, 'Entrega · RF-08')}
        `;
    }


    function returnView() {
        if (!isManager()) return denied();

        const l =
            db.loans.find(
                x => x.id === window._entityId && !x.returnedAt
            ) ||
            db.loans.find(x => !x.returnedAt);

        if (!l) {
            return panel(
                'No hay préstamos pendientes de devolución.',
                'Sin devoluciones'
            );
        }

        const r = reservation(l.reservationId);

        return `
            ${subnav([
                ['prestamos', '3.1 Entrega y control'],
                ['devolucion', '3.2 Devolución y checklist']
            ])}

            ${panel(`
                <div class="notice">
                    ${esc(l.id)} ·
                    ${esc(user(r.userId).name)} ·
                    ${esc(
                        r.equipmentIds
                            .map(i => eq(i).name)
                            .join(' + ')
                    )}
                </div>

                <form id="return-form" class="form-grid">

                    <input
                        type="hidden"
                        name="loanId"
                        value="${esc(l.id)}"
                    >

                    ${field(
                        'Fecha y hora real de devolución',
                        'returnedAt',
                        nowLocal(),
                        'datetime-local',
                        { required: true }
                    )}

                    ${select(
                        'Condición final',
                        'finalCondition',
                        [
                            'Conforme',
                            'Con novedades',
                            'Dañado'
                        ],
                        'Con novedades'
                    )}

                    <div class="full">
                        <div class="field-label">
                            Accesorios devueltos ·
                            desmarca los faltantes
                        </div>

                        ${l.accessories.map(a => `
                            <label class="check-row">

                                <input
                                    type="checkbox"
                                    name="returned-accessory"
                                    value="${esc(a)}"
                                    checked
                                >

                                ${esc(a)}
                            </label>
                        `).join('')}
                    </div>

                    ${textarea(
                        'Daños observados',
                        'damage',
                        '',
                        {
                            full: true,
                            placeholder:
                                'Describe cualquier novedad de condición física'
                        }
                    )}

                    ${textarea(
                        'Notas de recepción',
                        'notes',
                        '',
                        {
                            full: true,
                            placeholder:
                                'Ej. Se entrega sin la tarjeta de memoria'
                        }
                    )}

                    <div class="full btn-row">

                        <button class="btn" type="submit">
                            Continuar al checklist final →
                        </button>

                        ${btn(
                            'Volver',
                            'go',
                            'prestamos',
                            'secondary'
                        )}

                    </div>

                </form>
            `, 'Registrar devolución · RF-09')}
        `;
    }


    function checklistView() {
        let l =
            db.loans.find(
                x => x.id === window._entityId
            ) ||
            db.loans.at(-1);

        if (!l) {
            return panel(
                'No hay devoluciones registradas.',
                'Checklist final'
            );
        }

        const r = reservation(l.reservationId);

        return `
            ${subnav([
                ['prestamos', '3.1 Entrega y control'],
                ['devolucion', '3.2 Devolución y checklist']
            ])}

            ${panel(`
                <div class="split-line">

                    <strong>
                        ${esc(l.id)} ·
                        ${esc(
                            r.equipmentIds
                                .map(i => eq(i).name)
                                .join(' + ')
                        )}
                    </strong>

                    ${pill(
                        l.missing.length
                            ? 'Con faltantes'
                            : 'Devuelto'
                    )}
                </div>

                <div
                    class="section-header"
                    style="margin-top:15px"
                >
                    <h2 class="card-heading">
                        Accesorios y equipos
                    </h2>

                    <span class="meta">
                        ${l.returnedAccessories.length}
                        de ${l.accessories.length} devueltos
                    </span>
                </div>

                ${l.accessories.map(a => `
                    <div class="check-row">

                        <span style="font-size:17px">
                            ${l.returnedAccessories.includes(a)
                                ? '☑'
                                : '☐'
                            }
                        </span>

                        <span style="flex:1">
                            ${esc(a)}
                        </span>

                        ${pill(
                            l.returnedAccessories.includes(a)
                                ? 'Conforme'
                                : 'Faltante'
                        )}
                    </div>
                `).join('')}

                <div class="notice ${
                    l.missing.length ? 'warn' : 'ok'
                }">
                    ${l.missing.length
                        ? 'Novedad: ' + esc(l.missing.join(', '))
                        : 'Entrega completa sin faltantes.'
                    }
                </div>

                <div class="meta">
                    Fecha: ${date(l.returnedAt)} ·
                    Condición: ${esc(l.finalCondition)} ·
                    Responsable: ${esc(l.responsible)}
                </div>

                <div class="btn-row" style="margin-top:16px">

                    ${btn(
                        'Consultar seguimiento',
                        'go',
                        'seguimiento',
                        ''
                    )}

                    ${btn(
                        'Ver historial',
                        'equipment-history',
                        r.equipmentIds[0],
                        'secondary'
                    )}

                </div>
            `, 'Checklist final · RF-09 / RF-13')}
        `;
    }


    /* ============================================================
       17. MÓDULO 4 - SEGUIMIENTO Y MANTENIMIENTO
       ============================================================ */

    function historyView() {
        const id =
            window._entityId ||
            db.equipment[0]?.id;

        const e = eq(id);

        let events = db.events.filter(
            ev => ev.equipmentId === id
        );

        return `
            ${subnav([
                ['historial', '4.1 Historial e inspecciones'],
                ['inspecciones', 'Inspecciones'],
                ['seguimiento', '4.2 Estados y alertas'],
                ['mensajes', 'Mensajes']
            ])}

            <div class="layout-grid">

                <div class="span-4">

                    ${panel(`
                        <img
                            class="inline-photo"
                            src="${img(e)}"
                            alt="${esc(e.name)}"
                        >

                        <h3>${esc(e.name)}</h3>

                        <div class="meta">
                            ${esc(e.id)} · ${esc(e.location)}
                        </div>

                        <p>${pill(e.status)}</p>

                        ${select(
                            'Cambiar equipo consultado',
                            'history-equipment',
                            db.equipment.map(x => [
                                x.id,
                                x.name + ' · ' + x.id
                            ]),
                            id
                        )}

                        ${btn(
                            'Consultar historial',
                            'history-select',
                            '',
                            'ghost'
                        )}
                    `, 'Equipo')}

                </div>

                <div class="span-8">

                    ${panel(`
                        <div class="timeline">

                            ${events.map(ev => `
                                <div class="timeline-row">

                                    <div class="timeline-date">
                                        ${date(ev.date)}
                                    </div>

                                    <strong>
                                        ${esc(ev.type)}
                                    </strong>

                                    <div class="meta">
                                        ${esc(ev.by)} ·
                                        ${esc(ev.details)}
                                    </div>

                                </div>
                            `).join('') || `
                                <div class="empty">
                                    Aún no hay eventos para este equipo.
                                </div>
                            `}

                        </div>

                        ${btn(
                            'Registrar inspección',
                            'inspect',
                            id,
                            ''
                        )}
                    `, 'Historial de uso · RF-11')}

                </div>
            </div>
        `;
    }


    function inspectionsView() {
        if (!isManager()) return denied();

        const id =
            window._entityId ||
            db.equipment.find(
                x => x.status === 'Fuera de servicio'
            )?.id ||
            db.equipment[0].id;

        return `
            ${subnav([
                ['historial', '4.1 Historial e inspecciones'],
                ['inspecciones', 'Inspecciones'],
                ['seguimiento', '4.2 Estados y alertas'],
                ['mensajes', 'Mensajes']
            ])}

            ${panel(`
                <form class="form-grid" id="inspection-form">

                    ${select(
                        'Equipo',
                        'equipmentId',
                        db.equipment.map(x => [
                            x.id,
                            x.id + ' · ' + x.name
                        ]),
                        id
                    )}

                    ${field(
                        'Fecha',
                        'date',
                        nowLocal(),
                        'datetime-local',
                        { required: true }
                    )}

                    ${field(
                        'Responsable',
                        'responsible',
                        session.name,
                        'text',
                        { required: true }
                    )}

                    ${textarea(
                        'Diagnóstico',
                        'diagnosis',
                        'Revisión física y prueba funcional del equipo.',
                        { required: true, full: true }
                    )}

                    ${textarea(
                        'Acción realizada',
                        'actionTaken',
                        'Revisión y limpieza general.',
                        { required: true, full: true }
                    )}

                    ${select(
                        'Resultado',
                        'result',
                        [
                            'Equipo apto para uso',
                            'Requiere mantenimiento',
                            'Revisión pendiente'
                        ],
                        'Equipo apto para uso'
                    )}

                    ${select(
                        'Estado después de inspección',
                        'newStatus',
                        [
                            'Disponible',
                            'Fuera de servicio'
                        ],
                        'Disponible'
                    )}

                    <div class="full notice">
                        Habilitar un equipo solo corresponde
                        al personal autorizado. El registro
                        queda asociado a su historial.
                    </div>

                    <div class="full btn-row">

                        <button type="submit" class="btn">
                            Guardar inspección →
                        </button>

                        ${btn(
                            'Ver historial',
                            'equipment-history',
                            id,
                            'secondary'
                        )}

                    </div>
                </form>
            `, 'Inspecciones y mantenimiento · RF-12')}

            ${panel(`
                <div class="list-stack">

                    ${db.inspections.slice(0, 8).map(i => `
                        <div class="item-card">

                            <div class="split-line">
                                <strong>
                                    ${esc(i.id)} ·
                                    ${esc(eq(i.equipmentId).name)}
                                </strong>

                                ${pill(i.newStatus)}
                            </div>

                            <div class="meta">
                                ${date(i.date)} ·
                                ${esc(i.responsible)}
                            </div>

                            <p class="item-detail">
                                ${esc(i.diagnosis)}
                            </p>

                        </div>
                    `).join('') || `
                        <div class="meta">
                            Aún no hay inspecciones
                            de demostración registradas.
                        </div>
                    `}

                </div>
            `, 'Inspecciones recientes')}
        `;
    }


    function followView() {
        const c = counts();

        const alerts = db.loans.filter(
            l => lendStatus(l) === 'Vencido'
        );

        return `
            ${subnav([
                ['historial', '4.1 Historial e inspecciones'],
                ['inspecciones', 'Inspecciones'],
                ['seguimiento', '4.2 Estados y alertas'],
                ['mensajes', 'Mensajes']
            ])}

            <div class="layout-grid">

                ${[
                    [db.reservations.length, 'Reservas'],
                    [db.loans.length, 'Préstamos'],
                    [c.late, 'Vencidos'],
                    [c.inspection, 'Fuera de servicio']
                ].map(([v, t]) => `
                    <div class="span-3">
                        <div class="surface stat">
                            <div class="num">
                                ${fmtN(v)}
                            </div>

                            <div class="cap">
                                ${t}
                            </div>
                        </div>
                    </div>
                `).join('')}

                <div class="span-8">

                    ${panel(`
                        <div class="list-stack">

                            ${db.events.slice(0, 10).map(ev => `
                                <div class="item-card">

                                    <div class="split-line">
                                        <strong>
                                            ${esc(ev.type)}
                                        </strong>

                                        ${pill(
                                            eq(ev.equipmentId).status
                                        )}
                                    </div>

                                    <div class="item-detail">
                                        ${esc(ev.equipmentId)} ·
                                        ${esc(ev.details)}
                                        <br>
                                        ${date(ev.date)}
                                    </div>

                                    ${btn(
                                        'Ver historial',
                                        'equipment-history',
                                        ev.equipmentId,
                                        'secondary sm'
                                    )}

                                </div>
                            `).join('') || `
                                <p class="meta">
                                    Sin novedades
                                </p>
                            `}

                        </div>
                    `, 'Actividad reciente · RF-13')}

                </div>

                <div class="span-4">

                    ${panel(`
                        <div class="notice ${
                            alerts.length ? 'warn' : 'ok'
                        }">
                            ${alerts.length
                                ? `${alerts.length} préstamo(s) vencido(s). Revisa las devoluciones pendientes.`
                                : 'No hay alertas de vencimiento pendientes.'
                            }
                        </div>

                        <div class="notice">
                            ${c.inspection} equipo(s) fuera de servicio.
                            Consulta inspecciones y mantenimiento.
                        </div>

                        ${btn(
                            'Ver mensajes',
                            'go',
                            'mensajes',
                            'secondary block'
                        )}
                    `, 'Alertas')}

                </div>
            </div>
        `;
    }


    function messagesView() {
        const notificaciones = db.notifications || [];

        return `
            ${subnav([
                ['historial', '4.1 Historial e inspecciones'],
                ['inspecciones', 'Inspecciones'],
                ['seguimiento', '4.2 Estados y alertas'],
                ['mensajes', 'Mensajes']
            ])}

            ${panel(`
                <p class="meta">
                    Notificaciones generadas por las solicitudes, aprobaciones, entregas, devoluciones e inspecciones del sistema.
                </p>

                <div class="list-stack">
                    ${notificaciones.map(n => `
                        <div class="item-card">
                            <div class="item-head">
                                <strong>${esc(n.title)}</strong>
                                ${pill(n.read ? 'Leída' : 'Nueva')}
                            </div>
                            <div class="item-detail">${esc(n.message)}</div>
                            <div class="meta">${date(n.date)}</div>
                            ${!n.read ? btn('Marcar como leída', 'mark-notification', n.id, 'secondary sm') : ''}
                        </div>
                    `).join('') || `
                        <div class="empty">
                            <strong>No tienes notificaciones</strong>
                            Aquí aparecerán los avisos relacionados con tus operaciones.
                        </div>
                    `}
                </div>
            `, 'Mensajes y notificaciones · RF-13')}
        `;
    }

    function denied() {
        return panel(
            '<div class="notice bad"><strong>Acceso restringido</strong><br>Este perfil no tiene permiso para esta sección.</div>' +
            btn('Ir al inicio', 'go', 'inicio', ''),
            'Acceso denegado'
        );
    }


    /* ============================================================
       18. CONEXIÓN DE LAS 18 PÁGINAS HTML
       ============================================================ */

    const contentRoutes = {
        inicio: homeView,
        catalogo: catalogView,
        ficha: fichaView,
        usuarios: usersView,
        disponibilidad: availabilityView,
        'nueva-reserva': newReserveView,
        'mis-reservas': reservationsView,
        pendientes: pendingView,
        'detalle-reserva': detailReservationView,
        prestamos: loansView,
        entrega: deliveryView,
        devolucion: returnView,
        checklist: checklistView,
        historial: historyView,
        inspecciones: inspectionsView,
        seguimiento: followView,
        mensajes: messagesView
    };


    /* ============================================================
       19. RENDERIZADO Y NAVEGACIÓN
       ============================================================ */

    function render() {
        if (route === 'login') {
            document.title = `Acceso | ${APP_NAME}`;

            document.getElementById('app').innerHTML = loginView();
            return;
        }

        if (!session) {
            window.location.replace('index.html');
            return;
        }

        const p = pages[route] || pages.inicio;

        const moduleNames = {
            inicio: 'Centro audiovisual',
            equipos: 'Módulo 1 · Equipos',
            reservas: 'Módulo 2 · Reservas',
            prestamos: 'Módulo 3 · Préstamos',
            seguimiento: 'Módulo 4 · Seguimiento'
        };

        document.title = `${p[0]} | ${APP_NAME}`;

        document.getElementById('app').innerHTML = `
            <div class="app-shell">

                ${navAside()}

                <main class="content">

                    <header class="topbar">

                        <div>
                            <div class="eyebrow">
                                ${moduleNames[moduleOf(route)] || 'Centro audiovisual'}
                            </div>

                            <h1 class="page-title">
                                ${p[0]}
                            </h1>

                            <p class="page-desc">
                                ${p[1]}
                            </p>
                        </div>

                        <div class="header-right">
                            <span class="role-chip">
                                ${esc(role())}
                            </span>
                        </div>

                    </header>

                    ${(contentRoutes[route] || homeView)()}

                </main>

                ${navMobile()}

            </div>

            ${modal ? renderModal() : ''}
        `;
    }


    function navigate(r, id) {
        if (
            r === 'pendientes' ||
            r === 'entrega' ||
            r === 'devolucion' ||
            r === 'inspecciones' ||
            r === 'prestamos'
        ) {
            if (!isManager()) {
                toast(
                    'Esta sección corresponde al encargado audiovisual.',
                    true
                );
                return;
            }
        }

        if (r === 'usuarios' && !isAdmin()) {
            toast(
                'Solo el administrador gestiona usuarios.',
                true
            );
            return;
        }

        if (!contentRoutes[r]) return;

        route = r;

        window._entityId = id || null;

        modal = null;

        persistUI();

        window.location.assign(
            r + '.html' +
            (id ? '?id=' + encodeURIComponent(id) : '')
        );
    }


    /* Mensajes temporales */

    function toast(message, error = false) {
        const el = document.getElementById('toast-root');

        el.innerHTML = `
            <div class="toast ${error ? 'error' : ''}">
                ${esc(message)}
            </div>
        `;

        clearTimeout(toastTimeout);

        toastTimeout = setTimeout(
            () => el.innerHTML = '',
            4200
        );
    }


    /* ============================================================
       20. VENTANAS EMERGENTES
       ============================================================ */

    function renderModal() {
        if (!modal) return '';

        const close = btn(
            'Cancelar',
            'close',
            '',
            'secondary'
        );

        let body = '';
        let title = '';


        /* Crear equipo */

        if (modal.type === 'equipment') {
            title = 'Registrar equipo';

            body = `
                <form
                    id="new-equipment-form"
                    class="form-grid"
                >
                    ${field(
                        'Código',
                        'code',
                        '',
                        'text',
                        { required: true }
                    )}

                    ${field(
                        'Nombre',
                        'name',
                        '',
                        'text',
                        { required: true }
                    )}

                    ${select(
                        'Tipo',
                        'type',
                        [
                            'Cámara',
                            'Proyector',
                            'Audio',
                            'Pantalla',
                            'Iluminación'
                        ]
                    )}

                    ${field(
                        'Ubicación',
                        'location',
                        '',
                        'text',
                        { required: true }
                    )}

                    ${select(
                        'Estado',
                        'status',
                        [
                            'Disponible',
                            'Fuera de servicio'
                        ]
                    )}

                    ${field(
                        'Accesorios (separados por coma)',
                        'accessories',
                        '',
                        'text',
                        { full: true }
                    )}

                    ${textarea(
                        'Descripción del equipo',
                        'description',
                        '',
                        { full: true, placeholder: 'Describe el uso, características o estado general del equipo.' }
                    )}

                    ${field(
                        'URL de imagen (opcional)',
                        'image_url',
                        '',
                        'text',
                        {
                            full: true,
                            placeholder: 'https://sitio.com/imagen-del-equipo.jpg'
                        }
                    )}

                    <div class="field full">
                        <label for="image_file">O subir fotografía desde tu computador</label>
                        <input id="image_file" name="image_file" type="file" accept="image/jpeg,image/png,image/webp">
                        <small class="helper">JPG, PNG o WEBP · máximo 4 MB. La fotografía se almacena en MySQL.</small>
                    </div>


                    <div class="full modal-footer">
                        ${close}

                        <button class="btn" type="submit">
                            Crear equipo
                        </button>
                    </div>
                </form>
            `;
        }


        /* Crear usuario */

        else if (modal.type === 'user') {
            title = 'Registrar usuario';

            body = `
                <form
                    id="new-user-form"
                    class="form-grid"
                >
                    ${field(
                        'Nombre',
                        'name',
                        '',
                        'text',
                        { required: true }
                    )}

                    ${field(
                        'Correo',
                        'email',
                        '',
                        'email',
                        { required: true }
                    )}

                    ${select(
                        'Rol',
                        'role',
                        [
                            'Solicitante',
                            'Encargado audiovisual',
                            'Administrador'
                        ]
                    )}

                    ${field(
                        'Contraseña inicial',
                        'password',
                        '',
                        'password',
                        { required: true, full: true, placeholder: 'Mínimo 6 caracteres' }
                    )}

                    <div class="full notice">
                        La contraseña se almacena cifrada en MySQL.
                    </div>

                    <div class="full modal-footer">
                        ${close}

                        <button class="btn" type="submit">
                            Agregar usuario
                        </button>
                    </div>
                </form>
            `;
        }


        /* Rechazar reserva */

        else if (modal.type === 'reject') {
            title = 'Rechazar reserva';

            body = `
                <form id="reject-form">

                    <input
                        type="hidden"
                        name="id"
                        value="${esc(modal.id)}"
                    >

                    ${textarea(
                        'Motivo del rechazo',
                        'reason',
                        '',
                        {
                            required: true,
                            full: true,
                            placeholder: 'Explica el motivo al solicitante'
                        }
                    )}

                    <div class="modal-footer">

                        ${close}

                        <button
                            class="btn red"
                            type="submit"
                        >
                            Confirmar rechazo
                        </button>
                    </div>

                </form>
            `;
        }


        /* Detalle de préstamo */

        else if (modal.type === 'loan') {
            const l = db.loans.find(
                x => x.id === modal.id
            );

            const r = reservation(l?.reservationId);

            title = 'Detalle de préstamo';

            body = l ? `
                <div class="notice">
                    ${esc(l.id)} · ${pill(lendStatus(l))}
                </div>

                <p>
                    <strong>Solicitante:</strong>
                    ${esc(user(r.userId).name)}
                </p>

                <p>
                    <strong>Equipo:</strong>
                    ${esc(
                        r.equipmentIds
                            .map(i => eq(i).name)
                            .join(' + ')
                    )}
                </p>

                <p>
                    <strong>Entrega:</strong>
                    ${date(l.deliveredAt)}
                </p>

                <p>
                    <strong>Retorno previsto:</strong>
                    ${date(r.end)}
                </p>

                <p>
                    <strong>Retorno real:</strong>
                    ${date(l.returnedAt)}
                </p>

                <p>
                    <strong>Condición inicial:</strong>
                    ${esc(l.condition)}
                </p>

                <p>
                    <strong>Condición final:</strong>
                    ${esc(l.finalCondition || 'Pendiente')}
                </p>

                <p>
                    <strong>Faltantes:</strong>
                    ${esc(l.missing.join(', ') || 'Ninguno')}
                </p>

                <div class="modal-footer">
                    ${close}

                    ${!l.returnedAt
                        ? btn(
                            'Registrar devolución',
                            'start-return',
                            l.id,
                            ''
                        )
                        : ''
                    }
                </div>
            ` : '';
        }


        /* Actualización de información desde MySQL */

        else if (modal.type === 'reset') {
            title = 'Datos almacenados en MySQL';

            body = `
                <div class="notice">
                    Los registros ya no se guardan en este navegador.
                    Se almacenan en la base de datos del servidor.
                    Desde aquí puedes volver a consultar la información actual.
                </div>

                <div class="modal-footer">
                    ${close}
                    ${btn('Actualizar información', 'refresh-data', '', '')}
                </div>
            `;
        }


        return `
            <div
                class="modal-backdrop"
                data-action="close-overlay"
            >
                <div
                    class="modal"
                    role="dialog"
                    aria-modal="true"
                    aria-label="${esc(title)}"
                >
                    <div class="modal-head">

                        <h2>${esc(title)}</h2>

                        <button
                            type="button"
                            class="icon-btn"
                            data-action="close"
                            aria-label="Cerrar"
                        >
                            ✕
                        </button>

                    </div>

                    ${body}

                </div>
            </div>
        `;
    }


    /* ============================================================
       21. FORMULARIOS Y OPERACIONES
       ============================================================ */

    function val(form, name) {
        return (
            new FormData(form).get(name) || ''
        ).toString().trim();
    }


    async function handleSubmit(form) {
        try {
            /* Inicio de sesión real */
            if (form.id === 'login-form') {
                const email = val(form, 'login-email');
                const password = val(form, 'login-pass');
                const resultado = await apiRequest('auth.php?action=login', {
                    method: 'POST',
                    body: { email, password }
                });
                session = resultado.usuario;
                await cargarDatosDesdeAPI();
                persistUI();
                window.location.assign('inicio.html');
                return;
            }

            /* Crear o editar equipo en MySQL */
            if (form.id === 'equipment-form' || form.id === 'new-equipment-form') {
                if (!isAdmin()) return toast('Operación reservada al administrador.', true);

                const old = val(form, 'id-old');
                const code = val(form, 'code').toUpperCase();
                const previous = db.equipment.find(e => e.id === old);
                if (old && old !== code) return toast('El código no puede modificarse una vez creado.', true);

                const accessories = val(form, 'accessories')
                    .split(',').map(x => x.trim()).filter(Boolean);
                const imageFile = form.querySelector('[name="image_file"]')?.files?.[0] || null;
                const removeImage = !!form.querySelector('[name="quitar_imagen"]')?.checked;
                let imageBase64 = '';

                if (imageFile) {
                    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
                    if (!allowedTypes.includes(imageFile.type)) {
                        return toast('La imagen debe estar en formato JPG, PNG o WEBP.', true);
                    }
                    if (imageFile.size > 4 * 1024 * 1024) {
                        return toast('La imagen supera el máximo permitido de 4 MB.', true);
                    }
                    imageBase64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
                        reader.onerror = () => reject(new Error('No se pudo leer el archivo de imagen.'));
                        reader.readAsDataURL(imageFile);
                    });
                }

                const imagePath = imageFile ? '' : val(form, 'image_url');

                const payload = {
                    codigo: code,
                    codigo_original: old || code,
                    nombre: val(form, 'name'),
                    tipo: val(form, 'type'),
                    ubicacion: val(form, 'location'),
                    estado: val(form, 'status'),
                    imagen_ruta: imagePath,
                    imagen_base64: imageBase64,
                    imagen_nombre: imageFile?.name || '',
                    quitar_imagen: removeImage,
                    descripcion: val(form, 'description') || previous?.description || '',
                    accesorios: accessories
                };

                const resultado = await apiRequest('equipos.php', {
                    method: old ? 'PUT' : 'POST',
                    body: payload
                });
                await cargarDatosDesdeAPI();
                navigate('catalogo');
                toast(resultado.mensaje || (old ? 'Equipo actualizado.' : 'Equipo creado correctamente.'));
                return;
            }

            /* Crear usuario real */
            if (form.id === 'new-user-form') {
                if (!isAdmin()) return toast('Acceso restringido.', true);
                const resultado = await apiRequest('usuarios.php', {
                    method: 'POST',
                    body: {
                        nombre: val(form, 'name'),
                        correo: val(form, 'email'),
                        rol: val(form, 'role'),
                        password: val(form, 'password')
                    }
                });
                await cargarDatosDesdeAPI();
                modal = null;
                render();
                toast(resultado.mensaje || 'Usuario agregado correctamente.');
                return;
            }

            /* Consulta de disponibilidad: los datos consultados ya vienen de MySQL. */
            if (form.id === 'availability-form') {
                const start = val(form, 'start');
                const end = val(form, 'end');
                if (new Date(end) <= new Date(start)) return toast('La fecha final debe ser posterior a la inicial.', true);
                availability = { type: val(form, 'type'), start, end };
                selected = selected.filter(id => availableEquip(eq(id), start, end));
                persistUI();
                render();
                toast('Disponibilidad actualizada.');
                return;
            }

            /* Nueva solicitud de reserva */
            if (form.id === 'reserve-form') {
                const start = val(form, 'start');
                const end = val(form, 'end');
                const purpose = val(form, 'purpose');
                if (!selected.length) return toast('Selecciona al menos un equipo.', true);
                if (!purpose) return toast('Indica el propósito de la solicitud.', true);
                if (new Date(end) <= new Date(start)) return toast('La finalización debe ser posterior al inicio.', true);
                if (selected.some(id => busy(id, start, end))) return toast('Uno de los equipos está ocupado o fuera de servicio.', true);

                const resultado = await apiRequest('reservas.php?action=crear', {
                    method: 'POST',
                    body: {
                        equipo_codigos: [...selected],
                        proposito: purpose,
                        fecha_inicio: start,
                        fecha_fin: end
                    }
                });
                selected = [];
                persistUI();
                await cargarDatosDesdeAPI();
                navigate('mis-reservas');
                toast(`Solicitud ${resultado.codigo || ''} registrada como Pendiente.`);
                return;
            }

            /* Rechazar reserva */
            if (form.id === 'reject-form') {
                if (!isManager()) return toast('Sin permisos.', true);
                const codigo = val(form, 'id');
                const motivo = val(form, 'reason');
                if (!motivo) return toast('Escribe el motivo del rechazo.', true);
                const resultado = await apiRequest('reservas.php?action=rechazar', {
                    method: 'POST', body: { codigo, motivo }
                });
                await cargarDatosDesdeAPI();
                modal = null;
                render();
                toast(resultado.mensaje || 'Reserva rechazada.');
                return;
            }

            /* Registrar entrega */
            if (form.id === 'delivery-form') {
                if (!isManager()) return toast('Sin permisos.', true);
                const accesorios = [...form.querySelectorAll('[name="delivered-accessory"]:checked')].map(x => x.value);
                const resultado = await apiRequest('prestamos.php?action=entregar', {
                    method: 'POST',
                    body: {
                        reserva_codigo: val(form, 'reservationId'),
                        fecha_entrega: val(form, 'deliveredAt'),
                        condicion_inicial: val(form, 'condition'),
                        accesorios_entregados: accesorios
                    }
                });
                await cargarDatosDesdeAPI();
                navigate('prestamos');
                toast(`Entrega registrada: ${resultado.codigo || ''}.`);
                return;
            }

            /* Registrar devolución y checklist */
            if (form.id === 'return-form') {
                if (!isManager()) return toast('Sin permisos.', true);
                const accesorios = [...form.querySelectorAll('[name="returned-accessory"]:checked')].map(x => x.value);
                const codigoPrestamo = val(form, 'loanId');
                const resultado = await apiRequest('prestamos.php?action=devolver', {
                    method: 'POST',
                    body: {
                        prestamo_codigo: codigoPrestamo,
                        fecha_retorno_real: val(form, 'returnedAt'),
                        condicion_final: val(form, 'finalCondition'),
                        accesorios_devuelto: accesorios,
                        danos: val(form, 'damage'),
                        notas: val(form, 'notes')
                    }
                });
                await cargarDatosDesdeAPI();
                navigate('checklist', codigoPrestamo);
                toast(resultado.mensaje || 'Devolución guardada.');
                return;
            }

            /* Registrar inspección y mantenimiento */
            if (form.id === 'inspection-form') {
                if (!isManager()) return toast('Sin permisos.', true);
                const codigoEquipo = val(form, 'equipmentId');
                const resultado = await apiRequest('seguimiento.php', {
                    method: 'POST',
                    body: {
                        equipo_codigo: codigoEquipo,
                        fecha: val(form, 'date'),
                        diagnostico: val(form, 'diagnosis'),
                        accion: val(form, 'actionTaken'),
                        resultado: val(form, 'result'),
                        estado_resultante: val(form, 'newStatus')
                    }
                });
                await cargarDatosDesdeAPI();
                navigate('historial', codigoEquipo);
                toast(resultado.mensaje || 'Inspección registrada en el historial.');
                return;
            }
        } catch (err) {
            console.error(err);
            toast('No se pudo completar la operación: ' + err.message, true);
        }
    }


    /* ============================================================
       22. ACCIONES DE LOS BOTONES
       ============================================================ */

    async function action(name, id) {
        try {
            if (name === 'go') return navigate(id);

            if (name === 'logout') {
                try { await apiRequest('auth.php?action=logout', { method: 'POST', body: {} }); }
                catch (err) { console.warn('No se pudo cerrar la sesión en el servidor:', err); }
                session = null;
                window.location.assign('index.html');
                return;
            }

            if (name === 'set-login-role') {
                currentRole = id;
                persistUI();
                render();
                return;
            }

            if (name === 'reset') {
                modal = { type: 'reset' };
                render();
                return;
            }

            if (name === 'refresh-data') {
                await cargarDatosDesdeAPI();
                modal = null;
                render();
                toast('Información actualizada desde MySQL.');
                return;
            }

            if (name === 'close' || name === 'close-overlay') {
                modal = null;
                render();
                return;
            }

            /* Equipos */
            if (name === 'equipment' || name === 'edit-equipment') return navigate('ficha', id);
            if (name === 'new-equipment') { modal = { type: 'equipment' }; render(); return; }
            if (name === 'new-user') { modal = { type: 'user' }; render(); return; }
            if (name === 'retire-equipment') {
                if (!isAdmin()) return toast('Solo el administrador puede retirar equipos.', true);
                if (!window.confirm(`¿Retirar el equipo ${id} del catálogo? Se conservará su historial.`)) return;
                const resultado = await apiRequest('equipos.php?codigo=' + encodeURIComponent(id), { method: 'DELETE' });
                await cargarDatosDesdeAPI();
                render();
                toast(resultado.mensaje || 'Equipo retirado.');
                return;
            }

            /* Filtros */
            if (name === 'clear-filters') {
                search = ''; filterType = ''; filterStatus = ''; filterLocation = '';
                persistUI(); render(); return;
            }
            if (name === 'apply-filters') {
                search = document.querySelector('#catalog-search')?.value || '';
                filterType = document.querySelector('[name="filter-type"]')?.value || '';
                filterStatus = document.querySelector('[name="filter-status"]')?.value || '';
                filterLocation = document.querySelector('#filter-location')?.value || '';
                persistUI(); render(); return;
            }

            /* Reservas */
            if (name === 'remove-selected') {
                selected = selected.filter(x => x !== id);
                persistUI(); render(); return;
            }
            if (name === 'reservation') return navigate('detalle-reserva', id);
            if (name === 'tab') { tab = id; persistUI(); render(); return; }

            if (name === 'approve') {
                if (!isManager()) return toast('No autorizado.', true);
                const resultado = await apiRequest('reservas.php?action=aprobar', {
                    method: 'POST', body: { codigo: id }
                });
                await cargarDatosDesdeAPI();
                render();
                toast(resultado.mensaje || 'Reserva aprobada correctamente.');
                return;
            }
            if (name === 'reject') { modal = { type: 'reject', id }; render(); return; }

            /* Préstamos */
            if (name === 'start-delivery') return navigate('entrega', id);
            if (name === 'loan') { modal = { type: 'loan', id }; render(); return; }
            if (name === 'start-return') return navigate('devolucion', id);

            /* Seguimiento */
            if (name === 'equipment-history') return navigate('historial', id);
            if (name === 'inspect') return navigate('inspecciones', id);
            if (name === 'history-select') {
                return navigate('historial', document.querySelector('[name="history-equipment"]')?.value);
            }

            if (name === 'mark-notification') {
                await apiRequest('notificaciones.php', { method: 'POST', body: { id } });
                await cargarDatosDesdeAPI();
                render();
                toast('Notificación marcada como leída.');
                return;
            }
        } catch (err) {
            console.error(err);
            toast(err.message || 'No se pudo completar la acción.', true);
        }
    }


    /* ============================================================
       23. EVENTOS GENERALES
       ============================================================ */

    /* Clics en botones y navegación */

    document.addEventListener('click', e => {
        const nav = e.target.closest('[data-route]');

        if (nav) {
            navigate(nav.dataset.route);
            return;
        }

        const b = e.target.closest('[data-action]');

        if (!b) return;

        if (
            b.dataset.action === 'close-overlay' &&
            e.target !== b
        ) {
            return;
        }

        action(
            b.dataset.action,
            b.dataset.id
        );
    });


    /* Selección de equipos */

    document.addEventListener('change', e => {
        const el = e.target.closest('[data-select-equip]');

        if (el) {
            if (el.checked) {
                if (!selected.includes(el.dataset.selectEquip)) {
                    selected.push(el.dataset.selectEquip);
                }
            } else {
                selected = selected.filter(
                    i => i !== el.dataset.selectEquip
                );
            }

            persistUI();
            render();
        }
    });


    /* Envío de formularios */

    document.addEventListener('submit', e => {
        e.preventDefault();
        handleSubmit(e.target);
    });


    /* Cerrar ventana emergente con Escape */

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal) {
            modal = null;
            render();
        }
    });


    /* ============================================================
       24. INICIAR LA APLICACIÓN
       ============================================================ */

    async function iniciarAplicacion() {
        try {
            const autenticacion = await apiRequest('auth.php?action=me');
            session = autenticacion.usuario;
            await cargarDatosDesdeAPI();

            if (route === 'login') {
                window.location.replace('inicio.html');
                return;
            }

            render();
            console.log('CONTROL_EQUIX conectado con PHP y MySQL.');
        } catch (error) {
            console.warn('Sesión o conexión no disponible:', error);
            session = null;
            if (route !== 'login') {
                window.location.replace('index.html');
                return;
            }
            render();
            if (error.status && error.status !== 401) {
                toast('No se pudo conectar con la API: ' + error.message, true);
            }
        }
    }

    iniciarAplicacion();

})();

/* ============================================================
   FIN DEL ARCHIVO APP.JS
   CONTROL_EQUIX
   ============================================================ */
