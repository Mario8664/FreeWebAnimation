import './style.css';
import { App } from './app/App';
import { EditorConfigStore } from './app/EditorConfigStore';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app root element.');
}

const editorConfigStore = new EditorConfigStore();
const editorConfig = await editorConfigStore.load();
const app = new App(root, {
  editorConfigStore,
  initialPageIndex: editorConfig.activePageIndex,
});
app.start();
