<?php
require_once __DIR__ . '/_common.php';
try {
    $nombre = $conexion->query('SELECT DATABASE()')->fetchColumn();
    $tablaImagenes = (int)$conexion->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'equipo_imagenes'")->fetchColumn() > 0;
    correcto([
        'mensaje' => 'API PHP conectada correctamente con MySQL.',
        'base_datos' => $nombre,
        'tabla_imagenes' => $tablaImagenes
    ]);
} catch (PDOException $e) {
    error_log('health.php: ' . $e->getMessage());
    error_api('La conexión con MySQL falló.', 500);
}
