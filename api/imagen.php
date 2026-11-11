<?php
require_once __DIR__ . '/_common.php';
usuario_actual();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    exit;
}

$codigo = strtoupper(trim((string)($_GET['codigo'] ?? '')));
if ($codigo === '') {
    http_response_code(400);
    exit;
}

try {
    $q = $conexion->prepare('SELECT ei.mime_type, ei.contenido FROM equipo_imagenes ei INNER JOIN equipos e ON e.id_equipo = ei.id_equipo WHERE e.codigo = ? LIMIT 1');
    $q->execute([$codigo]);
    $imagen = $q->fetch();
    if (!$imagen) {
        http_response_code(404);
        exit;
    }

    header_remove('Content-Type');
    header('Content-Type: ' . $imagen['mime_type']);
    header('Content-Length: ' . strlen($imagen['contenido']));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=3600');
    echo $imagen['contenido'];
    exit;
} catch (Throwable $e) {
    error_log('imagen.php: ' . $e->getMessage());
    http_response_code(500);
    exit;
}
