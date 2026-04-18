import { getStore, saveStore, generateId, isDatabaseReady } from './tinybase';

const SUBCATEGORIES_ENABLED_KEY = 'subcategoriesEnabled';

export interface Subcategory {
  id: string;
  name: string;
  categoryId: string;
}

export async function getSubcategoriesEnabled(): Promise<boolean> {
  if (!isDatabaseReady()) return false;
  const store = getStore();
  const value = store.getValue(SUBCATEGORIES_ENABLED_KEY) as string | undefined;
  return value === 'true';
}

export async function setSubcategoriesEnabled(enabled: boolean): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.setValue(SUBCATEGORIES_ENABLED_KEY, enabled ? 'true' : 'false');
  await saveStore();
}

export async function getSubcategories(categoryId: string): Promise<Subcategory[]> {
  if (!isDatabaseReady()) return [];
  const store = getStore();
  const subcategories = store.getTable('subcategories');
  if (!subcategories) return [];

  return Object.entries(subcategories)
    .filter(([_, data]) => (data.categoryId as string) === categoryId)
    .map(([id, data]) => ({
      id,
      name: data.name as string,
      categoryId: data.categoryId as string,
    }));
}

export async function getAllSubcategories(): Promise<Subcategory[]> {
  if (!isDatabaseReady()) return [];
  const store = getStore();
  const subcategories = store.getTable('subcategories');
  if (!subcategories) return [];

  return Object.entries(subcategories).map(([id, data]) => ({
    id,
    name: data.name as string,
    categoryId: data.categoryId as string,
  }));
}

export async function getSubcategoryById(id: string): Promise<Subcategory | undefined> {
  if (!isDatabaseReady()) return undefined;
  const store = getStore();
  const row = store.getRow('subcategories', id);
  if (!row || !row.name) return undefined;

  return {
    id,
    name: row.name as string,
    categoryId: row.categoryId as string,
  };
}

export async function addSubcategory(categoryId: string, name: string): Promise<Subcategory> {
  if (!isDatabaseReady()) {
    throw new Error('Database not initialized');
  }
  const store = getStore();
  const id = generateId();

  store.setRow('subcategories', id, {
    name,
    categoryId,
  });

  await saveStore();

  return {
    id,
    name,
    categoryId,
  };
}

export async function updateSubcategory(id: string, name: string): Promise<Subcategory | undefined> {
  if (!isDatabaseReady()) return undefined;
  const store = getStore();

  const existing = await getSubcategoryById(id);
  if (!existing) return undefined;

  store.setCell('subcategories', id, 'name', name);
  await saveStore();

  return {
    id,
    name,
    categoryId: existing.categoryId,
  };
}

export async function deleteSubcategory(id: string): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  store.delRow('subcategories', id);
  await saveStore();
}

export async function deleteSubcategoriesByCategory(categoryId: string): Promise<void> {
  if (!isDatabaseReady()) return;
  const store = getStore();
  const subcategories = store.getTable('subcategories');

  if (subcategories) {
    for (const [id, data] of Object.entries(subcategories)) {
      if ((data.categoryId as string) === categoryId) {
        store.delRow('subcategories', id);
      }
    }
    await saveStore();
  }
}