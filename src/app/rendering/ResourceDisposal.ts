import { Mesh, Scene, type Material } from 'three';

export function disposeMaterial(material: Material | Material[], onDispose?: (material: Material) => void): void {
  const materials = Array.isArray(material) ? material : [material];

  for (const item of materials) {
    item.dispose();
    onDispose?.(item);
  }
}

export function disposeSceneResources(scene: Scene): void {
  scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;

    child.geometry.dispose();
    disposeMaterial(child.material);
  });
}
