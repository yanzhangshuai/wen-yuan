import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { register } from 'tsx/esm/api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

register();

const pagePath = resolve(__dirname, 'src/app/admin/review/[bookId]/page.tsx');
const { default: Page } = await import(pagePath);

// Mock the imports
const vi = (await import('vitest')).vi;

vi.mock('@/server/modules/books/getBookById', () => ({
  getBookById: async () => ({ id: '123', title: 'Test' })
}));

const page = await Page({
  params: Promise.resolve({ bookId: '123' })
});

console.log('Page type:', page?.type?.name);
console.log('Page props keys:', Object.keys(page?.props || {}));
console.log('renderMain:', typeof page?.props?.renderMain);

