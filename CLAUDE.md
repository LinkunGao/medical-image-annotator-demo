# Medical Image Annotator (Dev)

## Project Overview

A full-stack medical image annotation tool with AI-driven 3D segmentation capabilities. Built with Vue 3 + TypeScript frontend and FastAPI Python backend. Deployable as a standalone SPA or as an embedded UMD plugin inside a clinical dashboard.

## Architecture

```
medical-image-annotator-dev/
├── annotator-frontend/    # Vue 3 + TypeScript + Vuetify 3 (dual-mode: app or UMD plugin)
├── annotator-backend/     # FastAPI + SQLAlchemy + nnInteractive AI model
├── plan/                  # Implementation plans & task tracking
└── report/                # Phase reports and QA documentation
```

### Frontend Stack
- **Framework**: Vue 3 (Composition API with `<script setup>`)
- **Language**: TypeScript 5.0 (strict mode)
- **Build**: Vite 6.3 — dual mode via `BUILD_AS_PLUGIN` env var
  - Plugin mode → `my-app.umd.js` (UMD library, externals: Vue, Vuetify, Pinia, vue-toastification)
  - App mode → standard SPA build
- **UI**: Vuetify 3.8 (Material Design)
- **State**: Pinia 2.0
- **3D Engine**: copper3D (custom medical imaging renderer on Three.js)
- **Package Manager**: Yarn
- **Testing**: Vitest

### Backend Stack
- **Framework**: FastAPI (Python) on Uvicorn
- **Database**: SQLite + SQLAlchemy ORM
- **AI Model**: nnInteractive 1.1.2 (3D promptable segmentation)
- **Storage**: MinIO (S3-compatible)
- **Medical Libraries**: nibabel, SimpleITK, pynrrd, scikit-image
- **3D Conversion**: trimesh, pygltflib
- **Dataset Format**: SPARC SDS via sparc_me

## Common Commands

### Frontend
```bash
cd annotator-frontend
yarn dev              # Dev server with hot reload
yarn build            # Production app build
yarn build:plugin     # Plugin build (UMD, BUILD_AS_PLUGIN=true)
yarn test             # Run Vitest tests
yarn test:watch       # Watch mode
yarn test:ui          # Interactive test UI
yarn lint             # ESLint with auto-fix
```

### Backend
```bash
cd annotator-backend
uvicorn main:app --port 8082    # Start dev server
docker-compose up               # Docker (port 8002 → 8082)
```

## Code Conventions

- **Indent**: 2 spaces (JS/TS/Vue), per `.editorconfig`
- **Naming**: camelCase for variables/functions, PascalCase for components/classes
- **Components**: Vue 3 Composition API (`<script setup lang="ts">`)
- **Path alias**: `@/` maps to `src/`
- **Linting**: ESLint with `vue3-essential` + TypeScript rules
- **Multi-word component names rule**: disabled

## Key Source Locations

### Core Annotation Engine (`src/ts/` — excluded from Vite build, loaded separately)

| Path | Purpose |
|------|---------|
| `src/ts/Utils/segmentation/core/MaskVolume.ts` | 3D volumetric mask (width×height×depth×numChannels, Uint8Array) |
| `src/ts/Utils/segmentation/core/GaussianSmoother.ts` | Optimized 3D Gaussian blur (anisotropic spacing support) |
| `src/ts/Utils/segmentation/core/UndoManager.ts` | Undo/redo with grouped operations (`pushGroup`) |
| `src/ts/Utils/segmentation/core/types.ts` | Core type definitions (`ILayerChannelState`, `RenderMode`, `ChannelColorMap`, etc.) |
| `src/ts/Utils/segmentation/CanvasState.ts` | Central state container (NrrdState, GuiState, volumes, undo stacks) |
| `src/ts/Utils/segmentation/DrawToolCore.ts` | Rendering loop (canvas composition, globalAlpha) |
| `src/ts/Utils/segmentation/NrrdTools.ts` | High-level annotation API (draw, undo, actions) |
| `src/ts/Utils/segmentation/RenderingUtils.ts` | Layer composition + slice rendering |
| `src/ts/Utils/segmentation/coreTools/GuiState.ts` | ToolMode, drawing params, sphere state |
| `src/ts/Utils/segmentation/coreTools/NrrdState.ts` | Image metadata, voxel spacing, layer config |

### Annotation Tools (`src/ts/Utils/segmentation/tools/`)

| File | Purpose |
|------|---------|
| `DrawingTool.ts` | Pencil/brush for 2D slice editing |
| `EraserTool.ts` | 2D eraser |
| `SphereTool.ts` | 3D sphere with isolated `sphereMaskVolume` (preview only) |
| `SphereBrushTool.ts` | 3D sphere that writes to active layer's `MaskVolume` (with grouped undo) |
| `ContrastTool.ts` / `ZoomTool.ts` / `PanTool.ts` | View controls |
| `DataLoader.ts` | Loads NRRD/NIfTI/DICOM |

### Frontend Components & Composables

| Path | Purpose |
|------|---------|
| `src/components/segmentation/OperationCtl.vue` | Main tool buttons (Paint, Erase, Smooth, Sphere) |
| `src/components/segmentation/LayerChannelSelector.vue` | Multi-layer/channel UI |
| `src/composables/left-panel/useCaseManagement.ts` | Case load/save logic |
| `src/composables/left-panel/useMaskOperations.ts` | Undo/redo + mask operations |
| `src/composables/right-panel/useWebSocketSync.ts` | WebSocket synchronization |

### Backend

| Path | Purpose |
|------|---------|
| `main.py` | FastAPI app, CORS, `/api/tool-config`, `/api/generate_sds` |
| `router/tumour_segmentation.py` | Main API routes (REST + WebSocket) |
| `models/db_model.py` | SQLAlchemy ORM (User, Assay, Case, CaseInput, CaseOutput) |
| `services/minio_service.py` | MinIO S3 validation and path resolution |
| `utils/convert.py` | Format conversion (NIfTI → OBJ/GLB) |
| `utils/sds.py` | SPARC SDS dataset generation |
| `utils/ws_manager.py` | WebSocket notification manager |
| `database/database.py` | SQLAlchemy engine, `get_db()` dependency |

## Data Models (Backend)

- **User**: uuid, assays (1:N), cases (1:N)
- **Assay**: uuid, user_uuid, name, minio_public_path, datasets_config, cohorts_config, output_path
- **Case**: user_uuid, assay_uuid, name, is_current
- **CaseInput**: contrast_pre/1/2/3/4 paths + registration_pre/1/2/3/4 paths
- **CaseOutput**: mask_layer1-4_nii paths, mask_obj_path, mask_glb_path, SDS dataset names

## Core Workflow

1. **Tool Config** (`POST /api/tool-config`): frontend sends user/assay UUIDs + dataset/cohort names → backend validates MinIO paths, resolves input URLs, creates/updates DB records, returns resolved URLs
2. **Annotation**: user draws on 2D slices; `MaskVolume` accumulates changes; `UndoManager` tracks grouped undo operations
3. **3D Rendering**: copper3D renders multi-format volumes (NRRD, NIfTI, DICOM, VTK, OBJ, GLB, GLTF) in `src/ts/Utils/`
4. **Mask Export**: masks → NIfTI (.nii) per layer → 3D OBJ/GLB mesh → SPARC SDS dataset via async background task
5. **WebSocket Notifications**: backend notifies frontend when OBJ/GLB conversion completes

## Supported Medical Image Formats

NRRD, NIfTI (.nii / .nii.gz), DICOM, VTK, OBJ, GLB, GLTF

## Important Notes

- `src/ts/` is **excluded from the Vite build** and loaded as a separate bundle. Do not add imports from `src/ts/` into Vite-compiled files.
- Plugin build externalizes Vue, Vuetify, Pinia, vue-toastification — these must exist as globals in the host page.
- Backend serves on **port 8082** internally, mapped to **8002** via Docker.
- `UndoManager.pushGroup(slices)` is used for any multi-slice operation (sphere brush, gaussian smooth) to make it a single undoable action.
- `SphereBrushTool` and `SphereTool` are distinct: `SphereBrushTool` writes to the layer's `MaskVolume` directly; `SphereTool` uses its own isolated `sphereMaskVolume` for preview.
- **API URL convention**: `client.ts` sets `axios.defaults.baseURL = getApiBaseUrl()` (resolves to `/api` in production). All API calls via the `http` client must use relative paths **without** `/api` prefix (e.g. `/download_sds`, not `/api/download_sds`). For raw `fetch` calls, use `getApiBaseUrl()` to build the full URL. Never hardcode `/api/...` — it causes double-prefix bugs (`/api/api/...`) and breaks dev/plugin modes.

## Development Status

| Feature | Status |
|---------|--------|
| Gaussian Smoothing (3D, optimized, anisotropic) | ✅ Complete — 13 tests passing |
| Sphere Brush & Eraser (3D, grouped undo, wheel resize) | ✅ Complete |
| Per-Layer Alpha / Opacity Control | 🔄 In Progress |
