
<?php

/* =====================================================
   CONEXIÓN MYSQL - CONTROL_EQUIX
   Compatible con XAMPP y Render
   ===================================================== */

$host = getenv('DB_HOST') ?: '127.0.0.1';
$puerto = getenv('DB_PORT') ?: '3306';
$baseDatos = getenv('DB_NAME') ?: 'control_equipos_db';
$usuario = getenv('DB_USER') ?: 'root';

$contrasena = getenv('DB_PASSWORD');
if ($contrasena === false) {
    $contrasena = '';
}

$charset = 'utf8mb4';

$dsn = "mysql:host=$host;port=$puerto;dbname=$baseDatos;charset=$charset";

try {
    $conexion = new PDO($dsn, $usuario, $contrasena, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false
    ]);

} catch (PDOException $e) {
    error_log('Error de conexión CONTROL_EQUIX: ' . $e->getMessage());

    http_response_code(500);
    header('Content-Type: application/json; charset=UTF-8');

    echo json_encode([
        'exito' => false,
        'mensaje' => 'No se pudo conectar con la base de datos.'
    ]);

    exit;
}
