<?php
require_once __DIR__ . '/_common.php';

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$accion = $_GET['action'] ?? '';

try {
    if ($metodo === 'GET' && $accion === 'me') {
        if (empty($_SESSION['usuario'])) {
            error_api('No hay una sesión activa.', 401);
        }
        correcto(['usuario' => $_SESSION['usuario']]);
    }

    if ($metodo === 'POST' && $accion === 'login') {
        $datos = leer_json();
        $correo = strtolower(trim((string)($datos['email'] ?? '')));
        $clave = (string)($datos['password'] ?? '');

        if ($correo === '' || $clave === '') error_api('Escribe tu correo y contraseña.');

        $q = $conexion->prepare('SELECT id_usuario, nombre, correo, password_hash, rol, activo FROM usuarios WHERE correo = ? LIMIT 1');
        $q->execute([$correo]);
        $fila = $q->fetch();

        if (!$fila || (int)$fila['activo'] !== 1 || !password_verify($clave, $fila['password_hash'])) {
            error_api('Correo o contraseña incorrectos.', 401);
        }

        session_regenerate_id(true);
        $_SESSION['usuario'] = [
            'id' => (string)$fila['id_usuario'],
            'name' => $fila['nombre'],
            'email' => $fila['correo'],
            'role' => $fila['rol']
        ];

        correcto(['mensaje' => 'Inicio de sesión correcto.', 'usuario' => $_SESSION['usuario']]);
    }

    if ($metodo === 'POST' && $accion === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', $params['secure'], $params['httponly']);
        }
        session_destroy();
        correcto(['mensaje' => 'Sesión cerrada.']);
    }

    error_api('Acción o método no permitido.', 405);
} catch (PDOException $e) {
    error_log('auth.php: ' . $e->getMessage());
    error_api('No se pudo completar la autenticación.', 500);
}
