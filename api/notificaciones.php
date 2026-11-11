<?php
require_once __DIR__ . '/_common.php';
$usuario = usuario_actual();
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($metodo === 'GET') {
        $q = $conexion->prepare('SELECT id_notificacion, tipo, titulo, mensaje, leida, fecha_creacion FROM notificaciones WHERE usuario_id = ? ORDER BY fecha_creacion DESC LIMIT 100');
        $q->execute([(int)$usuario['id']]);
        correcto(['notificaciones' => $q->fetchAll()]);
    }

    if ($metodo === 'POST') {
        $datos = leer_json();
        $id = (int)($datos['id'] ?? 0);
        if (!$id) error_api('Indica la notificación.');
        $q = $conexion->prepare('UPDATE notificaciones SET leida = 1 WHERE id_notificacion = ? AND usuario_id = ?');
        $q->execute([$id, (int)$usuario['id']]);
        correcto(['mensaje' => 'Notificación marcada como leída.']);
    }

    error_api('Método no permitido.', 405);
} catch (PDOException $e) {
    error_log('notificaciones.php: ' . $e->getMessage());
    error_api('No se pudieron consultar las notificaciones.', 500);
}
