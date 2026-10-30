import './ui/style.css';
import { resolveHomeSearch } from './default-route.js';
import { loadClient } from './startup.js';
import { movementCandidateEnabled, offlineTrainingCandidateEnabled } from './candidate-route.js';
import { isCaptureRequest } from './capture/route.js';

// Resolve before lazy-loading clients: all existing option readers see one URL.
const homeSearch = resolveHomeSearch(location.search);
if (homeSearch !== location.search) history.replaceState(history.state, '', `${location.pathname}${homeSearch}${location.hash}`);

const boot = document.getElementById('boot')!;
const status = document.getElementById('boot-status')!;
void loadClient(() => offlineTrainingCandidateEnabled(location.search)
  ? import('./candidates/offline-training-v1/entry.js')
  : movementCandidateEnabled(location.search)
  ? (isCaptureRequest(location.search) ? import('./candidates/movement-v2/capture/client.js') : import('./candidates/movement-v2/client.js'))
  : (isCaptureRequest(location.search) ? import('./capture/client.js') : import('./client.js')), {
  slow() { status.textContent = '加载仍在进行，尚未开局。网络较慢时可继续等待；若一直没有进展，请重新载入页面。'; },
  failed(error) {
    status.setAttribute('role', 'alert');
    status.textContent = `场景组件加载失败：${error instanceof Error ? error.message : String(error)}。请检查网络后重新载入页面。`;
    console.error(error);
  },
  finished() { boot.hidden = true; },
});
