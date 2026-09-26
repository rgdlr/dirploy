# Checklist de Tareas — Dirploy

Estado del progreso del plan de implementación basado en [docs/ssd.md](docs/ssd.md) y roadmap futuro depurado.

---

## 1. Especificaciones del MVP (Fases 1 a 6)

### Fase 1: Fundamentos
- [x] Estructura del proyecto en TypeScript (ESM puro, target ES2024, Node >=20).
- [x] Metadatos del paquete (`package.json`, binario `dirploy`, exportaciones e indentación con tabs).
- [x] Punto de entrada CLI con `node:util parseArgs` (0 dependencias en runtime).
- [x] Carga y tipado de configuración (`dirploy.config.json`).
- [x] Modelo de errores unificado (`DirployError`, `DirployErrorCode`).
- [x] Validación de rutas y seguridad inicial (`paths.ts`).

### Fase 2: Motor Git
- [x] Ejecutor de comandos Git nativo (`DefaultGitClient`).
- [x] Creación y aislamiento de repositorio temporal (`createTemporaryRepository`).
- [x] Clonado superficial (`clone --depth 1 --branch`).
- [x] Comprobación de estado (`status --porcelain`).
- [x] Creación de commit con identidad aislada (`commit`).
- [x] Push seguro a la rama remota (`push`).
- [x] Limpieza garantizada del directorio temporal en bloques `finally`.

### Fase 3: Sincronización Segura
- [x] Sincronizador de directorios (`SafeDirectorySynchronizer`).
- [x] Eliminación segura de archivos obsoletos solo dentro del subdirectorio destino.
- [x] Cálculo de estadísticas de archivos añadidos, modificados y eliminados.
- [x] Preservación estricta de proyectos vecinos y archivos raíz del User Site.

### Fase 4: Resolución Automática
- [x] Resolución del propietario de GitHub (`--repo` → `gh auth status` → Git remote).
- [x] Detección del repositorio origen y nombre del proyecto (SSH y HTTPS).
- [x] Resolución del repositorio destino (`owner/owner.github.io`).
- [x] Resolución de ruta destino relativa (`--path` → `config.path` → nombre de repo).
- [x] Generación de URL pública del sitio (`https://<owner>.github.io/<path>/`).

### Fase 5: CLI y Experiencia de Usuario
- [x] Parseo de argumentos con precedencia estricta (CLI > config > defaults).
- [x] Salida en consola limpia con formato estructurado y colores ANSI nativos.
- [x] Modo `--dry-run` para cálculo y previsualización sin mutación remota.
- [x] Códigos de salida estándar de proceso (0: éxito, 1: error de despliegue, 2: CLI inválido).
- [x] Detección de primer despliegue con advertencia de contenido público.

### Fase 6: Robustez, Calidad y CI
- [x] Enmascaramiento estricto de credenciales y tokens en logs y errores.
- [x] Protección rigurosa contra path traversal (`../`, rutas absolutas, raíz `.`).
- [x] Manejo descriptivo de conflictos de push (sin forzar pushes).
- [x] Detección y mensajes accionables para fallos de autenticación.
- [x] Documentación completa en `README.md` (Quickstart, CI, modelo de seguridad).
- [x] Workflows de GitHub Actions optimizados a 1 runner (`ci.yml`, `release.yml`, `deploy-site.yml`).
- [x] Suite de tests unitarios e integración local con Git (45 tests en 8 suites pasando).

---

## 2. Tareas Operativas Inmediatas

- [x] **Commit inicial del repositorio**: Añadir y commitear todos los archivos del proyecto bajo Conventional Commits (`feat: initial release of dirploy`).
- [x] **Vinculación de Git Remote**: Configurar el origen remoto oficial (`git remote add origin git@github.com:rgdlr/dirploy.git`).
- [x] **Preparación de versión y Changeset inicial**: Configurado para publicación inicial de la versión `0.1.0`.

---

## 3. Roadmap Futuro (Depurado y Pragmático)

### 3.1. Experiencia de Inicialización (DX)
- [x] **Comando `dirploy init`**: Generar automáticamente `dirploy.config.json` prellenado con valores inferidos del proyecto actual (owner detectado, nombre del repositorio como `path`, source `./dist` por defecto), con bandera opcional `--force` para sobreescribir.

### 3.2. Optimización de Repositorio Local y Directorio Padre
- [x] **Configuración `localRepo` y flag `--local-repo <path>`**: Permitir indicar la ruta local donde ya existe el repositorio `username.github.io` clonado en la máquina host.
- [x] **Auto-detección en directorio padre**: Si no se indica `localRepo`, comprobar si en el directorio padre (`../<owner>.github.io` o `../*.github.io`) ya existe el repositorio clonado correspondiente.
- [x] **Prevención estricta de conflictos en local**:
  - No mutar el árbol de trabajo (`working tree`) del usuario si tiene cambios sin commitear o está en otra rama.
  - Utilizar un clon local instantáneo (`git clone --local` o `--reference`) hacia la carpeta temporal para obtener máxima velocidad (0 descargas de red) y aislamiento total de los archivos locales del desarrollador.

### 3.3. Dominios Personalizados y Compatibilidad GitHub Pages
- [x] **Detección automática de `CNAME`**: Leer el archivo `CNAME` en la raíz del repositorio destino clonado para mostrar la URL final real (`https://midominio.com/<path>/`) en lugar del fallback genérico de `github.io`.
- [x] **Configuración `"domain"` / `"cname"`**: Permitir forzar explícitamente el dominio base en `dirploy.config.json` para entornos con proxies o configuraciones especiales.
- [x] **Soporte / Advertencia de `.nojekyll`**: Detectar si el repositorio User Site carece de `.nojekyll` en la raíz y avisar al usuario (o generarlo si se habilita opción) para evitar que GitHub Pages descarte directorios con guión bajo (`_app/`, `_astro/`, `_next/`) en frameworks modernos.

### 3.4. Configuraciones Adicionales de Sincronización
- [x] **Configuración `"exclude"`**: Soportar patrones de exclusión (glob/regex simple) para no publicar archivos innecesarios de la build (ej. `[".DS_Store", "*.map"]`).
- [x] **Configuración `"clean"`**: Booleano opcional (por defecto `true`) para permitir sincronización aditiva si se desea conservar archivos existentes en el destino que no estén en la build actual.
- [x] **Identidad Git heredada**: Detectar y respetar `user.name` y `user.email` del entorno Git local del usuario en lugar del autor genérico `dirploy`, manteniendo este último solo como fallback en CI.

### 3.5. Resiliencia de Concurrencia
- [x] **Reintento automático ante `PUSH_REJECTED`**: Si otro despliegue o commit concurrente actualiza la rama remota durante la sincronización, reintentar automáticamente 1-2 veces antes de reportar el error al usuario.
