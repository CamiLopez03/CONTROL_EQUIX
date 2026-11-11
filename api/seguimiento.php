<?php
require_once __DIR__ . '/_common.php';
$usuario = usuario_actual();
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($metodo === 'GET') {
        $codigo = trim((string)($_GET['equipo'] ?? ''));
        $sql = "SELECT i.codigo, e.codigo AS equipo_codigo, i.tipo, i.fecha, i.diagnostico, i.accion, i.resultado, i.estado_resultante, i.origen, u.nombre AS responsable FROM inspecciones i INNER JOIN equipos e ON e.id_equipo = i.equipo_id LEFT JOIN usuarios u ON u.id_usuario = i.responsable_id";
        $params = [];
        if ($codigo !== '') { $sql .= ' WHERE e.codigo = ?'; $params[] = $codigo; }
        $sql .= ' ORDER BY i.fecha DESC, i.id_inspeccion DESC';
        $q = $conexion->prepare($sql);
        $q->execute($params);
        correcto(['inspecciones' => $q->fetchAll()]);
    }

    if ($metodo !== 'POST') error_api('Método no permitido.', 405);
    exigir_rol(['Administrador', 'Encargado audiovisual']);
    $datos = leer_json();

    $codigoEquipo = strtoupper(trim((string)($datos['equipo_codigo'] ?? '')));
    $fecha = fecha_mysql($datos['fecha'] ?? '');
    $diagnostico = trim((string)($datos['diagnostico'] ?? ''));
    $accion = trim((string)($datos['accion'] ?? ''));
    $resultado = trim((string)($datos['resultado'] ?? ''));
    $estadoNuevo = trim((string)($datos['estado_resultante'] ?? 'Disponible'));

    if ($codigoEquipo === '' || !$fecha || $diagnostico === '' || $accion === '' || $resultado === '') {
        error_api('Completa todos los datos de la inspección.');
    }
    if (!in_array($estadoNuevo, ['Disponible', 'Fuera de servicio'], true)) error_api('El estado final no es válido.');

    $equipoId = id_equipo_por_codigo($conexion, $codigoEquipo);
    if (!$equipoId) error_api('No se encontró el equipo seleccionado.', 404);

    $conexion->beginTransaction();
    $q = $conexion->prepare('SELECT estado FROM equipos WHERE id_equipo = ? FOR UPDATE');
    $q->execute([$equipoId]);
    $estadoAnterior = $q->fetchColumn();

    $tipo = (stripos($resultado, 'mantenimiento') !== false) ? 'Mantenimiento' : 'Inspeccion';
    $codigoInspeccion = generar_codigo('INS');
    $q = $conexion->prepare('INSERT INTO inspecciones (codigo, prestamo_id, equipo_id, responsable_id, tipo, fecha, diagnostico, accion, resultado, estado_resultante, origen) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $q->execute([$codigoInspeccion, $equipoId, (int)$usuario['id'], $tipo, $fecha, $diagnostico, $accion, $resultado, $estadoNuevo, 'Inspección manual']);

    $q = $conexion->prepare('UPDATE equipos SET estado = ? WHERE id_equipo = ?');
    $q->execute([$estadoNuevo, $equipoId]);

    if ($tipo === 'Mantenimiento') {
        $codigoMantenimiento = generar_codigo('MAN');
        $q = $conexion->prepare('INSERT INTO mantenimientos (codigo, equipo_id, responsable_id, fecha, diagnostico, accion, resultado, estado_anterior, estado_nuevo, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)');
        $q->execute([$codigoMantenimiento, $equipoId, (int)$usuario['id'], $fecha, $diagnostico, $accion, $resultado, $estadoAnterior, $estadoNuevo]);
    }

    agregar_evento($conexion, $codigoEquipo, 'Inspección / mantenimiento', $codigoInspeccion . ' · ' . $resultado, (int)$usuario['id']);
    $conexion->commit();
    correcto(['mensaje' => 'Inspección guardada en el historial.', 'codigo' => $codigoInspeccion], 201);
} catch (PDOException $e) {
    if ($conexion->inTransaction()) $conexion->rollBack();
    error_log('seguimiento.php: ' . $e->getMessage());
    error_api('No se pudo guardar la inspección.', 500);
} catch (Throwable $e) {
    if ($conexion->inTransaction()) $conexion->rollBack();
    error_log('seguimiento.php: ' . $e->getMessage());
    error_api('Ocurrió un error al registrar la inspección.', 500);
}
