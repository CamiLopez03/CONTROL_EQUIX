# CONTROL_EQUIX

Aplicación multipágina para la gestión de equipos audiovisuales, desarrollada con HTML, CSS, JavaScript, PHP y MySQL.

## Estructura
- 18 páginas HTML independientes.
- `app.js`: lógica de interfaz y conexión con la API.
- `styles.css`: estilos compartidos y tema CONTROL_EQUIX.
- `conexion.php`: conexión PDO con MySQL.
- `api/`: autenticación, equipos, usuarios, reservas, préstamos, seguimiento, imágenes y notificaciones.
- `control_equipos_db.sql`: esquema inicial de la base de datos.

## Base de datos
Se conserva el nombre `control_equipos_db` para no perder la información existente. Los archivos subidos se guardan en la tabla `equipo_imagenes` como BLOB; las URL externas se guardan en `equipos.imagen_ruta`.

## Inicio rápido
Consulta `README_INSTALACION.txt`. Para tu base existente ejecuta una sola vez `api/actualizar.php`; esta migración crea la tabla de imágenes sin alterar tus registros. El proyecto debe ejecutarse desde Apache/XAMPP, por ejemplo `http://localhost/CONTROL_EQUIX/index.html`.
