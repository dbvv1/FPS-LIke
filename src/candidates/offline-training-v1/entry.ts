import './ui/style.css';
import { validateOfflineTrainingOptions } from '../../candidate-route.js';
validateOfflineTrainingOptions(location.search);
const { artCaptureOptions } = await import('./capture/route.js');
if (artCaptureOptions(location.search)) await import('./capture/client.js');
else await import('./client.js');
