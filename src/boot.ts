import './ui/style.css';
import { loadClient } from './startup.js';
import { isCaptureRequest } from './capture/route.js';

const boot = document.getElementById('boot')!;
const status = document.getElementById('boot-status')!;
void loadClient(() => isCaptureRequest(location.search) ? import('./capture/client.js') : import('./client.js'), {
  slow() { status.textContent = '加载仍在进行，尚未开局。网络较慢时可继续等待；若一直没有进展，请重新载入页面。'; },
  failed(error) {
    status.setAttribute('role', 'alert');
    status.textContent = `场景组件加载失败：${error instanceof Error ? error.message : String(error)}。请检查网络后重新载入页面。`;
    console.error(error);
  },
  finished() { boot.hidden = true; },
});
