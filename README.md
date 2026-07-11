# FreeWebAnimation

FreeWebAnimation is a reusable Vite + TypeScript + Three.js deck framework for building browser-based animation scenes, parameterized demos, and video-exportable pages.

## What Is Included

- Page-based deck shell with resize-aware render frames.
- DOM, Canvas 2D, and Three.js page base classes.
- Optional page components that can plug into DOM, Canvas 2D, or Three.js pages.
- Scene parameter panels, global parameter panels, animation clips, and timeline composition UI.
- PBR rendering helpers with environment lighting, shadows, GTAO, FXAA, and post-processing composition.
- A PBR showcase page with animatable motion, layout, and material parameters for testing clips and timelines.
- Automatic axis debug overlays for `ThreePage` scenes, including hybrid 3D pages with DOM/SVG/Canvas overlays.
- A reusable free-camera page component for perspective Three.js scenes.
- Browser-driven frame export script for timeline-based video rendering.

## Page Components

Pages can opt into reusable components by overriding `createComponents()`. Components use the same lifecycle across page types:

```text
mount -> update -> lateUpdate -> resize -> unmount
```

`ThreePage` and `Canvas2DPage` both host components. A component can use only the generic page/root context, or require a capability such as `three` or `canvas2d`.

Example Three.js page component setup:

```ts
protected createComponents(): ThreePageComponent[] {
  return [
    createFreeCameraComponent({
      moveSpeed: 4,
      lookSpeed: 0.0024,
    }),
  ];
}
```

`ThreePage` still adds the axis debug overlay by default. Pages that do not want it can override `axisOverlayEnabled` and return `false`.

## Create A New Project

Launch the Windows project creator:

```powershell
.\创建项目.bat
```

The creator opens a small UI where you can choose a parent folder, enter a project name, create the destination folder, and optionally run `npm install`.

Root-level scripts are kept as `.bat` launchers. PowerShell implementation files live under `scripts/powershell/`.

## Start

```powershell
npm install
npm run dev
```

On Windows you can also launch the local demo server with:

```powershell
.\启动演示.bat
```

If the default port is occupied by another project, the launcher automatically tries the next available port. Use `-StrictPort` when you want startup to fail instead.

The Windows launcher opens the demo in a managed Chrome/Edge app window. Closing that demo window automatically stops this project's Vite dev server.

## Build

```powershell
npm run build
```

## Video Export

```powershell
npm run export:video -- --list
npm run export:video -- --scene pbr-showcase
```

The same exporter is also available through:

```powershell
.\导出视频.bat --list
.\导出视频.bat --scene pbr-showcase
```

New pages usually live under `src/pages/<page-name>/` and are registered in `src/pages/index.ts`.
