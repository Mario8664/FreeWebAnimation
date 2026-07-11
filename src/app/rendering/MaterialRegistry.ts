import type { Material } from 'three';

export class MaterialRegistry {
  private readonly materials = new Set<Material>();

  track<T extends Material>(material: T): T {
    this.materials.add(material);
    return material;
  }

  delete(material: Material): void {
    this.materials.delete(material);
  }

  forEach(callback: (material: Material) => void): void {
    for (const material of this.materials) {
      callback(material);
    }
  }

  disposeAll(): void {
    for (const material of this.materials) {
      material.dispose();
    }

    this.materials.clear();
  }
}
