<?php
/* Funciones compartidas de la API. No abrir este archivo directamente. */
require_once __DIR__ . '/../conexion.php';

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    session_start();
}

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function responder($datos, $estadoHttp = 200) {
    http_response_code($estadoHttp);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function correcto($datos = [], $estadoHttp = 200) {
    responder(array_merge(['exito' => true], $datos), $estadoHttp);
}

function error_api($mensaje, $estadoHttp = 400) {
    responder(['exito' => false, 'mensaje' => $mensaje], $estadoHttp);
}

function leer_json() {
    $contenido = file_get_contents('php://input');
    if ($contenido === false || trim($contenido) === '') return [];
    $datos = json_decode($contenido, true);
    if (!is_array($datos)) error_api('El cuerpo de la solicitud no contiene JSON válido.', 400);
    return $datos;
}

function usuario_actual() {
    if (empty($_SESSION['usuario']) || empty($_SESSION['usuario']['id'])) {
        error_api('Debes iniciar sesión para realizar esta operación.', 401);
    }
    return $_SESSION['usuario'];
}

function exigir_rol($roles) {
    $usuario = usuario_actual();
    if (!in_array($usuario['role'], (array)$roles, true)) {
        error_api('No tienes permisos para realizar esta operación.', 403);
    }
    return $usuario;
}

function fecha_mysql($valor) {
    $valor = trim((string)$valor);
    if ($valor === '') return null;
    $valor = str_replace('T', ' ', $valor);
    if (strlen($valor) === 16) $valor .= ':00';
    $fecha = DateTime::createFromFormat('Y-m-d H:i:s', $valor);
    if (!$fecha) return null;
    return $fecha->format('Y-m-d H:i:s');
}

function fecha_interfaz($valor) {
    if (!$valor) return '';
    $marca = strtotime($valor);
    return $marca ? date('Y-m-d\TH:i', $marca) : '';
}

function generar_codigo($prefijo) {
    return $prefijo . '-' . date('ymdHis') . '-' . strtoupper(bin2hex(random_bytes(2)));
}

function id_equipo_por_codigo(PDO $conexion, $codigo) {
    $q = $conexion->prepare('SELECT id_equipo FROM equipos WHERE codigo = ? LIMIT 1');
    $q->execute([$codigo]);
    $id = $q->fetchColumn();
    return $id ? (int)$id : null;
}

function id_reserva_por_codigo(PDO $conexion, $codigo) {
    $q = $conexion->prepare('SELECT id_reserva FROM reservas WHERE codigo = ? LIMIT 1');
    $q->execute([$codigo]);
    $id = $q->fetchColumn();
    return $id ? (int)$id : null;
}

function id_prestamo_por_codigo(PDO $conexion, $codigo) {
    $q = $conexion->prepare('SELECT id_prestamo FROM prestamos WHERE codigo = ? LIMIT 1');
    $q->execute([$codigo]);
    $id = $q->fetchColumn();
    return $id ? (int)$id : null;
}

function agregar_evento(PDO $conexion, $codigoEquipo, $tipo, $detalle, $usuarioId, $codigoReserva = null, $codigoPrestamo = null) {
    $equipoId = $codigoEquipo ? id_equipo_por_codigo($conexion, $codigoEquipo) : null;
    $reservaId = $codigoReserva ? id_reserva_por_codigo($conexion, $codigoReserva) : null;
    $prestamoId = $codigoPrestamo ? id_prestamo_por_codigo($conexion, $codigoPrestamo) : null;

    $q = $conexion->prepare('INSERT INTO eventos (equipo_id, reserva_id, prestamo_id, usuario_id, tipo, detalle, fecha_evento) VALUES (?, ?, ?, ?, ?, ?, NOW())');
    $q->execute([$equipoId, $reservaId, $prestamoId, $usuarioId ?: null, $tipo, $detalle]);
    return (int)$conexion->lastInsertId();
}

function agregar_notificacion(PDO $conexion, $usuarioId, $tipo, $titulo, $mensaje, $eventoId = null) {
    if (!$usuarioId) return;
    $q = $conexion->prepare('INSERT INTO notificaciones (usuario_id, evento_id, tipo, titulo, mensaje, leida, fecha_creacion) VALUES (?, ?, ?, ?, ?, 0, NOW())');
    $q->execute([$usuarioId, $eventoId, $tipo, $titulo, $mensaje]);
}

function obtener_accesorios_equipo(PDO $conexion, $equipoId) {
    $q = $conexion->prepare('SELECT a.id_accesorio, a.nombre FROM equipo_accesorio ea INNER JOIN accesorios a ON a.id_accesorio = ea.id_accesorio WHERE ea.id_equipo = ? ORDER BY a.nombre');
    $q->execute([$equipoId]);
    return $q->fetchAll();
}

function sincronizar_accesorios(PDO $conexion, $equipoId, $nombres) {
    $nombres = array_values(array_unique(array_filter(array_map(function ($v) {
        return trim((string)$v);
    }, (array)$nombres), function ($v) { return $v !== ''; })));

    $actuales = obtener_accesorios_equipo($conexion, $equipoId);
    $porNombre = [];
    foreach ($actuales as $actual) $porNombre[$actual['nombre']] = (int)$actual['id_accesorio'];

    $del = $conexion->prepare('DELETE FROM equipo_accesorio WHERE id_equipo = ?');
    $del->execute([$equipoId]);

    foreach ($nombres as $nombre) {
        if (isset($porNombre[$nombre])) {
            $accesorioId = $porNombre[$nombre];
        } else {
            $buscar = $conexion->prepare('SELECT id_accesorio FROM accesorios WHERE nombre = ? ORDER BY id_accesorio LIMIT 1');
            $buscar->execute([$nombre]);
            $accesorioId = $buscar->fetchColumn();
            if (!$accesorioId) {
                $crear = $conexion->prepare("INSERT INTO accesorios (nombre, estado, ubicacion) VALUES (?, 'Asignado', NULL)");
                $crear->execute([$nombre]);
                $accesorioId = $conexion->lastInsertId();
            }
            $accesorioId = (int)$accesorioId;
        }
        $rel = $conexion->prepare('INSERT IGNORE INTO equipo_accesorio (id_equipo, id_accesorio, cantidad) VALUES (?, ?, 1)');
        $rel->execute([$equipoId, $accesorioId]);
    }
}

function equipo_ocupado(PDO $conexion, $equipoId, $inicio, $fin, $excluirReservaId = null) {
    $q = $conexion->prepare("SELECT estado FROM equipos WHERE id_equipo = ?");
    $q->execute([$equipoId]);
    $estado = $q->fetchColumn();
    if (!$estado || in_array($estado, ['Fuera de servicio', 'Retirado'], true)) return true;

    $sql = "SELECT COUNT(*) FROM reserva_equipos re INNER JOIN reservas r ON r.id_reserva = re.id_reserva WHERE re.id_equipo = ? AND r.estado = 'Aprobada' AND r.fecha_inicio < ? AND r.fecha_fin > ?";
    $params = [$equipoId, $fin, $inicio];
    if ($excluirReservaId !== null) {
        $sql .= ' AND r.id_reserva <> ?';
        $params[] = $excluirReservaId;
    }
    $q = $conexion->prepare($sql);
    $q->execute($params);
    if ((int)$q->fetchColumn() > 0) return true;

    // Un préstamo que todavía no se ha devuelto bloquea nuevas reservas posteriores a la entrega real.
    $q = $conexion->prepare("SELECT COUNT(*) FROM prestamos p INNER JOIN reserva_equipos re ON re.id_reserva = p.reserva_id WHERE re.id_equipo = ? AND p.fecha_retorno_real IS NULL AND p.fecha_entrega < ?");
    $q->execute([$equipoId, $fin]);
    return (int)$q->fetchColumn() > 0;
}

function enviar_notificacion_a_rol(PDO $conexion, $rol, $tipo, $titulo, $mensaje) {
    $q = $conexion->prepare('SELECT id_usuario FROM usuarios WHERE rol = ? AND activo = 1');
    $q->execute([$rol]);
    foreach ($q->fetchAll(PDO::FETCH_COLUMN) as $id) {
        agregar_notificacion($conexion, (int)$id, $tipo, $titulo, $mensaje);
    }
}
