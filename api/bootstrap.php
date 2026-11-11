<?php
require_once __DIR__ . '/_common.php';
$usuario = usuario_actual();

try {
    /* Usuarios: nunca se envían hashes de contraseña al navegador. */
    $usuarios = $conexion->query('SELECT id_usuario, nombre, correo, rol FROM usuarios WHERE activo = 1 ORDER BY nombre')->fetchAll();
    $usuarios = array_map(function ($u) use ($usuario) {
        return [
            'id' => (string)$u['id_usuario'],
            'name' => $u['nombre'],
            'email' => ($usuario['role'] === 'Administrador') ? $u['correo'] : '',
            'role' => $u['rol']
        ];
    }, $usuarios);

    /* Equipos y accesorios asociados. */
    $filasEquipos = $conexion->query('SELECT e.id_equipo, e.codigo, e.nombre, e.tipo, e.ubicacion, e.estado, e.imagen_ruta, e.descripcion, EXISTS(SELECT 1 FROM equipo_imagenes ei WHERE ei.id_equipo = e.id_equipo) AS tiene_imagen_blob FROM equipos e ORDER BY e.fecha_registro DESC, e.id_equipo DESC')->fetchAll();
    $equipos = [];
    foreach ($filasEquipos as $e) {
        $accesorios = obtener_accesorios_equipo($conexion, (int)$e['id_equipo']);
        $equipos[] = [
            'id' => $e['codigo'],
            'name' => $e['nombre'],
            'type' => $e['tipo'],
            'location' => $e['ubicacion'],
            'status' => $e['estado'],
            'imagen_ruta' => $e['imagen_ruta'],
            'image' => !empty($e['tiene_imagen_blob']) ? 'api/imagen.php?codigo=' . rawurlencode($e['codigo']) : null,
            'description' => $e['descripcion'],
            'accessories' => array_values(array_map(function ($a) { return $a['nombre']; }, $accesorios))
        ];
    }

    /* Reservas. Un solicitante solo recibe sus propias solicitudes. */
    $sqlReservas = "SELECT r.id_reserva, r.codigo, r.usuario_id, r.proposito, r.fecha_inicio, r.fecha_fin, r.estado, r.motivo_rechazo, r.decision_por, u.nombre AS solicitante_nombre, d.nombre AS decisor_nombre, e.codigo AS equipo_codigo FROM reservas r INNER JOIN usuarios u ON u.id_usuario = r.usuario_id LEFT JOIN usuarios d ON d.id_usuario = r.decision_por LEFT JOIN reserva_equipos re ON re.id_reserva = r.id_reserva LEFT JOIN equipos e ON e.id_equipo = re.id_equipo";
    $paramsReservas = [];
    if ($usuario['role'] === 'Solicitante') {
        $sqlReservas .= ' WHERE r.usuario_id = ?';
        $paramsReservas[] = (int)$usuario['id'];
    }
    $sqlReservas .= ' ORDER BY r.fecha_solicitud DESC, r.id_reserva DESC';
    $q = $conexion->prepare($sqlReservas);
    $q->execute($paramsReservas);
    $reservasAgrupadas = [];
    foreach ($q->fetchAll() as $r) {
        $id = (int)$r['id_reserva'];
        if (!isset($reservasAgrupadas[$id])) {
            $reservasAgrupadas[$id] = [
                'id' => $r['codigo'],
                'userId' => (string)$r['usuario_id'],
                'equipmentIds' => [],
                'purpose' => $r['proposito'],
                'start' => fecha_interfaz($r['fecha_inicio']),
                'end' => fecha_interfaz($r['fecha_fin']),
                'status' => $r['estado'],
                'reason' => $r['motivo_rechazo'] ?? '',
                'decisionBy' => $r['decision_por'] ? (string)$r['decision_por'] : ''
            ];
        }
        if (!empty($r['equipo_codigo'])) $reservasAgrupadas[$id]['equipmentIds'][] = $r['equipo_codigo'];
    }
    $reservas = array_values($reservasAgrupadas);

    /* Préstamos y checklist de accesorios. */
    $sqlPrestamos = "SELECT p.id_prestamo, p.codigo, p.reserva_id, p.responsable_id, p.fecha_entrega, p.fecha_retorno_previsto, p.fecha_retorno_real, p.condicion_inicial, p.condicion_final, p.estado, p.observaciones, r.codigo AS reserva_codigo, r.usuario_id, u.nombre AS responsable_nombre FROM prestamos p INNER JOIN reservas r ON r.id_reserva = p.reserva_id LEFT JOIN usuarios u ON u.id_usuario = p.encargado_id";
    $paramsPrestamos = [];
    if ($usuario['role'] === 'Solicitante') {
        $sqlPrestamos .= ' WHERE r.usuario_id = ?';
        $paramsPrestamos[] = (int)$usuario['id'];
    }
    $sqlPrestamos .= ' ORDER BY p.fecha_registro DESC, p.id_prestamo DESC';
    $q = $conexion->prepare($sqlPrestamos);
    $q->execute($paramsPrestamos);
    $prestamos = [];
    $mapPrestamos = [];
    foreach ($q->fetchAll() as $p) {
        $observaciones = [];
        if (!empty($p['observaciones'])) {
            $decodificadas = json_decode($p['observaciones'], true);
            if (is_array($decodificadas)) $observaciones = $decodificadas;
            else $observaciones = ['danos' => $p['observaciones'], 'notas' => ''];
        }
        $mapPrestamos[(int)$p['id_prestamo']] = [
            'id' => $p['codigo'],
            'reservationId' => $p['reserva_codigo'],
            'responsible' => $p['responsable_nombre'] ?: 'Encargado audiovisual',
            'deliveredAt' => fecha_interfaz($p['fecha_entrega']),
            'condition' => $p['condicion_inicial'],
            'accessories' => [],
            'returnedAt' => fecha_interfaz($p['fecha_retorno_real']),
            'returnedAccessories' => [],
            'finalCondition' => $p['condicion_final'] ?? '',
            'damage' => $observaciones['danos'] ?? '',
            'notes' => $observaciones['notas'] ?? '',
            'missing' => []
        ];
    }

    if (!empty($mapPrestamos)) {
        $ids = array_keys($mapPrestamos);
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $sqlChecklist = "SELECT i.prestamo_id, d.nombre_accesorio, d.incluido, d.devuelto FROM inspecciones i INNER JOIN detalle_checklist d ON d.inspeccion_id = i.id_inspeccion WHERE i.prestamo_id IN ($marcas) AND i.tipo = 'Entrega' ORDER BY d.id_detalle";
        $qc = $conexion->prepare($sqlChecklist);
        $qc->execute($ids);
        foreach ($qc->fetchAll() as $d) {
            $pid = (int)$d['prestamo_id'];
            if (!isset($mapPrestamos[$pid]) || (int)$d['incluido'] !== 1) continue;
            $nombre = $d['nombre_accesorio'];
            $mapPrestamos[$pid]['accessories'][] = $nombre;
            if ((int)$d['devuelto'] === 1) $mapPrestamos[$pid]['returnedAccessories'][] = $nombre;
        }
    }

    foreach ($mapPrestamos as &$p) {
        $p['accessories'] = array_values(array_unique($p['accessories']));
        $p['returnedAccessories'] = array_values(array_unique($p['returnedAccessories']));
        $p['missing'] = $p['returnedAt'] ? array_values(array_diff($p['accessories'], $p['returnedAccessories'])) : [];
    }
    unset($p);
    $prestamos = array_values($mapPrestamos);

    /* Inspecciones. */
    $sqlIns = "SELECT i.codigo, e.codigo AS equipo_codigo, i.fecha, i.diagnostico, i.accion, i.resultado, i.estado_resultante, i.origen, u.nombre AS responsable_nombre, p.codigo AS prestamo_codigo FROM inspecciones i INNER JOIN equipos e ON e.id_equipo = i.equipo_id LEFT JOIN usuarios u ON u.id_usuario = i.responsable_id LEFT JOIN prestamos p ON p.id_prestamo = i.prestamo_id ORDER BY i.fecha DESC, i.id_inspeccion DESC";
    $inspecciones = [];
    foreach ($conexion->query($sqlIns)->fetchAll() as $i) {
        $inspecciones[] = [
            'id' => $i['codigo'],
            'equipmentId' => $i['equipo_codigo'],
            'date' => fecha_interfaz($i['fecha']),
            'responsible' => $i['responsable_nombre'] ?: 'Sistema',
            'diagnosis' => $i['diagnostico'] ?? '',
            'actionTaken' => $i['accion'] ?? '',
            'result' => $i['resultado'] ?? '',
            'newStatus' => $i['estado_resultante'] ?: 'Registrada',
            'origin' => $i['origen'] ?: ($i['prestamo_codigo'] ?? '')
        ];
    }

    /* Historial de eventos. */
    $sqlEventos = "SELECT ev.tipo, ev.detalle, ev.fecha_evento, e.codigo AS equipo_codigo, u.nombre AS usuario_nombre FROM eventos ev LEFT JOIN equipos e ON e.id_equipo = ev.equipo_id LEFT JOIN usuarios u ON u.id_usuario = ev.usuario_id ORDER BY ev.fecha_evento DESC, ev.id_evento DESC LIMIT 150";
    $eventos = [];
    foreach ($conexion->query($sqlEventos)->fetchAll() as $ev) {
        $eventos[] = [
            'equipmentId' => $ev['equipo_codigo'],
            'type' => $ev['tipo'],
            'date' => fecha_interfaz($ev['fecha_evento']),
            'by' => $ev['usuario_nombre'] ?: 'Sistema',
            'details' => $ev['detalle'] ?? ''
        ];
    }

    /* Notificaciones del usuario autenticado. */
    $qn = $conexion->prepare('SELECT id_notificacion, tipo, titulo, mensaje, leida, fecha_creacion FROM notificaciones WHERE usuario_id = ? ORDER BY fecha_creacion DESC LIMIT 100');
    $qn->execute([(int)$usuario['id']]);
    $notificaciones = [];
    foreach ($qn->fetchAll() as $n) {
        $notificaciones[] = [
            'id' => (string)$n['id_notificacion'],
            'type' => $n['tipo'],
            'title' => $n['titulo'],
            'message' => $n['mensaje'],
            'read' => (bool)$n['leida'],
            'date' => fecha_interfaz($n['fecha_creacion'])
        ];
    }

    correcto([
        'usuario' => $usuario,
        'datos' => [
            'users' => $usuarios,
            'equipment' => $equipos,
            'reservations' => $reservas,
            'loans' => $prestamos,
            'inspections' => $inspecciones,
            'events' => $eventos,
            'notifications' => $notificaciones
        ]
    ]);
} catch (PDOException $e) {
    error_log('bootstrap.php: ' . $e->getMessage());
    error_api('No se pudieron cargar los datos del sistema.', 500);
}
