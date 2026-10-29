import './ui/style.css';
import { validateOfflineTrainingOptions } from '../../candidate-route.js';
validateOfflineTrainingOptions(location.search);
const { artCaptureOptions } = await import('./capture/route.js');
const { qualityCaptureOptions } = await import('./capture/quality-route.js');
if (qualityCaptureOptions(location.search)) await import('./capture/quality-client.js');
else if (artCaptureOptions(location.search)) await import('./capture/client.js');
else await import('./client.js');
