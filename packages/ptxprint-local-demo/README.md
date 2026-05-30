# Demo local USFM → PDF

Mini aplicación web para probar **`@usfm-tools/ptxprint-driver`** en tu máquina.

## Requisitos

1. [PTXprint](https://software.sil.org/ptxprint/) instalado (`ptxprint` en PATH), **o** define `PTXPRINT_BIN` con la ruta al ejecutable antes de arrancar.
2. Un motor TeX con XeTeX (p. ej. [TeX Live](https://tug.org/texlive/) o MiKTeX), en PATH como suelen instalar junto a PTXprint.
3. El cuerpo usa **DejaVu Serif** por defecto: el driver copia `DejaVuSerif.ttf` (bitstream license, ver `packages/ptxprint-driver/vendor/fonts/`) a `shared/fonts/` del proyecto temporal, donde XeTeX la puede resolver incluso con una fontconfig muy limitada. Puedes cambiar la familia en el campo «Fuente», o fijar **`PTXPRINT_BODY_FONT`** antes de arrancar el servidor del demo. Para **Charis SIL**, instálala desde [silnrsi/font-charis releases](https://github.com/silnrsi/font-charis/releases) y escribe `Charis SIL` en «Fuente».
4. El driver también copia **Source Code Pro** (OFL); ptx2pdf la usa en marcas de corte. Si falla la resolución, instala [Source Code Pro](https://github.com/adobe-fonts/source-code-pro) a nivel de sistema.
5. En el monorepo `usfm-ast`, construir el driver:

```bash
bun install
bun run build --filter=@usfm-tools/ptxprint-driver
```

## Arranque

Desde la raíz del monorepo (tras `bun install` y construir el driver):

```bash
bun run build --filter=@usfm-tools/ptxprint-driver
bun run ptxprint-demo
```

O manualmente:

```bash
cd packages/ptxprint-local-demo
bun run start
```

Abre la URL que imprime la consola (por defecto **http://127.0.0.1:3876**). Si 3876 está ocupado, el servidor prueba 3877, 3878, etc., hasta 30 puertos (salvo que fijes un solo puerto con `PORT`). Forzar un puerto: `PORT=4000 bun run start` (en Windows Git Bash: igual; en `cmd`: `set PORT=4000 && bun run start`).

## Qué hace

- Sirve una página con uno o varios textareas USFM (varios libros) y llama a `POST /api/pdf`.
- El servidor ejecuta `usfmToPdf()` o `usfmsToPdf()` y devuelve el PDF para vista previa.
- **Configuración PTXprint avanzada** (sección plegable): pega fragmentos INI (mismas secciones/claves que `ptxprint.cfg` de PTXprint). Se fusionan con la config generada; el id de proyecto, libro(s) e `ifmainbodytext` los fija el driver. Para claves leídas con `getboolean` de Python, usa `True` / `False` (no uses `%` ni cadenas vacías).

No usar en producción ni exponer a red pública: es solo para desarrollo local.
