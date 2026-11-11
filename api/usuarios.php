<?php
require_once __DIR__ . '/_common.php';
$usuario = exigir_rol(['Administrador']);
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($metodo === 'GET') {
        $usuarios = $conexion->query('SELECT id_usuario, nombre, correo, rol, activo, fecha_creacion FROM usuarios ORDER BY nombre')->fetchAll();
        foreach ($usuarios as &$u) {
            $u['id'] = (string)$u['id_usuario'];
            $u['name'] = $u['nombre'];
            $u['email'] = $u['correo'];
            $u['role'] = $u['rol'];
            unset($u['password_hash']);
        }
        unset($u);
        correcto(['usuarios' => $usuarios]);
    }

    if ($metodo === 'POST') {
        $datos = leer_json();
        $nombre = trim((string)($datos['nombre'] ?? $datos['name'] ?? ''));
        $correo = strtolower(trim((string)($datos['correo'] ?? $datos['email'] ?? '')));
        $rol = trim((string)($datos['rol'] ?? $datos['role'] ?? 'Solicitante'));
        $clave = (string)($datos['password'] ?? '');

        if ($nombre === '' || $correo === '' || $clave === '') error_api('Completa nombre, correo y contraseña.');
        if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) error_api('El correo electrónico no tiene un formato válido.');
        if (strlen($clave) < 6) error_api('La contraseña debe tener al menos 6 caracteres.');
        if (!in_array($rol, ['Administrador', 'Encargado audiovisual', 'Solicitante'], true)) error_api('El rol seleccionado no es válido.');

        $q = $conexion->prepare('INSERT INTO usuarios (nombre, correo, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)');
        $q->execute([$nombre, $correo, password_hash($clave, PASSWORD_DEFAULT), $rol]);
        correcto(['mensaje' => 'Usuario creado correctamente.', 'id' => (string)$conexion->lastInsertId()], 201);
    }

    error_api('Método no permitido.', 405);
} catch (PDOException $e) {
    if ($e->getCode() === '23000') error_api('Ya existe un usuario registrado con ese correo.');
    error_log('usuarios.php: ' . $e->getMessage());
    error_api('No se pudo guardar o consultar el usuario.', 500);
}
