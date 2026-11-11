<?php
require_once __DIR__ . '/_common.php';
$usuario = usuario_actual();
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accion = $_GET['action'] ?? '';

try {
    if ($metodo === 'GET') {
        exigir_rol(['Administrador', 'Encargado audiovisual']);
        $q = $conexion->query('SELECT p.codigo, r.codigo AS reserva_codigo, p.fecha_entrega, p.fecha_retorno_previsto, p.fecha_retorno_real, p.estado FROM prestamos p INNER JOIN reservas r ON r.id_reserva = p.reserva_id ORDER BY p.fecha_registro DESC');
        correcto(['prestamos' => $q->fetchAll()]);
    }

    if ($metodo !== 'POST') error_api('Método no permitido.', 405);
    exigir_rol(['Administrador', 'Encargado audiovisual']);
    $datos = leer_json();

    if ($accion === 'entregar') {
        $codigoReserva = trim((string)($datos['reserva_codigo'] ?? ''));
        $fechaEntrega = fecha_mysql($datos['fecha_entrega'] ?? '');
        $condicion = trim((string)($datos['condicion_inicial'] ?? ''));
        $accesoriosSeleccionados = array_values(array_unique(array_map('strval', (array)($datos['accesorios_entregados'] ?? []))));
        if ($codigoReserva === '' || !$fechaEntrega || $condicion === '') error_api('Completa los datos de la entrega.');

        $conexion->beginTransaction();
        $q = $conexion->prepare('SELECT id_reserva, codigo, usuario_id, fecha_fin, estado FROM reservas WHERE codigo = ? FOR UPDATE');
        $q->execute([$codigoReserva]);
        $reserva = $q->fetch();
        if (!$reserva || $reserva['estado'] !== 'Aprobada') error_api('Solo se puede entregar una reserva aprobada.');

        $q = $conexion->prepare('SELECT COUNT(*) FROM prestamos WHERE reserva_id = ?');
        $q->execute([(int)$reserva['id_reserva']]);
        if ((int)$q->fetchColumn() > 0) error_api('Esta reserva ya tiene un préstamo registrado.');

        $qe = $conexion->prepare('SELECT e.id_equipo, e.codigo, e.nombre FROM reserva_equipos re INNER JOIN equipos e ON e.id_equipo = re.id_equipo WHERE re.id_reserva = ?');
        $qe->execute([(int)$reserva['id_reserva']]);
        $equipos = $qe->fetchAll();
        if (!$equipos) error_api('La reserva no tiene equipos asociados.');

        foreach ($equipos as $equipo) {
            $estadoQ = $conexion->prepare('SELECT estado FROM equipos WHERE id_equipo = ?');
            $estadoQ->execute([(int)$equipo['id_equipo']]);
            $estadoActual = $estadoQ->fetchColumn();
            if (in_array($estadoActual, ['Fuera de servicio', 'Retirado'], true)) {
                error_api('No se puede entregar: el equipo ' . $equipo['codigo'] . ' está fuera de servicio o retirado.');
            }
            $prestamoActivoQ = $conexion->prepare('SELECT COUNT(*) FROM prestamos p INNER JOIN reserva_equipos re ON re.id_reserva = p.reserva_id WHERE re.id_equipo = ? AND p.fecha_retorno_real IS NULL');
            $prestamoActivoQ->execute([(int)$equipo['id_equipo']]);
            if ((int)$prestamoActivoQ->fetchColumn() > 0) {
                error_api('No se puede entregar: el equipo ' . $equipo['codigo'] . ' ya tiene un préstamo activo.');
            }
        }

        $codigoPrestamo = generar_codigo('PRE');
        $q = $conexion->prepare("INSERT INTO prestamos (codigo, reserva_id, responsable_id, encargado_id, fecha_entrega, fecha_retorno_previsto, condicion_inicial, estado, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, 'Activo', NULL)");
        $q->execute([$codigoPrestamo, (int)$reserva['id_reserva'], (int)$reserva['usuario_id'], (int)$usuario['id'], $fechaEntrega, $reserva['fecha_fin'], $condicion]);
        $prestamoId = (int)$conexion->lastInsertId();

        foreach ($equipos as $equipo) {
            $codigoInspeccion = generar_codigo('INS');
            $qi = $conexion->prepare("INSERT INTO inspecciones (codigo, prestamo_id, equipo_id, responsable_id, tipo, fecha, diagnostico, accion, resultado, estado_resultante, origen) VALUES (?, ?, ?, ?, 'Entrega', ?, ?, 'Entrega de equipo', 'Entrega registrada', NULL, ?)");
            $qi->execute([$codigoInspeccion, $prestamoId, (int)$equipo['id_equipo'], (int)$usuario['id'], $fechaEntrega, $condicion, $codigoPrestamo]);
            $inspeccionId = (int)$conexion->lastInsertId();

            $accesorios = obtener_accesorios_equipo($conexion, (int)$equipo['id_equipo']);
            foreach ($accesorios as $a) {
                $incluido = in_array($a['nombre'], $accesoriosSeleccionados, true) ? 1 : 0;
                $qd = $conexion->prepare('INSERT INTO detalle_checklist (inspeccion_id, equipo_id, accesorio_id, nombre_accesorio, cantidad_entregada, cantidad_devuelta, incluido, devuelto, condicion_entrega) VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)');
                $qd->execute([$inspeccionId, (int)$equipo['id_equipo'], (int)$a['id_accesorio'], $a['nombre'], $incluido, $incluido, $incluido ? 'Entregado' : 'No incluido']);
            }

            $qu = $conexion->prepare("UPDATE equipos SET estado = 'Prestado' WHERE id_equipo = ?");
            $qu->execute([(int)$equipo['id_equipo']]);
            agregar_evento($conexion, $equipo['codigo'], 'Entrega registrada', $codigoPrestamo . ' · ' . $usuario['name'], (int)$usuario['id'], $codigoReserva, $codigoPrestamo);
        }

        agregar_notificacion($conexion, (int)$reserva['usuario_id'], 'Confirmacion', 'Entrega registrada', 'Se registró la entrega de equipos del préstamo ' . $codigoPrestamo . '.');
        $conexion->commit();
        correcto(['mensaje' => 'Entrega registrada correctamente.', 'codigo' => $codigoPrestamo], 201);
    }

    if ($accion === 'devolver') {
        $codigoPrestamo = trim((string)($datos['prestamo_codigo'] ?? ''));
        $fechaRetorno = fecha_mysql($datos['fecha_retorno_real'] ?? '');
        $condicionFinal = trim((string)($datos['condicion_final'] ?? ''));
        $accesoriosDevueltos = array_values(array_unique(array_map('strval', (array)($datos['accesorios_devuelto'] ?? []))));
        $danos = trim((string)($datos['danos'] ?? ''));
        $notas = trim((string)($datos['notas'] ?? ''));
        if ($codigoPrestamo === '' || !$fechaRetorno || $condicionFinal === '') error_api('Completa los datos de la devolución.');

        $conexion->beginTransaction();
        $q = $conexion->prepare('SELECT p.id_prestamo, p.reserva_id, p.responsable_id, p.fecha_entrega, r.codigo AS reserva_codigo FROM prestamos p INNER JOIN reservas r ON r.id_reserva = p.reserva_id WHERE p.codigo = ? AND p.fecha_retorno_real IS NULL FOR UPDATE');
        $q->execute([$codigoPrestamo]);
        $prestamo = $q->fetch();
        if (!$prestamo) error_api('No se encontró un préstamo activo con ese código.');
        if (strtotime($fechaRetorno) < strtotime($prestamo['fecha_entrega'])) error_api('La devolución no puede ser anterior a la fecha de entrega.');

        $prestamoId = (int)$prestamo['id_prestamo'];
        $reservaId = (int)$prestamo['reserva_id'];
        $q = $conexion->prepare("SELECT d.id_detalle, d.nombre_accesorio, d.incluido, d.equipo_id, e.codigo AS equipo_codigo FROM inspecciones i INNER JOIN detalle_checklist d ON d.inspeccion_id = i.id_inspeccion INNER JOIN equipos e ON e.id_equipo = d.equipo_id WHERE i.prestamo_id = ? AND i.tipo = 'Entrega' AND d.incluido = 1");
        $q->execute([$prestamoId]);
        $detalles = $q->fetchAll();

        $faltantes = [];
        $upd = $conexion->prepare('UPDATE detalle_checklist SET devuelto = ?, cantidad_devuelta = ?, condicion_devolucion = ?, observaciones = ? WHERE id_detalle = ?');
        foreach ($detalles as $d) {
            $devuelto = in_array($d['nombre_accesorio'], $accesoriosDevueltos, true) ? 1 : 0;
            if (!$devuelto) $faltantes[] = $d['nombre_accesorio'];
            $upd->execute([$devuelto, $devuelto, $devuelto ? 'Devuelto' : 'Faltante', $danos ?: $notas ?: null, (int)$d['id_detalle']]);
        }
        $faltantes = array_values(array_unique($faltantes));
        if ((!empty($faltantes) || $condicionFinal !== 'Conforme') && $danos === '' && $notas === '') {
            error_api('Describe los daños, faltantes o novedades antes de registrar la devolución.');
        }

        $hayNovedad = !empty($faltantes) || $condicionFinal !== 'Conforme' || $danos !== '';
        $nuevoEstado = $hayNovedad ? 'Fuera de servicio' : 'Disponible';
        $estadoPrestamo = $hayNovedad ? 'Con novedades' : 'Devuelto';
        $observaciones = json_encode(['danos' => $danos, 'notas' => $notas, 'faltantes' => $faltantes], JSON_UNESCAPED_UNICODE);

        $q = $conexion->prepare('UPDATE prestamos SET fecha_retorno_real = ?, condicion_final = ?, estado = ?, observaciones = ? WHERE id_prestamo = ?');
        $q->execute([$fechaRetorno, $condicionFinal, $estadoPrestamo, $observaciones, $prestamoId]);

        $qe = $conexion->prepare('SELECT e.id_equipo, e.codigo FROM reserva_equipos re INNER JOIN equipos e ON e.id_equipo = re.id_equipo WHERE re.id_reserva = ?');
        $qe->execute([$reservaId]);
        $equipos = $qe->fetchAll();
        $diagnostico = $danos;
        if ($faltantes) $diagnostico .= ($diagnostico !== '' ? ' | ' : '') . 'Accesorios faltantes: ' . implode(', ', $faltantes);
        if ($diagnostico === '') $diagnostico = 'Devolución revisada sin daños reportados.';

        foreach ($equipos as $equipo) {
            $qu = $conexion->prepare('UPDATE equipos SET estado = ? WHERE id_equipo = ?');
            $qu->execute([$nuevoEstado, (int)$equipo['id_equipo']]);

            $codigoInspeccion = generar_codigo('INS');
            $qi = $conexion->prepare("INSERT INTO inspecciones (codigo, prestamo_id, equipo_id, responsable_id, tipo, fecha, diagnostico, accion, resultado, estado_resultante, origen) VALUES (?, ?, ?, ?, 'Devolucion', ?, ?, ?, ?, ?, ?)");
            $accionTexto = $notas !== '' ? $notas : 'Recepción y revisión de devolución';
            $qi->execute([$codigoInspeccion, $prestamoId, (int)$equipo['id_equipo'], (int)$usuario['id'], $fechaRetorno, $diagnostico, $accionTexto, $condicionFinal, $nuevoEstado, $codigoPrestamo]);
            agregar_evento($conexion, $equipo['codigo'], 'Devolución registrada', $codigoPrestamo . ($hayNovedad ? ' · Con novedad' : ' · Conforme'), (int)$usuario['id'], $prestamo['reserva_codigo'], $codigoPrestamo);
        }

        agregar_notificacion($conexion, (int)$prestamo['responsable_id'], $hayNovedad ? 'Aviso' : 'Confirmacion', 'Devolución registrada', $hayNovedad ? 'El préstamo ' . $codigoPrestamo . ' fue devuelto con novedades.' : 'El préstamo ' . $codigoPrestamo . ' fue devuelto correctamente.');
        $conexion->commit();
        correcto([
            'mensaje' => 'Devolución registrada correctamente.',
            'faltantes' => $faltantes,
            'estado' => $estadoPrestamo
        ]);
    }

    error_api('Acción de préstamos no reconocida.', 400);
} catch (PDOException $e) {
    if ($conexion->inTransaction()) $conexion->rollBack();
    error_log('prestamos.php: ' . $e->getMessage());
    error_api('No se pudo procesar el préstamo o la devolución.', 500);
} catch (Throwable $e) {
    if ($conexion->inTransaction()) $conexion->rollBack();
    error_log('prestamos.php: ' . $e->getMessage());
    error_api('Ocurrió un error al procesar el préstamo.', 500);
}
