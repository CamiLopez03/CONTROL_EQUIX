<?php
require_once __DIR__ . '/_common.php';
$usuario = usuario_actual();
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function guardar_imagen_equipo(PDO $conexion, int $equipoId, string $base64, string $nombreOriginal = ''): void {
    if ($base64 === '') return;
    if (strlen($base64) > 6 * 1024 * 1024) error_api('La imagen supera el máximo permitido de 4 MB.', 413);
    $contenido = base64_decode($base64, true);
    if ($contenido === false || strlen($contenido) > 4 * 1024 * 1024) {
        error_api('El archivo de imagen no es válido o supera los 4 MB.', 400);
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->buffer($contenido);
    $permitidos = ['image/jpeg', 'image/png', 'image/webp'];
    if (!in_array($mime, $permitidos, true) || @getimagesizefromstring($contenido) === false) {
        error_api('Solo se permiten fotografías JPG, PNG o WEBP.', 400);
    }
    $nombreOriginal = $nombreOriginal !== '' ? basename($nombreOriginal) : null;
    $q = $conexion->prepare('INSERT INTO equipo_imagenes (id_equipo, mime_type, nombre_original, contenido) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), nombre_original = VALUES(nombre_original), contenido = VALUES(contenido), fecha_actualizacion = CURRENT_TIMESTAMP');
    $q->bindValue(1, $equipoId, PDO::PARAM_INT);
    $q->bindValue(2, $mime, PDO::PARAM_STR);
    $q->bindValue(3, $nombreOriginal, $nombreOriginal === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
    $q->bindValue(4, $contenido, PDO::PARAM_LOB);
    $q->execute();
}

function validar_ruta_imagen(string $ruta): void {
    if ($ruta === '') return;
    if (preg_match('~^https?://~i', $ruta)) {
        if (!filter_var($ruta, FILTER_VALIDATE_URL)) error_api('La URL de la imagen no es válida.');
        $esquema = strtolower((string)parse_url($ruta, PHP_URL_SCHEME));
        if (!in_array($esquema, ['http', 'https'], true)) error_api('La URL debe comenzar con http:// o https://.');
        return;
    }
    if (!preg_match('~^(assets|uploads)/[a-zA-Z0-9_./-]+$~', $ruta) || strpos($ruta, '..') !== false) {
        error_api('Usa una URL http(s) o una ruta local dentro de assets/.');
    }
}


try {
    if ($metodo === 'GET') {
        $buscar = trim((string)($_GET['buscar'] ?? ''));
        $tipo = trim((string)($_GET['tipo'] ?? ''));
        $estado = trim((string)($_GET['estado'] ?? ''));
        $ubicacion = trim((string)($_GET['ubicacion'] ?? ''));

        $sql = 'SELECT id_equipo, codigo, nombre, tipo, ubicacion, estado, imagen_ruta, descripcion, fecha_registro, fecha_actualizacion FROM equipos WHERE 1=1';
        $params = [];
        if ($buscar !== '') {
            $sql .= ' AND (codigo LIKE ? OR nombre LIKE ?)';
            $params[] = '%' . $buscar . '%';
            $params[] = '%' . $buscar . '%';
        }
        if ($tipo !== '') { $sql .= ' AND tipo = ?'; $params[] = $tipo; }
        if ($estado !== '') { $sql .= ' AND estado = ?'; $params[] = $estado; }
        if ($ubicacion !== '') { $sql .= ' AND ubicacion LIKE ?'; $params[] = '%' . $ubicacion . '%'; }
        $sql .= ' ORDER BY fecha_registro DESC, id_equipo DESC';

        $q = $conexion->prepare($sql);
        $q->execute($params);
        $equipos = $q->fetchAll();
        foreach ($equipos as &$e) {
            $e['accesorios'] = array_map(function ($a) { return $a['nombre']; }, obtener_accesorios_equipo($conexion, (int)$e['id_equipo']));
        }
        unset($e);
        correcto(['total' => count($equipos), 'equipos' => $equipos]);
    }

    if ($metodo === 'POST' || $metodo === 'PUT') {
        exigir_rol(['Administrador']);
        $datos = leer_json();
        $codigo = strtoupper(trim((string)($datos['codigo'] ?? '')));
        $nombre = trim((string)($datos['nombre'] ?? ''));
        $tipo = trim((string)($datos['tipo'] ?? ''));
        $ubicacion = trim((string)($datos['ubicacion'] ?? ''));
        $estado = trim((string)($datos['estado'] ?? 'Disponible'));
        $imagen = trim((string)($datos['imagen_ruta'] ?? $datos['image'] ?? ''));
        $imagenBase64 = trim((string)($datos['imagen_base64'] ?? ''));
        $imagenNombre = trim((string)($datos['imagen_nombre'] ?? ''));
        $quitarImagen = !empty($datos['quitar_imagen']);
        if ($imagenBase64 !== '') $imagen = '';
        if ($quitarImagen) { $imagen = ''; $imagenBase64 = ''; }
        validar_ruta_imagen($imagen);
        $descripcion = trim((string)($datos['descripcion'] ?? $datos['description'] ?? ''));
        $accesorios = $datos['accesorios'] ?? $datos['accessories'] ?? [];

        if ($codigo === '' || $nombre === '' || $tipo === '' || $ubicacion === '') {
            error_api('Completa el código, nombre, tipo y ubicación del equipo.');
        }
        $estadosPermitidos = ['Disponible', 'Reservado', 'Prestado', 'Fuera de servicio', 'Retirado'];
        if (!in_array($estado, $estadosPermitidos, true)) error_api('El estado seleccionado no es válido.');

        if ($metodo === 'POST') {
            $q = $conexion->prepare('SELECT COUNT(*) FROM equipos WHERE codigo = ?');
            $q->execute([$codigo]);
            if ((int)$q->fetchColumn() > 0) error_api('Ya existe un equipo con ese código.');

            $conexion->beginTransaction();
            $q = $conexion->prepare('INSERT INTO equipos (codigo, nombre, tipo, ubicacion, estado, imagen_ruta, descripcion) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $q->execute([$codigo, $nombre, $tipo, $ubicacion, $estado, $imagen ?: null, $descripcion ?: null]);
            $equipoId = (int)$conexion->lastInsertId();
            sincronizar_accesorios($conexion, $equipoId, $accesorios);
            if ($imagenBase64 !== '') guardar_imagen_equipo($conexion, $equipoId, $imagenBase64, $imagenNombre);
            agregar_evento($conexion, $codigo, 'Equipo registrado', 'Se registró el equipo ' . $nombre . '.', (int)$usuario['id']);
            $conexion->commit();
            correcto(['mensaje' => 'Equipo creado correctamente.', 'codigo' => $codigo], 201);
        }

        $codigoOriginal = strtoupper(trim((string)($datos['codigo_original'] ?? $codigo)));
        if ($codigoOriginal !== $codigo) error_api('El código del equipo no se puede modificar una vez creado.');
        $equipoId = id_equipo_por_codigo($conexion, $codigoOriginal);
        if (!$equipoId) error_api('No se encontró el equipo que deseas actualizar.', 404);

        $conexion->beginTransaction();
        $q = $conexion->prepare('UPDATE equipos SET nombre = ?, tipo = ?, ubicacion = ?, estado = ?, imagen_ruta = ?, descripcion = ? WHERE id_equipo = ?');
        $q->execute([$nombre, $tipo, $ubicacion, $estado, $imagen ?: null, $descripcion ?: null, $equipoId]);
        sincronizar_accesorios($conexion, $equipoId, $accesorios);
        if ($imagenBase64 !== '') {
            guardar_imagen_equipo($conexion, $equipoId, $imagenBase64, $imagenNombre);
        } elseif ($imagen !== '' || $quitarImagen) {
            $borrarImagen = $conexion->prepare('DELETE FROM equipo_imagenes WHERE id_equipo = ?');
            $borrarImagen->execute([$equipoId]);
        }
        agregar_evento($conexion, $codigoOriginal, 'Equipo actualizado', 'Se actualizaron los datos de ' . $nombre . '.', (int)$usuario['id']);
        $conexion->commit();
        correcto(['mensaje' => 'Equipo actualizado correctamente.', 'codigo' => $codigoOriginal]);
    }

    if ($metodo === 'DELETE') {
        exigir_rol(['Administrador']);
        $codigo = strtoupper(trim((string)($_GET['codigo'] ?? '')));
        if ($codigo === '') error_api('Indica el código del equipo.');
        $equipoId = id_equipo_por_codigo($conexion, $codigo);
        if (!$equipoId) error_api('No se encontró el equipo.', 404);
        $q = $conexion->prepare("SELECT COUNT(*) FROM reserva_equipos re INNER JOIN reservas r ON r.id_reserva = re.id_reserva LEFT JOIN prestamos p ON p.reserva_id = r.id_reserva WHERE re.id_equipo = ? AND (r.estado = 'Pendiente' OR (r.estado = 'Aprobada' AND (p.id_prestamo IS NULL OR p.fecha_retorno_real IS NULL)))");
        $q->execute([$equipoId]);
        if ((int)$q->fetchColumn() > 0) error_api('No se puede eliminar: el equipo tiene reservas pendientes o aprobadas.');
        // Se conserva el registro para no romper el historial de reservas y préstamos.
        $q = $conexion->prepare("UPDATE equipos SET estado = 'Retirado' WHERE id_equipo = ?");
        $q->execute([$equipoId]);
        agregar_evento($conexion, $codigo, 'Equipo retirado', 'El equipo fue retirado del catálogo; su historial se conserva.', (int)$usuario['id']);
        correcto(['mensaje' => 'Equipo retirado del catálogo.']);
    }

    error_api('Método no permitido.', 405);
} catch (PDOException $e) {
    if ($conexion->inTransaction()) $conexion->rollBack();
    error_log('equipos.php: ' . $e->getMessage());
    error_api('No se pudo guardar o consultar el equipo. Revisa los datos y la conexión.', 500);
} catch (Throwable $e) {
    if ($conexion->inTransaction()) $conexion->rollBack();
    error_log('equipos.php: ' . $e->getMessage());
    error_api('Ocurrió un error al procesar el equipo.', 500);
}
