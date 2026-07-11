# FreeWebAnimation

FreeWebAnimation 是一个可复用的 Web 动画项目框架，基于 Vite + TypeScript + Three.js。它适合制作浏览器里的动画演示、参数化场景、PBR/后处理展示，以及可以按时间轴导出视频的页面。

## 包含内容

- 基于页面的演示 deck 框架，支持统一尺寸、切页和逐帧更新。
- DOM、Canvas 2D、Three.js 三类页面基类。
- 可选接入的 Page Components，用于复用自由摄像机、坐标轴、调试层等页面能力。
- 场景参数面板、全局参数面板、动画片段和时间轴组合 UI。
- PBR 渲染辅助，包括环境光、阴影、GTAO、FXAA 和后处理合成。
- 一个 PBR Showcase 示例页，可用于验证材质、动画、参数、导出和摄像机控制。
- 3D 页面默认带坐标轴调试层，混合 DOM/SVG/Canvas overlay 的 3D 页面也会显示。
- 可复用的自由摄像机组件，适用于 PerspectiveCamera 的 Three.js 页面。
- 基于浏览器的逐帧导出脚本，用于后续合成视频。

## Page Components

页面可以通过覆写 `createComponents()` 来接入可复用组件。组件生命周期在不同页面类型中保持一致：

```text
mount -> update -> lateUpdate -> resize -> unmount
```

`ThreePage` 和 `Canvas2DPage` 都可以承载组件。组件可以只使用通用的页面/root 上下文，也可以要求特定能力，比如 `three` 或 `canvas2d`。

Three.js 页面接入自由摄像机的例子：

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

`ThreePage` 默认会添加坐标轴调试层。如果某个页面不需要，可以覆写：

```ts
protected get axisOverlayEnabled(): boolean {
  return false;
}
```

## 创建新项目

在模板项目根目录运行：

```powershell
.\创建项目.bat
```

它会打开一个 Windows 小窗口，可以选择父目录、输入项目名、自动创建目标文件夹，并可选择是否在创建后执行 `npm install`。

新项目不会再包含 `创建项目.bat` 和 `scripts/powershell/create-project.ps1`。也就是说，只有这个模板项目负责创建新项目；生成出来的项目只保留启动和导出能力。

根目录只保留 `.bat` 入口。PowerShell 实现文件放在：

```text
scripts/powershell/
```

## 启动

常规启动方式：

```powershell
npm install
npm run dev
```

Windows 下也可以直接运行：

```powershell
.\启动演示.bat
```

如果默认端口被其它项目占用，启动器会自动尝试下一个可用端口。需要严格使用指定端口时，可以加：

```powershell
.\启动演示.bat -StrictPort
```

`启动演示.bat` 会用独立的 Chrome/Edge app 窗口打开演示。关闭这个演示窗口后，对应项目的 Vite dev server 会自动停止。

## 构建

```powershell
npm run build
```

## 视频导出

查看可导出的场景：

```powershell
npm run export:video -- --list
```

导出指定场景：

```powershell
npm run export:video -- --scene pbr-showcase
```

Windows 下也可以使用根目录入口：

```powershell
.\导出视频.bat --list
.\导出视频.bat --scene pbr-showcase
```

## 新增页面

新页面通常放在：

```text
src/pages/<page-name>/
```

然后在这里注册：

```text
src/pages/index.ts
```

可以从模板页开始：

```text
src/pages/_template/TemplatePage.ts
```
