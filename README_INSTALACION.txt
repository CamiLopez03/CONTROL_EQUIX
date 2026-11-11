CONTROL_EQUIX — INSTALACIÓN LOCAL CON XAMPP
============================================

IMPORTANTE: este paquete ya viene con las 18 páginas HTML separadas, app.js, styles.css y la API PHP. No abras los HTML con doble clic ni con Live Server. PHP debe ejecutarse desde Apache.

1. COPIAR EL PROYECTO
---------------------
1. Descomprime CONTROL_EQUIX.zip.
2. Copia la carpeta CONTROL_EQUIX directamente dentro de:
   C:\xampp\htdocs\
3. La estructura debe quedar así (sin una segunda carpeta CONTROL_EQUIX dentro):
   C:\xampp\htdocs\CONTROL_EQUIX\index.html
   C:\xampp\htdocs\CONTROL_EQUIX\app.js
   C:\xampp\htdocs\CONTROL_EQUIX\conexion.php
   C:\xampp\htdocs\CONTROL_EQUIX\api\equipos.php

2. ENCENDER XAMPP
-----------------
Abre XAMPP Control Panel e inicia Apache y MySQL.

3. CONSERVAR TU BASE DE DATOS ACTUAL
------------------------------------
La aplicación sigue usando la base de datos control_equipos_db para conservar los equipos que ya registraste. NO borres esa base de datos y NO la vuelvas a importar si ya contiene tu información.

En conexion.php están los datos de XAMPP:
  $host = 'localhost';
  $baseDatos = 'control_equipos_db';
  $usuario = 'root';
  $contrasena = '';

Si tu MySQL usa otra contraseña, modifica únicamente ese valor.

4. ACTUALIZAR LA TABLA DE FOTOGRAFÍAS (TU BASE ACTUAL)
------------------------------------------------------
El sistema admite dos alternativas:
- Pegar una URL pública de imagen: se guarda la URL en equipos.imagen_ruta.
- Seleccionar un archivo desde el computador: se guarda el contenido de la imagen en MySQL, en la tabla equipo_imagenes (BLOB).

Como ya tienes la base de datos y los usuarios creados, usa esta migración segura:
1. Abre en el navegador:
   http://localhost/CONTROL_EQUIX/api/actualizar.php
2. Debe indicar que la actualización terminó y que no modificó registros.
3. Elimina api/actualizar.php después de ejecutarlo.

Esta operación NO borra ni modifica los equipos, accesorios, usuarios, reservas o préstamos que ya tienes.

Si algún día instalas el proyecto desde cero, importa control_equipos_db.sql y ejecuta api/instalar.php para crear la tabla de imágenes y los cuatro usuarios demo. Elimina api/instalar.php después.

5. PROBAR LA CONEXIÓN
---------------------
Abre:
  http://localhost/CONTROL_EQUIX/api/health.php
Debe indicar que la API está conectada con control_equipos_db.

Luego abre:
  http://localhost/CONTROL_EQUIX/index.html

6. USUARIOS DE DEMOSTRACIÓN
---------------------------
Contraseña para todos: demo123

Administrador:          camila@campus.edu
Encargado audiovisual:  luis@campus.edu
Solicitante:            diego@campus.edu
Solicitante:            lucia@campus.edu

7. FUNCIONES CONECTADAS
-----------------------
- Inicio y cierre de sesión mediante PHP Sessions y contraseñas con password_hash/password_verify.
- Consulta, búsqueda y filtros de equipos.
- Registro, edición y retiro lógico de equipos.
- Accesorios asociados a cada equipo.
- Fotografías subidas a MySQL como BLOB (JPG, PNG, WEBP, máximo 4 MB).
- URL externa de imagen o ruta local assets/ guardada en MySQL.
- Registro de usuarios y roles.
- Solicitudes, aprobación y rechazo de reservas.
- Entregas, devoluciones y checklist.
- Seguimiento, inspecciones, mantenimiento, historial y notificaciones.

8. NOTAS PARA DESPLIEGUE
------------------------
Esta versión está preparada para pruebas locales académicas. Antes de publicar en internet se deben configurar HTTPS, contraseñas reales, protección CSRF, permisos mínimos de MySQL, copias de seguridad y retirar api/instalar.php. No publiques la clave demo123.
