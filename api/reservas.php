<?php
require_once __DIR__ . '/_common.php';
$usuario = usuario_actual();
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accion = $_GET['action'] ?? 'listar';

try {
    if ($metodo === 'GET') {
        $sql = "SELECT r.id_reserva, r.codigo, r.usuario_id, r.proposito, r.fecha_inicio, r.fecha_fin, r.estado, r.motivo_rechazo, r.decision_por, e.codigo AS equipo_codigo FROM reservas r LEFT JOIN reserva_equipos re ON re.id_reserva = r.id_reserva LEFT JOIN equipos e ON e.id_equipo = re.id_equipo";
        $params = [];
        if ($usuario['role'] === 'Solicitante') {
            $sql .= ' WHERE r.usuario_id = ?';
            $params[] = (int)$usuario['id'];
        }
        $sql .= ' ORDER BY r.fecha_solicitud DESC, r.id_reserva DESC';
        $q = $conexion->prepare($sql);
        $q->execute($params);
        $resultado = [];
        foreach ($q->fetchAll() as $r) {
            $id = (int)$r['id_reserva'];
            if (!isset($resultado[$id])) {
                $resultado[$id] = [
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
            if ($r['equipo_codigo']) $resultado[$id]['equipmentIds'][] = $r['equipo_codigo'];
        }
        correcto(['reservas' => array_values($resultado)]);
    }

    if ($metodo !== 'POST') error_api('Método no permitido.', 405);
    $datos = leer_json();

    if ($accion === 'crear') {
        $equipoCodigos = array_values(array_unique(array_map('strval', (array)($datos['equipo_codigos'] ?? []))));
        $proposito = trim((string)($datos['proposito'] ?? ''));
        $inicio = fecha_mysql($datos['fecha_inicio'] ?? '');
        $fin = fecha_mysql($datos['fecha_fin'] ?? '');

        if (!$equipoCodigos) error_api('Selecciona al menos un equipo.');
        if ($proposito === '') error_api('Escribe el propósito de la reserva.');
        if (!$inicio || !$fin || strtotime($fin) <= strtotime($inicio)) error_api('El periodo de la reserva no es válido.');

        $conexion->beginTransaction();
        $idsEquipos = [];
        foreach ($equipoCodigos as $codigo) {
            $equipoId = id_equipo_por_codigo($conexion, $codigo);
            if (!$equipoId) error_api('No se encontró el equipo ' . $codigo . '.', 404);
            if (equipo_ocupado($conexion, $equipoId, $inicio, $fin)) error_api('El equipo ' . $codigo . ' está ocupado o fuera de servicio para ese periodo.');
            $idsEquipos[] = $equipoId;
        }

        $codigoReserva = generar_codigo('RES');
        $q = $conexion->prepare("INSERT INTO reservas (codigo, usuario_id, proposito, fecha_inicio, fecha_fin, estado, fecha_solicitud) VALUES (?, ?, ?, ?, ?, 'Pendiente', NOW())");
        $q->execute([$codigoReserva, (int)$usuario['id'], $proposito, $inicio, $fin]);
        $reservaId = (int)$conexion->lastInsertId();

        $rel = $conexion->prepare('INSERT INTO reserva_equipos (id_reserva, id_equipo) VALUES (?, ?)');
        foreach ($idsEquipos as $equipoId) {
            $rel->execute([$reservaId, $equipoId]);
            $qEquipo = $conexion->prepare('SELECT codigo FROM equipos WHERE id_equipo = ?');
            $qEquipo->execute([$equipoId]);
            $codigoEquipo = $qEquipo->fetchColumn();
            $eventoId = agregar_evento($conexion, $codigoEquipo, 'Solicitud recibida', $codigoReserva . ': ' . $proposito, (int)$usuario['id'], $codigoReserva);
        }

        enviar_notificacion_a_rol($conexion, 'Administrador', 'Informacion', 'Nueva solicitud de reserva', 'Se recibió la solicitud ' . $codigoReserva . '.');
        enviar_notificacion_a_rol($conexion, 'Encargado audiovisual', 'Informacion', 'Nueva solicitud de reserva', 'Se recibió la solicitud ' . $codigoReserva . '.');
        $conexion->commit();
        correcto(['mensaje' => 'Solicitud registrada como Pendiente.', 'codigo' => $codigoReserva], 201);
    }

    if ($accion === 'aprobar') {
        exigir_rol(['Administrador', 'Encargado audiovisual']);
        $codigo = trim((string)($datos['codigo'] ?? ''));
        if ($codigo === '') error_api('No se recibió el código de la reserva.');

        $conexion->beginTransaction();
        $q = $conexion->prepare('SELECT id_reserva, usuario_id, estado FROM reservas WHERE codigo = ? FOR UPDATE');
        $q->execute([$codigo]);
        $r = $q->fetch();
        if (!$r || $r['estado'] !== 'Pendiente') error_api('La solicitud no existe o ya fue procesada.', 409);

        $qe = $conexion->prepare('SELECT e.id_equipo, e.codigo FROM reserva_equipos re INNER JOIN equipos e ON e.id_equipo = re.id_equipo WHERE re.id_reserva = ?');
        $qe->execute([(int)$r['id_reserva']]);
        $equipos = $qe->fetchAll();
        $qf = $conexion->prepare('SELECT fecha_inicio, fecha_fin FROM reservas WHERE id_reserva = ?');
        $qf->execute([(int)$r['id_reserva']]);
        $periodo = $qf->fetch();

        foreach ($equipos as $e) {
            if (equipo_ocupado($conexion, (int)$e['id_equipo'], $periodo['fecha_inicio'], $periodo['fecha_fin'], (int)$r['id_reserva'])) {
                error_api('No se puede aprobar: el equipo ' . $e['codigo'] . ' está ocupado o fuera de servicio.', 409);
            }
        }

        $q = $conexion->prepare("UPDATE reservas SET estado = 'Aprobada', decision_por = ?, fecha_decision = NOW() WHERE id_reserva = ?");
        $q->execute([(int)$usuario['id'], (int)$r['id_reserva']]);
        foreach ($equipos as $e) {
            agregar_evento($conexion, $e['codigo'], 'Reserva aprobada', $codigo, (int)$usuario['id'], $codigo);
        }
        agregar_notificacion($conexion, (int)$r['usuario_id'], 'Confirmacion', 'Reserva aprobada', 'Tu solicitud ' . $codigo . ' fue aprobada.');
        $conexion->commit();
        correcto(['mensaje' => 'Reserva aprobada correctamente.']);
    }

    if ($accion === 'rechazar') {
        exigir_rol(['Administrador', 'Encargado audiovisual']);
        $codigo = trim((string)($datos['codigo'] ?? ''));
        $motivo = trim((string)($datos['motivo'] ?? ''));
        if ($codigo === '' || $motivo === '') error_api('Indica la reserva y el motivo del rechazo.');

        $conexion->beginTransaction();
        $q = $conexion->prepare("SELECT id_reserva, usuario_id, estado FROM reservas WHERE codigo = ? FOR UPDATE");
        $q->execute([$codigo]);
        $r = $q->fetch();
        if (!$r || $r['estado'] !== 'Pendiente') error_api('La solicitud no existe o ya fue procesada.', 409);

        $q = $conexion->prepare("UPDATE reservas SET estado = 'Rechazada', motivo_rechazo = ?, decision_por = ?, fecha_decision = NOW() WHERE id_reserva = ?");
        $q->execute([$motivo, (int)$usuario['id'], (int)$r['id_reserva']]);
        $qe = $conexion->prepare('SELECT e.codigo FROM reserva_equipos re INNER JOIN equipos e ON e.id_equipo = re.id_equipo WHERE re.id_reserva = ?');
        $qe->execute([(int)$r['id_reserva']]);
        foreach ($qe->fetchAll(PDO::FETCH_COLUMN) as $codigoEquipo) {
            agregar_evento($conexion, $codigoEquipo, 'Reserva rechazada', $codigo . ': ' . $motivo, (int)$usuario['id'], $codigo);
        }
        agregar_notificacion($conexion, (int)$r['usuario_id'], 'Aviso', 'Reserva rechazada', 'Tu solicitud ' . $codigo . ' fue rechazada. Motivo: ' . $motivo);
        $conexion->commit();
        correcto(['mensaje' => 'Reserva rechazada y motivo registrado.']);
    }

    error_api('Acción de reservas no reconocida.', 400);
} catch (PDOException $e) {
    if ($conexion->inTransaction()) $conexion->rollBack();
    error_log('reservas.php: ' . $e->getMessage());
    error_api('No se pudo procesar la reserva.', 500);
} catch (Throwable $e) {
    if ($conexion->inTransaction()) $conexion->rollBack();
    error_log('reservas.php: ' . $e->getMessage());
    error_api('Ocurrió un error al procesar la reserva.', 500);
}
