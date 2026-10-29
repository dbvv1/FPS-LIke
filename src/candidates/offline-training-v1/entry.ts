import './ui/style.css';
import { validateOfflineTrainingOptions } from '../../candidate-route.js';
validateOfflineTrainingOptions(location.search);
const { qualityCaptureOptions } = await import('./capture/quality-route.js');
if (qualityCaptureOptions(location.search)) await import('./capture/quality-client.js');
else await import('./client.js');
